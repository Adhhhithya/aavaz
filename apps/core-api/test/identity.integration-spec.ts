/**
 * Integration test against a REAL, fully isolated, throwaway PostgreSQL
 * instance — per Phase 9's explicit instruction to test against a disposable
 * Postgres where practical. This spins up its own cluster (unique temp dir,
 * random-ish high port) rather than touching any developer's own running
 * Postgres service, applies the exact same backend/schema.sql and
 * backend/migrations/0002_otp_codes.sql the Python backend uses, runs the
 * full Nest application through the real HTTP layer (supertest), and tears
 * everything down afterward. No real victim data is used anywhere — only
 * synthetic, clearly-fake identifiers.
 *
 * This mirrors the exact throwaway-Postgres technique already used and
 * documented in S3/S4 for schema verification, now reused to drive a real
 * end-to-end test instead of a one-off manual check.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PG_BIN = 'C:/Program Files/PostgreSQL/17/bin';
const PORT = 55555;
let PGDATA: string;
let app: INestApplication;
let prisma: PrismaService;

function pg(bin: string, args: string[], opts: Record<string, unknown> = {}): void {
  const result = spawnSync(path.join(PG_BIN, bin), args, { stdio: 'pipe', ...opts });
  if (result.status !== 0) {
    throw new Error(`${bin} ${args.join(' ')} failed:\n${result.stderr?.toString() ?? '(no captured output; check server.log)'}`);
  }
}

const canRunPostgres = fs.existsSync(PG_BIN);
const describeIfPostgres = canRunPostgres ? describe : describe.skip;

describeIfPostgres('Identity module — real PostgreSQL integration', () => {
  jest.setTimeout(60000);

  beforeAll(async () => {
    PGDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aavaz-core-api-pgtest-'));
    pg('initdb.exe', ['-D', PGDATA, '-U', 'verify_user', '-A', 'trust', '--locale=C']);
    // stdio must NOT be 'pipe' here: `pg_ctl start` launches postgres.exe as a
    // detached background process on Windows, and that child inherits the
    // pipe handles Node created to capture pg_ctl's own output. postgres.exe
    // never closes them (it keeps running), so Node's synchronous pipe read
    // never sees EOF and spawnSync hangs forever even though pg_ctl itself
    // already exited successfully. Startup errors are still visible in
    // server.log, which pg_ctl's own exit code plus that log file cover.
    pg('pg_ctl.exe', ['-D', PGDATA, '-l', path.join(PGDATA, 'server.log'), '-o', `-p ${PORT}`, 'start'], {
      stdio: 'ignore',
    });

    const env = { ...process.env, PGHOST: 'localhost', PGPORT: String(PORT), PGUSER: 'verify_user' };
    execFileSync(path.join(PG_BIN, 'createdb.exe'), ['aavaz_core_api_test'], { env });
    execFileSync(
      path.join(PG_BIN, 'psql.exe'),
      ['-d', 'aavaz_core_api_test', '-c', 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'],
      { env },
    );
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    execFileSync(
      path.join(PG_BIN, 'psql.exe'),
      ['-d', 'aavaz_core_api_test', '-f', path.join(repoRoot, 'backend', 'schema.sql')],
      { env },
    );
    execFileSync(
      path.join(PG_BIN, 'psql.exe'),
      [
        '-d',
        'aavaz_core_api_test',
        '-f',
        path.join(repoRoot, 'backend', 'migrations', '0002_otp_codes.sql'),
      ],
      { env },
    );

    process.env.DATABASE_URL = `postgresql://verify_user@localhost:${PORT}/aavaz_core_api_test?schema=public`;
    process.env.NODE_ENV = 'development'; // uses SyntheticOtpProvider + dev secret fallbacks, same as local dev

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    try {
      pg('pg_ctl.exe', ['-D', PGDATA, 'stop']);
    } finally {
      fs.rmSync(PGDATA, { recursive: true, force: true });
    }
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

  const PHONE = '+910000000101'; // synthetic, all-zero-shaped — not a real number

  it('full flow: request OTP -> verify -> register -> authenticated /me', async () => {
    const capture = captureNextOtp();
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phoneNumber: PHONE })
      .expect(201);
    const code = capture.get();
    expect(code).toMatch(/^\d{6}$/);

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phoneNumber: PHONE, code })
      .expect(201);
    expect(verifyRes.body.isNewUser).toBe(true);
    const phoneVerifiedToken = verifyRes.body.token;

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${phoneVerifiedToken}`)
      .send({
        name: 'Synthetic Integration Test Victim',
        roleType: 'victim',
        consentGiven: true,
        preferredLanguage: 'en',
      })
      .expect(201);
    expect(registerRes.body.status).toBe('success');
    const sessionToken = registerRes.body.token;

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200);
    expect(meRes.body.id).toBe(registerRes.body.userId);
    expect(meRes.body.phoneNumber).toBe(PHONE);

    // The row genuinely exists in real Postgres, not just in-memory.
    const row = await prisma.user.findUnique({ where: { phoneNumber: PHONE } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe('Synthetic Integration Test Victim');
  });

  it('an existing victim gets a session directly from otp/verify (no registration step)', async () => {
    const phone = '+910000000102';
    let capture = captureNextOtp();
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phoneNumber: phone }).expect(201);
    let code = capture.get();
    const verify1 = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phoneNumber: phone, code })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${verify1.body.token}`)
      .send({ name: 'Second Synthetic Victim', roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
      .expect(201);

    capture = captureNextOtp();
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phoneNumber: phone }).expect(201);
    code = capture.get();
    const verify2 = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phoneNumber: phone, code })
      .expect(201);
    expect(verify2.body.isNewUser).toBe(false);
    expect(verify2.body.tokenType).toBe('victim_session');
  });

  it('cross-victim: victim A\'s token never resolves to victim B\'s identity', async () => {
    const phoneA = '+910000000201';
    const phoneB = '+910000000202';

    async function registerAndGetToken(phone: string, name: string): Promise<{ token: string; id: string }> {
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
      return { token: reg.body.token, id: reg.body.userId };
    }

    const a = await registerAndGetToken(phoneA, 'Victim A');
    const b = await registerAndGetToken(phoneB, 'Victim B');
    expect(a.id).not.toBe(b.id);

    const meAsA = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(200);
    expect(meAsA.body.id).toBe(a.id);
    expect(meAsA.body.id).not.toBe(b.id);

    const meAsB = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${b.token}`)
      .expect(200);
    expect(meAsB.body.id).toBe(b.id);
  });

  it('unauthenticated access to /me is rejected', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('malformed Authorization header is rejected', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'NotBearer something')
      .expect(401);
  });

  it('registration without a phone-verified token is rejected', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'No Token', roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
      .expect(401);
  });

  it('a victim session token cannot be used to register (wrong token purpose)', async () => {
    const phone = '+910000000301';
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
      .send({ name: 'Session Token Reuse Test', roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
      .expect(201);

    // reg.body.token is a `victim` session token now, not `phone_verified`.
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ name: 'Should not work', roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
      .expect(401);
  });

  it('invalid OTP code is rejected end-to-end', async () => {
    const phone = '+910000000401';
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phoneNumber: phone }).expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phoneNumber: phone, code: '000000' })
      .expect(401);
  });

  it('duplicate registration for an already-registered phone is rejected', async () => {
    const phone = '+910000000501';
    const capture = captureNextOtp();
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phoneNumber: phone }).expect(201);
    const code = capture.get();
    const verify = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phoneNumber: phone, code })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${verify.body.token}`)
      .send({ name: 'First', roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
      .expect(201);

    // Same phone-verified token can't be reused for a second registration
    // either way (it's single-purpose and the phone now already has a user).
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${verify.body.token}`)
      .send({ name: 'Second', roleType: 'victim', consentGiven: true, preferredLanguage: 'en' })
      .expect(409);
  });
});
