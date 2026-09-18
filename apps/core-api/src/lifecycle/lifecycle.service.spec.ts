import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffAuditService } from '../staff/staff-audit.service';
import { StaffService } from '../staff/staff.service';
import { LifecycleService } from './lifecycle.service';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

describe('LifecycleService', () => {
  let fake: FakePrismaService;
  let staffService: StaffService;
  let auditService: StaffAuditService;
  let lifecycleService: LifecycleService;

  beforeEach(() => {
    fake = new FakePrismaService();
    staffService = new StaffService(fake as unknown as PrismaService);
    auditService = new StaffAuditService(fake as unknown as PrismaService);
    lifecycleService = new LifecycleService(fake as unknown as PrismaService, auditService);
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

  function seedCase(over: { userId: string | null; assignedCounsellorId?: string | null; lifecycleState?: string }) {
    const row = {
      id: nextId('case'),
      userId: over.userId,
      caseType: 'unspecified',
      intakeChannel: 'app',
      caseStage: 'registered',
      assignedCounsellorId: over.assignedCounsellorId ?? null,
      currentDistressScore: 10,
      priorityRank: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lifecycleState: over.lifecycleState ?? 'REGISTERED',
      lifecycleUpdatedAt: new Date(),
    };
    fake.caseRows.push(row);
    return row;
  }

  describe('role gating', () => {
    it('state_admin cannot transition any case — oversight-tier roles are excluded, same as S7 console', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'state_admin' });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      await expect(lifecycleService.transition(staff, kase.id, 'MONITORING')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assignment ownership (counsellor role)', () => {
    it('a counsellor can transition a case actually assigned to their linked counsellor identity', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-A' });

      const result = await lifecycleService.transition(staff, kase.id, 'MONITORING');
      expect(result.newState).toBe('MONITORING');
      expect(result.previousState).toBe('REGISTERED');
    });

    it('a counsellor cannot transition a case assigned to a different counsellor', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-OTHER' });

      await expect(lifecycleService.transition(staff, kase.id, 'MONITORING')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('a counsellor-role staff member with no linked counsellor identity is denied everything, fail closed', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-A' });

      await expect(lifecycleService.transition(staff, kase.id, 'MONITORING')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("never authorizes via staff.userId happening to equal a case's assignedCounsellorId — only staff.counsellorId is ever compared", async () => {
      const coincidental = 'coincidentally-shared-id-value';
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id, assignedCounsellorId: coincidental });
      const staff = await staffService.createStaff({ userId: coincidental, role: 'counsellor' });

      await expect(lifecycleService.transition(staff, kase.id, 'MONITORING')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('district scoping (supervisor, district_admin)', () => {
    it('a district_admin can transition a case whose victim is within their district_scope', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });

      const result = await lifecycleService.transition(staff, kase.id, 'MONITORING');
      expect(result.newState).toBe('MONITORING');
    });

    it('a district_admin cannot transition a case outside their district_scope', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Mumbai' });
      const kase = seedCase({ userId: victim.id });

      await expect(lifecycleService.transition(staff, kase.id, 'MONITORING')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('an empty district_scope authorizes nothing', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'supervisor', districtScope: [] });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });

      await expect(lifecycleService.transition(staff, kase.id, 'MONITORING')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('consistent denial response', () => {
    it('a nonexistent case id produces the SAME denial as an out-of-scope case', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });

      let nonexistentError: unknown;
      try {
        await lifecycleService.transition(staff, 'not-a-real-case-id', 'MONITORING');
      } catch (e) {
        nonexistentError = e;
      }

      const outOfScopeVictim = seedUser({ locationDistrict: 'Mumbai' });
      const outOfScopeCase = seedCase({ userId: outOfScopeVictim.id });
      let outOfScopeError: unknown;
      try {
        await lifecycleService.transition(staff, outOfScopeCase.id, 'MONITORING');
      } catch (e) {
        outOfScopeError = e;
      }

      expect(nonexistentError).toBeInstanceOf(ForbiddenException);
      expect(outOfScopeError).toBeInstanceOf(ForbiddenException);
      expect((nonexistentError as ForbiddenException).message).toBe((outOfScopeError as ForbiddenException).message);
    });
  });

  describe('transition validity', () => {
    it('rejects an invalid transition even for a fully authorized staff member', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id, lifecycleState: 'REGISTERED' });

      // REGISTERED -> ESCALATED skips required intermediate states.
      await expect(lifecycleService.transition(staff, kase.id, 'ESCALATED')).rejects.toBeInstanceOf(
        ConflictException,
      );
      // The case's state must be unchanged after a rejected transition.
      expect(fake.caseRows.find((c) => c.id === kase.id)?.lifecycleState).toBe('REGISTERED');
    });

    it('rejects a self-transition', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id, lifecycleState: 'MONITORING' });

      await expect(lifecycleService.transition(staff, kase.id, 'MONITORING')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('concurrency safety', () => {
    it('a stale conditional update (state changed underneath it) is rejected with a real conflict, not silently applied', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id, lifecycleState: 'MONITORING' });

      // Simulate a "concurrent" request winning the race: mutate the row
      // out-of-band between this service's read and its conditional
      // write, by intercepting findUnique once.
      const originalFindUnique = fake.case.findUnique.bind(fake.case);
      fake.case.findUnique = (async (args: Parameters<typeof originalFindUnique>[0]) => {
        const result = await originalFindUnique(args);
        // Another "request" commits first, moving the real row to PAUSED.
        const row = fake.caseRows.find((c) => c.id === kase.id)!;
        row.lifecycleState = 'PAUSED';
        return result; // this request still believes the state is MONITORING
      }) as typeof fake.case.findUnique;

      await expect(lifecycleService.transition(staff, kase.id, 'ESCALATED')).rejects.toBeInstanceOf(
        ConflictException,
      );
      // The real, concurrently-committed state must win — not silently
      // overwritten by the stale request.
      expect(fake.caseRows.find((c) => c.id === kase.id)?.lifecycleState).toBe('PAUSED');
    });
  });

  describe('opt-out foundation', () => {
    it('transitioning to OPTED_OUT stamps the victim-level optedOutAt marker', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id, lifecycleState: 'MONITORING' });

      await lifecycleService.transition(staff, kase.id, 'OPTED_OUT');

      const profile = fake.victimProfileRows.find((p) => p.userId === victim.id);
      expect(profile?.optedOutAt).not.toBeNull();
    });

    it('a transition that does not reach OPTED_OUT never touches victim_profiles', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id, lifecycleState: 'REGISTERED' });

      await lifecycleService.transition(staff, kase.id, 'MONITORING');

      expect(fake.victimProfileRows.find((p) => p.userId === victim.id)).toBeUndefined();
    });
  });

  describe('audit hook', () => {
    it('records a successful transition as an id/code row, never the state values or any victim content', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune', id: nextId('user') });
      const kase = seedCase({ userId: victim.id, lifecycleState: 'REGISTERED' });

      await lifecycleService.transition(staff, kase.id, 'MONITORING');

      expect(fake.staffAuditLogRows).toHaveLength(1);
      const entry = fake.staffAuditLogRows[0];
      expect(entry.staffId).toBe(staff.id);
      expect(entry.action).toBe('lifecycle.case.transition');
      expect(entry.resourceType).toBe('case');
      expect(entry.resourceId).toBe(kase.id);
      expect(entry.reason).toBeNull();
    });

    it('does NOT record an audit entry for a denied attempt', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Mumbai' });
      const kase = seedCase({ userId: victim.id });

      await expect(lifecycleService.transition(staff, kase.id, 'MONITORING')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(fake.staffAuditLogRows).toHaveLength(0);
    });

    it('does NOT record an audit entry for a rejected (invalid) transition', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'district_admin',
        districtScope: ['Pune'],
      });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id, lifecycleState: 'REGISTERED' });

      await expect(lifecycleService.transition(staff, kase.id, 'ESCALATED')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(fake.staffAuditLogRows).toHaveLength(0);
    });
  });
});
