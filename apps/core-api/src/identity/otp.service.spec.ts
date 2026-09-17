import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { ExpiredOtpError, InvalidOtpError, OtpService, RateLimitedError } from './otp.service';
import * as otpProviderModule from './otp-provider';

/**
 * Exercises the REAL OtpService logic (hashing, expiry, attempt-counting,
 * rate limiting) against the in-memory fake Prisma store — the direct
 * TypeScript equivalent of backend/tests/test_otp_service.py, testing the
 * same behavioral contract established in S2/S3.
 */

const PHONE = '+919999999999';

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'development',
    port: 3001,
    otpPepper: '',
    otpLength: 6,
    otpTtlSeconds: 300,
    otpMaxAttempts: 3,
    otpRateLimitWindowSeconds: 900,
    otpRateLimitPerPhone: 5,
    otpRateLimitPerIp: 20,
    victimSessionSecret: '',
    victimSessionTtlSeconds: 86400,
    phoneVerifiedTokenTtlSeconds: 600,
    ...overrides,
  };
}

function buildService(fake: FakePrismaService, config: AppConfig = buildConfig()): OtpService {
  return new OtpService(fake as unknown as PrismaService, config);
}

/** Spies on the OTP provider to recover the plaintext code that was "sent",
 * without ever storing/logging it ourselves — the test-side equivalent of
 * reading a real SMS. */
async function requestAndCaptureViaSpy(
  service: OtpService,
  ip = '203.0.113.5',
): Promise<string> {
  let captured = '';
  jest.spyOn(otpProviderModule, 'getOtpProvider').mockReturnValue({
    sendOtp: async (_phone: string, code: string) => {
      captured = code;
    },
  });
  await service.requestOtp(PHONE, ip);
  return captured;
}

describe('OtpService', () => {
  let fake: FakePrismaService;
  let service: OtpService;

  beforeEach(() => {
    fake = new FakePrismaService();
    service = buildService(fake);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateCode', () => {
    it('produces a 6-digit, zero-padded numeric code by default', () => {
      for (let i = 0; i < 20; i++) {
        const code = service.generateCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });

    it('uses crypto.randomInt, not Math.random', () => {
      const source = OtpService.prototype.generateCode.toString();
      expect(source).toContain('crypto.randomInt');
      expect(source).not.toContain('Math.random');
    });
  });

  it('valid OTP succeeds', async () => {
    const code = await requestAndCaptureViaSpy(service);
    await expect(service.verifyOtp(PHONE, code)).resolves.toBeUndefined();
  });

  it('invalid OTP fails', async () => {
    await requestAndCaptureViaSpy(service);
    await expect(service.verifyOtp(PHONE, '000000')).rejects.toBeInstanceOf(InvalidOtpError);
  });

  it('expired OTP fails', async () => {
    const code = await requestAndCaptureViaSpy(service);
    fake.otpRows[fake.otpRows.length - 1].expiresAt = new Date(Date.now() - 1000);
    await expect(service.verifyOtp(PHONE, code)).rejects.toBeInstanceOf(ExpiredOtpError);
  });

  it('OTP cannot be reused (single-use consumption)', async () => {
    const code = await requestAndCaptureViaSpy(service);
    await service.verifyOtp(PHONE, code);
    await expect(service.verifyOtp(PHONE, code)).rejects.toBeInstanceOf(InvalidOtpError);
  });

  it('fourth attempt fails even with the correct code once the attempt budget is spent', async () => {
    const code = await requestAndCaptureViaSpy(service);
    for (let i = 0; i < 3; i++) {
      await expect(service.verifyOtp(PHONE, '000000')).rejects.toBeInstanceOf(InvalidOtpError);
    }
    expect(fake.otpRows[fake.otpRows.length - 1].attempts).toBe(3);
    await expect(service.verifyOtp(PHONE, code)).rejects.toBeInstanceOf(InvalidOtpError);
  });

  it('no pending OTP is rejected', async () => {
    await expect(service.verifyOtp('+910000000000', '123456')).rejects.toBeInstanceOf(InvalidOtpError);
  });

  it('enforces the phone rate limit', async () => {
    const limited = buildService(fake, buildConfig({ otpRateLimitPerPhone: 2 }));
    await requestAndCaptureViaSpy(limited, '10.0.0.1');
    await requestAndCaptureViaSpy(limited, '10.0.0.2');
    await expect(requestAndCaptureViaSpy(limited, '10.0.0.3')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('enforces the IP rate limit across different phone numbers', async () => {
    const limited = buildService(fake, buildConfig({ otpRateLimitPerIp: 2 }));
    jest.spyOn(otpProviderModule, 'getOtpProvider').mockReturnValue({ sendOtp: async () => undefined });
    await limited.requestOtp('+911111111111', '203.0.113.9');
    await limited.requestOtp('+912222222222', '203.0.113.9');
    await expect(limited.requestOtp('+913333333333', '203.0.113.9')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('rate-limit window expiry allows new requests again', async () => {
    const limited = buildService(fake, buildConfig({ otpRateLimitPerPhone: 1 }));
    await requestAndCaptureViaSpy(limited, '10.0.0.1');
    fake.otpRows[fake.otpRows.length - 1].createdAt = new Date(Date.now() - 3600 * 1000);
    await expect(requestAndCaptureViaSpy(limited, '10.0.0.1')).resolves.toMatch(/^\d{6}$/);
  });

  it('never persists the plaintext code', async () => {
    const code = await requestAndCaptureViaSpy(service);
    const row = fake.otpRows[fake.otpRows.length - 1];
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.codeHash).not.toBe(code);
  });

  it('requestOtp resolves to nothing that could leak the code', async () => {
    jest.spyOn(otpProviderModule, 'getOtpProvider').mockReturnValue({ sendOtp: async () => undefined });
    const result = await service.requestOtp(PHONE, '10.0.0.1');
    expect(result).toBeUndefined();
  });

  it('verification uses a constant-time comparison (crypto.timingSafeEqual)', () => {
    const source = OtpService.prototype.verifyOtp.toString();
    expect(source).toContain('timingSafeEqual');
  });

  it('hashing never falls back to an insecure pepper outside development', () => {
    const prodConfig = buildConfig({ nodeEnv: 'production', otpPepper: '' });
    const prodService = buildService(fake, prodConfig);
    expect(() => prodService.hashPhone(PHONE)).toThrow(/OTP_PEPPER is not configured/);
  });
});
