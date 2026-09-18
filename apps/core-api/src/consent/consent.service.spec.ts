import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { ConsentService } from './consent.service';
import { CONSENT_COPY, CONSENT_SCOPES, hashConsentCopy } from './consent-copy';
import { GrantConsentDto } from './dto/grant-consent.dto';

describe('ConsentService', () => {
  let fake: FakePrismaService;
  let service: ConsentService;

  beforeEach(() => {
    fake = new FakePrismaService();
    service = new ConsentService(fake as unknown as PrismaService);
  });

  const dto: GrantConsentDto = { scope: 'monitoring', granted: true, channel: 'app' };

  it('grants consent and stores the SHA-256 hash of the current server-side consent copy, not any client-supplied value', async () => {
    const result = await service.grantConsent('user-1', dto);
    const expectedHash = hashConsentCopy(CONSENT_COPY.monitoring);
    expect(result.textVersionHash).toBe(expectedHash);
    expect(result.userId).toBe('user-1');
    expect(result.granted).toBe(true);
    expect(result.capturedBy).toBe('self');
  });

  it('every one of the 7 v0.2 scopes has its own configured copy and produces a distinct hash', () => {
    const hashes = new Set(CONSENT_SCOPES.map((scope) => hashConsentCopy(CONSENT_COPY[scope])));
    expect(hashes.size).toBe(CONSENT_SCOPES.length);
  });

  it('each grant is a NEW row — append-only, not an update in place', async () => {
    await service.grantConsent('user-1', { scope: 'monitoring', granted: true, channel: 'app' });
    await service.grantConsent('user-1', { scope: 'monitoring', granted: false, channel: 'app' });
    expect(fake.consentRows).toHaveLength(2);
  });

  it('getCurrentConsents returns only the most recent row per scope', async () => {
    await service.grantConsent('user-1', { scope: 'monitoring', granted: true, channel: 'app' });
    await new Promise((r) => setTimeout(r, 5));
    await service.grantConsent('user-1', { scope: 'monitoring', granted: false, channel: 'app' });
    await service.grantConsent('user-1', { scope: 'voice_recording', granted: true, channel: 'app' });

    const current = await service.getCurrentConsents('user-1');
    expect(current).toHaveLength(2);
    const monitoring = current.find((c) => c.scope === 'monitoring');
    expect(monitoring?.granted).toBe(false); // the most recent grant, not the first
  });

  it('a scope never acted on is simply absent, never fabricated as granted:false', async () => {
    await service.grantConsent('user-1', { scope: 'monitoring', granted: true, channel: 'app' });
    const current = await service.getCurrentConsents('user-1');
    expect(current.find((c) => c.scope === 'voice_recording')).toBeUndefined();
  });

  it("never returns another victim's consent rows", async () => {
    await service.grantConsent('user-1', dto);
    await service.grantConsent('user-2', dto);
    const currentForUser1 = await service.getCurrentConsents('user-1');
    expect(currentForUser1.every((c) => c.userId === 'user-1')).toBe(true);
    expect(currentForUser1).toHaveLength(1);
  });
});
