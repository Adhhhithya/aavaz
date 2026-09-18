import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffAuditService } from '../staff/staff-audit.service';
import { StaffService } from '../staff/staff.service';
import { ConsoleService } from './console.service';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

describe('ConsoleService', () => {
  let fake: FakePrismaService;
  let staffService: StaffService;
  let auditService: StaffAuditService;
  let consoleService: ConsoleService;

  beforeEach(() => {
    fake = new FakePrismaService();
    staffService = new StaffService(fake as unknown as PrismaService);
    auditService = new StaffAuditService(fake as unknown as PrismaService);
    consoleService = new ConsoleService(fake as unknown as PrismaService, auditService);
  });

  function seedUser(over: Partial<{ id: string; name: string; locationDistrict: string | null }> = {}) {
    const row = {
      id: over.id ?? nextId('user'),
      phoneNumber: `+9100000${seq}`,
      name: over.name ?? 'Synthetic Victim',
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

  function seedCase(over: { userId: string; assignedCounsellorId?: string | null; distressScore?: number }) {
    const row = {
      id: nextId('case'),
      userId: over.userId,
      caseType: 'unspecified',
      intakeChannel: 'app',
      caseStage: 'registered',
      assignedCounsellorId: over.assignedCounsellorId ?? null,
      currentDistressScore: over.distressScore ?? 10,
      priorityRank: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lifecycleState: 'REGISTERED',
      lifecycleUpdatedAt: new Date(),
    };
    fake.caseRows.push(row);
    return row;
  }

  describe('role gating', () => {
    it('state_admin cannot call console endpoints at all — oversight-tier roles see aggregates only, per v0.2', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'state_admin' });
      await expect(consoleService.getQueue(staff)).rejects.toThrow(ForbiddenException);
    });

    it('national_admin cannot call console endpoints at all', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'national_admin' });
      const victim = seedUser();
      await expect(consoleService.getVictim(staff, victim.id)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('queue — counsellor role (assignment-scoped)', () => {
    it('returns only cases assigned to this staff member\'s linked counsellor identity', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser();
      const mine = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-A' });
      seedCase({ userId: seedUser().id, assignedCounsellorId: 'counsellor-B' }); // someone else's

      const queue = await consoleService.getQueue(staff);
      expect(queue).toHaveLength(1);
      expect(queue[0].caseId).toBe(mine.id);
    });

    it('a counsellor-role staff member with no linked counsellorId is denied entirely (fail closed), not shown an empty queue silently', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor' });
      await expect(consoleService.getQueue(staff)).rejects.toThrow(ForbiddenException);
    });

    it("never authorizes via staff.userId happening to equal a case's assignedCounsellorId — only staff.counsellorId is ever compared", async () => {
      const coincidental = 'coincidentally-shared-id-value';
      const victim = seedUser();
      seedCase({ userId: victim.id, assignedCounsellorId: coincidental });
      // This staff member's OWN userId equals the case's
      // assignedCounsellorId by pure coincidence — but counsellorId is
      // never set, so access must still be denied.
      const staff = await staffService.createStaff({ userId: coincidental, role: 'counsellor' });

      await expect(consoleService.getQueue(staff)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('queue — district-scoped roles (supervisor, district_admin)', () => {
    it('returns cases whose victim is within the staff member\'s district_scope', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const inScope = seedUser({ locationDistrict: 'Pune' });
      const outOfScope = seedUser({ locationDistrict: 'Mumbai' });
      const wanted = seedCase({ userId: inScope.id });
      seedCase({ userId: outOfScope.id });

      const queue = await consoleService.getQueue(staff);
      expect(queue).toHaveLength(1);
      expect(queue[0].caseId).toBe(wanted.id);
    });

    it('an empty district_scope authorizes nothing (fail closed), not "no restriction"', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'supervisor' });
      const victim = seedUser({ locationDistrict: 'Pune' });
      seedCase({ userId: victim.id });

      const queue = await consoleService.getQueue(staff);
      expect(queue).toEqual([]);
    });

    it('supervisor sees every district case, not only ones assigned to a specific counsellor (no assignment requirement for this role)', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'supervisor',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune' });
      seedCase({ userId: victim.id, assignedCounsellorId: null });

      const queue = await consoleService.getQueue(staff);
      expect(queue).toHaveLength(1);
    });
  });

  describe('getVictim', () => {
    it('a counsellor can read a victim they are actually assigned a case for', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser({ name: 'Assigned Victim' });
      seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-A' });

      const result = await consoleService.getVictim(staff, victim.id);
      expect(result.userId).toBe(victim.id);
      expect(result.name).toBe('Assigned Victim');
    });

    it('a counsellor cannot read a victim assigned to a different counsellor', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser();
      seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-OTHER' });

      await expect(consoleService.getVictim(staff, victim.id)).rejects.toThrow(ForbiddenException);
    });

    it('a district_admin cannot read a victim outside their district_scope', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Mumbai' });

      await expect(consoleService.getVictim(staff, victim.id)).rejects.toThrow(ForbiddenException);
    });

    it('a nonexistent victim id produces the SAME denial as an out-of-scope victim — no existence-leaking distinction', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });

      let nonexistentError: unknown;
      try {
        await consoleService.getVictim(staff, 'not-a-real-user-id');
      } catch (e) {
        nonexistentError = e;
      }

      const outOfScopeVictim = seedUser({ locationDistrict: 'Mumbai' });
      let outOfScopeError: unknown;
      try {
        await consoleService.getVictim(staff, outOfScopeVictim.id);
      } catch (e) {
        outOfScopeError = e;
      }

      expect(nonexistentError).toBeInstanceOf(ForbiddenException);
      expect(outOfScopeError).toBeInstanceOf(ForbiddenException);
      expect((nonexistentError as ForbiddenException).message).toBe(
        (outOfScopeError as ForbiddenException).message,
      );
    });
  });

  describe('audit hook', () => {
    it('records a successful queue read as an id/code row, never victim content', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      seedCase({ userId: seedUser({ locationDistrict: 'Pune', name: 'Should Not Appear In Audit' }).id });

      await consoleService.getQueue(staff);

      expect(fake.staffAuditLogRows).toHaveLength(1);
      const entry = fake.staffAuditLogRows[0];
      expect(entry.staffId).toBe(staff.id);
      expect(entry.action).toBe('console.queue.read');
      expect(entry.resourceType).toBe('queue');
      expect(JSON.stringify(entry)).not.toContain('Should Not Appear In Audit');
    });

    it('records a successful victim read with the victim\'s id as resourceId, never their name/phone', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune', name: 'Should Not Appear In Audit Either' });

      await consoleService.getVictim(staff, victim.id);

      expect(fake.staffAuditLogRows).toHaveLength(1);
      const entry = fake.staffAuditLogRows[0];
      expect(entry.action).toBe('console.victim.read');
      expect(entry.resourceType).toBe('victim');
      expect(entry.resourceId).toBe(victim.id);
      expect(JSON.stringify(entry)).not.toContain('Should Not Appear In Audit Either');
    });

    it('does NOT record an audit entry for a denied attempt', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Mumbai' });

      await expect(consoleService.getVictim(staff, victim.id)).rejects.toThrow(ForbiddenException);
      expect(fake.staffAuditLogRows).toHaveLength(0);
    });
  });
});
