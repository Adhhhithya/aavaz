import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuditService } from '../staff/staff-audit.service';
import { OVERSIGHT_ROLES } from '../staff/staff-roles';
import { ResolvedStaff } from '../staff/staff.service';
import { suppressibleCount, suppressibleMedian, SuppressibleCount, SuppressibleMedian } from './oversight-suppression';

export interface DistrictMetrics {
  districtCode: string;
  referralsByDestinationAndStatus: Record<string, Record<string, SuppressibleCount>>;
  medianDaysToService: SuppressibleMedian;
  overdueReliefCount: SuppressibleCount;
}

/**
 * Node's oversight domain (v0.2 §14 `GET
 * /v1/oversight/districts/{code}/metrics`, Workflow H "H4"). Replaces
 * nothing that exists on the Node side (this is net-new) — the FastAPI
 * equivalent this domain is meant to eventually retire
 * (`backend/api/dashboards/state_routes.py`) returns 100% hardcoded mock
 * data with no indication it isn't live (S8 audit §D); this endpoint is
 * NOT wired to replace that FastAPI route in this slice (no client
 * migration performed), but it is the first real, evidence-based Node
 * implementation of the same capability.
 *
 * v0.2's H4 names exactly three metrics: "referrals by destination and
 * state, median time to service, overdue relief count." This module reads
 * "state" as "referral lifecycle status" (matching the event catalog's own
 * `referral.state_changed` naming for the same concept), not "Indian
 * state" — the endpoint is already district-scoped, so a geographic-state
 * breakdown within one district's response would not be meaningful. See
 * docs/S10_OVERSIGHT_MIGRATION.md for the full reasoning and the
 * "overdue relief" definition.
 *
 * Computed on-demand from live data, not a nightly batch job — no job
 * queue exists yet (S8 audit §F). This is a deliberate, documented
 * divergence from v0.2's "nightly job" framing: the same aggregation
 * logic, just computed synchronously per request instead of pre-computed
 * and cached, since nothing in this slice's data volume requires batching
 * yet.
 */
@Injectable()
export class OversightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: StaffAuditService,
  ) {}

  async getDistrictMetrics(staff: ResolvedStaff, districtCode: string): Promise<DistrictMetrics> {
    if (!OVERSIGHT_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to oversight metrics');
    }
    // See this file's class-level comment and
    // docs/S10_OVERSIGHT_MIGRATION.md section D for why an EMPTY
    // districtScope means "no restriction" for this oversight-tier role,
    // the opposite of CONSOLE_INDIVIDUAL_RECORD_ROLES' fail-closed
    // convention (S7/S8/S9) — a considered, documented asymmetry, not an
    // inconsistency.
    if (staff.districtScope.length > 0 && !staff.districtScope.includes(districtCode)) {
      throw new ForbiddenException('This staff member is not scoped to this district');
    }

    const referrals = await this.prisma.referral.findMany({
      where: { user: { locationDistrict: districtCode } },
      select: {
        destinationType: true,
        status: true,
        sentAt: true,
        inServiceAt: true,
        serviceDueAt: true,
      },
    });

    const metrics: DistrictMetrics = {
      districtCode,
      referralsByDestinationAndStatus: this.buildDestinationStatusGrid(referrals),
      medianDaysToService: this.buildMedianDaysToService(referrals),
      overdueReliefCount: this.buildOverdueReliefCount(referrals),
    };

    // Audit hook: IDs/codes only — no resourceId is passed, matching
    // ConsoleService.getQueue's own precedent for an aggregate (not
    // single-row) read; a district code is not a UUID and the
    // staff_audit_log.resource_id column is UUID-typed, so it is not
    // forced into that column either.
    await this.auditService.record(staff.id, 'oversight.metrics.read', 'district');

    return metrics;
  }

  private buildDestinationStatusGrid(
    referrals: Array<{ destinationType: string; status: string }>,
  ): Record<string, Record<string, SuppressibleCount>> {
    const raw: Record<string, Record<string, number>> = {};
    for (const r of referrals) {
      raw[r.destinationType] ??= {};
      raw[r.destinationType][r.status] = (raw[r.destinationType][r.status] ?? 0) + 1;
    }
    const suppressed: Record<string, Record<string, SuppressibleCount>> = {};
    for (const [destinationType, byStatus] of Object.entries(raw)) {
      suppressed[destinationType] = {};
      for (const [status, count] of Object.entries(byStatus)) {
        suppressed[destinationType][status] = suppressibleCount(count);
      }
    }
    return suppressed;
  }

  /** Median days from `sentAt` to `inServiceAt`, over referrals where both
   * are set — referrals that never reached IN_SERVICE are correctly
   * excluded (there is no "time to service" for a referral that never
   * started service), not counted as zero or omitted silently. */
  private buildMedianDaysToService(
    referrals: Array<{ sentAt: Date | null; inServiceAt: Date | null }>,
  ): SuppressibleMedian {
    const days = referrals
      .filter((r): r is { sentAt: Date; inServiceAt: Date } => r.sentAt !== null && r.inServiceAt !== null)
      .map((r) => (r.inServiceAt.getTime() - r.sentAt.getTime()) / (1000 * 60 * 60 * 24));
    return suppressibleMedian(days);
  }

  /** "Overdue relief": welfare-destination referrals whose service-start
   * SLA (`serviceDueAt`) has passed and whose status is not one of the
   * terminal/successful outcomes (VERIFIED, DELIVERED — service actually
   * started; DISCARDED, CLOSED_UNRESOLVED — already resolved, however
   * unsuccessfully). A referral in any other state past its due date is
   * genuinely still pending and overdue. See
   * docs/S10_OVERSIGHT_MIGRATION.md section C for this definition's full
   * reasoning. */
  private buildOverdueReliefCount(
    referrals: Array<{ destinationType: string; status: string; serviceDueAt: Date | null }>,
  ): SuppressibleCount {
    const now = new Date();
    const resolvedStates = new Set(['VERIFIED', 'DELIVERED', 'DISCARDED', 'CLOSED_UNRESOLVED']);
    const overdue = referrals.filter(
      (r) =>
        r.destinationType === 'welfare' &&
        r.serviceDueAt !== null &&
        r.serviceDueAt.getTime() < now.getTime() &&
        !resolvedStates.has(r.status),
    );
    return suppressibleCount(overdue.length);
  }
}
