import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/configuration';
import { StaffTokenService } from './staff-token.service';

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

function buildService(config: AppConfig = buildConfig()): StaffTokenService {
  return new StaffTokenService(new JwtService(), config);
}

describe('StaffTokenService', () => {
  it('issues a token that resolves back to the same userId', () => {
    const service = buildService();
    const token = service.issueStaffSessionToken('user-1');
    expect(service.getCurrentStaffSession(token).userId).toBe('user-1');
  });

  it('rejects a garbage token', () => {
    const service = buildService();
    expect(() => service.getCurrentStaffSession('not-a-real-token')).toThrow(UnauthorizedException);
  });

  it('a token signed with a different secret is rejected', () => {
    const a = buildService(buildConfig({ staffSessionSecret: 'secret-a' }));
    const b = buildService(buildConfig({ staffSessionSecret: 'secret-b' }));
    const token = a.issueStaffSessionToken('user-1');
    expect(() => b.getCurrentStaffSession(token)).toThrow(UnauthorizedException);
  });

  it('an expired token is rejected', async () => {
    const service = buildService(buildConfig({ staffSessionTtlSeconds: -1 }));
    const token = service.issueStaffSessionToken('user-1');
    expect(() => service.getCurrentStaffSession(token)).toThrow(UnauthorizedException);
  });

  it('throws with no secret configured outside development', () => {
    const service = buildService(buildConfig({ nodeEnv: 'production', staffSessionSecret: '' }));
    expect(() => service.issueStaffSessionToken('user-1')).toThrow(/STAFF_SESSION_SECRET is not configured/);
  });

  it('a victim session token (different secret AND different purpose) is never confused with a staff session — this service only ever signs/verifies its own purpose', () => {
    // Uses its own configured secret to sign a token with a foreign
    // purpose, proving the purpose check (not just the secret) is what
    // gates acceptance.
    const service = buildService(buildConfig({ staffSessionSecret: 'shared-secret' }));
    const jwt = new JwtService();
    const foreignToken = jwt.sign({ purpose: 'victim', sub: 'user-1' }, { secret: 'shared-secret' });
    expect(() => service.getCurrentStaffSession(foreignToken)).toThrow(UnauthorizedException);
  });
});
