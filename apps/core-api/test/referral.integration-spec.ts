/**
 * S9 integration test: the referral domain (draft/transition/consent-gate/
 * SLA/concurrency), against a REAL, isolated, throwaway PostgreSQL instance
 * (test/pg-harness.ts). Runs the full Nest app over real HTTP (supertest),
 * with backend/schema.sql plus every migration through
 * backend/migrations/0008_referral_in_service_at.sql applied (S10 added
 * `in_service_at` to the same `referrals` table S9 created — every suite
 * that writes a Referral row needs it applied, the same lesson S8's own
 * "Known limitations" section documented for `0006_lifecycle.sql`). No
 * real victim data anywhere — only synthetic, clearly-fake identifiers.
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

const PORT = 55560; // distinct from 55555 (S4) .. 55559 (S8)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;
let staffService: StaffService;
let staffTokenService: StaffTokenService;

describeIfPostgres('Referral domain — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_referral_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
      '0005_staff.sql',
      '0006_lifecycle.sql',
      '0007_referrals.sql',
      '0008_referral_in_service_at.sql',
      '0009_audit_hash_chain.sql',
      '0013_referral_ack_token.sql',
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
    await prisma.referral.deleteMany({});
    await prisma.staffAuditLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.case.deleteMany({});
    await prisma.counsellor.deleteMany({});
    await prisma.consent.deleteMany({});
    await prisma.victimProfile.deleteMany({});
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
    return `+91000001${String(1000 + seq)}`;
  }

  async function registerVictim(name: string, district = 'Pune'): Promise<{ userId: string }> {
    const row = await prisma.user.create({
      data: {
        phoneNumber: nextPhone(),
        name,
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

  async function createCase(userId: string, counsellorId: string | null, caseType = 'unspecified'): Promise<string> {
    const row = await prisma.case.create({
      data: {
        userId,
        caseType,
        intakeChannel: 'app',
        caseStage: 'registered',
        assignedCounsellorId: counsellorId,
        lifecycleState: 'MONITORING',
      },
    });
    return row.id;
  }

  async function grantConsent(userId: string, scope: string, granted = true): Promise<void> {
    await prisma.consent.create({
      data: { userId, scope, granted, textVersionHash: 'test-hash', channel: 'app', capturedBy: 'self' },
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

  describe('migration', () => {
    it('0007_referrals.sql is additive only — no DROP/TRUNCATE/DELETE in the actual SQL (comments excluded)', () => {
      const raw = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0007_referrals.sql'),
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

    it('applied cleanly — a referral row is queryable via real Prisma Client', async () => {
      const { userId } = await registerVictim('Migration Check Victim');
      const caseId = await createCase(userId, null);
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });

      const res = await draftReferral(token, caseId, 'mental_health', { needSummary: 'Wants to talk' });
      expect(res.status).toBe(201);
      const row = await prisma.referral.findUnique({ where: { id: res.body.referral.id } });
      expect(row?.status).toBe('DRAFTED');
    });
  });

  describe('draft + full happy-path transition sequence (real HTTP)', () => {
    it('DRAFTED -> APPROVED -> SENT -> ACKNOWLEDGED -> IN_SERVICE -> DELIVERED -> VERIFIED', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Happy Path Victim', 'Pune');
      const caseId = await createCase(userId, null, 'poa_act_offence');
      await grantConsent(userId, 'share_welfare');

      const draft = await draftReferral(token, caseId, 'welfare', { reliefStagePending: 'First instalment' });
      expect(draft.status).toBe(201);
      expect(draft.body.referral.status).toBe('DRAFTED');
      expect(draft.body.referral.packetData.crimeCategory).toBe('poa_act_offence');
      const referralId = draft.body.referral.id;

      const approved = await transitionReferral(token, referralId, 'APPROVED');
      expect(approved.status).toBe(200);
      expect(approved.body.referral.status).toBe('APPROVED');

      const sent = await transitionReferral(token, referralId, 'SENT');
      expect(sent.status).toBe(200);
      expect(sent.body.referral.sentAt).not.toBeNull();
      expect(sent.body.referral.ackDueAt).not.toBeNull();
      expect(sent.body.referral.idempotencyKey).toBe(`${referralId}:1`);

      const acked = await transitionReferral(token, referralId, 'ACKNOWLEDGED');
      expect(acked.status).toBe(200);
      expect(acked.body.referral.ackedAt).not.toBeNull();
      expect(acked.body.referral.serviceDueAt).not.toBeNull();

      await transitionReferral(token, referralId, 'IN_SERVICE').expect(200);

      const delivered = await transitionReferral(token, referralId, 'DELIVERED');
      expect(delivered.body.referral.deliveredAt).not.toBeNull();

      const verified = await transitionReferral(token, referralId, 'VERIFIED');
      expect(verified.body.referral.status).toBe('VERIFIED');
      expect(verified.body.referral.verifiedAt).not.toBeNull();
    });
  });

  describe('consent gate (real HTTP)', () => {
    it('blocks SENT with 409 when consent is not granted, and allows it once granted', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Consent Gate Victim', 'Pune');
      const caseId = await createCase(userId, null);

      const draft = await draftReferral(token, caseId, 'legal_aid', { legalIssueSummary: 'Investigation delay' });
      const referralId = draft.body.referral.id;
      await transitionReferral(token, referralId, 'APPROVED').expect(200);

      await transitionReferral(token, referralId, 'SENT').expect(409);
      let row = await prisma.referral.findUnique({ where: { id: referralId } });
      expect(row?.status).toBe('APPROVED');

      await grantConsent(userId, 'share_legal_aid');
      await transitionReferral(token, referralId, 'SENT').expect(200);
      row = await prisma.referral.findUnique({ where: { id: referralId } });
      expect(row?.status).toBe('SENT');
    });
  });

  describe('invalid transitions', () => {
    it('rejects a transition not in the matrix (409), and the referral is unchanged', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Invalid Transition Victim', 'Pune');
      const caseId = await createCase(userId, null);
      const draft = await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' });
      const referralId = draft.body.referral.id;

      await transitionReferral(token, referralId, 'SENT').expect(409); // must go through APPROVED first

      const row = await prisma.referral.findUnique({ where: { id: referralId } });
      expect(row?.status).toBe('DRAFTED');
    });

    it('a DTO-level invalid target state is rejected (400)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Bad Value Victim', 'Pune');
      const caseId = await createCase(userId, null);
      const draft = await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' });

      await transitionReferral(token, draft.body.referral.id, 'NOT_A_REAL_STATE').expect(400);
    });

    it('an invalid destinationType is rejected (400) at draft time', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Bad Destination Victim', 'Pune');
      const caseId = await createCase(userId, null);

      await request(app.getHttpServer())
        .post(`/v1/console/cases/${caseId}/referrals`)
        .set('Authorization', `Bearer ${token}`)
        .send({ destinationType: 'not_a_real_destination', fields: {} })
        .expect(400);
    });

    it('a missing required staff-entered field is rejected (400)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Missing Field Victim', 'Pune');
      const caseId = await createCase(userId, null);

      await draftReferral(token, caseId, 'protection', {}).expect(400);
    });
  });

  describe('unauthorized staff', () => {
    it('unauthenticated request is denied (401)', async () => {
      await request(app.getHttpServer())
        .post(`/v1/console/cases/${randomUUID()}/referrals`)
        .send({ destinationType: 'mental_health', fields: { needSummary: 'x' } })
        .expect(401);
    });

    it('a valid staff session for a user with no staff row is denied (403)', async () => {
      const { userId: staffishUserId } = await registerVictim('Not Actually Staff');
      const token = staffTokenService.issueStaffSessionToken(staffishUserId);
      const { userId } = await registerVictim('Some Victim', 'Pune');
      const caseId = await createCase(userId, null);

      await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' }).expect(403);
    });

    it('state_admin (oversight-tier) is denied — no individual-record access', async () => {
      const { token } = await createStaffAndToken('state_admin');
      const { userId } = await registerVictim('Oversight Denied Victim', 'Pune');
      const caseId = await createCase(userId, null);

      await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' }).expect(403);
    });
  });

  describe('cross-district denial', () => {
    it('a district_admin cannot draft a referral for a case outside their district_scope', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Mumbai Victim', 'Mumbai');
      const caseId = await createCase(userId, null);

      await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' }).expect(403);
    });
  });

  describe('cross-assignment denial', () => {
    it('a counsellor cannot draft a referral for a case assigned to a different counsellor', async () => {
      const myCounsellorId = await createCounsellor('Pune');
      const otherCounsellorId = await createCounsellor('Pune');
      const { token } = await createStaffAndToken('counsellor', { counsellorId: myCounsellorId });
      const { userId } = await registerVictim('Other Counsellor Victim', 'Pune');
      const caseId = await createCase(userId, otherCounsellorId);

      await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' }).expect(403);
    });

    it('a counsellor cannot transition a referral belonging to a different counsellor\'s case', async () => {
      const myCounsellorId = await createCounsellor('Pune');
      const otherCounsellorId = await createCounsellor('Pune');
      const { token: myToken } = await createStaffAndToken('counsellor', { counsellorId: myCounsellorId });
      const { token: otherToken } = await createStaffAndToken('counsellor', { counsellorId: otherCounsellorId });
      const { userId } = await registerVictim('Assignment Test Victim', 'Pune');
      const caseId = await createCase(userId, myCounsellorId);

      const draft = await draftReferral(myToken, caseId, 'mental_health', { needSummary: 'x' });
      await transitionReferral(otherToken, draft.body.referral.id, 'APPROVED').expect(403);
    });
  });

  describe('concurrent transitions (real disposable PostgreSQL)', () => {
    it('two concurrent, conflicting transition requests for the same referral never both succeed', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Concurrency Test Victim', 'Pune');
      const caseId = await createCase(userId, null);
      await grantConsent(userId, 'share_mental_health');
      const draft = await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' });
      const referralId = draft.body.referral.id;
      await transitionReferral(token, referralId, 'APPROVED').expect(200);
      await transitionReferral(token, referralId, 'SENT').expect(200);

      // Both requests read the same starting state (SENT) and race to move
      // it to two DIFFERENT, individually-valid target states.
      const [resA, resB] = await Promise.all([
        transitionReferral(token, referralId, 'ACKNOWLEDGED'),
        transitionReferral(token, referralId, 'BOUNCED'),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 409]);

      const finalRow = await prisma.referral.findUnique({ where: { id: referralId } });
      const winner = resA.status === 200 ? 'ACKNOWLEDGED' : 'BOUNCED';
      expect(finalRow?.status).toBe(winner);

      // 3 total: the two prior sequential transitions (APPROVED, SENT)
      // plus exactly ONE of the two racing requests — the rejected racer
      // never reached the audit call.
      const auditRows = await prisma.staffAuditLog.findMany({
        where: { resourceId: referralId, action: 'referral.transition' },
      });
      expect(auditRows).toHaveLength(3);
    });
  });

  describe('audit hook', () => {
    it('a successful draft and transition each write exactly one audit row with IDs/codes only', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Audit Hook Victim', 'Pune');
      const caseId = await createCase(userId, null);

      const draft = await draftReferral(token, caseId, 'mental_health', { needSummary: 'SENSITIVE_NARRATIVE_MARKER' });
      const referralId = draft.body.referral.id;
      await transitionReferral(token, referralId, 'APPROVED').expect(200);

      const rows = await prisma.staffAuditLog.findMany({ where: { resourceId: referralId } });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.action).sort()).toEqual(['referral.drafted', 'referral.transition']);
      for (const row of rows) {
        expect(JSON.stringify(row)).not.toContain('SENSITIVE_NARRATIVE_MARKER');
      }
    });

    it('a rejected (invalid) transition writes no additional audit row', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('No Audit On Reject Victim', 'Pune');
      const caseId = await createCase(userId, null);
      const draft = await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' });
      const referralId = draft.body.referral.id;

      await transitionReferral(token, referralId, 'SENT').expect(409); // must go through APPROVED

      const rows = await prisma.staffAuditLog.findMany({ where: { resourceId: referralId } });
      expect(rows).toHaveLength(1); // only the draft's own entry
    });
  });

  describe('S16: one-time acknowledgement link (real HTTP, PUBLIC — no staff auth)', () => {
    it('0013_referral_ack_token.sql is additive only — no DROP/TRUNCATE/DELETE (comments excluded)', () => {
      const raw = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0013_referral_ack_token.sql'),
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

    async function driveToSent(): Promise<{ referralId: string; rawAckToken: string }> {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Ack Token Victim', 'Pune');
      const caseId = await createCase(userId, null);
      await grantConsent(userId, 'share_mental_health');
      const draft = await draftReferral(token, caseId, 'mental_health', { needSummary: 'x' }).expect(201);
      const referralId = draft.body.referral.id;
      await transitionReferral(token, referralId, 'APPROVED').expect(200);
      const sent = await transitionReferral(token, referralId, 'SENT').expect(200);
      expect(sent.body.referral.rawAckToken).toBeDefined();
      return { referralId, rawAckToken: sent.body.referral.rawAckToken };
    }

    it('GET /v1/ack/:token with NO auth header returns only a reference number', async () => {
      const { referralId, rawAckToken } = await driveToSent();

      const res = await request(app.getHttpServer()).get(`/v1/ack/${rawAckToken}`).expect(200);
      expect(res.body.referenceNumber).toBe(referralId);
      expect(Object.keys(res.body)).toEqual(['result', 'referenceNumber']);
    });

    it('POST /v1/ack/:token with NO auth header acknowledges the referral', async () => {
      const { referralId, rawAckToken } = await driveToSent();

      await request(app.getHttpServer()).post(`/v1/ack/${rawAckToken}`).expect(201);

      const row = await prisma.referral.findUnique({ where: { id: referralId } });
      expect(row?.status).toBe('ACKNOWLEDGED');
      expect(row?.ackedAt).not.toBeNull();
    });

    it('the same token cannot be used twice (404 on the second attempt)', async () => {
      const { rawAckToken } = await driveToSent();
      await request(app.getHttpServer()).post(`/v1/ack/${rawAckToken}`).expect(201);
      await request(app.getHttpServer()).post(`/v1/ack/${rawAckToken}`).expect(404);
    });

    it('a made-up token gets the same 404 as an already-used one — no information leakage', async () => {
      await request(app.getHttpServer()).post('/v1/ack/not-a-real-token-at-all').expect(404);
      await request(app.getHttpServer()).get('/v1/ack/not-a-real-token-at-all').expect(404);
    });

    it('two genuinely concurrent uses of the same token: exactly one succeeds', async () => {
      const { rawAckToken } = await driveToSent();

      const [a, b] = await Promise.all([
        request(app.getHttpServer()).post(`/v1/ack/${rawAckToken}`),
        request(app.getHttpServer()).post(`/v1/ack/${rawAckToken}`),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 404]);
    });

    it('no audit row is created for a public token acknowledgement', async () => {
      const { referralId, rawAckToken } = await driveToSent();
      const before = await prisma.staffAuditLog.count();

      await request(app.getHttpServer()).post(`/v1/ack/${rawAckToken}`).expect(201);

      const after = await prisma.staffAuditLog.count();
      expect(after).toBe(before);
      // sanity: the referral itself really did change, just with no audit trail.
      const row = await prisma.referral.findUnique({ where: { id: referralId } });
      expect(row?.status).toBe('ACKNOWLEDGED');
    });
  });
});
