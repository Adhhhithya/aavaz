import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuditService } from '../staff/staff-audit.service';
import { CONSOLE_INDIVIDUAL_RECORD_ROLES } from '../staff/staff-roles';
import { ResolvedStaff } from '../staff/staff.service';
import { TaskService } from '../task/task.service';

/** v0.2 §15 states the duration plainly: "expires in 2 hours." */
export const BREAK_GLASS_DURATION_HOURS = 2;

export interface BreakGlassGrantView {
  id: string;
  staffId: string;
  caseId: string;
  reason: string;
  grantedAt: Date;
  expiresAt: Date;
}

/**
 * Node's break-glass domain (v0.2 §15) — the REQUEST/RECORD/NOTIFY
 * foundation only. See docs/S15_BREAK_GLASS_MIGRATION.md for the full
 * design record and, critically, for what this slice deliberately does
 * NOT do: no existing domain's authorization check (console, lifecycle,
 * referral, task, milestone) is modified here to actually HONOR a grant
 * and bypass its own district/assignment scoping — `isActive()` exists
 * as a real, tested building block for that later, separate wiring.
 *
 * Unlike every other domain in this codebase, `request()` performs NO
 * case-scope check at all — that is the entire point of break-glass
 * (v0.2 §15's role table: "Case manager: ... Cannot see: Victims outside
 * scope WITHOUT break-glass"). Every OTHER individual-record-tier role
 * gate still applies (oversight-tier roles are still excluded — v0.2
 * never describes break-glass as extending to that tier, which is
 * aggregate-only by design regardless).
 */
@Injectable()
export class BreakGlassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: StaffAuditService,
    private readonly taskService: TaskService,
  ) {}

  async request(staff: ResolvedStaff, caseId: string, reason: string): Promise<BreakGlassGrantView> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to break-glass requests');
    }

    return this.prisma.$transaction(async (tx) => {
      // Deliberately NOT gated by canMutateCase — break-glass exists
      // precisely for access this staff member would otherwise be
      // denied. Existence is still checked (a grant for a case that
      // does not exist is meaningless), and since break-glass never
      // discriminates by scope, returning a real 404 here leaks nothing
      // a scoped check wouldn't already reveal to this same caller.
      const caseRow = await tx.case.findUnique({ where: { id: caseId } });
      if (!caseRow) {
        throw new NotFoundException('Case not found');
      }
      if (!caseRow.userId) {
        throw new NotFoundException('This case has no linked victim');
      }

      const grantedAt = new Date();
      const expiresAt = new Date(grantedAt.getTime() + BREAK_GLASS_DURATION_HOURS * 60 * 60 * 1000);

      const grant = await tx.breakGlassGrant.create({
        data: { staffId: staff.id, caseId, reason, grantedAt, expiresAt },
      });

      // "notifies the supervisor" — see TaskService.createBreakGlassReviewTaskTx's
      // own comment for why this task IS the notification mechanism.
      await this.taskService.createBreakGlassReviewTaskTx(tx, { id: caseId, userId: caseRow.userId });

      // Audit hook: IDs/codes only — the real reason text lives on
      // break_glass_grants, never in staff_audit_log (see the migration
      // file's header for why).
      await this.auditService.record(staff.id, 'break_glass.requested', 'case', caseId, tx);

      return this.toView(grant);
    });
  }

  /**
   * A real, tested building block — NOT consumed by any other domain's
   * authorization check in this slice. See this class's own header
   * comment.
   */
  async isActive(staffId: string, caseId: string): Promise<boolean> {
    const grant = await this.prisma.breakGlassGrant.findFirst({
      where: { staffId, caseId, expiresAt: { gt: new Date() } },
      orderBy: { grantedAt: 'desc' },
    });
    return grant !== null;
  }

  private toView(grant: {
    id: string;
    staffId: string;
    caseId: string;
    reason: string;
    grantedAt: Date;
    expiresAt: Date;
  }): BreakGlassGrantView {
    return {
      id: grant.id,
      staffId: grant.staffId,
      caseId: grant.caseId,
      reason: grant.reason,
      grantedAt: grant.grantedAt,
      expiresAt: grant.expiresAt,
    };
  }
}
