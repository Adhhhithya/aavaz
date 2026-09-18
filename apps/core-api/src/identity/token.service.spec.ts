import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AppConfig } from '../config/configuration';
import { TokenService } from './token.service';

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
    staffSessionSecret: '',
    staffSessionTtlSeconds: 28800,
    ...overrides,
  };
}

function buildService(config: AppConfig = buildConfig()): TokenService {
  return new TokenService(new JwtService(), config);
}

describe('TokenService', () => {
  it('a victim session token resolves to the issuing victim id', () => {
    const service = buildService();
    const token = service.issueVictimSessionToken('victim-123', '+919999999999');
    const victim = service.getCurrentVictim(token);
    expect(victim.id).toBe('victim-123');
    expect(victim.phoneNumber).toBe('+919999999999');
  });

  it('a phone-verified token resolves to the verified phone only', () => {
    const service = buildService();
    const token = service.issuePhoneVerifiedToken('+919999999999');
    expect(service.getPhoneVerifiedNumber(token)).toBe('+919999999999');
  });

  it('a phone-verified token cannot be used as a victim session', () => {
    const service = buildService();
    const token = service.issuePhoneVerifiedToken('+919999999999');
    expect(() => service.getCurrentVictim(token)).toThrow(UnauthorizedException);
  });

  it('a victim session token cannot be used as phone-verified', () => {
    const service = buildService();
    const token = service.issueVictimSessionToken('victim-123', '+919999999999');
    expect(() => service.getPhoneVerifiedNumber(token)).toThrow(UnauthorizedException);
  });

  it('garbage input is rejected as a victim session', () => {
    const service = buildService();
    expect(() => service.getCurrentVictim('not-a-real-jwt')).toThrow(UnauthorizedException);
  });

  it('a token signed with a different secret is rejected', () => {
    const serviceA = buildService(buildConfig({ victimSessionSecret: 'secret-a' }));
    const serviceB = buildService(buildConfig({ victimSessionSecret: 'secret-b' }));
    const forged = serviceA.issueVictimSessionToken('victim-attacker-controlled', '+910000000000');
    expect(() => serviceB.getCurrentVictim(forged)).toThrow(UnauthorizedException);
  });

  it('an expired victim session is rejected', () => {
    const service = buildService(buildConfig({ victimSessionTtlSeconds: -1 }));
    const token = service.issueVictimSessionToken('victim-123', '+919999999999');
    expect(() => service.getCurrentVictim(token)).toThrow(UnauthorizedException);
  });

  it('refuses to issue/verify tokens with no secret outside development', () => {
    const service = buildService(buildConfig({ nodeEnv: 'production', victimSessionSecret: '' }));
    expect(() => service.issueVictimSessionToken('victim-123', '+919999999999')).toThrow(
      /VICTIM_SESSION_SECRET is not configured/,
    );
  });
});
