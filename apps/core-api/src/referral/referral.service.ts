import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAuditService } from '../staff/staff-audit.service';
import { ASSIGNMENT_SCOPED_ROLES, CONSOLE_INDIVIDUAL_RECORD_ROLES } from '../staff/staff-roles';
import { ResolvedStaff } from '../staff/staff.service';
import { TaskService } from '../task/task.service';
import { generateAckToken, hashAckToken } from './referral-ack';
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
  inServiceAt: Date | null;
  deliveredAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
  /** S16: the RAW (not hashed) one-time acknowledgement token — populated
   * ONLY in the direct response to the transition call that just
   * generated it (targetState === 'SENT'). Never persisted in plaintext
   * anywhere, never present on any other response from this service
   * (`get()`, a later `transition()` call, or any subsequent `SENT`
   * response after a fresh token has already replaced it in memory —
   * each call returns only the token IT just generated). Staff relay this
   * to the destination via whatever channel is being used outside this
   * system (email/SMS/phone) — this repository has no delivery adapter,
   * per docs/S9_REFERRAL_MIGRATION.md's own "Out of scope" list. */
  rawAckToken?: string;
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
    private readonly taskService: TaskService,
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
      let rawAckToken: string | undefined;
      if (targetState === 'SENT') {
        nextAttemptCount = referral.attemptCount + 1;
        extra.sentAt = now;
        extra.ackDueAt = addWorkingDays(now, ACKNOWLEDGEMENT_SLA_WORKING_DAYS);
        extra.attemptCount = nextAttemptCount;
        extra.idempotencyKey = `${referral.id}:${nextAttemptCount}`;
        // S16: a fresh token every time a referral (re-)enters SENT —
        // naturally invalidates any earlier, still-circulating link (a
        // prior bounce-then-retry's token can no longer match once this
        // one overwrites ack_token_hash).
        const generated = generateAckToken();
        extra.ackTokenHash = generated.tokenHash;
        rawAckToken = generated.rawToken;
      } else if (targetState === 'ACKNOWLEDGED') {
        extra.ackedAt = now;
        extra.serviceDueAt = addWorkingDays(referral.sentAt ?? now, SERVICE_START_SLA_WORKING_DAYS);
      } else if (targetState === 'IN_SERVICE') {
        // Added for S10 (oversight): v0.2 Workflow H "H4"'s "median time to
        // service" aggregate needs to know WHEN service actually started,
        // not just that it eventually did — sentAt alone can't answer
        // that. Not present in S9's original migration; added here as a
        // small, additive follow-up rather than silently approximating the
        // metric from a timestamp that doesn't represent the real event.
        extra.inServiceAt = now;
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

      // S12: v0.2 Workflow H "H3" — a stalled referral gets a case-manager
      // follow-up task, escalating to a supervisor after 5 working days.
      // Created in the SAME transaction as this transition (atomic — a
      // referral never reaches STALLED without its follow-up task also
      // existing). See TaskService.createStalledReferralTaskTx's own
      // comment for why this is not separately staff-attributed in the
      // audit log.
      if (targetState === 'STALLED') {
        await this.taskService.createStalledReferralTaskTx(tx, {
          id: referral.id,
          caseId: referral.caseId,
          userId: referral.userId,
        });
      }

      const updated = await tx.referral.findUniqueOrThrow({ where: { id: referralId } });
      const view = this.toView(updated);
      if (rawAckToken) {
        view.rawAckToken = rawAckToken;
      }
      return view;
    });
  }

  /**
   * S16: `POST /v1/ack/{token}` (v0.2 §14) — the receiver-facing, PUBLIC
   * (no staff auth) counterpart to a case manager manually acknowledging
   * a referral after a call. Deliberately returns the SAME generic error
   * for every failure mode (token not found, referral not in SENT,
   * concurrent double-use) — never distinguishing "wrong token" from
   * "already used" from "expired," the same "consistent denial" pattern
   * every staff-facing domain in this codebase already uses (S7-S15), so
   * a caller probing this endpoint learns nothing about which failure
   * occurred. No `ResolvedStaff` is involved and no `StaffAuditService`
   * call is made — there is no staff actor to attribute this action to
   * (the same system-actor reasoning `TaskService`'s own `...Tx` methods
   * already document).
   */
  async acknowledgeViaToken(rawToken: string): Promise<{ referenceNumber: string }> {
    const tokenHash = hashAckToken(rawToken);

    return this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findFirst({ where: { ackTokenHash: tokenHash, status: 'SENT' } });
      if (!referral) {
        throw new NotFoundException('This acknowledgement link is invalid or has already been used.');
      }

      const now = new Date();
      const claim = await tx.referral.updateMany({
        where: { id: referral.id, status: 'SENT', ackTokenHash: tokenHash },
        data: {
          status: 'ACKNOWLEDGED',
          ackedAt: now,
          serviceDueAt: addWorkingDays(referral.sentAt ?? now, SERVICE_START_SLA_WORKING_DAYS),
          updatedAt: now,
        },
      });
      if (claim.count === 0) {
        // Lost a race (a staff member or a concurrent use of this same
        // link claimed it first) — same generic error, never a different
        // one for this case.
        throw new NotFoundException('This acknowledgement link is invalid or has already been used.');
      }

      return { referenceNumber: referral.id };
    });
  }

  /**
   * S16: read-only counterpart for the receiver's landing page — "shows
   * nothing but an Acknowledge button and reference number" (Workflow H).
   * Returns ONLY the reference number, structurally incapable of leaking
   * any victim content (the return type has no other field) — matching
   * this codebase's data-minimization discipline for every other
   * externally-facing artifact (see docs/S9_REFERRAL_MIGRATION.md's
   * packet-builder design).
   */
  async getAckInfo(rawToken: string): Promise<{ referenceNumber: string }> {
    const tokenHash = hashAckToken(rawToken);
    const referral = await this.prisma.referral.findFirst({ where: { ackTokenHash: tokenHash, status: 'SENT' } });
    if (!referral) {
      throw new NotFoundException('This acknowledgement link is invalid or has already been used.');
    }
    return { referenceNumber: referral.id };
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
    inServiceAt: Date | null;
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
      inServiceAt: referral.inServiceAt,
      deliveredAt: referral.deliveredAt,
      verifiedAt: referral.verifiedAt,
      createdAt: referral.createdAt,
    };
  }
}
