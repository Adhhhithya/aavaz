import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffAuthGuard } from './staff-auth.guard';
import { StaffTokenService } from './staff-token.service';
import { StaffService } from './staff.service';

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
    staffSessionSecret: 'test-staff-secret',
    staffSessionTtlSeconds: 28800,
    ...overrides,
  };
}

function contextWithHeader(header?: string): ExecutionContext {
  const request: Record<string, unknown> = { headers: header ? { authorization: header } : {} };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('StaffAuthGuard', () => {
  let fake: FakePrismaService;
  let tokenService: StaffTokenService;
  let staffService: StaffService;
  let guard: StaffAuthGuard;

  beforeEach(() => {
    fake = new FakePrismaService();
    tokenService = new StaffTokenService(new JwtService(), buildConfig());
    staffService = new StaffService(fake as unknown as PrismaService);
    guard = new StaffAuthGuard(tokenService, staffService);
  });

  it('rejects a request with no Authorization header (401)', async () => {
    await expect(guard.canActivate(contextWithHeader(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed Authorization header (401)', async () => {
    await expect(guard.canActivate(contextWithHeader('Token abc'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid/garbage token (401)', async () => {
    await expect(guard.canActivate(contextWithHeader('Bearer not-a-real-jwt'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a valid staff session token whose user has no staff row (403) — authenticated but not authorized', async () => {
    const token = tokenService.issueStaffSessionToken('user-with-no-staff-row');
    await expect(guard.canActivate(contextWithHeader(`Bearer ${token}`))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('attaches the freshly-resolved staff identity onto the request for a valid token + existing staff row', async () => {
    await staffService.createStaff({ userId: 'user-1', role: 'counsellor', counsellorId: 'counsellor-1' });
    const token = tokenService.issueStaffSessionToken('user-1');
    const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const attached = (request as { staff?: { userId: string; role: string; counsellorId: string | null } }).staff;
    expect(attached?.userId).toBe('user-1');
    expect(attached?.role).toBe('counsellor');
    expect(attached?.counsellorId).toBe('counsellor-1');
  });

  it('a role change in the database takes effect on the very next request — the guard never trusts a stale token claim, because the token carries no role at all', async () => {
    await staffService.createStaff({ userId: 'user-2', role: 'counsellor', counsellorId: 'counsellor-2' });
    const token = tokenService.issueStaffSessionToken('user-2');

    const request1: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request1 }) } as unknown as ExecutionContext);
    expect((request1 as { staff?: { role: string } }).staff?.role).toBe('counsellor');

    // Simulate the staff row being removed (e.g. the staff member was
    // deprovisioned) — the SAME still-unexpired token must now be denied.
    fake.staffRows = fake.staffRows.filter((s) => s.userId !== 'user-2');

    const request2: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    await expect(
      guard.canActivate({ switchToHttp: () => ({ getRequest: () => request2 }) } as unknown as ExecutionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
