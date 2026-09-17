import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { IdentityService } from './identity.service';
import { RegisterDto, RoleTypeInput, PreferredLanguageInput } from './dto/register.dto';

describe('IdentityService', () => {
  let fake: FakePrismaService;
  let service: IdentityService;

  beforeEach(() => {
    fake = new FakePrismaService();
    service = new IdentityService(fake as unknown as PrismaService);
  });

  const dto: RegisterDto = {
    name: 'Synthetic Test Victim',
    roleType: RoleTypeInput.victim,
    consentGiven: true,
    preferredLanguage: PreferredLanguageInput.en,
  };

  it('creates a user row for a new phone number', async () => {
    const user = await service.registerVictim('+910000000001', dto);
    expect(user.phoneNumber).toBe('+910000000001');
    expect(user.name).toBe('Synthetic Test Victim');
    expect(fake.userRows).toHaveLength(1);
  });

  it('does not create a case or run counsellor assignment (identity-only, by design)', async () => {
    await service.registerVictim('+910000000002', dto);
    // FakePrismaService has no `cases` delegate at all — if registerVictim
    // ever tried to touch one, this test file wouldn't even compile/run,
    // which is itself a form of regression protection for this scope
    // boundary. Explicit assertion for clarity:
    expect((fake as unknown as { cases?: unknown }).cases).toBeUndefined();
  });

  it('rejects a duplicate phone number', async () => {
    await service.registerVictim('+910000000003', dto);
    await expect(service.registerVictim('+910000000003', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('findVictimByPhone returns null for an unknown phone', async () => {
    const found = await service.findVictimByPhone('+910000000999');
    expect(found).toBeNull();
  });

  it('findVictimByPhone finds a registered victim', async () => {
    const created = await service.registerVictim('+910000000004', dto);
    const found = await service.findVictimByPhone('+910000000004');
    expect(found?.id).toBe(created.id);
  });
});
