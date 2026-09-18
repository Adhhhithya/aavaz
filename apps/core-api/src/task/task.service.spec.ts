import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FakePrismaService } from '../../test/fake-prisma';
import { StaffAuditService } from '../staff/staff-audit.service';
import { StaffService } from '../staff/staff.service';
import { TaskService } from './task.service';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

describe('TaskService', () => {
  let fake: FakePrismaService;
  let staffService: StaffService;
  let auditService: StaffAuditService;
  let taskService: TaskService;

  beforeEach(() => {
    fake = new FakePrismaService();
    staffService = new StaffService(fake as unknown as PrismaService);
    auditService = new StaffAuditService(fake as unknown as PrismaService);
    taskService = new TaskService(fake as unknown as PrismaService, auditService);
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

  function seedReferral(over: { caseId: string; userId: string; status?: string }) {
    const row = {
      id: nextId('referral'),
      caseId: over.caseId,
      userId: over.userId,
      destinationType: 'mental_health',
      status: over.status ?? 'DRAFTED',
      packetData: {},
      createdByStaffId: nextId('staff'),
      attemptCount: 0,
      idempotencyKey: null,
      sentAt: null,
      ackDueAt: null,
      ackedAt: null,
      serviceDueAt: null,
      inServiceAt: null,
      deliveredAt: null,
      verifiedAt: null,
      ackTokenHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fake.referralRows.push(row);
    return row;
  }

  async function seedDistrictStaff(district = 'Pune') {
    return staffService.createStaff({ userId: nextId('user'), role: 'district_admin', districtScope: [district] });
  }

  describe('createReferralReviewTask (staff-initiated)', () => {
    it('a district-scoped staff member can create a referral_review task for a referral in scope', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id });

      const task = await taskService.createReferralReviewTask(staff, referral.id, 'bad');
      expect(task.type).toBe('referral_review');
      expect(task.priority).toBe('bad');
      expect(task.status).toBe('OPEN');
      expect(task.referralId).toBe(referral.id);
      expect(task.caseId).toBe(kase.id);
      expect(task.createdByStaffId).toBe(staff.id);
    });

    it('a staff member outside the case scope cannot create a task for it', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Mumbai' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id });

      await expect(taskService.createReferralReviewTask(staff, referral.id, 'bad')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('state_admin (oversight-tier) cannot create tasks', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'state_admin' });
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id });

      await expect(taskService.createReferralReviewTask(staff, referral.id, 'bad')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('createStalledReferralTaskTx (system-created)', () => {
    it('creates a referral_stalled task with serious priority and an SLA 5 working days out', async () => {
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id, status: 'STALLED' });

      await taskService.createStalledReferralTaskTx(fake as unknown as PrismaService, {
        id: referral.id,
        caseId: kase.id,
        userId: victim.id,
      });

      expect(fake.taskRows).toHaveLength(1);
      const task = fake.taskRows[0];
      expect(task.type).toBe('referral_stalled');
      expect(task.priority).toBe('serious');
      expect(task.status).toBe('OPEN');
      expect(task.createdByStaffId).toBeNull(); // system-created, not staff-attributed
      expect(task.slaDueAt).not.toBeNull();
      expect(task.slaDueAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('does NOT write a staff-attributed audit row (see the method\'s own comment for why)', async () => {
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id, status: 'STALLED' });

      await taskService.createStalledReferralTaskTx(fake as unknown as PrismaService, {
        id: referral.id,
        caseId: kase.id,
        userId: victim.id,
      });

      expect(fake.staffAuditLogRows).toHaveLength(0);
    });
  });

  describe('transition', () => {
    it('OPEN -> ACKNOWLEDGED stamps ackedAt; ACKNOWLEDGED -> COMPLETED stamps completedAt', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id });
      const task = await taskService.createReferralReviewTask(staff, referral.id, 'bad');

      const acked = await taskService.transition(staff, task.id, 'ACKNOWLEDGED');
      expect(acked.status).toBe('ACKNOWLEDGED');
      expect(acked.ackedAt).not.toBeNull();

      const completed = await taskService.transition(staff, task.id, 'COMPLETED');
      expect(completed.status).toBe('COMPLETED');
      expect(completed.completedAt).not.toBeNull();
    });

    it('rejects an invalid transition (OPEN -> COMPLETED, skipping ACKNOWLEDGED)', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id });
      const task = await taskService.createReferralReviewTask(staff, referral.id, 'bad');

      await expect(taskService.transition(staff, task.id, 'COMPLETED')).rejects.toBeInstanceOf(ConflictException);
    });

    it('a staff member outside the case scope cannot transition the task', async () => {
      const owner = await seedDistrictStaff('Pune');
      const outsider = await seedDistrictStaff('Mumbai');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id });
      const task = await taskService.createReferralReviewTask(owner, referral.id, 'bad');

      await expect(taskService.transition(outsider, task.id, 'ACKNOWLEDGED')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('a stale conditional update (status changed underneath it) is rejected with a real conflict', async () => {
      const staff = await seedDistrictStaff('Pune');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id });
      const task = await taskService.createReferralReviewTask(staff, referral.id, 'bad');

      const originalFindUnique = fake.task.findUnique.bind(fake.task);
      fake.task.findUnique = (async (args: Parameters<typeof originalFindUnique>[0]) => {
        const result = await originalFindUnique(args);
        const row = fake.taskRows.find((t) => t.id === task.id)!;
        row.status = 'CANCELLED';
        return result;
      }) as typeof fake.task.findUnique;

      await expect(taskService.transition(staff, task.id, 'ACKNOWLEDGED')).rejects.toBeInstanceOf(ConflictException);
      expect(fake.taskRows.find((t) => t.id === task.id)?.status).toBe('CANCELLED');
    });
  });

  describe('listTasks', () => {
    it('a counsellor sees only tasks for cases assigned to their linked counsellor identity', async () => {
      const staff = await staffService.createStaff({
        userId: nextId('user'),
        role: 'counsellor',
        counsellorId: 'counsellor-A',
      });
      const victim = seedUser();
      const myCase = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-A' });
      const otherCase = seedCase({ userId: victim.id, assignedCounsellorId: 'counsellor-OTHER' });
      const myReferral = seedReferral({ caseId: myCase.id, userId: victim.id });
      const otherReferral = seedReferral({ caseId: otherCase.id, userId: victim.id });
      await taskService.createStalledReferralTaskTx(fake as unknown as PrismaService, {
        id: myReferral.id,
        caseId: myCase.id,
        userId: victim.id,
      });
      await taskService.createStalledReferralTaskTx(fake as unknown as PrismaService, {
        id: otherReferral.id,
        caseId: otherCase.id,
        userId: victim.id,
      });

      const tasks = await taskService.listTasks(staff);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].caseId).toBe(myCase.id);
    });

    it('a counsellor-role staff member with no linked counsellor identity sees nothing, fail closed', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'counsellor' });
      expect(await taskService.listTasks(staff)).toEqual([]);
    });

    it('an empty district_scope authorizes nothing', async () => {
      const staff = await staffService.createStaff({ userId: nextId('user'), role: 'supervisor', districtScope: [] });
      expect(await taskService.listTasks(staff)).toEqual([]);
    });
  });

  describe('audit hook', () => {
    it('records a create and a transition, but does NOT record an audit entry for a denied attempt', async () => {
      const staff = await seedDistrictStaff('Pune');
      const outsider = await seedDistrictStaff('Mumbai');
      const victim = seedUser({ locationDistrict: 'Pune' });
      const kase = seedCase({ userId: victim.id });
      const referral = seedReferral({ caseId: kase.id, userId: victim.id });

      const task = await taskService.createReferralReviewTask(staff, referral.id, 'bad');
      await taskService.transition(staff, task.id, 'ACKNOWLEDGED');
      await expect(taskService.transition(outsider, task.id, 'COMPLETED')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(fake.staffAuditLogRows).toHaveLength(2); // create + one successful transition, not the denied one
      expect(fake.staffAuditLogRows.map((r) => r.action)).toEqual(['task.created', 'task.transition']);
    });
  });
});
