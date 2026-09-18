/**
 * S5 integration test: registration -> identity -> case creation ->
 * counsellor assignment, against a REAL, isolated, throwaway PostgreSQL
 * instance (see test/pg-harness.ts, factored out of S4's
 * identity.integration-spec.ts). Runs the full Nest app over real HTTP
 * (supertest), with backend/schema.sql plus every migration through
 * backend/migrations/0006_lifecycle.sql applied — the same files a real
 * deployment would apply, since the shared Prisma schema (and therefore
 * every Case insert) now depends on later milestones' additive columns
 * regardless of which milestone this suite itself exercises. No real
 * victim data anywhere — only synthetic, clearly-fake identifiers.
 */

import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AssignmentService } from '../src/cases/assignment.service';
import { describeIfPostgres, startThrowawayPostgres, stopThrowawayPostgres, ThrowawayPostgres } from './pg-harness';

const PORT = 55556; // distinct from identity.integration-spec.ts's 55555

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;

describeIfPostgres('Registration module — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_registration_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
      '0005_staff.sql',
      '0006_lifecycle.sql',
    ]);
    process.env.DATABASE_URL = pgInstance.databaseUrl;
    process.env.NODE_ENV = 'development';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (pgInstance) stopThrowawayPostgres(pgInstance.pgData);
  });

  afterEach(async () => {
    // Keep each test's data isolated without tearing down the whole cluster
    // between tests (that would defeat the point of one shared instance).
    await prisma.case.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.counsellor.deleteMany({});
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

  async function getPhoneVerifiedToken(phone: string): Promise<string> {
    const capture = captureNextOtp();
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phoneNumber: phone }).expect(201);
    const code = capture.get();
    const verify = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phoneNumber: phone, code })
      .expect(201);
    expect(verify.body.tokenType).toBe('phone_verified');
    return verify.body.token;
  }

  const validBody = {
    name: 'Synthetic Registration Victim',
    roleType: 'victim',
    consentGiven: true,
    preferredLanguage: 'en',
    location: { lat: 18.5204, lng: 73.8567 }, // resolves to the mock "Mock District"
  };

  it('1. successful registration creates a user, a case, and assigns the lowest-caseload eligible counsellor', async () => {
    await prisma.counsellor.create({
      data: { name: 'Dr. High Load', district: 'Mock District', languages: ['en'], currentCaseload: 5, caseloadCap: 80 },
    });
    const lowLoad = await prisma.counsellor.create({
      data: { name: 'Dr. Low Load', district: 'Mock District', languages: ['en'], currentCaseload: 1, caseloadCap: 80 },
    });

    const phone = '+910000001101';
    const token = await getPhoneVerifiedToken(phone);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(201);

    expect(res.body.status).toBe('success');
    expect(res.body.userId).toBeTruthy();
    expect(res.body.caseId).toBeTruthy();

    // 2. victim creation — real row exists
    const userRow = await prisma.user.findUnique({ where: { phoneNumber: phone } });
    expect(userRow).not.toBeNull();
    expect(userRow?.locationDistrict).toBe('Mock District');

    // 3. case creation — real row exists, correctly linked
    const caseRow = await prisma.case.findUnique({ where: { id: res.body.caseId } });
    expect(caseRow).not.toBeNull();
    expect(caseRow?.userId).toBe(res.body.userId);
    expect(caseRow?.caseStage).toBe('registered');
    expect(caseRow?.intakeChannel).toBe('app');

    // 4./10. counsellor assignment respects "lowest active caseload"
    expect(caseRow?.assignedCounsellorId).toBe(lowLoad.id);
    const updatedCounsellor = await prisma.counsellor.findUnique({ where: { id: lowLoad.id } });
    expect(updatedCounsellor?.currentCaseload).toBe(2);
  });

  it('5. registration transaction rolls back entirely if a later step fails — no orphaned user, no orphaned caseload increment', async () => {
    // Force a failure AFTER user creation but BEFORE case creation, by
    // making the real, DI-resolved AssignmentService throw — proving the
    // whole prisma.$transaction (user insert included) rolls back together.
    const liveAssignmentService = app.get(AssignmentService);
    const liveSpy = jest.spyOn(liveAssignmentService, 'assign').mockImplementation(async () => {
      throw new Error('simulated failure after user creation, before case creation');
    });

    const phone = '+910000001102';
    const token = await getPhoneVerifiedToken(phone);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(500);

    liveSpy.mockRestore();

    // The whole transaction — including the user insert that happened
    // BEFORE assignment threw — must have rolled back.
    const userRow = await prisma.user.findUnique({ where: { phoneNumber: phone } });
    expect(userRow).toBeNull();
    const caseCount = await prisma.case.count({});
    expect(caseCount).toBe(0);
  });

  it('6. invalid registration is rejected by validation before any row is written', async () => {
    const phone = '+910000001103';
    const token = await getPhoneVerifiedToken(phone);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Missing Fields' }) // no roleType, consentGiven, preferredLanguage
      .expect(400);

    const userRow = await prisma.user.findUnique({ where: { phoneNumber: phone } });
    expect(userRow).toBeNull();
  });

  it('7. duplicate registration is rejected at the full registration+case level, not just identity', async () => {
    const phone = '+910000001104';
    const token = await getPhoneVerifiedToken(phone);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(409);

    expect(await prisma.user.count({})).toBe(1);
    expect(await prisma.case.count({})).toBe(1);
  });

  it('9. two victims registering concurrently never end up linked to each other\'s case', async () => {
    const phoneA = '+910000001201';
    const phoneB = '+910000001202';
    // Acquired sequentially, deliberately: captureNextOtp() spies on the
    // shared Logger.prototype.warn, which is not safe to use from two
    // concurrent OTP flows at once (one capture can steal the other's log
    // line). The actual thing this test needs to be concurrent — the two
    // /register calls racing each other's DB writes — is still concurrent
    // below; only the token setup is sequential.
    const tokenA = await getPhoneVerifiedToken(phoneA);
    const tokenB = await getPhoneVerifiedToken(phoneB);

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...validBody, name: 'Victim A' })
        .expect(201),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ ...validBody, name: 'Victim B' })
        .expect(201),
    ]);

    expect(resA.body.userId).not.toBe(resB.body.userId);
    expect(resA.body.caseId).not.toBe(resB.body.caseId);

    const caseA = await prisma.case.findUnique({ where: { id: resA.body.caseId } });
    const caseB = await prisma.case.findUnique({ where: { id: resB.body.caseId } });
    expect(caseA?.userId).toBe(resA.body.userId);
    expect(caseB?.userId).toBe(resB.body.userId);
    expect(caseA?.userId).not.toBe(caseB?.userId);
  });

  it('11. assignment failure (no eligible counsellor) is handled safely — case is still created, unassigned, no error', async () => {
    // No counsellors seeded at all in "Mock District".
    const phone = '+910000001105';
    const token = await getPhoneVerifiedToken(phone);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(201);

    const caseRow = await prisma.case.findUnique({ where: { id: res.body.caseId } });
    expect(caseRow?.assignedCounsellorId).toBeNull();
  });

  it('assignment respects the caseload cap under real Postgres — a counsellor at the cap is never chosen', async () => {
    const atCap = await prisma.counsellor.create({
      data: { name: 'Dr. At Cap', district: 'Mock District', languages: ['en'], currentCaseload: 2, caseloadCap: 2 },
    });
    const underCap = await prisma.counsellor.create({
      data: { name: 'Dr. Under Cap', district: 'Mock District', languages: ['en'], currentCaseload: 10, caseloadCap: 80 },
    });

    const phone = '+910000001106';
    const token = await getPhoneVerifiedToken(phone);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(201);

    const caseRow = await prisma.case.findUnique({ where: { id: res.body.caseId } });
    expect(caseRow?.assignedCounsellorId).toBe(underCap.id);
    expect(caseRow?.assignedCounsellorId).not.toBe(atCap.id);
  });

  it('12. no fabricated CNR/legal data — the cases table in this schema has no cnr/ecourts_data column at all', async () => {
    const phone = '+910000001107';
    const token = await getPhoneVerifiedToken(phone);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(201);

    const caseRow = await prisma.case.findUnique({ where: { id: res.body.caseId } });
    expect((caseRow as unknown as { cnr?: unknown })?.cnr).toBeUndefined();

    // Stronger proof than "the TypeScript type doesn't have it": the column
    // genuinely does not exist in this database at all (schema.sql never
    // defines it, and registration never adds it), so a raw query for it
    // fails at the database level, not just the ORM level.
    await expect(prisma.$queryRawUnsafe('SELECT cnr FROM cases LIMIT 1')).rejects.toThrow();
  });
});
