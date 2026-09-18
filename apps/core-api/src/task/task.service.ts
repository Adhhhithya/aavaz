import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuditService } from '../staff/staff-audit.service';
import { ASSIGNMENT_SCOPED_ROLES, CONSOLE_INDIVIDUAL_RECORD_ROLES } from '../staff/staff-roles';
import { ResolvedStaff } from '../staff/staff.service';
import { addWorkingDays, REFERRAL_STALLED_FOLLOWUP_SLA_WORKING_DAYS } from './task-sla';
import { isValidTaskTransition, TaskPriority, TaskState } from './task-states';

export interface TaskView {
  id: string;
  userId: string | null;
  caseId: string | null;
  referralId: string | null;
  type: string;
  priority: string;
  status: string;
  assigneeStaffId: string | null;
  createdByStaffId: string | null;
  slaDueAt: Date | null;
  ackedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

type TxClient = Prisma.TransactionClient;

/**
 * Node's task domain (v0.2 §12's `tasks` table; Workflow H "H2"/"H3").
 * See docs/S12_TASK_MIGRATION.md for the full design record — which task
 * types are wired to a real, automatic trigger (`referral_stalled`, via
 * `createStalledReferralTaskTx`, called from
 * apps/core-api/src/referral/referral.service.ts's own transaction) versus
 * which are staff-created as a stopgap (`referral_review`, v0.2 "H2").
 *
 * Authorization and concurrency both reuse S7-S9's exact patterns — role
 * gate via CONSOLE_INDIVIDUAL_RECORD_ROLES, case-scoped
 * assignment/district authorization, and the same atomic
 * conditional-`UPDATE` transition claim.
 */
@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: StaffAuditService,
  ) {}

  async createReferralReviewTask(staff: ResolvedStaff, referralId: string, priority: TaskPriority): Promise<TaskView> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to tasks');
    }

    return this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({
        where: { id: referralId },
        include: { case: { include: { user: { select: { locationDistrict: true } } } } },
      });
      if (!referral || !referral.case || !this.canMutateCase(staff, referral.case)) {
        throw new ForbiddenException('You do not have access to this referral');
      }

      const task = await tx.task.create({
        data: {
          userId: referral.userId,
          caseId: referral.caseId,
          referralId: referral.id,
          type: 'referral_review',
          priority,
          status: 'OPEN',
          createdByStaffId: staff.id,
        },
      });

      await this.auditService.record(staff.id, 'task.created', 'task', task.id, tx);

      return this.toView(task);
    });
  }

  /**
   * Called from ReferralService.transition (same transaction — `tx` is
   * the caller's own transaction client, never a fresh one, matching
   * S8's own audit-atomicity fix) whenever a referral reaches STALLED.
   * `createdByStaffId` is deliberately null — this is a SYSTEM-created
   * task, not a staff action, and StaffAuditService.record requires a
   * real `staffId`, so no audit row is written for this specific creation
   * (the referral's own transition already writes its own audit row for
   * the same request — see docs/S12_TASK_MIGRATION.md section D for why
   * a second, staff-attributed audit entry for a system action would
   * misrepresent who did what).
   */
  async createStalledReferralTaskTx(
    tx: TxClient,
    referral: { id: string; caseId: string; userId: string },
  ): Promise<void> {
    await tx.task.create({
      data: {
        userId: referral.userId,
        caseId: referral.caseId,
        referralId: referral.id,
        type: 'referral_stalled',
        priority: 'serious',
        status: 'OPEN',
        slaDueAt: addWorkingDays(new Date(), REFERRAL_STALLED_FOLLOWUP_SLA_WORKING_DAYS),
      },
    });
  }

  /**
   * S14: called from RegistrationService's own transaction (v0.2
   * Workflow A "A7": "No match creates an unassigned task for the
   * district supervisor") whenever a district was resolved but no
   * eligible counsellor was found. `createdByStaffId` is null for the
   * same system-actor reason `createStalledReferralTaskTx` documents.
   * `priority: 'bad'` is a considered default, NOT spec-evidenced — A7
   * names no priority for this task type; `bad` was chosen because a
   * newly-registered victim with literally no assigned support is a
   * more consequential gap than `okay`'s routine connotation elsewhere
   * in v0.2's own vocabulary (Workflow F's table). See
   * docs/S14_TASK_TRIGGER_EXTENSION.md.
   */
  async createUnassignedCaseTaskTx(tx: TxClient, kase: { id: string; userId: string }): Promise<void> {
    await tx.task.create({
      data: {
        userId: kase.userId,
        caseId: kase.id,
        type: 'unassigned_case',
        priority: 'bad',
        status: 'OPEN',
      },
    });
  }

  /**
   * S15: called from BreakGlassService's own transaction (v0.2 §15:
   * "Break-glass: out-of-scope access needs a typed reason, expires in 2
   * hours, and notifies the supervisor") whenever a break-glass grant is
   * requested. This task IS the "notifies the supervisor" mechanism —
   * it becomes visible in the district-scoped queue of every
   * `supervisor`/`district_admin` whose scope covers the case's own
   * district, via the exact same `listTasks` visibility every other task
   * type already uses. `priority: 'critical'` is a considered default
   * (not spec-evidenced — §15 names no priority): an out-of-scope access
   * grant is, by definition, an exception to this system's normal
   * authorization boundary, which this codebase treats as the most
   * serious category of event it has a vocabulary for.
   */
  async createBreakGlassReviewTaskTx(tx: TxClient, kase: { id: string; userId: string }): Promise<void> {
    await tx.task.create({
      data: {
        userId: kase.userId,
        caseId: kase.id,
        type: 'break_glass_review',
        priority: 'critical',
        status: 'OPEN',
      },
    });
  }

  async transition(staff: ResolvedStaff, taskId: string, targetState: TaskState): Promise<TaskView> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to tasks');
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: { case: { include: { user: { select: { locationDistrict: true } } } } },
      });
      if (!task || !task.case || !this.canMutateCase(staff, task.case)) {
        throw new ForbiddenException('You do not have access to this task');
      }

      const currentState = task.status as TaskState;
      if (!isValidTaskTransition(currentState, targetState)) {
        throw new ConflictException(
          `Cannot transition from ${currentState} to ${targetState} — not a permitted task transition`,
        );
      }

      const now = new Date();
      const extra: Record<string, unknown> = {};
      if (targetState === 'ACKNOWLEDGED') {
        extra.ackedAt = now;
      } else if (targetState === 'COMPLETED') {
        extra.completedAt = now;
      }

      const claim = await tx.task.updateMany({
        where: { id: taskId, status: currentState },
        data: { status: targetState, updatedAt: now, ...extra },
      });
      if (claim.count === 0) {
        throw new ConflictException('This task was changed by another request — refresh and retry');
      }

      await this.auditService.record(staff.id, 'task.transition', 'task', taskId, tx);

      const updated = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      return this.toView(updated);
    });
  }

  /** Same visibility rule as ConsoleService.getQueue (S7): assignment-
   * scoped for `counsellor`, district-scoped for `supervisor`/
   * `district_admin`. A task with no case (should not occur for either of
   * this slice's two real task types, both of which always have one) is
   * excluded rather than shown to everyone by default — fail closed. */
  async listTasks(staff: ResolvedStaff): Promise<TaskView[]> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to tasks');
    }

    const tasks = ASSIGNMENT_SCOPED_ROLES.includes(staff.role)
      ? await this.listAssignedTasks(staff)
      : await this.listDistrictTasks(staff);

    await this.auditService.record(staff.id, 'task.list.read', 'task');

    return tasks.map((t) => this.toView(t));
  }

  private async listAssignedTasks(staff: ResolvedStaff) {
    if (!staff.counsellorId) return [];
    return this.prisma.task.findMany({
      where: { case: { assignedCounsellorId: staff.counsellorId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async listDistrictTasks(staff: ResolvedStaff) {
    if (staff.districtScope.length === 0) return [];
    return this.prisma.task.findMany({
      where: { case: { user: { locationDistrict: { in: staff.districtScope } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private canMutateCase(
    staff: ResolvedStaff,
    caseRow: { assignedCounsellorId: string | null; user: { locationDistrict: string | null } | null },
  ): boolean {
    if (ASSIGNMENT_SCOPED_ROLES.includes(staff.role)) {
      if (!staff.counsellorId) return false;
      return caseRow.assignedCounsellorId === staff.counsellorId;
    }
    const district = caseRow.user?.locationDistrict;
    if (!district) return false;
    return staff.districtScope.includes(district);
  }

  private toView(task: {
    id: string;
    userId: string | null;
    caseId: string | null;
    referralId: string | null;
    type: string;
    priority: string;
    status: string;
    assigneeStaffId: string | null;
    createdByStaffId: string | null;
    slaDueAt: Date | null;
    ackedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }): TaskView {
    return {
      id: task.id,
      userId: task.userId,
      caseId: task.caseId,
      referralId: task.referralId,
      type: task.type,
      priority: task.priority,
      status: task.status,
      assigneeStaffId: task.assigneeStaffId,
      createdByStaffId: task.createdByStaffId,
      slaDueAt: task.slaDueAt,
      ackedAt: task.ackedAt,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
    };
  }
}
