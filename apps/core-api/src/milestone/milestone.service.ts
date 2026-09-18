import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { StaffAuditService } from '../staff/staff-audit.service';
import { ASSIGNMENT_SCOPED_ROLES, CONSOLE_INDIVIDUAL_RECORD_ROLES } from '../staff/staff-roles';
import { ResolvedStaff } from '../staff/staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { MilestoneType } from './milestone-types';

export interface MilestoneView {
  id: string;
  caseId: string;
  type: string;
  dueAt: Date | null;
  metAt: Date | null;
  enteredByStaffId: string;
  createdAt: Date;
}

/**
 * Node's milestone domain (v0.2 §12's `milestones` table; Workflow B
 * "B5"'s case-manager data-entry half only — see
 * docs/S13_MILESTONE_MIGRATION.md for why automated timer computation
 * ("configurable milestone timers from a legal-reviewed template") is
 * explicitly NOT implemented here: it needs a legal-reviewed template
 * this repository has no sign-off for, and timer-expiry handling needs
 * job-queue infrastructure that still doesn't exist (S8 audit §F/I,
 * unchanged since S8).
 *
 * Authorization and concurrency both reuse S7-S12's exact patterns.
 */
@Injectable()
export class MilestoneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: StaffAuditService,
  ) {}

  async create(staff: ResolvedStaff, caseId: string, type: MilestoneType, dueAt?: string): Promise<MilestoneView> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to milestones');
    }

    return this.prisma.$transaction(async (tx) => {
      const caseRow = await tx.case.findUnique({
        where: { id: caseId },
        include: { user: { select: { locationDistrict: true } } },
      });
      if (!caseRow || !this.canMutateCase(staff, caseRow)) {
        throw new ForbiddenException('You do not have access to this case');
      }

      const milestone = await tx.milestone.create({
        data: {
          caseId,
          type,
          dueAt: dueAt ? new Date(dueAt) : null,
          enteredByStaffId: staff.id,
        },
      });

      await this.auditService.record(staff.id, 'milestone.created', 'milestone', milestone.id, tx);

      return this.toView(milestone);
    });
  }

  async markMet(staff: ResolvedStaff, milestoneId: string, metAt?: string): Promise<MilestoneView> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to milestones');
    }

    return this.prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.findUnique({
        where: { id: milestoneId },
        include: { case: { include: { user: { select: { locationDistrict: true } } } } },
      });
      if (!milestone || !this.canMutateCase(staff, milestone.case)) {
        throw new ForbiddenException('You do not have access to this milestone');
      }
      if (milestone.metAt !== null) {
        throw new ConflictException('This milestone is already marked met');
      }

      const resolvedMetAt = metAt ? new Date(metAt) : new Date();

      // Concurrency-safe: only succeeds if metAt is still NULL at claim
      // time — the same conditional-UPDATE pattern S5/S8/S9/S12 already
      // use, applied to "unmet -> met" as this domain's own two-state
      // transition.
      const claim = await tx.milestone.updateMany({
        where: { id: milestoneId, metAt: null },
        data: { metAt: resolvedMetAt, updatedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new ConflictException('This milestone was already marked met by another request');
      }

      await this.auditService.record(staff.id, 'milestone.marked_met', 'milestone', milestoneId, tx);

      const updated = await tx.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
      return this.toView(updated);
    });
  }

  /** Same visibility rule as every other console endpoint (S7-S12):
   * assignment-scoped for `counsellor`, district-scoped for
   * `supervisor`/`district_admin`. */
  async listForCase(staff: ResolvedStaff, caseId: string): Promise<MilestoneView[]> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to milestones');
    }

    const caseRow = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: { user: { select: { locationDistrict: true } } },
    });
    if (!caseRow || !this.canMutateCase(staff, caseRow)) {
      throw new ForbiddenException('You do not have access to this case');
    }

    const milestones = await this.prisma.milestone.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });

    await this.auditService.record(staff.id, 'milestone.list.read', 'case', caseId);

    return milestones.map((m) => this.toView(m));
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

  private toView(milestone: {
    id: string;
    caseId: string;
    type: string;
    dueAt: Date | null;
    metAt: Date | null;
    enteredByStaffId: string;
    createdAt: Date;
  }): MilestoneView {
    return {
      id: milestone.id,
      caseId: milestone.caseId,
      type: milestone.type,
      dueAt: milestone.dueAt,
      metAt: milestone.metAt,
      enteredByStaffId: milestone.enteredByStaffId,
      createdAt: milestone.createdAt,
    };
  }
}
