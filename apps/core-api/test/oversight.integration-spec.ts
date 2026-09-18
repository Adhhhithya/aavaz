/**
 * S10 integration test: the oversight domain (district metrics,
 * small-count suppression, role/district scoping), against a REAL,
 * isolated, throwaway PostgreSQL instance (test/pg-harness.ts). Runs the
 * full Nest app over real HTTP (supertest), with backend/schema.sql plus
 * every migration through
 * backend/migrations/0008_referral_in_service_at.sql applied. No real
 * victim data anywhere — only synthetic, clearly-fake identifiers.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffService } from '../src/staff/staff.service';
import { StaffTokenService } from '../src/staff/staff-token.service';
import { StaffRole } from '../src/staff/staff-roles';
import { describeIfPostgres, startThrowawayPostgres, stopThrowawayPostgres, ThrowawayPostgres } from './pg-harness';

const PORT = 55561; // distinct from 55555 (S4) .. 55560 (S9)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;
let staffService: StaffService;
let staffTokenService: StaffTokenService;

describeIfPostgres('Oversight domain — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_oversight_test', [
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
    await prisma.referral.deleteMany({});
    await prisma.staffAuditLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.case.deleteMany({});
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
    return `+91000002${String(2000 + seq)}`;
  }

  async function registerVictim(district: string): Promise<{ userId: string }> {
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
    opts: { districtScope?: string[] } = {},
  ): Promise<{ token: string }> {
    seq += 1;
    const { userId } = await registerVictim('Pune');
    await staffService.createStaff({ userId, role, districtScope: opts.districtScope ?? [] });
    const token = staffTokenService.issueStaffSessionToken(userId);
    return { token };
  }

  async function createCaseAndStaffForReferral(district: string) {
    const { userId } = await registerVictim(district);
    const caseRow = await prisma.case.create({
      data: { userId, caseType: 'unspecified', intakeChannel: 'app', caseStage: 'registered' },
    });
    const draftingStaff = await staffService.createStaff({
      userId: (await registerVictim(district)).userId,
      role: 'district_admin',
      districtScope: [district],
    });
    return { userId, caseId: caseRow.id, draftingStaff };
  }

  async function seedReferralViaHttp(district: string, destinationType: string, fields: Record<string, unknown>) {
    const { caseId, draftingStaff } = await createCaseAndStaffForReferral(district);
    const draftingToken = staffTokenService.issueStaffSessionToken(draftingStaff.userId);
    const draft = await request(app.getHttpServer())
      .post(`/v1/console/cases/${caseId}/referrals`)
      .set('Authorization', `Bearer ${draftingToken}`)
      .send({ destinationType, fields })
      .expect(201);
    return draft.body.referral.id;
  }

  function getMetrics(token: string, district: string) {
    return request(app.getHttpServer())
      .get(`/v1/oversight/districts/${district}/metrics`)
      .set('Authorization', `Bearer ${token}`);
  }

  describe('role gating (real HTTP)', () => {
    it('a district_admin (individual-record tier) is denied (403)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      await getMetrics(token, 'Pune').expect(403);
    });

    it('unauthenticated request is denied (401)', async () => {
      await request(app.getHttpServer()).get('/v1/oversight/districts/Pune/metrics').expect(401);
    });

    it('a national_admin is allowed (200)', async () => {
      const { token } = await createStaffAndToken('national_admin');
      const res = await getMetrics(token, 'Pune').expect(200);
      expect(res.body.metrics.districtCode).toBe('Pune');
    });
  });

  describe('district scoping', () => {
    it('a scoped state_admin cannot query a district outside their scope (403)', async () => {
      const { token } = await createStaffAndToken('state_admin', { districtScope: ['Pune'] });
      await getMetrics(token, 'Mumbai').expect(403);
    });

    it('an unscoped national_admin can query any district (200)', async () => {
      const { token } = await createStaffAndToken('national_admin', { districtScope: [] });
      await getMetrics(token, 'AnyDistrictWhatsoever').expect(200);
    });
  });

  describe('small-count suppression (real HTTP + real Postgres aggregation)', () => {
    it('suppresses a cell below 5 and reveals it once the threshold is reached', async () => {
      const { token } = await createStaffAndToken('national_admin');
      const district = `District-${seq}`;
      for (let i = 0; i < 4; i += 1) {
        await seedReferralViaHttp(district, 'mental_health', { needSummary: 'x' });
      }

      const below = await getMetrics(token, district).expect(200);
      expect(below.body.metrics.referralsByDestinationAndStatus.mental_health.DRAFTED.suppressed).toBe(true);
      expect(below.body.metrics.referralsByDestinationAndStatus.mental_health.DRAFTED.count).toBeNull();

      await seedReferralViaHttp(district, 'mental_health', { needSummary: 'x' });
      const atThreshold = await getMetrics(token, district).expect(200);
      expect(atThreshold.body.metrics.referralsByDestinationAndStatus.mental_health.DRAFTED.suppressed).toBe(false);
      expect(atThreshold.body.metrics.referralsByDestinationAndStatus.mental_health.DRAFTED.count).toBe(5);
    });
  });

  describe('district isolation', () => {
    it('referrals in one district never leak into another district\'s metrics', async () => {
      const { token } = await createStaffAndToken('national_admin');
      const districtA = `District-A-${seq}`;
      const districtB = `District-B-${seq}`;
      for (let i = 0; i < 6; i += 1) {
        await seedReferralViaHttp(districtA, 'mental_health', { needSummary: 'x' });
      }
      await seedReferralViaHttp(districtB, 'mental_health', { needSummary: 'x' });

      const metricsB = await getMetrics(token, districtB).expect(200);
      const cell = metricsB.body.metrics.referralsByDestinationAndStatus.mental_health?.DRAFTED;
      // District B has exactly 1 referral — must be suppressed, and must
      // never reflect district A's 6.
      expect(cell.suppressed).toBe(true);
      expect(cell.count).not.toBe(6);
    });
  });

  describe('audit hook', () => {
    it('a successful metrics read writes exactly one audit row', async () => {
      const { token } = await createStaffAndToken('national_admin');
      await getMetrics(token, 'Pune').expect(200);

      const rows = await prisma.staffAuditLog.findMany({ where: { action: 'oversight.metrics.read' } });
      expect(rows).toHaveLength(1);
      expect(rows[0].resourceType).toBe('district');
      expect(rows[0].resourceId).toBeNull();
    });
  });
});
