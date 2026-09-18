import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffAuditService } from '../staff/staff-audit.service';
import { StaffService } from '../staff/staff.service';
import { MilestoneService } from './milestone.service';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

describe('MilestoneService', () => {
  let fake: FakePrismaService;
  let staffService: StaffService;
  let auditService: StaffAuditService;
  let milestoneService: MilestoneService;

  beforeEach(() => {
    fake = new FakePrismaService();
    staffService = new StaffService(fake as unknown as PrismaService);
    auditService = new StaffAuditService(fake as unknown as PrismaService);
    milestoneService = new MilestoneService(fake as unknown as PrismaService, auditService);
  });

  function seedUser(over: Partial<{ id: string; locationDistrict: string | null }> = {}) {
    const row = {
      id: over.id ?? nextId('user'),
      phoneNumber: `+9100000${seq}`,
      name: 'Synthetic Victim',
      roleType: 'victim',
      preferredLanguage: 'en',
      consentGiven: true,
      consentTimestamp: null,
      locationDistrict: over.locationDistrict ?? null,
      locationState: null,
      locationSource: null,
      locationLat: null,
      locationLng: null,
      createdAt: new Date(),
    };
    fake.userRows.push(row);
    return row;
  }

  function seedCase(over: { userId: string | null; assignedCounsellorId?: string | null }) {
    const row = {
      id: nextId('case'),
      userId: over.userId,
      caseType: 'unspecified',
      intakeChannel: 'app',
      caseStage: 'registered',
      assignedCounsellorId: over.assignedCounsellorId ?? null,
      currentDistressScore: 0,
      priorityRank: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lifecycleState: 'MONITORING',
      lifecycleUpdatedAt: new Date(),
    };
    fake.caseRows.push(row);
    return row;
  }

  async function seedDistrictStaff(district = 'Pune') {
    return staffService.createStaff({ userId: nextId('user'), role: 'district_admin', districtScope: [district] });
  }

  describe('create', () => {
    it('a district-scoped staff member can record a milestone for a case in scope', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });

      const milestone = await milestoneService.create(staff, kase.id, 'chargesheet_filed');
      expect(milestone.type).toBe('chargesheet_filed');
      expect(milestone.metAt).toBeNull();
      expect(milestone.enteredByStaffId).toBe(staff.id);
    });

    it('accepts a real, staff-supplied dueAt', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });

      const milestone = await milestoneService.create(staff, kase.id, 'relief_instalment_paid', '2026-03-01T00:00:00.000Z');
      expect(milestone.dueAt?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('a staff member outside the case scope cannot record a milestone', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Mumbai' });
      const kase = seedCase({ userId: victim.id });

      await expect(milestoneService.create(staff, kase.id, 'fir_filed')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('state_admin (oversight-tier) cannot record milestones', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'state_admin' });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });

      await expect(milestoneService.create(staff, kase.id, 'fir_filed')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('markMet', () => {
    it('marks a milestone met, defaulting metAt to now when not supplied', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const milestone = await milestoneService.create(staff, kase.id, 'chargesheet_filed');

      const before = Date.now();
      const updated = await milestoneService.markMet(staff, milestone.id);
      expect(updated.metAt).not.toBeNull();
      expect(updated.metAt!.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('accepts a real, staff-supplied metAt (backdating a confirmed event)', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const milestone = await milestoneService.create(staff, kase.id, 'chargesheet_filed');

      const updated = await milestoneService.markMet(staff, milestone.id, '2026-01-15T00:00:00.000Z');
      expect(updated.metAt?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    });

    it('rejects marking an already-met milestone met again', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const milestone = await milestoneService.create(staff, kase.id, 'chargesheet_filed');
      await milestoneService.markMet(staff, milestone.id);

      await expect(milestoneService.markMet(staff, milestone.id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('a staff member outside the case scope cannot mark a milestone met', async () => {
      const owner = await seedDistrictStaff('Pune');
      const outsider = await seedDistrictStaff('Mumbai');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const milestone = await milestoneService.create(owner, kase.id, 'fir_filed');

      await expect(milestoneService.markMet(outsider, milestone.id)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a stale conditional update (already met underneath it) is rejected with a real conflict', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const milestone = await milestoneService.create(staff, kase.id, 'fir_filed');

      const originalFindUnique = fake.milestone.findUnique.bind(fake.milestone);
      fake.milestone.findUnique = (async (args: Parameters<typeof originalFindUnique>[0]) => {
        const result = await originalFindUnique(args);
        const row = fake.milestoneRows.find((m) => m.id === milestone.id)!;
        row.metAt = new Date('2020-01-01T00:00:00.000Z'); // another "request" won first
        return result;
      }) as typeof fake.milestone.findUnique;

      await expect(milestoneService.markMet(staff, milestone.id)).rejects.toBeInstanceOf(ConflictException);
      expect(fake.milestoneRows.find((m) => m.id === milestone.id)?.metAt?.toISOString()).toBe(
        '2020-01-01T00:00:00.000Z',
      );
    });
  });

  describe('listForCase', () => {
    it('lists milestones for a case in scope, oldest first', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      await milestoneService.create(staff, kase.id, 'fir_filed');
      await milestoneService.create(staff, kase.id, 'chargesheet_filed');

      const list = await milestoneService.listForCase(staff, kase.id);
      expect(list).toHaveLength(2);
      expect(list[0].type).toBe('fir_filed');
      expect(list[1].type).toBe('chargesheet_filed');
    });

    it('a staff member outside the case scope cannot list its milestones', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Mumbai' });
      const kase = seedCase({ userId: victim.id });

      await expect(milestoneService.listForCase(staff, kase.id)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('audit hook', () => {
    it('records create/markMet/list, but nothing for a denied attempt', async () => {
      const staff = await seedDistrictStaff('Pune');
      const outsider = await seedDistrictStaff('Mumbai');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });

      const milestone = await milestoneService.create(staff, kase.id, 'fir_filed');
      await milestoneService.markMet(staff, milestone.id);
      await milestoneService.listForCase(staff, kase.id);
      await expect(milestoneService.create(outsider, kase.id, 'chargesheet_filed')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(fake.staffAuditLogRows.map((r) => r.action)).toEqual([
        'milestone.created',
        'milestone.marked_met',
        'milestone.list.read',
      ]);
    });
  });
});
