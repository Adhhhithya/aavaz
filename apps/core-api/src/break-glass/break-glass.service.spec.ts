import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffAuditService } from '../staff/staff-audit.service';
import { StaffService } from '../staff/staff.service';
import { TaskService } from '../task/task.service';
import { BREAK_GLASS_DURATION_HOURS, BreakGlassService } from './break-glass.service';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

describe('BreakGlassService', () => {
  let fake: FakePrismaService;
  let staffService: StaffService;
  let auditService: StaffAuditService;
  let taskService: TaskService;
  let breakGlassService: BreakGlassService;

  beforeEach(() => {
    fake = new FakePrismaService();
    staffService = new StaffService(fake as unknown as PrismaService);
    auditService = new StaffAuditService(fake as unknown as PrismaService);
    taskService = new TaskService(fake as unknown as PrismaService, auditService);
    breakGlassService = new BreakGlassService(fake as unknown as PrismaService, auditService, taskService);
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

  const REASON = 'Victim\'s sister called in crisis, on-call counsellor unreachable';

  describe('request', () => {
    it('a counsellor can request break-glass access to a case OUTSIDE their normal assignment scope', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser({ locationDistrict: 'Mumbai' }); // different district
      const kase = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-OTHER' }); // different counsellor

      const grant = await breakGlassService.request(staff, kase.id, REASON);
      expect(grant.caseId).toBe(kase.id);
      expect(grant.staffId).toBe(staff.id);
      expect(grant.reason).toBe(REASON);
    });

    it('expiresAt is exactly BREAK_GLASS_DURATION_HOURS after grantedAt', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'district_admin', districtScope: [] });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });

      const grant = await breakGlassService.request(staff, kase.id, REASON);
      const diffHours = (grant.expiresAt.getTime() - grant.grantedAt.getTime()) / (60 * 60 * 1000);
      expect(diffHours).toBeCloseTo(BREAK_GLASS_DURATION_HOURS, 5);
      expect(BREAK_GLASS_DURATION_HOURS).toBe(2); // v0.2 §15's exact stated duration
    });

    it('oversight-tier roles (state_admin/national_admin) cannot request break-glass', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'state_admin' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });

      await expect(breakGlassService.request(staff, kase.id, REASON)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a nonexistent case is rejected', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'district_admin', districtScope: [] });
      await expect(breakGlassService.request(staff, 'not-a-real-case-id', REASON)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('automatically creates a break_glass_review task ("notifies the supervisor")', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor', counsellorId: 'c-1' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });

      await breakGlassService.request(staff, kase.id, REASON);

      expect(fake.taskRows).toHaveLength(1);
      const task = fake.taskRows[0];
      expect(task.type).toBe('break_glass_review');
      expect(task.caseId).toBe(kase.id);
      expect(task.priority).toBe('critical');
      expect(task.createdByStaffId).toBeNull(); // system-created
    });

    it('records an audit row with IDs/codes only — the real reason text never appears in staff_audit_log', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor', counsellorId: 'c-1' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });

      await breakGlassService.request(staff, kase.id, REASON);

      expect(fake.staffAuditLogRows).toHaveLength(1);
      const entry = fake.staffAuditLogRows[0];
      expect(entry.action).toBe('break_glass.requested');
      expect(entry.resourceType).toBe('case');
      expect(entry.resourceId).toBe(kase.id);
      expect(JSON.stringify(entry)).not.toContain(REASON);
    });

    it('the real reason text IS stored on the grant itself, for a supervisor to actually read', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor', counsellorId: 'c-1' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });

      await breakGlassService.request(staff, kase.id, REASON);
      expect(fake.breakGlassGrantRows[0].reason).toBe(REASON);
    });
  });

  describe('isActive', () => {
    it('returns true for a just-granted, unexpired grant', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor', counsellorId: 'c-1' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });
      await breakGlassService.request(staff, kase.id, REASON);

      expect(await breakGlassService.isActive(staff.id, kase.id)).toBe(true);
    });

    it('returns false once the grant has expired', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor', counsellorId: 'c-1' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });
      await breakGlassService.request(staff, kase.id, REASON);

      // Simulate time passing past expiry.
      fake.breakGlassGrantRows[0].expiresAt = new Date(Date.now() - 1000);
      expect(await breakGlassService.isActive(staff.id, kase.id)).toBe(false);
    });

    it('returns false for a different staff member — a grant is per-staff, not per-case', async () => {
      const grantee = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor', counsellorId: 'c-1' });
      const otherStaff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor', counsellorId: 'c-2' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });
      await breakGlassService.request(grantee, kase.id, REASON);

      expect(await breakGlassService.isActive(otherStaff.id, kase.id)).toBe(false);
    });

    it('returns false when no grant was ever requested', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor', counsellorId: 'c-1' });
      const victim = seedUser();
      const kase = seedCase({ userId: victim.id });

      expect(await breakGlassService.isActive(staff.id, kase.id)).toBe(false);
    });
  });
});
