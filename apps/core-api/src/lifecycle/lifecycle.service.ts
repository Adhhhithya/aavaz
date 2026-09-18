import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuditService } from '../staff/staff-audit.service';
import { ASSIGNMENT_SCOPED_ROLES, CONSOLE_INDIVIDUAL_RECORD_ROLES } from '../staff/staff-roles';
import { ResolvedStaff } from '../staff/staff.service';
import { isValidTransition, LifecycleState } from './lifecycle-states';

export interface LifecycleTransitionResult {
  caseId: string;
  previousState: LifecycleState;
  newState: LifecycleState;
  updatedAt: Date;
}

/**
 * Node's authoritative owner of lifecycle transitions made THROUGH THIS
 * SERVICE. This is deliberately not phrased as "Node is the sole
 * authority over case lifecycle" — the existing FastAPI endpoint
 * (`backend/api/cases/lifecycle_routes.py::update_case_stage`) remains
 * live, unmodified, and still capable of writing to a DIFFERENT column
 * (`case_stage`, not `lifecycleState`) with no validation at all. See
 * docs/S8_LIFECYCLE_MIGRATION.md section I/J for the full, explicit
 * coexistence-gap accounting. This service only ever reads/writes
 * `Case.lifecycleState` — it never touches `case_stage`.
 *
 * Authorization reuses S7's exact pattern (ConsoleService): role gate via
 * CONSOLE_INDIVIDUAL_RECORD_ROLES, then either assignment ownership
 * (`counsellor`, via the Decision-1 `staff.counsellorId` bridge — never a
 * direct `users.id`/`counsellors.id` comparison) or district-scope
 * membership (`supervisor`/`district_admin`). No Postgres RLS is
 * involved — see backend/migrations/0006_lifecycle.sql's RLS note.
 */
@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: StaffAuditService,
  ) {}

  async transition(staff: ResolvedStaff, caseId: string, targetState: LifecycleState): Promise<LifecycleTransitionResult> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to lifecycle transitions');
    }

    return this.prisma.$transaction(async (tx) => {
      const caseRow = await tx.case.findUnique({
        where: { id: caseId },
        include: { user: { select: { locationDistrict: true } } },
      });

      // Consistent authorization response whether the case doesn't exist
      // at all or exists but is outside this staff member's scope — the
      // same "never distinguish doesn't-exist from denied" rule S7's
      // ConsoleService already established.
      if (!caseRow || !this.canMutateCase(staff, caseRow)) {
        throw new ForbiddenException('You do not have access to this case');
      }

      const currentState = caseRow.lifecycleState as LifecycleState;

      if (!isValidTransition(currentState, targetState)) {
        throw new ConflictException(
          `Cannot transition from ${currentState} to ${targetState} — not a permitted lifecycle transition`,
        );
      }

      // Concurrency-safe transition: the WHERE guard re-checks
      // lifecycleState against the row's latest COMMITTED value at lock
      // time, using the value THIS request itself just read (never a
      // client-supplied "current state" — the DTO has no such field).
      // Two concurrent requests that both read the same stale
      // `currentState` can never both succeed: only the first UPDATE to
      // reach Postgres wins the row lock and matches the WHERE clause;
      // the second's guard no longer matches (the row has already moved
      // on) and it affects zero rows, which this service treats as a
      // real conflict to report, not silently ignore.
      const claim = await tx.case.updateMany({
        where: { id: caseId, lifecycleState: currentState },
        data: { lifecycleState: targetState, lifecycleUpdatedAt: new Date() },
      });

      if (claim.count === 0) {
        throw new ConflictException(
          'This case\'s lifecycle state was changed by another request — refresh and retry',
        );
      }

      // Victim-level opt-out foundation (S8 scope item 7): reaching
      // OPTED_OUT on a case also stamps the underlying victim's
      // optedOutAt marker, in the SAME transaction as the case
      // transition — matching v0.2's own victim-level placement of this
      // concept (see backend/migrations/0006_lifecycle.sql). No
      // scheduling-cancellation or purge behavior is triggered here.
      if (targetState === 'OPTED_OUT' && caseRow.userId) {
        await tx.victimProfile.upsert({
          where: { userId: caseRow.userId },
          create: { userId: caseRow.userId, optedOutAt: new Date() },
          update: { optedOutAt: new Date() },
        });
      }

      // Audit hook: IDs/codes only — staffId, a closed action code, the
      // case id. No free text, no previous/new state value is logged
      // (state names are not victim content, but this service still
      // keeps the audit call identical in shape to S7's own calls,
      // recording only which resource was mutated, not what changed).
      // Passed `tx` explicitly (not the default) so the audit row commits
      // or rolls back atomically with the transition itself, rather than
      // on a separate connection outside this transaction's boundary.
      await this.auditService.record(staff.id, 'lifecycle.case.transition', 'case', caseId, tx);

      return {
        caseId,
        previousState: currentState,
        newState: targetState,
        updatedAt: new Date(),
      };
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
}
