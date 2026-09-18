/**
 * S8 integration test: case/victim lifecycle transitions, against a REAL,
 * isolated, throwaway PostgreSQL instance (test/pg-harness.ts). Runs the
 * full Nest app over real HTTP (supertest), with backend/schema.sql plus
 * every migration through backend/migrations/0006_lifecycle.sql applied.
 * No real victim data anywhere — only synthetic, clearly-fake identifiers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffService } from '../src/staff/staff.service';
import { StaffTokenService } from '../src/staff/staff-token.service';
import { StaffRole } from '../src/staff/staff-roles';
import { LifecycleState } from '../src/lifecycle/lifecycle-states';
import { describeIfPostgres, startThrowawayPostgres, stopThrowawayPostgres, ThrowawayPostgres } from './pg-harness';

const PORT = 55559; // distinct from 55555 (S4), 55556 (S5), 55557 (S6), 55558 (S7)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;
let staffService: StaffService;
let staffTokenService: StaffTokenService;

describeIfPostgres('Lifecycle transitions — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_lifecycle_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
      '0005_staff.sql',
      '0006_lifecycle.sql',
    ]);
    process.env.DATABASE_URL = pgInstance.databaseUrl;
    process.env.NODE_ENV = 'development';
    process.env.OTP_RATE_LIMIT_PER_IP = '1000'; // S7's own fix for this exact suite pattern

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    staffService = moduleRef.get(StaffService);
    staffTokenService = moduleRef.get(StaffTokenService);
  });

  afterEach(async () => {
    await prisma.staffAuditLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.case.deleteMany({});
    await prisma.counsellor.deleteMany({});
    await prisma.victimProfile.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (pgInstance) stopThrowawayPostgres(pgInstance.pgData);
  });

  function captureNextOtp(): { get: () => string } {
    let captured = '';
    const spy = jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      const text = String(message);
      const match = text.match(/Synthetic OTP for .* via sms: (\d{4,8})/);
      if (match) captured = match[1];
      return undefined as never;
    });
    return {
      get: () => {
        spy.mockRestore();
        return captured;
      },
    };
  }

  let seq = 0;
  function nextPhone(): string {
    seq += 1;
    return `+91000000${String(4000 + seq)}`;
  }

  async function registerVictim(name: string, district = 'Pune'): Promise<{ userId: string }> {
    const phone = nextPhone();
    const capture = captureNextOtp();
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phoneNumber: phone }).expect(201);
    const code = capture.get();
    const verify = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phoneNumber: phone, code })
      .expect(201);
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${verify.body.token}`)
      .send({ name, roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
      .expect(201);
    await prisma.user.update({ where: { id: reg.body.userId }, data: { locationDistrict: district } });
    return { userId: reg.body.userId };
  }

  async function createStaffAndToken(
    role: StaffRole,
    opts: { districtScope?: string[]; counsellorId?: string | null } = {},
  ): Promise<{ userId: string; token: string }> {
    const { userId } = await registerVictim(`Staff ${role} ${seq}`);
    await staffService.createStaff({
      userId,
      role,
      districtScope: opts.districtScope ?? [],
      counsellorId: opts.counsellorId ?? null,
    });
    const token = staffTokenService.issueStaffSessionToken(userId);
    return { userId, token };
  }

  async function createCounsellor(district: string): Promise<string> {
    const row = await prisma.counsellor.create({
      data: { name: 'Synthetic Counsellor', district, languages: ['en'], currentCaseload: 0, caseloadCap: 80 },
    });
    return row.id;
  }

  async function createCase(
    userId: string,
    counsellorId: string | null,
    lifecycleState: LifecycleState = 'REGISTERED',
  ): Promise<string> {
    const row = await prisma.case.create({
      data: {
        userId,
        caseType: 'unspecified',
        intakeChannel: 'app',
        caseStage: 'registered',
        assignedCounsellorId: counsellorId,
        lifecycleState,
      },
    });
    return row.id;
  }

  describe('migration', () => {
    it('0006_lifecycle.sql is additive only — no DROP/TRUNCATE/DELETE in the actual SQL (comments excluded)', () => {
      const raw = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0006_lifecycle.sql'),
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

    it('applied cleanly — new columns are queryable and existing case_stage is untouched', async () => {
      const { userId } = await registerVictim('Migration Check Victim');
      const caseId = await createCase(userId, null);
      const row = await prisma.case.findUnique({ where: { id: caseId } });
      expect(row?.lifecycleState).toBe('REGISTERED');
      expect(row?.caseStage).toBe('registered'); // legacy column, untouched, different casing/values entirely
    });
  });

  describe('valid transitions', () => {
    it('a district_admin can move a case through REGISTERED -> MONITORING -> ESCALATED', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Transition Test Victim', 'Pune');
      const caseId = await createCase(userId, null);

      const r1 = await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'MONITORING' })
        .expect(200);
      expect(r1.body.newState).toBe('MONITORING');
      expect(r1.body.previousState).toBe('REGISTERED');

      const r2 = await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'ESCALATED' })
        .expect(200);
      expect(r2.body.newState).toBe('ESCALATED');
    });
  });

  describe('invalid transitions', () => {
    it('rejects a transition not in the matrix (409), and the case is unchanged', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Invalid Transition Victim', 'Pune');
      const caseId = await createCase(userId, null); // starts REGISTERED

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'ESCALATED' }) // must go through MONITORING first
        .expect(409);

      const row = await prisma.case.findUnique({ where: { id: caseId } });
      expect(row?.lifecycleState).toBe('REGISTERED');
    });

    it('an unrecognized target state is rejected by DTO validation (400)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Bad Value Victim', 'Pune');
      const caseId = await createCase(userId, null);

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'NOT_A_REAL_STATE' })
        .expect(400);
    });
  });

  describe('unauthorized staff', () => {
    it('unauthenticated request is denied (401)', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${randomUUID()}/lifecycle`)
        .send({ targetState: 'MONITORING' })
        .expect(401);
    });

    it('a victim session token cannot call the lifecycle endpoint', async () => {
      const { userId } = await registerVictim('Real Victim For Token Test', 'Pune');
      const phone = nextPhone();
      // reuse the real registration token by logging in again via OTP for a NEW victim, since we need a genuine victim_session token — simplest: register once more and use its returned token
      const capture = captureNextOtp();
      await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phoneNumber: phone }).expect(201);
      const code = capture.get();
      const verify = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phoneNumber: phone, code })
        .expect(201);
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${verify.body.token}`)
        .send({ name: 'Victim Token Holder', roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
        .expect(201);

      const caseId = await createCase(userId, null);
      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${reg.body.token}`)
        .send({ targetState: 'MONITORING' })
        .expect(401);
    });

    it('a valid staff session for a user with no staff row is denied (403)', async () => {
      const { userId: staffishUserId } = await registerVictim('Not Actually Staff');
      const token = staffTokenService.issueStaffSessionToken(staffishUserId);
      const { userId } = await registerVictim('Some Victim', 'Pune');
      const caseId = await createCase(userId, null);

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'MONITORING' })
        .expect(403);
    });
  });

  describe('cross-district denial', () => {
    it('a district_admin cannot transition a case outside their district_scope', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Mumbai Victim', 'Mumbai');
      const caseId = await createCase(userId, null);

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'MONITORING' })
        .expect(403);
    });
  });

  describe('cross-assignment denial', () => {
    it('a counsellor cannot transition a case assigned to a different counsellor', async () => {
      const myCounsellorId = await createCounsellor('Pune');
      const otherCounsellorId = await createCounsellor('Pune');
      const { token } = await createStaffAndToken('counsellor', { counsellorId: myCounsellorId });
      const { userId } = await registerVictim('Other Counsellor Victim', 'Pune');
      const caseId = await createCase(userId, otherCounsellorId);

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'MONITORING' })
        .expect(403);
    });
  });

  describe('unrelated-ID denial', () => {
    it("a coincidental match between a staff member's users.id and a counsellors.id grants nothing", async () => {
      const realCounsellorId = await createCounsellor('Pune');
      const { userId } = await registerVictim('Victim For Coincidence Test', 'Pune');
      const caseId = await createCase(userId, realCounsellorId);

      const { userId: coincidentalUserId, token } = await createStaffAndToken('counsellor', { counsellorId: null });
      await prisma.counsellor.create({
        data: {
          id: coincidentalUserId,
          name: 'Coincidental Counsellor',
          district: 'Pune',
          languages: ['en'],
          currentCaseload: 0,
          caseloadCap: 80,
        },
      });

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'MONITORING' })
        .expect(403);
    });
  });

  describe('concurrent transitions (real disposable PostgreSQL)', () => {
    it('two concurrent, conflicting transition requests for the same case never both succeed', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Concurrency Test Victim', 'Pune');
      const caseId = await createCase(userId, null, 'MONITORING');

      // Both requests read the same starting state (MONITORING) and race
      // to move it to two DIFFERENT, individually-valid target states.
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/v1/console/cases/${caseId}/lifecycle`)
          .set('Authorization', `Bearer ${token}`)
          .send({ targetState: 'ESCALATED' }),
        request(app.getHttpServer())
          .patch(`/v1/console/cases/${caseId}/lifecycle`)
          .set('Authorization', `Bearer ${token}`)
          .send({ targetState: 'PAUSED' }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      // Exactly one must succeed (200) and the other must be rejected as a
      // real conflict (409) — never both 200 (a lost update), and never
      // both 409 (a false negative that would make the endpoint unusable
      // under any real concurrency).
      expect(statuses).toEqual([200, 409]);

      const finalRow = await prisma.case.findUnique({ where: { id: caseId } });
      const winner = resA.status === 200 ? 'ESCALATED' : 'PAUSED';
      expect(finalRow?.lifecycleState).toBe(winner);

      // Exactly one audit row was written — the rejected request never
      // reached the audit call.
      const auditRows = await prisma.staffAuditLog.findMany({ where: { resourceId: caseId } });
      expect(auditRows).toHaveLength(1);
    });
  });

  describe('opt-out behavior', () => {
    it('transitioning a case to OPTED_OUT stamps the victim-level optedOutAt marker in the same request', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Opt Out Victim', 'Pune');
      const caseId = await createCase(userId, null, 'MONITORING');

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'OPTED_OUT' })
        .expect(200);

      const profile = await prisma.victimProfile.findUnique({ where: { userId } });
      expect(profile?.optedOutAt).not.toBeNull();
    });

    it('a transition that does not reach OPTED_OUT never creates a victim_profiles row', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('No Opt Out Victim', 'Pune');
      const caseId = await createCase(userId, null);

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'MONITORING' })
        .expect(200);

      const profile = await prisma.victimProfile.findUnique({ where: { userId } });
      expect(profile).toBeNull();
    });
  });

  describe('audit hook', () => {
    it('a successful transition writes exactly one audit row with IDs/codes only, atomically with the transition', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Audit Hook Victim', 'Pune');
      const caseId = await createCase(userId, null);

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'MONITORING' })
        .expect(200);

      const rows = await prisma.staffAuditLog.findMany({ where: { resourceId: caseId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('lifecycle.case.transition');
      expect(rows[0].resourceType).toBe('case');
      expect(rows[0].reason).toBeNull();
      expect(JSON.stringify(rows[0])).not.toContain('MONITORING'); // state values are not logged
    });

    it('a rejected (invalid) transition writes no audit row', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('No Audit On Reject Victim', 'Pune');
      const caseId = await createCase(userId, null); // REGISTERED

      await request(app.getHttpServer())
        .patch(`/v1/console/cases/${caseId}/lifecycle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetState: 'ESCALATED' })
        .expect(409);

      const rows = await prisma.staffAuditLog.findMany({ where: { resourceId: caseId } });
      expect(rows).toHaveLength(0);
    });
  });
});
