import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AppConfig } from '../config/configuration';
import { TokenService } from './token.service';
import { VictimAuthGuard } from './victim-auth.guard';
import { JwtService } from '@nestjs/jwt';

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
    victimSessionSecret: 'test-secret',
    victimSessionTtlSeconds: 86400,
    phoneVerifiedTokenTtlSeconds: 600,
    ...overrides,
  };
}

function contextWithHeader(header?: string): ExecutionContext {
  const request: Record<string, unknown> = { headers: header ? { authorization: header } : {} };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('VictimAuthGuard', () => {
  const tokenService = new TokenService(new JwtService(), buildConfig());
  const guard = new VictimAuthGuard(tokenService);

  it('rejects a request with no Authorization header', () => {
    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(UnauthorizedException);
  });

  it('rejects a malformed Authorization header', () => {
    expect(() => guard.canActivate(contextWithHeader('Token abc'))).toThrow(UnauthorizedException);
  });

  it('rejects an expired/invalid token', () => {
    expect(() => guard.canActivate(contextWithHeader('Bearer not-a-real-jwt'))).toThrow(UnauthorizedException);
  });

  it('attaches the resolved victim identity onto the request for a valid token', () => {
    const token = tokenService.issueVictimSessionToken('victim-abc', '+919999999999');
    const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;

    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
    expect((request as { victim?: { id: string } }).victim?.id).toBe('victim-abc');
  });

  it('a phone-verified token (wrong purpose) is rejected by this guard', () => {
    const token = tokenService.issuePhoneVerifiedToken('+919999999999');
    expect(() => guard.canActivate(contextWithHeader(`Bearer ${token}`))).toThrow(UnauthorizedException);
  });
});
