import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { ProfileService } from './profile.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

describe('ProfileService', () => {
  let fake: FakePrismaService;
  let service: ProfileService;

  beforeEach(() => {
    fake = new FakePrismaService();
    service = new ProfileService(fake as unknown as PrismaService);
  });

  it('returns an all-null profile for a victim who has never set one, not a 404 or a fabricated default', async () => {
    const profile = await service.getProfile('user-1');
    expect(profile.relationType).toBeNull();
    expect(profile.preferredChannel).toBeNull();
    expect(profile.safeToCall).toBeNull();
  });

  it('creates a profile row on first update (upsert)', async () => {
    const dto: UpdatePreferencesDto = { relationType: 'survivor', preferredChannel: 'app' };
    const updated = await service.updateProfile('user-1', dto);
    expect(updated.relationType).toBe('survivor');
    expect(updated.preferredChannel).toBe('app');
    expect(fake.victimProfileRows).toHaveLength(1);
  });

  it('PATCH semantics: only supplied fields change, existing fields are preserved', async () => {
    await service.updateProfile('user-1', { relationType: 'survivor', safeToCall: true });
    const updated = await service.updateProfile('user-1', { preferredChannel: 'sms' });
    expect(updated.relationType).toBe('survivor'); // preserved
    expect(updated.safeToCall).toBe(true); // preserved
    expect(updated.preferredChannel).toBe('sms'); // newly set
  });

  it('stores safe contact windows as submitted', async () => {
    const windows = [{ day: 'weekday', start: '11:00', end: '13:00' }];
    const updated = await service.updateProfile('user-1', { safeWindows: windows as never });
    expect(updated.safeWindows).toEqual(windows);
  });

  it("never mixes one victim's profile into another's", async () => {
    await service.updateProfile('user-1', { relationType: 'survivor' });
    await service.updateProfile('user-2', { relationType: 'family_member' });
    const p1 = await service.getProfile('user-1');
    const p2 = await service.getProfile('user-2');
    expect(p1.relationType).toBe('survivor');
    expect(p2.relationType).toBe('family_member');
  });
});
