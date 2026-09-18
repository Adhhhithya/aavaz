import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuditService } from '../staff/staff-audit.service';
import { ASSIGNMENT_SCOPED_ROLES, CONSOLE_INDIVIDUAL_RECORD_ROLES } from '../staff/staff-roles';
import { ResolvedStaff } from '../staff/staff.service';

export interface QueueCaseView {
  caseId: string;
  userId: string | null;
  userName: string | null;
  district: string | null;
  caseType: string;
  caseStage: string | null;
  distressScore: number | null;
  assignedCounsellorId: string | null;
}

export interface VictimView {
  userId: string;
  name: string;
  phoneNumber: string;
  district: string | null;
  preferredLanguage: string;
  cases: Array<{
    caseId: string;
    caseType: string;
    caseStage: string | null;
    distressScore: number | null;
    assignedCounsellorId: string | null;
  }>;
}

/**
 * All authorization for this slice's console endpoints lives here, at the
 * APPLICATION layer — Decision 2. No Postgres RLS/`app.district_scope` is
 * involved; every check below is a plain, explicit query filter or
 * post-fetch comparison, run in Node, against the freshly-resolved
 * `ResolvedStaff` the guard attaches to the request (never a client-
 * supplied value). See docs/S7_STAFF_CONSOLE_MIGRATION.md for the full
 * authorization matrix this implements.
 */
@Injectable()
export class ConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: StaffAuditService,
  ) {}

  private assertConsoleRole(staff: ResolvedStaff): void {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to individual-record console endpoints');
    }
  }

  async getQueue(staff: ResolvedStaff): Promise<QueueCaseView[]> {
    this.assertConsoleRole(staff);

    const cases = ASSIGNMENT_SCOPED_ROLES.includes(staff.role)
      ? await this.getAssignedQueue(staff)
      : await this.getDistrictQueue(staff);

    await this.auditService.record(staff.id, 'console.queue.read', 'queue');

    return cases.map((c) => ({
      caseId: c.id,
      userId: c.userId,
      userName: c.user?.name ?? null,
      district: c.user?.locationDistrict ?? null,
      caseType: c.caseType,
      caseStage: c.caseStage,
      distressScore: c.currentDistressScore,
      assignedCounsellorId: c.assignedCounsellorId,
    }));
  }

  async getVictim(staff: ResolvedStaff, victimUserId: string): Promise<VictimView> {
    this.assertConsoleRole(staff);

    const user = await this.prisma.user.findUnique({
      where: { id: victimUserId },
      include: { cases: true },
    });

    // Consistent authorization response whether the victim doesn't exist
    // at all, exists but is outside this staff member's scope, or exists
    // and is unassigned to this counsellor — never distinguish "doesn't
    // exist" from "exists but denied" (that distinction itself would leak
    // information to an unauthorized caller).
    if (!user || !this.canAccessVictim(staff, user)) {
      throw new ForbiddenException('You do not have access to this victim');
    }

    await this.auditService.record(staff.id, 'console.victim.read', 'victim', user.id);

    return {
      userId: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      district: user.locationDistrict,
      preferredLanguage: user.preferredLanguage,
      cases: user.cases.map((c) => ({
        caseId: c.id,
        caseType: c.caseType,
        caseStage: c.caseStage,
        distressScore: c.currentDistressScore,
        assignedCounsellorId: c.assignedCounsellorId,
      })),
    };
  }

  /** `counsellor` role: cases assigned to THIS staff member's linked
   * counsellor identity — the Decision-1 bridge, never a direct
   * users.id/counsellors.id comparison. A counsellor-role staff member
   * with no linked counsellor identity is denied everything (fail
   * closed), not silently shown an empty queue that could be mistaken for
   * "genuinely zero cases." */
  private async getAssignedQueue(staff: ResolvedStaff) {
    if (!staff.counsellorId) {
      throw new ForbiddenException('Staff identity is not linked to an assignment record');
    }
    return this.prisma.case.findMany({
      where: { assignedCounsellorId: staff.counsellorId },
      orderBy: { currentDistressScore: 'desc' },
      include: { user: { select: { name: true, locationDistrict: true } } },
    });
  }

  /** `supervisor`/`district_admin` roles: every case whose victim's
   * district falls within this staff member's district_scope. An empty
   * district_scope authorizes nothing (fail closed) rather than being
   * treated as "no restriction." */
  private async getDistrictQueue(staff: ResolvedStaff) {
    if (staff.districtScope.length === 0) {
      return [];
    }
    return this.prisma.case.findMany({
      where: { user: { locationDistrict: { in: staff.districtScope } } },
      orderBy: { currentDistressScore: 'desc' },
      include: { user: { select: { name: true, locationDistrict: true } } },
    });
  }

  private canAccessVictim(
    staff: ResolvedStaff,
    user: { locationDistrict: string | null; cases: Array<{ assignedCounsellorId: string | null }> },
  ): boolean {
    if (ASSIGNMENT_SCOPED_ROLES.includes(staff.role)) {
      if (!staff.counsellorId) return false;
      return user.cases.some((c) => c.assignedCounsellorId === staff.counsellorId);
    }
    if (!user.locationDistrict) return false;
    return staff.districtScope.includes(user.locationDistrict);
  }
}
