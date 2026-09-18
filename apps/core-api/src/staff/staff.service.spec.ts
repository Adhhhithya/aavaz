import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffService } from './staff.service';

describe('StaffService', () => {
  let fake: FakePrismaService;
  let service: StaffService;

  beforeEach(() => {
    fake = new FakePrismaService();
    service = new StaffService(fake as unknown as PrismaService);
  });

  it('resolves a staff identity by userId (the authenticated-identity bridge)', async () => {
    await service.createStaff({ userId: 'user-1', role: 'counsellor', counsellorId: 'counsellor-1' });
    const resolved = await service.getStaffForUser('user-1');
    expect(resolved?.userId).toBe('user-1');
    expect(resolved?.counsellorId).toBe('counsellor-1');
    expect(resolved?.role).toBe('counsellor');
  });

  it('returns null for a user with no staff row — authenticated but not staff', async () => {
    const resolved = await service.getStaffForUser('user-with-no-staff-row');
    expect(resolved).toBeNull();
  });

  it('a role without a caseload (e.g. district_admin) can be created with no linked counsellor at all', async () => {
    const resolved = await service.createStaff({
      userId: 'user-2',
      role: 'district_admin',
      districtScope: ['Pune'],
    });
    expect(resolved.counsellorId).toBeNull();
  });

  it('rejects an unrecognized role at creation time', async () => {
    await expect(
      service.createStaff({ userId: 'user-3', role: 'not_a_real_role' as never }),
    ).rejects.toThrow(/Unrecognized staff role/);
    expect(fake.staffRows).toHaveLength(0);
  });

  it('treats a staff row with an unrecognized role (e.g. written outside this service) as not staff, fail-closed', async () => {
    fake.staffRows.push({
      id: 'staff-x',
      userId: 'user-4',
      counsellorId: null,
      role: 'some_future_role_this_code_does_not_know_about',
      orgId: null,
      districtScope: [],
      languages: [],
      caseloadCap: null,
      onCallSchedule: null,
      createdAt: new Date(),
    });
    const resolved = await service.getStaffForUser('user-4');
    expect(resolved).toBeNull();
  });

  it('district_scope defaults to empty (authorizes nothing) when not supplied', async () => {
    const resolved = await service.createStaff({ userId: 'user-5', role: 'supervisor' });
    expect(resolved.districtScope).toEqual([]);
  });

  it("never resolves one user's staff identity for another user's id", async () => {
    await service.createStaff({ userId: 'user-6', role: 'counsellor', counsellorId: 'counsellor-a' });
    await service.createStaff({ userId: 'user-7', role: 'counsellor', counsellorId: 'counsellor-b' });
    const staff6 = await service.getStaffForUser('user-6');
    const staff7 = await service.getStaffForUser('user-7');
    expect(staff6?.counsellorId).toBe('counsellor-a');
    expect(staff7?.counsellorId).toBe('counsellor-b');
  });
});
