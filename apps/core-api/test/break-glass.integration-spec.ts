/**
 * S15 integration test: the break-glass domain (request, notify-via-task,
 * audit), against a REAL, isolated, throwaway PostgreSQL instance
 * (test/pg-harness.ts). Runs the full Nest app over real HTTP (supertest),
 * with backend/schema.sql plus every migration through
 * backend/migrations/0012_break_glass_grants.sql applied. No real victim
 * data anywhere — only synthetic, clearly-fake identifiers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffService } from '../src/staff/staff.service';
import { StaffTokenService } from '../src/staff/staff-token.service';
import { StaffRole } from '../src/staff/staff-roles';
import { describeIfPostgres, startThrowawayPostgres, stopThrowawayPostgres, ThrowawayPostgres } from './pg-harness';

const PORT = 55565; // distinct from 55555 (S4) .. 55564 (S13)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;
let staffService: StaffService;
let staffTokenService: StaffTokenService;

describeIfPostgres('Break-glass domain — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_break_glass_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
      '0005_staff.sql',
      '0006_lifecycle.sql',
      '0007_referrals.sql',
      '0008_referral_in_service_at.sql',
      '0009_audit_hash_chain.sql',
      '0010_tasks.sql',
      '0012_break_glass_grants.sql',
    ]);
    process.env.DATABASE_URL = pgInstance.databaseUrl;
    process.env.NODE_ENV = 'development';
    process.env.OTP_RATE_LIMIT_PER_IP = '1000';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffService = moduleRef.get(StaffService);
    staffTokenService = moduleRef.get(StaffTokenService);
  });

  afterEach(async () => {
    await prisma.breakGlassGrant.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.staffAuditLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.case.deleteMany({});
    await prisma.counsellor.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (pgInstance) stopThrowawayPostgres(pgInstance.pgData);
  });

  let seq = 0;
  function nextPhone(): string {
    seq += 1;
    return `+91000006${String(6000 + seq)}`;
  }

  async function registerVictim(district = 'Pune'): Promise<{ userId: string }> {
    const row = await prisma.user.create({
      data: {
        phoneNumber: nextPhone(),
        name: 'Synthetic Victim',
        roleType: 'victim',
        preferredLanguage: 'en',
        consentGiven: true,
        locationDistrict: district,
      },
    });
    return { userId: row.id };
  }

  async function createStaffAndToken(
    role: StaffRole,
    opts: { districtScope?: string[]; counsellorId?: string | null } = {},
  ): Promise<{ userId: string; token: string }> {
    const { userId } = await registerVictim('Pune');
    await staffService.createStaff({
      userId,
      role,
      districtScope: opts.districtScope ?? [],
      counsellorId: opts.counsellorId ?? null,
    });
    const token = staffTokenService.issueStaffSessionToken(userId);
    return { userId, token };
  }

  async function createCase(userId: string, counsellorId: string | null = null): Promise<string> {
    const row = await prisma.case.create({
      data: { userId, caseType: 'unspecified', intakeChannel: 'app', caseStage: 'registered' },
    });
    if (counsellorId) {
      await prisma.case.update({ where: { id: row.id }, data: { assignedCounsellorId: counsellorId } });
    }
    return row.id;
  }

  function requestBreakGlass(token: string, caseId: string, reason: string) {
    return request(app.getHttpServer())
      .post(`/v1/console/cases/${caseId}/break-glass`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason });
  }

  const REASON = "Victim's sister called in crisis, on-call counsellor unreachable";

  describe('migration', () => {
    it('0012_break_glass_grants.sql is additive only — no DROP/TRUNCATE/DELETE (comments excluded)', () => {
      const raw = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0012_break_glass_grants.sql'),
        'utf-8',
      );
      const sqlOnly = raw
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n')
        .toUpperCase();
      expect(sqlOnly).not.toMatch(/\bDROP\b/);
      expect(sqlOnly).not.toMatch(/\bTRUNCATE\b/);
      expect(sqlOnly).not.toMatch(/\bDELETE\s+FROM\b/);
    });
  });

  describe('request + notification (real HTTP end-to-end)', () => {
    it('a counsellor can request break-glass access to a case OUTSIDE their assignment scope, over real HTTP', async () => {
      const { token } = await createStaffAndToken('counsellor', { counsellorId: (
        await prisma.counsellor.create({
          data: { name: 'My Counsellor', district: 'Pune', languages: ['en'], currentCaseload: 0, caseloadCap: 80 },
        })
      ).id });
      const otherCounsellorId = (
        await prisma.counsellor.create({
          data: { name: 'Other Counsellor', district: 'Mumbai', languages: ['en'], currentCaseload: 0, caseloadCap: 80 },
        })
      ).id;
      const { userId } = await registerVictim('Mumbai');
      const caseId = await createCase(userId, otherCounsellorId); // NOT this counsellor's case

      const res = await requestBreakGlass(token, caseId, REASON).expect(201);
      expect(res.body.grant.caseId).toBe(caseId);
      expect(res.body.grant.reason).toBe(REASON);
      expect(res.body.grant.expiresAt).not.toBeNull();
    });

    it('creates a real, queryable break_glass_review task visible to the case\'s district supervisor', async () => {
      const { token: granteeToken } = await createStaffAndToken('counsellor', { counsellorId: (
        await prisma.counsellor.create({
          data: { name: 'Grantee Counsellor', district: 'Mumbai', languages: ['en'], currentCaseload: 0, caseloadCap: 80 },
        })
      ).id });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      await requestBreakGlass(granteeToken, caseId, REASON).expect(201);

      const tasks = await prisma.task.findMany({ where: { caseId } });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].type).toBe('break_glass_review');
      expect(tasks[0].priority).toBe('critical');

      // The real district supervisor can see it via the existing task list.
      const { token: supervisorToken } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const list = await request(app.getHttpServer())
        .get('/v1/console/tasks')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      expect(list.body.tasks).toHaveLength(1);
      expect(list.body.tasks[0].type).toBe('break_glass_review');
    });
  });

  describe('reason persistence and audit separation', () => {
    it('the real reason is retrievable via the grant response, but never appears in the audit log', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: [] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);

      const res = await requestBreakGlass(token, caseId, REASON).expect(201);
      expect(res.body.grant.reason).toBe(REASON);

      const auditRows = await prisma.staffAuditLog.findMany({ where: { resourceId: caseId } });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].action).toBe('break_glass.requested');
      expect(JSON.stringify(auditRows[0])).not.toContain(REASON);
    });
  });

  describe('invalid input', () => {
    it('a too-short reason is rejected (400)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: [] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);

      await requestBreakGlass(token, caseId, 'x').expect(400);
    });

    it('a nonexistent case is rejected (404)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: [] });
      await requestBreakGlass(token, randomUUID(), REASON).expect(404);
    });
  });

  describe('unauthorized staff', () => {
    it('unauthenticated request is denied (401)', async () => {
      await request(app.getHttpServer())
        .post(`/v1/console/cases/${randomUUID()}/break-glass`)
        .send({ reason: REASON })
        .expect(401);
    });

    it('state_admin (oversight-tier) is denied (403) — break-glass does not extend to the aggregate-only tier', async () => {
      const { token } = await createStaffAndToken('state_admin');
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);

      await requestBreakGlass(token, caseId, REASON).expect(403);
    });
  });

  describe('the defining property: NO scope check on the target case', () => {
    it('a district_admin scoped to Pune CAN request break-glass for a Mumbai case — this is the entire point of the feature', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Mumbai');
      const caseId = await createCase(userId);

      // A normal lifecycle/referral/task/milestone call would be 403 here —
      // break-glass deliberately is not.
      await requestBreakGlass(token, caseId, REASON).expect(201);
    });
  });
});
