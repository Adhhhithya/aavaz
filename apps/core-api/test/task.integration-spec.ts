/**
 * S12 integration test: the task domain (manual referral_review creation,
 * the automatic referral_stalled hook, transitions, listing), against a
 * REAL, isolated, throwaway PostgreSQL instance (test/pg-harness.ts). Runs
 * the full Nest app over real HTTP (supertest), with backend/schema.sql
 * plus every migration through backend/migrations/0010_tasks.sql applied.
 * No real victim data anywhere — only synthetic, clearly-fake identifiers.
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

const PORT = 55563; // distinct from 55555 (S4) .. 55562 (S11)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;
let staffService: StaffService;
let staffTokenService: StaffTokenService;

describeIfPostgres('Task domain — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_task_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
      '0005_staff.sql',
      '0006_lifecycle.sql',
      '0007_referrals.sql',
      '0008_referral_in_service_at.sql',
      '0009_audit_hash_chain.sql',
      '0010_tasks.sql',
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
    await prisma.task.deleteMany({});
    await prisma.referral.deleteMany({});
    await prisma.staffAuditLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.case.deleteMany({});
    await prisma.consent.deleteMany({});
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
    return `+91000004${String(4000 + seq)}`;
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

  async function grantConsent(userId: string, scope: string): Promise<void> {
    await prisma.consent.create({
      data: { userId, scope, granted: true, textVersionHash: 'test-hash', channel: 'app', capturedBy: 'self' },
    });
  }

  function draftReferral(token: string, caseId: string, destinationType: string, fields: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/v1/console/cases/${caseId}/referrals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ destinationType, fields });
  }

  function transitionReferral(token: string, referralId: string, targetState: string) {
    return request(app.getHttpServer())
      .patch(`/v1/console/referrals/${referralId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ targetState });
  }

  function createReferralReviewTask(token: string, referralId: string, priority: string) {
    return request(app.getHttpServer())
      .post(`/v1/console/referrals/${referralId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority });
  }

  function transitionTask(token: string, taskId: string, targetState: string) {
    return request(app.getHttpServer())
      .patch(`/v1/console/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ targetState });
  }

  async function driveReferralToStalled(token: string, caseId: string, userId: string): Promise<string> {
    await grantConsent(userId, 'share_mental_health');
    const draft = await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' }).expect(201);
    const referralId = draft.body.referral.id;
    await transitionReferral(token, referralId, 'APPROVED').expect(200);
    await transitionReferral(token, referralId, 'SENT').expect(200);
    await transitionReferral(token, referralId, 'STALLED').expect(200);
    return referralId;
  }

  describe('migration', () => {
    it('0010_tasks.sql is additive only — no DROP/TRUNCATE/DELETE (comments excluded)', () => {
      const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0010_tasks.sql'), 'utf-8');
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

  describe('automatic referral_stalled task creation (real HTTP end-to-end)', () => {
    it('a referral reaching STALLED over real HTTP creates a real, queryable task row', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);

      const referralId = await driveReferralToStalled(token, caseId, userId);

      const tasks = await prisma.task.findMany({ where: { referralId } });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].type).toBe('referral_stalled');
      expect(tasks[0].status).toBe('OPEN');
      expect(tasks[0].slaDueAt).not.toBeNull();
      expect(tasks[0].createdByStaffId).toBeNull();
    });

    it('the task is visible via GET /v1/console/tasks to a staff member scoped to that case', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      await driveReferralToStalled(token, caseId, userId);

      const res = await request(app.getHttpServer()).get('/v1/console/tasks').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].type).toBe('referral_stalled');
    });

    it('the task is NOT visible to a staff member outside the case\'s district', async () => {
      const { token: puneToken } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { token: mumbaiToken } = await createStaffAndToken('district_admin', { districtScope: ['Mumbai'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      await driveReferralToStalled(puneToken, caseId, userId);

      const res = await request(app.getHttpServer())
        .get('/v1/console/tasks')
        .set('Authorization', `Bearer ${mumbaiToken}`)
        .expect(200);
      expect(res.body.tasks).toHaveLength(0);
    });
  });

  describe('manual referral_review task creation (real HTTP)', () => {
    it('a staff member can manually create a referral_review task for a referral in scope', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      const draft = await draftReferral(token, caseId, 'legal_aid', { legalIssueSummary: 'x' }).expect(201);

      const res = await createReferralReviewTask(token, draft.body.referral.id, 'serious').expect(201);
      expect(res.body.task.type).toBe('referral_review');
      expect(res.body.task.priority).toBe('serious');
      expect(res.body.task.createdByStaffId).not.toBeNull();
    });

    it('a staff member outside the case\'s scope cannot create a task for it (403)', async () => {
      const { token: puneToken } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { token: mumbaiToken } = await createStaffAndToken('district_admin', { districtScope: ['Mumbai'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      const draft = await draftReferral(puneToken, caseId, 'legal_aid', { legalIssueSummary: 'x' }).expect(201);

      await createReferralReviewTask(mumbaiToken, draft.body.referral.id, 'serious').expect(403);
    });

    it('an invalid priority is rejected by DTO validation (400)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      const draft = await draftReferral(token, caseId, 'legal_aid', { legalIssueSummary: 'x' }).expect(201);

      await createReferralReviewTask(token, draft.body.referral.id, 'good').expect(400);
    });
  });

  describe('task transitions (real HTTP)', () => {
    it('OPEN -> ACKNOWLEDGED -> COMPLETED over real HTTP, stamping timestamps', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      const draft = await draftReferral(token, caseId, 'legal_aid', { legalIssueSummary: 'x' }).expect(201);
      const created = await createReferralReviewTask(token, draft.body.referral.id, 'bad').expect(201);
      const taskId = created.body.task.id;

      const acked = await transitionTask(token, taskId, 'ACKNOWLEDGED').expect(200);
      expect(acked.body.task.ackedAt).not.toBeNull();

      const completed = await transitionTask(token, taskId, 'COMPLETED').expect(200);
      expect(completed.body.task.completedAt).not.toBeNull();
    });

    it('rejects an invalid transition (409), and the task is unchanged', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      const draft = await draftReferral(token, caseId, 'legal_aid', { legalIssueSummary: 'x' }).expect(201);
      const created = await createReferralReviewTask(token, draft.body.referral.id, 'bad').expect(201);

      await transitionTask(token, created.body.task.id, 'COMPLETED').expect(409); // must go through ACKNOWLEDGED

      const row = await prisma.task.findUnique({ where: { id: created.body.task.id } });
      expect(row?.status).toBe('OPEN');
    });
  });

  describe('unauthorized staff', () => {
    it('unauthenticated request is denied (401)', async () => {
      await request(app.getHttpServer()).get('/v1/console/tasks').expect(401);
      await request(app.getHttpServer())
        .post(`/v1/console/referrals/${randomUUID()}/tasks`)
        .send({ priority: 'bad' })
        .expect(401);
    });

    it('state_admin (oversight-tier) is denied (403)', async () => {
      const { token } = await createStaffAndToken('state_admin');
      await request(app.getHttpServer()).get('/v1/console/tasks').set('Authorization', `Bearer ${token}`).expect(403);
    });
  });

  describe('cross-assignment denial', () => {
    it('a counsellor cannot transition a task belonging to a different counsellor\'s case', async () => {
      const myCounsellorId = (
        await prisma.counsellor.create({
          data: { name: 'Synthetic Counsellor A', district: 'Pune', languages: ['en'], currentCaseload: 0, caseloadCap: 80 },
        })
      ).id;
      const otherCounsellorId = (
        await prisma.counsellor.create({
          data: { name: 'Synthetic Counsellor B', district: 'Pune', languages: ['en'], currentCaseload: 0, caseloadCap: 80 },
        })
      ).id;
      const { token: myToken } = await createStaffAndToken('counsellor', { counsellorId: myCounsellorId });
      const { token: otherToken } = await createStaffAndToken('counsellor', { counsellorId: otherCounsellorId });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId, myCounsellorId);
      const draft = await draftReferral(myToken, caseId, 'legal_aid', { legalIssueSummary: 'x' }).expect(201);
      const created = await createReferralReviewTask(myToken, draft.body.referral.id, 'bad').expect(201);

      await transitionTask(otherToken, created.body.task.id, 'ACKNOWLEDGED').expect(403);
    });
  });
});
