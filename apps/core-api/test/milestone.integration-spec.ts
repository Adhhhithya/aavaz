/**
 * S13 integration test: the milestone domain (case-manager data entry,
 * marking met, listing), against a REAL, isolated, throwaway PostgreSQL
 * instance (test/pg-harness.ts). Runs the full Nest app over real HTTP
 * (supertest), with backend/schema.sql plus 0002-0006, 0009 (the audit
 * hash-chain — MilestoneService calls StaffAuditService.record(), which
 * requires staff_audit_chain_head to exist since S11), and
 * 0011_milestones.sql applied. 0007/0008/0010 (referrals/tasks) are
 * skipped — this suite never touches those tables, the same
 * apply-only-what's-needed discipline S9/S10/S12's own docs established.
 * No real victim data anywhere — only synthetic, clearly-fake
 * identifiers.
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

const PORT = 55564; // distinct from 55555 (S4) .. 55563 (S12)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;
let staffService: StaffService;
let staffTokenService: StaffTokenService;

describeIfPostgres('Milestone domain — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_milestone_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
      '0005_staff.sql',
      '0006_lifecycle.sql',
      '0009_audit_hash_chain.sql',
      '0011_milestones.sql',
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
    await prisma.milestone.deleteMany({});
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
    return `+91000005${String(5000 + seq)}`;
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
  ): Promise<{ token: string }> {
    const { userId } = await registerVictim('Pune');
    await staffService.createStaff({
      userId,
      role,
      districtScope: opts.districtScope ?? [],
      counsellorId: opts.counsellorId ?? null,
    });
    const token = staffTokenService.issueStaffSessionToken(userId);
    return { token };
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

  function createMilestone(token: string, caseId: string, type: string, dueAt?: string) {
    return request(app.getHttpServer())
      .post(`/v1/console/cases/${caseId}/milestones`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type, ...(dueAt ? { dueAt } : {}) });
  }

  function markMilestoneMet(token: string, milestoneId: string, metAt?: string) {
    return request(app.getHttpServer())
      .patch(`/v1/console/milestones/${milestoneId}/met`)
      .set('Authorization', `Bearer ${token}`)
      .send(metAt ? { metAt } : {});
  }

  function listMilestones(token: string, caseId: string) {
    return request(app.getHttpServer())
      .get(`/v1/console/cases/${caseId}/milestones`)
      .set('Authorization', `Bearer ${token}`);
  }

  describe('migration', () => {
    it('0011_milestones.sql is additive only — no DROP/TRUNCATE/DELETE (comments excluded)', () => {
      const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0011_milestones.sql'), 'utf-8');
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

  describe('create + mark met + list (real HTTP end-to-end)', () => {
    it('records a milestone, marks it met, and lists it back', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);

      const created = await createMilestone(token, caseId, 'chargesheet_filed').expect(201);
      expect(created.body.milestone.metAt).toBeNull();

      const acked = await markMilestoneMet(token, created.body.milestone.id).expect(200);
      expect(acked.body.milestone.metAt).not.toBeNull();

      const list = await listMilestones(token, caseId).expect(200);
      expect(list.body.milestones).toHaveLength(1);
      expect(list.body.milestones[0].type).toBe('chargesheet_filed');
    });

    it('accepts a real staff-supplied dueAt and metAt', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);

      const created = await createMilestone(token, caseId, 'relief_instalment_paid', '2026-06-01T00:00:00.000Z').expect(
        201,
      );
      expect(created.body.milestone.dueAt).toBe('2026-06-01T00:00:00.000Z');

      const acked = await markMilestoneMet(token, created.body.milestone.id, '2026-05-20T00:00:00.000Z').expect(200);
      expect(acked.body.milestone.metAt).toBe('2026-05-20T00:00:00.000Z');
    });
  });

  describe('invalid input', () => {
    it('an unrecognized milestone type is rejected (400)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);

      await createMilestone(token, caseId, 'bail_granted').expect(400);
    });

    it('marking an already-met milestone met again is rejected (409)', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      const created = await createMilestone(token, caseId, 'fir_filed').expect(201);
      await markMilestoneMet(token, created.body.milestone.id).expect(200);

      await markMilestoneMet(token, created.body.milestone.id).expect(409);
    });
  });

  describe('unauthorized staff', () => {
    it('unauthenticated request is denied (401)', async () => {
      await request(app.getHttpServer())
        .post(`/v1/console/cases/${randomUUID()}/milestones`)
        .send({ type: 'fir_filed' })
        .expect(401);
    });

    it('state_admin (oversight-tier) is denied (403)', async () => {
      const { token } = await createStaffAndToken('state_admin');
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);

      await createMilestone(token, caseId, 'fir_filed').expect(403);
    });
  });

  describe('cross-district denial', () => {
    it('a district_admin cannot record a milestone for a case outside their district_scope', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Mumbai');
      const caseId = await createCase(userId);

      await createMilestone(token, caseId, 'fir_filed').expect(403);
    });
  });

  describe('cross-assignment denial', () => {
    it('a counsellor cannot mark met a milestone belonging to a different counsellor\'s case', async () => {
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
      const created = await createMilestone(myToken, caseId, 'fir_filed').expect(201);

      await markMilestoneMet(otherToken, created.body.milestone.id).expect(403);
    });
  });

  describe('audit hook', () => {
    it('records create/markMet/list as separate audit rows', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune');
      const caseId = await createCase(userId);
      const created = await createMilestone(token, caseId, 'fir_filed').expect(201);
      await markMilestoneMet(token, created.body.milestone.id).expect(200);
      await listMilestones(token, caseId).expect(200);

      const rows = await prisma.staffAuditLog.findMany({ orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => r.action)).toEqual(['milestone.created', 'milestone.marked_met', 'milestone.list.read']);
    });
  });
});
