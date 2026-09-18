/**
 * S11 integration test: audit hash-chain tamper-evidence, against a REAL,
 * isolated, throwaway PostgreSQL instance (test/pg-harness.ts). Runs the
 * full Nest app over real HTTP (supertest), with backend/schema.sql plus
 * every migration through backend/migrations/0009_audit_hash_chain.sql
 * applied. The critical property this suite proves that no unit test
 * (which only simulates concurrency against a synchronous in-memory fake)
 * can: that StaffAuditService's claim-and-retry logic is actually safe
 * against Postgres's REAL row-locking behavior under genuinely concurrent
 * HTTP requests, not just a hand-simulated race. No real victim data
 * anywhere — only synthetic, clearly-fake identifiers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAuditService } from '../src/staff/staff-audit.service';
import { StaffService } from '../src/staff/staff.service';
import { StaffTokenService } from '../src/staff/staff-token.service';
import { describeIfPostgres, startThrowawayPostgres, stopThrowawayPostgres, ThrowawayPostgres } from './pg-harness';

const PORT = 55562; // distinct from 55555 (S4) .. 55561 (S10)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;
let staffService: StaffService;
let staffTokenService: StaffTokenService;
let auditService: StaffAuditService;

describeIfPostgres('Audit hash chain — real PostgreSQL integration', () => {
  jest.setTimeout(120000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_audit_chain_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
      '0005_staff.sql',
      '0006_lifecycle.sql',
      '0009_audit_hash_chain.sql',
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
    auditService = moduleRef.get(StaffAuditService);
  });

  afterEach(async () => {
    await prisma.staffAuditLog.deleteMany({});
    await prisma.staffAuditChainHead.update({ where: { id: 1 }, data: { tipHash: GENESIS_HASH } });
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

  const GENESIS_HASH = 'f60ab132aafb26848316d3e8ad3395d0dc40d7a93049d4d84a4145cc01e79171';

  let seq = 0;
  function nextPhone(): string {
    seq += 1;
    return `+91000003${String(3000 + seq)}`;
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

  async function createStaffAndToken(district = 'Pune'): Promise<{ token: string }> {
    const { userId } = await registerVictim(district);
    await staffService.createStaff({ userId, role: 'district_admin', districtScope: [district] });
    const token = staffTokenService.issueStaffSessionToken(userId);
    return { token };
  }

  describe('migration', () => {
    it('0009_audit_hash_chain.sql is additive only — no DROP/TRUNCATE/DELETE (comments excluded)', () => {
      const raw = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0009_audit_hash_chain.sql'),
        'utf-8',
      );
      const sqlOnly = raw
        .split('\n')
        .map((line: string) => line.replace(/--.*$/, ''))
        .join('\n')
        .toUpperCase();
      expect(sqlOnly).not.toMatch(/\bDROP\b/);
      expect(sqlOnly).not.toMatch(/\bTRUNCATE\b/);
      expect(sqlOnly).not.toMatch(/\bDELETE\s+FROM\b/);
    });

    it('the chain head is seeded with the real genesis hash on a fresh database', async () => {
      const head = await prisma.staffAuditChainHead.findUnique({ where: { id: 1 } });
      expect(head?.tipHash).toBe(GENESIS_HASH);
    });
  });

  describe('sequential real-HTTP audit writes form a valid chain', () => {
    it('several console reads from real HTTP requests produce a verifiable chain', async () => {
      const { token } = await createStaffAndToken('Pune');
      for (let i = 0; i < 5; i += 1) {
        await request(app.getHttpServer()).get('/v1/console/queue').set('Authorization', `Bearer ${token}`).expect(200);
      }

      const rows = await prisma.staffAuditLog.findMany({});
      expect(rows).toHaveLength(5);

      const result = await auditService.verifyChainIntegrity();
      expect(result.valid).toBe(true);
      expect(result.rowsVerified).toBe(5);
    });
  });

  describe('genuinely concurrent real-HTTP audit writes (the critical property)', () => {
    it('20 concurrent console-queue requests each write exactly one audit row, and the resulting chain is fully valid — no lost writes, no forks, no broken links', async () => {
      const { token } = await createStaffAndToken('Pune');
      const CONCURRENCY = 20;

      const responses = await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          request(app.getHttpServer()).get('/v1/console/queue').set('Authorization', `Bearer ${token}`),
        ),
      );
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      const rows = await prisma.staffAuditLog.findMany({});
      // Every single concurrent request's audit write must be present —
      // none silently lost to a race, none double-counted.
      expect(rows).toHaveLength(CONCURRENCY);

      const result = await auditService.verifyChainIntegrity();
      expect(result.valid).toBe(true);
      expect(result.rowsVerified).toBe(CONCURRENCY);

      // Every row's prevHash must be genuinely unique — a fork (two rows
      // claiming the same prevHash) would mean the concurrency-safety
      // claim was actually violated under real Postgres load.
      const prevHashes = rows.map((r) => r.prevHash);
      expect(new Set(prevHashes).size).toBe(CONCURRENCY);
    });

    it('concurrent writes from MULTIPLE domains (console reads + lifecycle transitions) still form one valid chain', async () => {
      const { token: consoleToken } = await createStaffAndToken('Pune');
      const { token: lifecycleToken } = await createStaffAndToken('Pune');
      const { userId } = await registerVictim('Pune');
      const cases = await Promise.all(
        Array.from({ length: 5 }, () =>
          prisma.case.create({
            data: { userId, caseType: 'unspecified', intakeChannel: 'app', caseStage: 'registered' },
          }),
        ),
      );

      const requests = [
        ...Array.from({ length: 5 }, () =>
          request(app.getHttpServer()).get('/v1/console/queue').set('Authorization', `Bearer ${consoleToken}`),
        ),
        ...cases.map((c) =>
          request(app.getHttpServer())
            .patch(`/v1/console/cases/${c.id}/lifecycle`)
            .set('Authorization', `Bearer ${lifecycleToken}`)
            .send({ targetState: 'MONITORING' }),
        ),
      ];
      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect([200, 201]).toContain(res.status);
      }

      const rows = await prisma.staffAuditLog.findMany({});
      expect(rows).toHaveLength(10); // 5 console reads + 5 lifecycle transitions

      const result = await auditService.verifyChainIntegrity();
      expect(result.valid).toBe(true);
      expect(result.rowsVerified).toBe(10);
    });
  });

  describe('tamper detection against real, persisted rows', () => {
    it('directly modifying a persisted row via raw SQL is detected by verification', async () => {
      const { token } = await createStaffAndToken('Pune');
      await request(app.getHttpServer()).get('/v1/console/queue').set('Authorization', `Bearer ${token}`).expect(200);

      const [row] = await prisma.staffAuditLog.findMany({});
      // Simulate a database-level tamper attempt (e.g. a compromised
      // service-role credential editing a row directly) — bypasses
      // StaffAuditService entirely, which is the whole point of this test.
      await prisma.$executeRawUnsafe(
        `UPDATE staff_audit_log SET action = 'lifecycle.case.transition' WHERE id = $1::uuid`,
        row.id,
      );

      const result = await auditService.verifyChainIntegrity();
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/stored hash does not match recomputed hash/);
      expect(result.brokenRowId).toBe(row.id);
    });

    it('deleting a row from the chain is detected by verification', async () => {
      const { token } = await createStaffAndToken('Pune');
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer()).get('/v1/console/queue').set('Authorization', `Bearer ${token}`).expect(200);
      }
      const rows = await prisma.staffAuditLog.findMany({ orderBy: { createdAt: 'asc' } });
      await prisma.staffAuditLog.delete({ where: { id: rows[1].id } }); // delete the middle row

      const result = await auditService.verifyChainIntegrity();
      expect(result.valid).toBe(false);
    });
  });
});
