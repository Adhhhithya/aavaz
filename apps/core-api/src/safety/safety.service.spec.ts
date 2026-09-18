import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { SafetyService } from './safety.service';

describe('SafetyService', () => {
  let fake: FakePrismaService;
  let service: SafetyService;

  beforeEach(() => {
    fake = new FakePrismaService();
    service = new SafetyService(fake as unknown as PrismaService);
  });

  it('a victim with no settings yet gets all-false/null booleans, not an error', async () => {
    const settings = await service.getSettings('user-1');
    expect(settings).toEqual({
      disguiseEnabled: false,
      hasDuressPin: false,
      hasSafeWord: false,
      trustedContactName: null,
      trustedContactPhone: null,
    });
  });

  it('duress PIN is Argon2id-hashed, never stored in plaintext', async () => {
    await service.updateSettings('user-1', { duressPin: '1234' });
    const row = fake.safetySettingRows.find((r) => r.userId === 'user-1')!;
    expect(row.duressPinHash).not.toBe('1234');
    expect(row.duressPinHash).toMatch(/^\$argon2id\$/);
  });

  it('safe word is Argon2id-hashed, never stored in plaintext', async () => {
    await service.updateSettings('user-1', { safeWord: 'blue umbrella' });
    const row = fake.safetySettingRows.find((r) => r.userId === 'user-1')!;
    expect(row.safeWordHash).not.toBe('blue umbrella');
    expect(row.safeWordHash).toMatch(/^\$argon2id\$/);
  });

  it('the returned view never contains the hash, only a boolean', async () => {
    const settings = await service.updateSettings('user-1', { duressPin: '1234', safeWord: 'blue umbrella' });
    expect(settings.hasDuressPin).toBe(true);
    expect(settings.hasSafeWord).toBe(true);
    expect(JSON.stringify(settings)).not.toContain('1234');
    expect(JSON.stringify(settings)).not.toContain('blue umbrella');
    expect(JSON.stringify(settings)).not.toMatch(/argon2/i);
    expect(Object.keys(settings)).not.toContain('duressPinHash');
    expect(Object.keys(settings)).not.toContain('safeWordHash');
  });

  it('correct PIN verifies successfully', async () => {
    await service.updateSettings('user-1', { duressPin: '5678' });
    await expect(service.verifyDuressPin('user-1', '5678')).resolves.toBe(true);
  });

  it('incorrect PIN fails verification', async () => {
    await service.updateSettings('user-1', { duressPin: '5678' });
    await expect(service.verifyDuressPin('user-1', '0000')).resolves.toBe(false);
  });

  it('verification fails safely (not an error) when no PIN has ever been set', async () => {
    await expect(service.verifyDuressPin('user-1', '5678')).resolves.toBe(false);
  });

  it('the PIN and safe word are never logged', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    await service.updateSettings('user-1', { duressPin: '9999', safeWord: 'canary-value' });
    await service.verifyDuressPin('user-1', '9999');

    const allLoggedText = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls, ...debugSpy.mock.calls]
      .flat()
      .map(String)
      .join('\n');
    expect(allLoggedText).not.toContain('9999');
    expect(allLoggedText).not.toContain('canary-value');

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('trusted contact is stored and returned as plain text (documented gap, not encrypted)', async () => {
    const settings = await service.updateSettings('user-1', {
      trustedContactName: 'Aunt Priya',
      trustedContactPhone: '+919999999999',
    });
    expect(settings.trustedContactName).toBe('Aunt Priya');
    expect(settings.trustedContactPhone).toBe('+919999999999');
  });

  it("never leaks one victim's duress PIN validity to another victim's id", async () => {
    await service.updateSettings('user-1', { duressPin: '1111' });
    await service.updateSettings('user-2', { duressPin: '2222' });
    await expect(service.verifyDuressPin('user-2', '1111')).resolves.toBe(false);
    await expect(service.verifyDuressPin('user-1', '1111')).resolves.toBe(true);
  });

  it('PATCH semantics: updating disguise does not clear an already-set duress PIN', async () => {
    await service.updateSettings('user-1', { duressPin: '1234' });
    await service.updateSettings('user-1', { disguiseEnabled: true });
    const settings = await service.getSettings('user-1');
    expect(settings.disguiseEnabled).toBe(true);
    expect(settings.hasDuressPin).toBe(true);
  });
});
