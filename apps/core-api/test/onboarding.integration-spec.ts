/**
 * S6 integration test: consent + profile + safety settings, against a REAL,
 * isolated, throwaway PostgreSQL instance (test/pg-harness.ts). Runs the
 * full Nest app over real HTTP (supertest), with backend/schema.sql plus
 * every migration through
 * backend/migrations/0004_consent_profile_safety.sql applied. No real
 * victim data anywhere — only synthetic, clearly-fake identifiers.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SafetyService } from '../src/safety/safety.service';
import { CONSENT_COPY } from '../src/consent/consent-copy';
import { describeIfPostgres, startThrowawayPostgres, stopThrowawayPostgres, ThrowawayPostgres } from './pg-harness';

const PORT = 55557; // distinct from 55555 (S4) and 55556 (S5)

let pgInstance: ThrowawayPostgres;
let app: INestApplication;
let prisma: PrismaService;

describeIfPostgres('Consent/Profile/Safety modules — real PostgreSQL integration', () => {
  jest.setTimeout(90000);

  beforeAll(async () => {
    pgInstance = await startThrowawayPostgres(PORT, 'aavaz_core_api_onboarding_test', [
      '0002_otp_codes.sql',
      '0003_counsellor_caseload_cap.sql',
      '0004_consent_profile_safety.sql',
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

  /** Registers a brand-new victim end-to-end and returns their real
   * victim_session token + user id — the same real HTTP flow S5 tests use. */
  async function registerVictim(phone: string, name: string): Promise<{ token: string; userId: string }> {
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
    return { token: reg.body.token, userId: reg.body.userId };
  }

  let victimA: { token: string; userId: string };
  let victimB: { token: string; userId: string };

  beforeAll(async () => {
    victimA = await registerVictim('+910000002101', 'Victim A');
    victimB = await registerVictim('+910000002102', 'Victim B');
  });

  describe('migration', () => {
    it('is additive only — no DROP/TRUNCATE/DELETE statement anywhere in the actual SQL (comments excluded)', () => {
      const raw = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'backend', 'migrations', '0004_consent_profile_safety.sql'),
        'utf-8',
      );
      // Strip `-- ...` line comments first — this file's own prose
      // deliberately explains what it does NOT do (e.g. "does not ... drop
      // any column"), which would otherwise false-positive a naive
      // whole-file keyword search.
      const sqlOnly = raw
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n')
        .toUpperCase();
      expect(sqlOnly).not.toMatch(/\bDROP\b/);
      expect(sqlOnly).not.toMatch(/\bTRUNCATE\b/);
      expect(sqlOnly).not.toMatch(/\bDELETE\s+FROM\b/);
    });

    it('applied cleanly — the three new tables are queryable', async () => {
      await expect(prisma.consent.count({})).resolves.toBeDefined();
      await expect(prisma.victimProfile.count({})).resolves.toBeDefined();
      await expect(prisma.safetySetting.count({})).resolves.toBeDefined();
    });
  });

  describe('consent', () => {
    it('authenticated victim can grant consent', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/consents')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ scope: 'monitoring', granted: true, channel: 'app' })
        .expect(201);
      expect(res.body.status).toBe('success');
      expect(res.body.scope).toBe('monitoring');
    });

    it('unauthenticated request is rejected', async () => {
      await request(app.getHttpServer())
        .post('/v1/consents')
        .send({ scope: 'monitoring', granted: true, channel: 'app' })
        .expect(401);
      await request(app.getHttpServer()).get('/v1/consents').expect(401);
    });

    it('exact SHA-256 hash of the server-side consent copy is stored, never a client-supplied value', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/consents')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ scope: 'store_transcripts', granted: true, channel: 'app' })
        .expect(201);
      const copy = CONSENT_COPY.store_transcripts;
      const expectedHash = crypto.createHash('sha256').update(`${copy.version}:${copy.text}`).digest('hex');
      expect(res.body.textVersionHash).toBe(expectedHash);

      // A client-supplied hash/text is not even accepted as a field.
      const withInjectedHash = await request(app.getHttpServer())
        .post('/v1/consents')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ scope: 'voice_recording', granted: true, channel: 'app', textVersionHash: 'attacker-supplied' })
        .expect(201);
      expect(withInjectedHash.body.textVersionHash).not.toBe('attacker-supplied');
    });

    it('each of several scopes is handled independently', async () => {
      for (const scope of ['share_mental_health', 'share_legal_aid', 'share_welfare']) {
        await request(app.getHttpServer())
          .post('/v1/consents')
          .set('Authorization', `Bearer ${victimA.token}`)
          .send({ scope, granted: true, channel: 'app' })
          .expect(201);
      }
      const res = await request(app.getHttpServer())
        .get('/v1/consents')
        .set('Authorization', `Bearer ${victimA.token}`)
        .expect(200);
      const scopes = res.body.consents.map((c: { scope: string }) => c.scope);
      expect(scopes).toEqual(expect.arrayContaining(['share_mental_health', 'share_legal_aid', 'share_welfare']));
    });

    it('consent changes are attributable to the correct victim, and a victim never sees another victim\'s consent history', async () => {
      await request(app.getHttpServer())
        .post('/v1/consents')
        .set('Authorization', `Bearer ${victimB.token}`)
        .send({ scope: 'share_protection', granted: true, channel: 'app' })
        .expect(201);

      const rowsForB = await prisma.consent.findMany({ where: { userId: victimB.userId } });
      expect(rowsForB.every((r) => r.userId === victimB.userId)).toBe(true);

      const resA = await request(app.getHttpServer())
        .get('/v1/consents')
        .set('Authorization', `Bearer ${victimA.token}`)
        .expect(200);
      const scopesA = resA.body.consents.map((c: { scope: string }) => c.scope);
      expect(scopesA).not.toContain('share_protection'); // only B granted this
    });

    it('rejects an unknown consent scope', async () => {
      await request(app.getHttpServer())
        .post('/v1/consents')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ scope: 'not_a_real_scope', granted: true, channel: 'app' })
        .expect(400);
    });
  });

  describe('profile', () => {
    it('authenticated victim can read their own (initially empty) profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/victims/me/preferences')
        .set('Authorization', `Bearer ${victimA.token}`)
        .expect(200);
      expect(res.body.relationType).toBeNull();
    });

    it('authenticated victim can update their own profile', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/victims/me/preferences')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({
          relationType: 'survivor',
          preferredChannel: 'app',
          safeToCall: true,
          safeWindows: [{ day: 'weekday', start: '11:00', end: '13:00' }],
        })
        .expect(200);
      expect(res.body.relationType).toBe('survivor');

      const readBack = await request(app.getHttpServer())
        .get('/v1/victims/me/preferences')
        .set('Authorization', `Bearer ${victimA.token}`)
        .expect(200);
      expect(readBack.body.relationType).toBe('survivor');
      expect(readBack.body.safeToCall).toBe(true);
    });

    it("a victim cannot access or overwrite another victim's profile", async () => {
      await request(app.getHttpServer())
        .patch('/v1/victims/me/preferences')
        .set('Authorization', `Bearer ${victimB.token}`)
        .send({ relationType: 'family_member' })
        .expect(200);

      const profileA = await request(app.getHttpServer())
        .get('/v1/victims/me/preferences')
        .set('Authorization', `Bearer ${victimA.token}`)
        .expect(200);
      const profileB = await request(app.getHttpServer())
        .get('/v1/victims/me/preferences')
        .set('Authorization', `Bearer ${victimB.token}`)
        .expect(200);
      expect(profileA.body.relationType).toBe('survivor');
      expect(profileB.body.relationType).toBe('family_member');

      const dbRowA = await prisma.victimProfile.findUnique({ where: { userId: victimA.userId } });
      const dbRowB = await prisma.victimProfile.findUnique({ where: { userId: victimB.userId } });
      expect(dbRowA?.userId).toBe(victimA.userId);
      expect(dbRowB?.userId).toBe(victimB.userId);
    });

    it('invalid profile data is rejected', async () => {
      await request(app.getHttpServer())
        .patch('/v1/victims/me/preferences')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ relationType: 'not_a_valid_relation' })
        .expect(400);
    });

    it('unauthenticated profile access is rejected', async () => {
      await request(app.getHttpServer()).get('/v1/victims/me/preferences').expect(401);
      await request(app.getHttpServer()).patch('/v1/victims/me/preferences').send({ safeToCall: true }).expect(401);
    });
  });

  describe('safety settings', () => {
    it('authenticated victim can configure their own safety settings', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/victims/me/safety-settings')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ disguiseEnabled: true, duressPin: '4321', safeWord: 'red balloon' })
        .expect(200);
      expect(res.body.disguiseEnabled).toBe(true);
      expect(res.body.hasDuressPin).toBe(true);
      expect(res.body.hasSafeWord).toBe(true);
    });

    it('plaintext PIN/safe word are never returned by the API', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/victims/me/safety-settings')
        .set('Authorization', `Bearer ${victimA.token}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('4321');
      expect(JSON.stringify(res.body)).not.toContain('red balloon');
      expect(JSON.stringify(res.body)).not.toMatch(/argon2/i);
    });

    it("the duress PIN hash in the database is not the plaintext PIN", async () => {
      const row = await prisma.safetySetting.findUnique({ where: { userId: victimA.userId } });
      expect(row?.duressPinHash).not.toBe('4321');
      expect(row?.duressPinHash).toMatch(/^\$argon2id\$/);
    });

    it('server-side verification: correct PIN succeeds, incorrect PIN fails', async () => {
      // Uses the real, DI-resolved SafetyService from the already-running
      // app — there is no public HTTP verify endpoint in this slice (see
      // safety.service.ts's comment on why), so this is how Phase 12's
      // "correct/incorrect PIN verification" requirement is exercised.
      const safetyService = app.get(SafetyService);
      await expect(safetyService.verifyDuressPin(victimA.userId, '4321')).resolves.toBe(true);
      await expect(safetyService.verifyDuressPin(victimA.userId, '0000')).resolves.toBe(false);
    });

    it("a victim's duress PIN never verifies against another victim's id", async () => {
      await request(app.getHttpServer())
        .patch('/v1/victims/me/safety-settings')
        .set('Authorization', `Bearer ${victimB.token}`)
        .send({ duressPin: '8888' })
        .expect(200);
      const safetyService = app.get(SafetyService);
      await expect(safetyService.verifyDuressPin(victimB.userId, '4321')).resolves.toBe(false); // A's PIN
      await expect(safetyService.verifyDuressPin(victimA.userId, '8888')).resolves.toBe(false); // B's PIN
    });

    it("a victim cannot configure another victim's settings via their own token", async () => {
      const beforeB = await prisma.safetySetting.findUnique({ where: { userId: victimB.userId } });
      await request(app.getHttpServer())
        .patch('/v1/victims/me/safety-settings')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ trustedContactName: 'Should only affect A' })
        .expect(200);
      const afterB = await prisma.safetySetting.findUnique({ where: { userId: victimB.userId } });
      expect(afterB?.trustedContactName).toBe(beforeB?.trustedContactName ?? null);
    });

    it('trusted contact handling is ownership-bound and readable back', async () => {
      await request(app.getHttpServer())
        .patch('/v1/victims/me/safety-settings')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ trustedContactName: 'Aunt Priya', trustedContactPhone: '+919999999999' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .get('/v1/victims/me/safety-settings')
        .set('Authorization', `Bearer ${victimA.token}`)
        .expect(200);
      expect(res.body.trustedContactName).toBe('Aunt Priya');
    });

    it('invalid duress PIN format is rejected', async () => {
      await request(app.getHttpServer())
        .patch('/v1/victims/me/safety-settings')
        .set('Authorization', `Bearer ${victimA.token}`)
        .send({ duressPin: 'not-digits' })
        .expect(400);
    });

    it('unauthenticated safety-settings access is rejected', async () => {
      await request(app.getHttpServer()).get('/v1/victims/me/safety-settings').expect(401);
      await request(app.getHttpServer())
        .patch('/v1/victims/me/safety-settings')
        .send({ disguiseEnabled: true })
        .expect(401);
    });
  });
});
