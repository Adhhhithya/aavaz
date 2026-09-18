import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuditService } from '../staff/staff-audit.service';
import { ASSIGNMENT_SCOPED_ROLES, CONSOLE_INDIVIDUAL_RECORD_ROLES } from '../staff/staff-roles';
import { ResolvedStaff } from '../staff/staff.service';
import { CONSENT_SCOPE_BY_DESTINATION, DestinationType, StaffPacketInput } from './referral-destinations';
import { buildReferralPacket } from './referral-packets';
import { ACKNOWLEDGEMENT_SLA_WORKING_DAYS, addWorkingDays, SERVICE_START_SLA_WORKING_DAYS } from './referral-sla';
import { CONSENT_GATED_TARGET, isValidReferralTransition, ReferralState } from './referral-states';

export interface ReferralView {
  id: string;
  caseId: string;
  userId: string;
  destinationType: string;
  status: string;
  packetData: unknown;
  attemptCount: number;
  idempotencyKey: string | null;
  sentAt: Date | null;
  ackDueAt: Date | null;
  ackedAt: Date | null;
  serviceDueAt: Date | null;
  deliveredAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

type TxClient = Prisma.TransactionClient;

/**
 * Node's referral domain (v0.2 Workflow G) — a real, evidence-based
 * candidate identified by docs/S8_DEPENDENCY_AUDIT.md section L candidate
 * D (prerequisites already real: consent [S6], case data [S5], and now
 * lifecycle [S8]). See docs/S9_REFERRAL_MIGRATION.md for the full design
 * record, including the transition-matrix reconstruction and the
 * data-minimization enforcement.
 *
 * Authorization reuses S7/S8's exact pattern — role gate via
 * CONSOLE_INDIVIDUAL_RECORD_ROLES, then either assignment ownership
 * (`counsellor`) or district-scope membership (`supervisor`/
 * `district_admin`). No Postgres RLS is involved.
 *
 * No delivery adapter, no Puppeteer PDF renderer, and no automated SLA
 * timer/worker exist in this slice — `STALLED` is reached only via an
 * explicit staff-initiated transition (matching S8's "no automated
 * enforcement" precedent for its own opt-out flag). A future `workers`
 * slice would call `transition(..., 'STALLED')` the same way a human
 * caller does today.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: StaffAuditService,
  ) {}

  async draft(staff: ResolvedStaff, caseId: string, destinationType: DestinationType, fields: Record<string, unknown>): Promise<ReferralView> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to referrals');
    }

    return this.prisma.$transaction(async (tx) => {
      const caseRow = await tx.case.findUnique({
        where: { id: caseId },
        include: { user: { select: { locationDistrict: true } } },
      });

      if (!caseRow || !this.canMutateCase(staff, caseRow)) {
        throw new ForbiddenException('You do not have access to this case');
      }
      if (!caseRow.userId) {
        throw new BadRequestException('This case has no linked victim to refer');
      }

      const user = await tx.user.findUnique({ where: { id: caseRow.userId } });
      if (!user) {
        throw new BadRequestException('This case has no linked victim to refer');
      }

      const staffInput = this.toStaffPacketInput(destinationType, fields);
      const packet = buildReferralPacket(
        {
          userName: user.name,
          preferredLanguage: user.preferredLanguage,
          phoneNumber: user.phoneNumber,
          safeWindows: (await tx.victimProfile.findUnique({ where: { userId: user.id } }))?.safeWindows ?? null,
          caseType: caseRow.caseType,
          caseId: caseRow.id,
        },
        staffInput,
      );

      const referral = await tx.referral.create({
        data: {
          caseId: caseRow.id,
          userId: user.id,
          destinationType,
          status: 'DRAFTED',
          packetData: packet as unknown as Prisma.InputJsonValue,
          createdByStaffId: staff.id,
        },
      });

      await this.auditService.record(staff.id, 'referral.drafted', 'referral', referral.id, tx);

      return this.toView(referral);
    });
  }

  async transition(staff: ResolvedStaff, referralId: string, targetState: ReferralState): Promise<ReferralView> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to referrals');
    }

    return this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({
        where: { id: referralId },
        include: { case: { include: { user: { select: { locationDistrict: true } } } } },
      });

      if (!referral || !referral.case || !this.canMutateCase(staff, referral.case)) {
        throw new ForbiddenException('You do not have access to this referral');
      }

      const currentState = referral.status as ReferralState;
      if (!isValidReferralTransition(currentState, targetState)) {
        throw new ConflictException(
          `Cannot transition from ${currentState} to ${targetState} — not a permitted referral transition`,
        );
      }

      if (targetState === CONSENT_GATED_TARGET) {
        const scope = CONSENT_SCOPE_BY_DESTINATION[referral.destinationType as DestinationType];
        const granted = await this.isConsentCurrentlyGranted(tx, referral.userId, scope);
        if (!granted) {
          throw new ConflictException(
            `Cannot send this referral — the matching consent scope ("${scope}") is not currently granted. Transition to AWAITING_CONSENT instead.`,
          );
        }
      }

      const now = new Date();
      const extra: Record<string, unknown> = {};
      let nextAttemptCount = referral.attemptCount;
      if (targetState === 'SENT') {
        nextAttemptCount = referral.attemptCount + 1;
        extra.sentAt = now;
        extra.ackDueAt = addWorkingDays(now, ACKNOWLEDGEMENT_SLA_WORKING_DAYS);
        extra.attemptCount = nextAttemptCount;
        extra.idempotencyKey = `${referral.id}:${nextAttemptCount}`;
      } else if (targetState === 'ACKNOWLEDGED') {
        extra.ackedAt = now;
        extra.serviceDueAt = addWorkingDays(referral.sentAt ?? now, SERVICE_START_SLA_WORKING_DAYS);
      } else if (targetState === 'DELIVERED') {
        extra.deliveredAt = now;
      } else if (targetState === 'VERIFIED') {
        extra.verifiedAt = now;
      }

      // Concurrency-safe transition — same conditional-updateMany pattern
      // as LifecycleService.transition (S8): the WHERE guard re-checks
      // `status` against the value this request itself just read.
      const claim = await tx.referral.updateMany({
        where: { id: referralId, status: currentState },
        data: { status: targetState, updatedAt: now, ...extra },
      });

      if (claim.count === 0) {
        throw new ConflictException('This referral was changed by another request — refresh and retry');
      }

      await this.auditService.record(staff.id, 'referral.transition', 'referral', referralId, tx);

      const updated = await tx.referral.findUniqueOrThrow({ where: { id: referralId } });
      return this.toView(updated);
    });
  }

  async get(staff: ResolvedStaff, referralId: string): Promise<ReferralView> {
    if (!CONSOLE_INDIVIDUAL_RECORD_ROLES.includes(staff.role)) {
      throw new ForbiddenException('This staff role does not have access to referrals');
    }
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: { case: { include: { user: { select: { locationDistrict: true } } } } },
    });
    if (!referral || !referral.case || !this.canMutateCase(staff, referral.case)) {
      throw new ForbiddenException('You do not have access to this referral');
    }
    await this.auditService.record(staff.id, 'referral.read', 'referral', referralId);
    return this.toView(referral);
  }

  private toStaffPacketInput(destinationType: DestinationType, fields: Record<string, unknown>): StaffPacketInput {
    switch (destinationType) {
      case 'mental_health':
        return { destinationType, fields: { needSummary: fields.needSummary as string } };
      case 'legal_aid':
        return { destinationType, fields: { legalIssueSummary: fields.legalIssueSummary as string } };
      case 'welfare':
        return {
          destinationType,
          fields: {
            reliefStagePending: fields.reliefStagePending as string,
            earlierApplicationDates: Array.isArray(fields.earlierApplicationDates)
              ? (fields.earlierApplicationDates as string[])
              : undefined,
          },
        };
      case 'protection':
        return { destinationType, fields: { threatLog: fields.threatLog as string } };
    }
  }

  private async isConsentCurrentlyGranted(tx: TxClient, userId: string, scope: string): Promise<boolean> {
    const latest = await tx.consent.findFirst({
      where: { userId, scope },
      orderBy: { capturedAt: 'desc' },
    });
    return latest?.granted === true;
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

  private toView(referral: {
    id: string;
    caseId: string;
    userId: string;
    destinationType: string;
    status: string;
    packetData: unknown;
    attemptCount: number;
    idempotencyKey: string | null;
    sentAt: Date | null;
    ackDueAt: Date | null;
    ackedAt: Date | null;
    serviceDueAt: Date | null;
    deliveredAt: Date | null;
    verifiedAt: Date | null;
    createdAt: Date;
  }): ReferralView {
    return {
      id: referral.id,
      caseId: referral.caseId,
      userId: referral.userId,
      destinationType: referral.destinationType,
      status: referral.status,
      packetData: referral.packetData,
      attemptCount: referral.attemptCount,
      idempotencyKey: referral.idempotencyKey,
      sentAt: referral.sentAt,
      ackDueAt: referral.ackDueAt,
      ackedAt: referral.ackedAt,
      serviceDueAt: referral.serviceDueAt,
      deliveredAt: referral.deliveredAt,
      verifiedAt: referral.verifiedAt,
      createdAt: referral.createdAt,
    };
  }
}
