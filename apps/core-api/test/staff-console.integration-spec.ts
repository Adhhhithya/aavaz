/**
 * S7 integration test: staff identity + console authorization, against a
 * REAL, isolated, throwaway PostgreSQL instance (test/pg-harness.ts). Runs
 * the full Nest app over real HTTP (supertest), with backend/schema.sql
 * plus every migration through backend/migrations/0006_lifecycle.sql
 * applied (S8's additive columns are also required here — the shared
 * Prisma schema affects every Case insert regardless of milestone). No
 * real staff or victim data anywhere — only synthetic, clearly-fake
 * identifiers.
 *
 * This file proves, against real Postgres and real HTTP, every scenario
 * docs/S7_STAFF_CONSOLE_AUDIT.md's Section I threat model identified, and
 * every item in this milestone's explicit security-requirements list.
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
import { describeIfPostgres, startThrowawayPostgres, stopThrowawayPostgres, ThrowawayPostgres } from './pg-harness';

const PORT = 55558; // distinct from 55555 (S4), 55556 (S5), 55557 (S6)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;
let staffService: StaffService;
let staffTokenService: StaffTokenService;

describeIfPostgres('Staff identity + console authorization — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_staff_console_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
      '0005_staff.sql',
      '0006_lifecycle.sql',
      '0009_audit_hash_chain.sql',
    ]);
    process.env.DATABASE_URL = pgInstance.databaseUrl;
    process.env.NODE_ENV = 'development';
    // This suite registers many synthetic victims (one or more per test,
    // all from the same loopback IP via supertest) — well past the
    // default per-IP OTP rate limit (20). Raised here, for this test
    // process only, so the suite exercises real authorization scenarios
    // rather than incidentally re-testing OTP rate limiting (already
    // covered by otp.service.spec.ts).
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
    // Keep each test's authorization assertions accurate — without this,
    // a later test's district/queue check would see leftover cases from
    // every earlier test (all seeded into the same 'Pune'/'Mumbai'
    // district values), making "the queue is empty" or "only N cases"
    // assertions meaningless. FK-safe order: audit log -> staff -> case ->
    // counsellor -> user.
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
    return `+91000000${String(3000 + seq)}`;
  }

  /** Registers a real victim end-to-end (real OTP flow, real HTTP) and
   * returns their user id + location district, matching how S5/S6's own
   * integration suites establish real fixture data. */
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
      .send({
        name,
        roleType: 'victim',
        consentGiven: true,
        preferredLanguage: 'en',
        location: { lat: 18.5204, lng: 73.8567 }, // resolves to the mock "Mock District" via LocationService
      })
      .expect(201);
    // registration's own district resolution is a mock (S5) that always
    // returns "Mock District" — override it directly so this suite can
    // exercise real, distinct district values (Pune/Mumbai) without
    // depending on that mock's fixed output.
    await prisma.user.update({ where: { id: reg.body.userId }, data: { locationDistrict: district } });
    return { userId: reg.body.userId };
  }

  /** Registers a real victim (identity only, via the phone+OTP flow this
   * codebase actually has) and bridges them to a staff identity — the
   * Decision-1 pattern this whole slice implements. No real staff login
   * flow exists yet (see docs/S7_STAFF_CONSOLE_MIGRATION.md), so the
   * session token is obtained directly from the DI-resolved
   * StaffTokenService, the same "reach into the container" pattern S5's
   * own rollback test already established for this codebase. */
  async function createStaffAndToken(
    role: StaffRole,
    opts: { districtScope?: string[]; counsellorId?: string | null } = {},
  ): Promise<{ userId: string; staffId: string; token: string }> {
    const { userId } = await registerVictim(`Staff ${role} ${seq}`);
    const staff = await staffService.createStaff({
      userId,
      role,
      districtScope: opts.districtScope ?? [],
      counsellorId: opts.counsellorId ?? null,
    });
    const token = staffTokenService.issueStaffSessionToken(userId);
    return { userId, staffId: staff.id, token };
  }

  async function createCounsellor(district: string): Promise<string> {
    const row = await prisma.counsellor.create({
      data: { name: 'Synthetic Counsellor', district, languages: ['en'], currentCaseload: 0, caseloadCap: 80 },
    });
    return row.id;
  }

  describe('migration', () => {
    it('0005_staff.sql is additive only — no DROP/TRUNCATE/DELETE in the actual SQL (comments excluded)', () => {
      const raw = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0005_staff.sql'),
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

    it('applied cleanly — the two new tables are queryable', async () => {
      await expect(prisma.staff.count({})).resolves.toBeDefined();
      await expect(prisma.staffAuditLog.count({})).resolves.toBeDefined();
    });
  });

  describe('1-2. authentication', () => {
    it('unauthenticated request to either console endpoint is denied (401)', async () => {
      await request(app.getHttpServer()).get('/v1/console/queue').expect(401);
      await request(app.getHttpServer()).get(`/v1/console/victims/${randomUUID()}`).expect(401);
    });

    it('malformed Authorization header is denied (401)', async () => {
      await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', 'NotBearer something')
        .expect(401);
    });

    it('invalid/garbage staff token is denied (401)', async () => {
      await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('a valid staff session token for a user with no staff row is denied (403) — authenticated but not authorized', async () => {
      const { userId } = await registerVictim('Not Actually Staff');
      const token = staffTokenService.issueStaffSessionToken(userId);
      await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('3. victim tokens cannot call staff endpoints', () => {
    it("a real victim session token (from the actual OTP+register flow) is rejected by the console endpoints", async () => {
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
        .send({ name: 'Real Victim', roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
        .expect(201);

      // reg.body.token is a real, valid victim_session token — signed with
      // a DIFFERENT secret and a DIFFERENT purpose than a staff session.
      await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', `Bearer ${reg.body.token}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/v1/console/victims/${randomUUID()}`)
        .set('Authorization', `Bearer ${reg.body.token}`)
        .expect(401);
    });
  });

  describe('4/11. district scoping (district_admin, supervisor)', () => {
    it('district_admin can read victims/cases inside their district_scope', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Pune Victim', 'Pune');

      const res = await request(app.getHttpServer())
        .get(`/v1/console/victims/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.userId).toBe(userId);
    });

    it('district_admin CANNOT read a victim outside their district_scope', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Mumbai Victim', 'Mumbai');

      await request(app.getHttpServer())
        .get(`/v1/console/victims/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('supervisor sees every case in their district_scope regardless of counsellor assignment (v0.2: no per-case assignment requirement for this role)', async () => {
      const { token } = await createStaffAndToken('supervisor', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Supervisor Test Victim', 'Pune');
      await prisma.case.create({
        data: { userId, caseType: 'unspecified', intakeChannel: 'app', caseStage: 'registered' },
      });

      const res = await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.queue.some((c: { userId: string }) => c.userId === userId)).toBe(true);
    });

    it('district_admin and supervisor queues are both empty (not an error, not everything) when district_scope is empty', async () => {
      const { token: districtAdminToken } = await createStaffAndToken('district_admin', { districtScope: [] });
      const { token: supervisorToken } = await createStaffAndToken('supervisor', { districtScope: [] });
      await registerVictim('Some Victim', 'Pune');

      const res1 = await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', `Bearer ${districtAdminToken}`)
        .expect(200);
      expect(res1.body.queue).toEqual([]);

      const res2 = await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      expect(res2.body.queue).toEqual([]);
    });
  });

  describe('5. assignment ownership (counsellor role)', () => {
    it('a counsellor can read a victim/case actually assigned to their linked counsellor identity', async () => {
      const counsellorId = await createCounsellor('Pune');
      const { token } = await createStaffAndToken('counsellor', { counsellorId });
      const { userId } = await registerVictim('Assigned Victim', 'Pune');
      await prisma.case.create({
        data: {
          userId,
          caseType: 'unspecified',
          intakeChannel: 'app',
          caseStage: 'registered',
          assignedCounsellorId: counsellorId,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/console/victims/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.userId).toBe(userId);
    });

    it('a counsellor CANNOT read a victim/case assigned to a different counsellor', async () => {
      const myCounsellorId = await createCounsellor('Pune');
      const otherCounsellorId = await createCounsellor('Pune');
      const { token } = await createStaffAndToken('counsellor', { counsellorId: myCounsellorId });
      const { userId } = await registerVictim('Other Counsellor Victim', 'Pune');
      await prisma.case.create({
        data: {
          userId,
          caseType: 'unspecified',
          intakeChannel: 'app',
          caseStage: 'registered',
          assignedCounsellorId: otherCounsellorId,
        },
      });

      await request(app.getHttpServer())
        .get(`/v1/console/victims/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('a counsellor-role staff member with no linked counsellor identity is denied everything, fail closed', async () => {
      const { token } = await createStaffAndToken('counsellor', { counsellorId: null });
      await request(app.getHttpServer()).get('/v1/console/queue').set('Authorization', `Bearer ${token}`).expect(403);
    });
  });

  describe('6/7. client cannot override district or staff identity', () => {
    it('a query string claiming a different district has no effect — the endpoint has no district input at all', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { userId } = await registerVictim('Mumbai Victim For Override Test', 'Mumbai');

      // Even with an attacker-supplied query string naming the victim's
      // real district, access must still be denied — ConsoleService never
      // reads any query parameter for district at all.
      await request(app.getHttpServer())
        .get(`/v1/console/victims/${userId}?district=Mumbai&districtScope=Mumbai`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('a body claiming a different staffId/role has no effect on a GET request — identity is resolved only from the verified token', async () => {
      const { token: staffAToken } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });
      const { staffId: staffBId } = await createStaffAndToken('national_admin');

      // The genuine, unmodified result for staff A — note that
      // registering a staff member also registers them as a "victim" with
      // their own case (S5's registration flow), so staff A's own queue is
      // NOT expected to be empty here; both staff members' own
      // self-registration cases land in Pune.
      const genuine = await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', `Bearer ${staffAToken}`)
        .expect(200);

      // Attempt to impersonate staff B by claiming their id/role in the
      // body of a request authenticated as staff A — the response must be
      // byte-for-byte identical to the genuine, unmodified request: the
      // injected body has zero effect, because ConsoleController's
      // handlers have no @Body() parameter at all and StaffAuthGuard
      // resolves identity only from the verified bearer token.
      const tampered = await request(app.getHttpServer())
        .get('/v1/console/queue')
        .set('Authorization', `Bearer ${staffAToken}`)
        .send({ staffId: staffBId, role: 'national_admin' })
        .expect(200);

      expect(tampered.body).toEqual(genuine.body);
    });
  });

  describe('8. unrelated users.id/counsellors.id cannot accidentally authorize access', () => {
    it('a counsellor whose users.id coincidentally equals a real counsellors.id is still denied unless the Decision-1 bridge (staff.counsellorId) actually links them', async () => {
      const realCounsellorId = await createCounsellor('Pune');
      const { userId } = await registerVictim('Victim For Coincidence Test', 'Pune');
      await prisma.case.create({
        data: {
          userId,
          caseType: 'unspecified',
          intakeChannel: 'app',
          caseStage: 'registered',
          assignedCounsellorId: realCounsellorId,
        },
      });

      // A DIFFERENT counsellor row, deliberately created with an id equal
      // to some staff member's own users.id — proving that even a genuine
      // id collision between the two independent id spaces (Section B of
      // the audit) cannot accidentally grant access, because the code
      // never compares users.id to counsellors.id at all.
      const { userId: coincidentalUserId, token } = await createStaffAndToken('counsellor', { counsellorId: null });
      await prisma.counsellor.create({
        data: {
          id: coincidentalUserId, // deliberate coincidence with the staff member's own users.id
          name: 'Coincidental Counsellor',
          district: 'Pune',
          languages: ['en'],
          currentCaseload: 0,
          caseloadCap: 80,
        },
      });

      await request(app.getHttpServer())
        .get(`/v1/console/victims/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403); // staff.counsellorId is still null — the coincidental id match grants nothing
    });
  });

  describe('9. no sensitive logging', () => {
    it('the staff session token value never appears in any logged text during a full authenticate-and-query flow', async () => {
      const { token } = await createStaffAndToken('district_admin', { districtScope: ['Pune'] });

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

      await request(app.getHttpServer()).get('/v1/console/queue').set('Authorization', `Bearer ${token}`).expect(200);

      const allLoggedText = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls, ...debugSpy.mock.calls]
        .flat()
        .map(String)
        .join('\n');
      expect(allLoggedText).not.toContain(token);

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      debugSpy.mockRestore();
    });
  });

  describe('10. staff identity mapping is unique and deterministic', () => {
    it('the database rejects a second staff row for the same userId (real UNIQUE constraint, not just application-layer discipline)', async () => {
      const { userId } = await registerVictim('Double Staff Attempt');
      await staffService.createStaff({ userId, role: 'counsellor' });
      await expect(staffService.createStaff({ userId, role: 'supervisor' })).rejects.toThrow();
    });

    it('resolving the same userId twice always returns the same staff identity (deterministic)', async () => {
      const { userId } = await registerVictim('Deterministic Lookup Victim');
      await staffService.createStaff({ userId, role: 'supervisor', districtScope: ['Pune'] });

      const first = await staffService.getStaffForUser(userId);
      const second = await staffService.getStaffForUser(userId);
      expect(first?.id).toBe(second?.id);
    });
  });
});
