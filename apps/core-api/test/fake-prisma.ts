/**
 * Minimal in-memory fake of the subset of PrismaClient's `otpCode`/`user`
 * delegate methods the identity module actually uses. Exists so
 * OtpService/IdentityService logic can be exercised for real (actual hashing,
 * expiry, attempt-counting, rate-limit comparisons) without a live database —
 * the direct TypeScript equivalent of backend/tests/fake_supabase.py.
 *
 * This does not attempt to be a general-purpose Prisma mock — only the exact
 * method shapes (`create`, `findFirst`, `findUnique`, `update`, `count`) with
 * the exact filter fields the identity module passes are implemented.
 */

import { AUDIT_CHAIN_GENESIS_HASH } from '../src/staff/audit-chain';

interface OtpCodeRow {
  id: string;
  phoneHash: string;
  codeHash: string;
  salt: string;
  purpose: string;
  ipHash: string | null;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  phoneNumber: string;
  name: string;
  roleType: string;
  preferredLanguage: string;
  consentGiven: boolean | null;
  consentTimestamp: Date | null;
  locationDistrict: string | null;
  locationState: string | null;
  locationSource: string | null;
  locationLat: number | null;
  locationLng: number | null;
  createdAt: Date;
}

interface CounsellorRow {
  id: string;
  name: string;
  district: string;
  languages: string[];
  currentCaseload: number | null;
  caseloadCap: number;
}

interface CaseRow {
  id: string;
  userId: string | null;
  caseType: string;
  intakeChannel: string;
  caseStage: string | null;
  assignedCounsellorId: string | null;
  currentDistressScore: number | null;
  priorityRank: number | null;
  createdAt: Date;
  updatedAt: Date;
  lifecycleState: string;
  lifecycleUpdatedAt: Date;
}

interface ConsentRow {
  id: string;
  userId: string;
  scope: string;
  granted: boolean;
  textVersionHash: string;
  channel: string;
  capturedBy: string;
  capturedAt: Date;
}

interface VictimProfileRow {
  userId: string;
  relationType: string | null;
  preferredChannel: string | null;
  safeWindows: unknown;
  safeToCall: boolean | null;
  optedOutAt: Date | null;
  updatedAt: Date;
}

interface SafetySettingRow {
  userId: string;
  duressPinHash: string | null;
  disguiseEnabled: boolean;
  safeWordHash: string | null;
  trustedContactName: string | null;
  trustedContactPhone: string | null;
  updatedAt: Date;
}

interface StaffRow {
  id: string;
  userId: string;
  counsellorId: string | null;
  role: string;
  orgId: string | null;
  districtScope: string[];
  languages: string[];
  caseloadCap: number | null;
  onCallSchedule: unknown;
  createdAt: Date;
}

interface StaffAuditLogRow {
  id: string;
  staffId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  createdAt: Date;
  prevHash: string | null;
  hash: string | null;
}

interface ReferralRow {
  id: string;
  caseId: string;
  userId: string;
  destinationType: string;
  status: string;
  packetData: unknown;
  createdByStaffId: string;
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
  updatedAt: Date;
}

interface TaskRow {
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
  updatedAt: Date;
}

interface MilestoneRow {
  id: string;
  caseId: string;
  type: string;
  dueAt: Date | null;
  metAt: Date | null;
  enteredByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fake-id-${idCounter}`;
}

export class FakePrismaService {
  otpRows: OtpCodeRow[] = [];
  userRows: UserRow[] = [];
  counsellorRows: CounsellorRow[] = [];
  caseRows: CaseRow[] = [];
  consentRows: ConsentRow[] = [];
  victimProfileRows: VictimProfileRow[] = [];
  safetySettingRows: SafetySettingRow[] = [];
  staffRows: StaffRow[] = [];
  staffAuditLogRows: StaffAuditLogRow[] = [];
  referralRows: ReferralRow[] = [];

  otpCode = {
    create: async ({ data }: { data: Partial<OtpCodeRow> }): Promise<OtpCodeRow> => {
      const row: OtpCodeRow = {
        id: nextId(),
        phoneHash: data.phoneHash!,
        codeHash: data.codeHash!,
        salt: data.salt!,
        purpose: data.purpose ?? 'login',
        ipHash: data.ipHash ?? null,
        attempts: data.attempts ?? 0,
        maxAttempts: data.maxAttempts ?? 3,
        expiresAt: data.expiresAt!,
        consumedAt: data.consumedAt ?? null,
        createdAt: new Date(),
      };
      this.otpRows.push(row);
      return row;
    },

    findFirst: async (args: {
      where: { phoneHash: string; purpose: string; consumedAt: null };
      orderBy: { createdAt: 'desc' | 'asc' };
    }): Promise<OtpCodeRow | null> => {
      const matches = this.otpRows.filter(
        (r) =>
          r.phoneHash === args.where.phoneHash &&
          r.purpose === args.where.purpose &&
          r.consumedAt === null,
      );
      matches.sort((a, b) => (args.orderBy.createdAt === 'desc' ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime()));
      return matches[0] ?? null;
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<OtpCodeRow>;
    }): Promise<OtpCodeRow> => {
      const row = this.otpRows.find((r) => r.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },

    count: async (args: { where: Record<string, unknown> }): Promise<number> => {
      const { createdAt, ...rest } = args.where as { createdAt?: { gte: Date } } & Record<string, unknown>;
      return this.otpRows.filter((r) => {
        for (const [key, value] of Object.entries(rest)) {
          if ((r as unknown as Record<string, unknown>)[key] !== value) return false;
        }
        if (createdAt && r.createdAt < createdAt.gte) return false;
        return true;
      }).length;
    },
  };

  user = {
    findUnique: async ({
      where,
      include,
    }: {
      where: { phoneNumber?: string; id?: string };
      include?: { cases?: boolean };
    }): Promise<(UserRow & { cases?: CaseRow[] }) | null> => {
      const row = where.phoneNumber
        ? this.userRows.find((u) => u.phoneNumber === where.phoneNumber)
        : this.userRows.find((u) => u.id === where.id);
      if (!row) return null;
      if (include?.cases) {
        return { ...row, cases: this.caseRows.filter((c) => c.userId === row.id).map((c) => ({ ...c })) };
      }
      return { ...row };
    },

    create: async ({ data }: { data: Partial<UserRow> }): Promise<UserRow> => {
      const row: UserRow = {
        id: nextId(),
        phoneNumber: data.phoneNumber!,
        name: data.name!,
        roleType: data.roleType!,
        preferredLanguage: data.preferredLanguage!,
        consentGiven: data.consentGiven ?? false,
        consentTimestamp: data.consentTimestamp ?? null,
        locationDistrict: data.locationDistrict ?? null,
        locationState: data.locationState ?? null,
        locationSource: data.locationSource ?? null,
        locationLat: data.locationLat ?? null,
        locationLng: data.locationLng ?? null,
        createdAt: new Date(),
      };
      this.userRows.push(row);
      return row;
    },
  };

  counsellor = {
    // Scoped by district only — the real query can't compare two columns of
    // the same row (currentCaseload < caseloadCap) in a `where` filter
    // either, so AssignmentService applies the per-row cap in memory after
    // this call. See assignment.service.ts.
    findMany: async (args: {
      where: { district: string };
      orderBy: { currentCaseload: 'asc' | 'desc' };
    }): Promise<CounsellorRow[]> => {
      const matches = this.counsellorRows.filter((c) => c.district === args.where.district);
      matches.sort((a, b) =>
        args.orderBy.currentCaseload === 'asc'
          ? (a.currentCaseload ?? 0) - (b.currentCaseload ?? 0)
          : (b.currentCaseload ?? 0) - (a.currentCaseload ?? 0),
      );
      return matches.map((c) => ({ ...c }));
    },

    // Mirrors the real atomic-conditional-update pattern in
    // assignment.service.ts: only increments and reports success if the
    // WHERE clause (id + still-under-cap) still matches at the moment of
    // the "write" — the fake applies this synchronously, which is enough to
    // exercise the retry-next-candidate logic in unit tests. Real
    // concurrent-race safety is proven against real Postgres in the
    // integration suite, not here.
    updateMany: async (args: {
      where: { id: string; currentCaseload: { lt: number } };
      data: { currentCaseload: { increment: number } };
    }): Promise<{ count: number }> => {
      const row = this.counsellorRows.find((c) => c.id === args.where.id);
      if (!row || (row.currentCaseload ?? 0) >= args.where.currentCaseload.lt) {
        return { count: 0 };
      }
      row.currentCaseload = (row.currentCaseload ?? 0) + args.data.currentCaseload.increment;
      return { count: 1 };
    },
  };

  case = {
    create: async ({ data }: { data: Partial<CaseRow> }): Promise<CaseRow> => {
      const row: CaseRow = {
        id: nextId(),
        userId: data.userId ?? null,
        caseType: data.caseType!,
        intakeChannel: data.intakeChannel!,
        caseStage: data.caseStage ?? 'registered',
        assignedCounsellorId: data.assignedCounsellorId ?? null,
        currentDistressScore: data.currentDistressScore ?? 0,
        priorityRank: data.priorityRank ?? 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lifecycleState: data.lifecycleState ?? 'REGISTERED',
        lifecycleUpdatedAt: new Date(),
      };
      this.caseRows.push(row);
      return row;
    },

    findUnique: async ({
      where,
      include,
    }: {
      where: { id: string };
      include?: { user?: { select?: { locationDistrict?: boolean } } };
    }): Promise<(CaseRow & { user?: { locationDistrict: string | null } | null }) | null> => {
      const row = this.caseRows.find((c) => c.id === where.id);
      if (!row) return null;
      const result: CaseRow & { user?: { locationDistrict: string | null } | null } = { ...row };
      if (include?.user) {
        const owner = this.userRows.find((u) => u.id === row.userId);
        result.user = owner ? { locationDistrict: owner.locationDistrict } : null;
      }
      return result;
    },

    // Mirrors the real atomic-conditional-update pattern used by
    // lifecycle.service.ts: only updates and reports success if the
    // WHERE clause (id + still-matching lifecycleState) still matches at
    // the moment of the "write" — enough to exercise the
    // lost-the-race-returns-zero-rows behavior in unit tests. Real
    // concurrent-race safety against real Postgres is proven in the
    // integration suite, not here.
    updateMany: async (args: {
      where: { id: string; lifecycleState: string };
      data: { lifecycleState: string; lifecycleUpdatedAt: Date };
    }): Promise<{ count: number }> => {
      const row = this.caseRows.find((c) => c.id === args.where.id);
      if (!row || row.lifecycleState !== args.where.lifecycleState) {
        return { count: 0 };
      }
      row.lifecycleState = args.data.lifecycleState;
      row.lifecycleUpdatedAt = args.data.lifecycleUpdatedAt;
      return { count: 1 };
    },

    // Supports exactly the two shapes console.service.ts needs: a flat
    // assignedCounsellorId match (counsellor-role queue), or a
    // user.locationDistrict-in-list match (district-scoped queue) — plus
    // sort-by-distress-score and an `include: { user: {...} }` join,
    // resolved against the in-memory user rows.
    findMany: async (args: {
      where?: {
        assignedCounsellorId?: string;
        user?: { locationDistrict?: { in: string[] } };
      };
      orderBy?: { currentDistressScore?: 'asc' | 'desc' };
      include?: { user?: { select?: { name?: boolean; locationDistrict?: boolean } } };
    }): Promise<Array<CaseRow & { user?: { name: string; locationDistrict: string | null } | null }>> => {
      let matches = [...this.caseRows];
      if (args.where?.assignedCounsellorId !== undefined) {
        matches = matches.filter((c) => c.assignedCounsellorId === args.where!.assignedCounsellorId);
      }
      if (args.where?.user?.locationDistrict?.in) {
        const allowed = args.where.user.locationDistrict.in;
        matches = matches.filter((c) => {
          const owner = this.userRows.find((u) => u.id === c.userId);
          return owner?.locationDistrict != null && allowed.includes(owner.locationDistrict);
        });
      }
      if (args.orderBy?.currentDistressScore) {
        const dir = args.orderBy.currentDistressScore;
        matches.sort((a, b) =>
          dir === 'desc'
            ? (b.currentDistressScore ?? 0) - (a.currentDistressScore ?? 0)
            : (a.currentDistressScore ?? 0) - (b.currentDistressScore ?? 0),
        );
      }
      return matches.map((c) => {
        const result: CaseRow & { user?: { name: string; locationDistrict: string | null } | null } = { ...c };
        if (args.include?.user) {
          const owner = this.userRows.find((u) => u.id === c.userId);
          result.user = owner ? { name: owner.name, locationDistrict: owner.locationDistrict } : null;
        }
        return result;
      });
    },
  };

  consent = {
    create: async ({ data }: { data: Partial<ConsentRow> }): Promise<ConsentRow> => {
      const row: ConsentRow = {
        id: nextId(),
        userId: data.userId!,
        scope: data.scope!,
        granted: data.granted!,
        textVersionHash: data.textVersionHash!,
        channel: data.channel!,
        capturedBy: data.capturedBy ?? 'self',
        capturedAt: new Date(),
      };
      this.consentRows.push(row);
      return row;
    },

    findMany: async (args: {
      where: { userId: string };
      orderBy: { capturedAt: 'desc' | 'asc' };
    }): Promise<ConsentRow[]> => {
      const matches = this.consentRows.filter((r) => r.userId === args.where.userId);
      matches.sort((a, b) =>
        args.orderBy.capturedAt === 'desc'
          ? b.capturedAt.getTime() - a.capturedAt.getTime()
          : a.capturedAt.getTime() - b.capturedAt.getTime(),
      );
      return matches.map((r) => ({ ...r }));
    },

    // Supports ReferralService's consent-gate check: the single
    // most-recent row for (userId, scope), mirroring
    // consent.service.ts::getCurrentConsents's own "latest row wins"
    // semantics but scoped to one scope via a real SQL-shaped filter
    // rather than filtering client-side across every scope.
    findFirst: async (args: {
      where: { userId: string; scope: string };
      orderBy: { capturedAt: 'desc' | 'asc' };
    }): Promise<ConsentRow | null> => {
      const matches = this.consentRows.filter(
        (r) => r.userId === args.where.userId && r.scope === args.where.scope,
      );
      matches.sort((a, b) =>
        args.orderBy.capturedAt === 'desc'
          ? b.capturedAt.getTime() - a.capturedAt.getTime()
          : a.capturedAt.getTime() - b.capturedAt.getTime(),
      );
      return matches[0] ?? null;
    },
  };

  victimProfile = {
    findUnique: async ({ where }: { where: { userId: string } }): Promise<VictimProfileRow | null> => {
      return this.victimProfileRows.find((r) => r.userId === where.userId) ?? null;
    },

    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: Partial<VictimProfileRow> & { userId: string };
      update: Partial<VictimProfileRow>;
    }): Promise<VictimProfileRow> => {
      const existing = this.victimProfileRows.find((r) => r.userId === where.userId);
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const row: VictimProfileRow = {
        userId: create.userId,
        relationType: create.relationType ?? null,
        preferredChannel: create.preferredChannel ?? null,
        safeWindows: create.safeWindows ?? null,
        safeToCall: create.safeToCall ?? null,
        optedOutAt: create.optedOutAt ?? null,
        updatedAt: new Date(),
      };
      this.victimProfileRows.push(row);
      return row;
    },
  };

  safetySetting = {
    findUnique: async ({ where }: { where: { userId: string } }): Promise<SafetySettingRow | null> => {
      return this.safetySettingRows.find((r) => r.userId === where.userId) ?? null;
    },

    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: Partial<SafetySettingRow> & { userId: string };
      update: Partial<SafetySettingRow>;
    }): Promise<SafetySettingRow> => {
      const existing = this.safetySettingRows.find((r) => r.userId === where.userId);
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return existing;
      }
      const row: SafetySettingRow = {
        userId: create.userId,
        duressPinHash: create.duressPinHash ?? null,
        disguiseEnabled: create.disguiseEnabled ?? false,
        safeWordHash: create.safeWordHash ?? null,
        trustedContactName: create.trustedContactName ?? null,
        trustedContactPhone: create.trustedContactPhone ?? null,
        updatedAt: new Date(),
      };
      this.safetySettingRows.push(row);
      return row;
    },
  };

  staff = {
    findUnique: async ({ where }: { where: { userId: string } }): Promise<StaffRow | null> => {
      return this.staffRows.find((s) => s.userId === where.userId) ?? null;
    },

    create: async ({ data }: { data: Partial<StaffRow> }): Promise<StaffRow> => {
      const row: StaffRow = {
        id: nextId(),
        userId: data.userId!,
        counsellorId: data.counsellorId ?? null,
        role: data.role!,
        orgId: data.orgId ?? null,
        districtScope: data.districtScope ?? [],
        languages: data.languages ?? [],
        caseloadCap: data.caseloadCap ?? null,
        onCallSchedule: data.onCallSchedule ?? null,
        createdAt: new Date(),
      };
      this.staffRows.push(row);
      return row;
    },
  };

  staffAuditLog = {
    create: async ({ data }: { data: Partial<StaffAuditLogRow> }): Promise<StaffAuditLogRow> => {
      const row: StaffAuditLogRow = {
        id: nextId(),
        staffId: data.staffId!,
        action: data.action!,
        resourceType: data.resourceType!,
        resourceId: data.resourceId ?? null,
        reason: data.reason ?? null,
        // createdAt is caller-supplied by StaffAuditService.record (it
        // generates the timestamp itself so it can be included in the
        // hash computation BEFORE insert) — never silently regenerated
        // here, which would make the fake's row content diverge from
        // what was actually hashed.
        createdAt: data.createdAt ?? new Date(),
        prevHash: data.prevHash ?? null,
        hash: data.hash ?? null,
      };
      this.staffAuditLogRows.push(row);
      return row;
    },

    findMany: async (): Promise<StaffAuditLogRow[]> => this.staffAuditLogRows.map((r) => ({ ...r })),
  };

  // Seeded with the real genesis value on every fresh FakePrismaService,
  // mirroring backend/migrations/0009_audit_hash_chain.sql's
  // ON CONFLICT DO NOTHING seed — a fresh fake instance is meant to
  // behave like a fresh, just-migrated database, not an empty table.
  staffAuditChainHeadRow: { id: 1; tipHash: string } = { id: 1, tipHash: AUDIT_CHAIN_GENESIS_HASH };

  staffAuditChainHead = {
    findUnique: async ({ where }: { where: { id: number } }): Promise<{ id: number; tipHash: string } | null> => {
      return where.id === this.staffAuditChainHeadRow.id ? { ...this.staffAuditChainHeadRow } : null;
    },

    // Mirrors the real atomic-conditional-update pattern (S5/S8/S9/S11):
    // only advances the tip and reports success if the WHERE clause
    // (id + still-matching tipHash) still matches at the moment of the
    // "write".
    updateMany: async (args: {
      where: { id: number; tipHash: string };
      data: { tipHash: string };
    }): Promise<{ count: number }> => {
      if (this.staffAuditChainHeadRow.id !== args.where.id || this.staffAuditChainHeadRow.tipHash !== args.where.tipHash) {
        return { count: 0 };
      }
      this.staffAuditChainHeadRow.tipHash = args.data.tipHash;
      return { count: 1 };
    },
  };

  referral = {
    create: async ({ data }: { data: Partial<ReferralRow> }): Promise<ReferralRow> => {
      const row: ReferralRow = {
        id: nextId(),
        caseId: data.caseId!,
        userId: data.userId!,
        destinationType: data.destinationType!,
        status: data.status ?? 'DRAFTED',
        packetData: data.packetData!,
        createdByStaffId: data.createdByStaffId!,
        attemptCount: data.attemptCount ?? 0,
        idempotencyKey: data.idempotencyKey ?? null,
        sentAt: data.sentAt ?? null,
        ackDueAt: data.ackDueAt ?? null,
        ackedAt: data.ackedAt ?? null,
        serviceDueAt: data.serviceDueAt ?? null,
        inServiceAt: data.inServiceAt ?? null,
        deliveredAt: data.deliveredAt ?? null,
        verifiedAt: data.verifiedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.referralRows.push(row);
      return row;
    },

    findUnique: async ({
      where,
      include,
    }: {
      where: { id: string };
      include?: { case?: { include?: { user?: { select?: { locationDistrict?: boolean } } } } };
    }): Promise<
      | (ReferralRow & { case?: (CaseRow & { user?: { locationDistrict: string | null } | null }) | null })
      | null
    > => {
      const row = this.referralRows.find((r) => r.id === where.id);
      if (!row) return null;
      const result: ReferralRow & { case?: (CaseRow & { user?: { locationDistrict: string | null } | null }) | null } = {
        ...row,
      };
      if (include?.case) {
        const caseRow = this.caseRows.find((c) => c.id === row.caseId);
        if (caseRow) {
          const caseResult: CaseRow & { user?: { locationDistrict: string | null } | null } = { ...caseRow };
          if (include.case.include?.user) {
            const owner = this.userRows.find((u) => u.id === caseRow.userId);
            caseResult.user = owner ? { locationDistrict: owner.locationDistrict } : null;
          }
          result.case = caseResult;
        } else {
          result.case = null;
        }
      }
      return result;
    },

    findUniqueOrThrow: async (args: { where: { id: string } }): Promise<ReferralRow> => {
      const row = this.referralRows.find((r) => r.id === args.where.id);
      if (!row) throw new Error('not found');
      return { ...row };
    },

    // Mirrors the real atomic-conditional-update pattern used by
    // referral.service.ts: only updates and reports success if the WHERE
    // clause (id + still-matching status) still matches at the moment of
    // the "write" — same technique as case.updateMany above (S8).
    updateMany: async (args: {
      where: { id: string; status: string };
      data: Partial<ReferralRow>;
    }): Promise<{ count: number }> => {
      const row = this.referralRows.find((r) => r.id === args.where.id);
      if (!row || row.status !== args.where.status) {
        return { count: 0 };
      }
      Object.assign(row, args.data);
      return { count: 1 };
    },

    // Supports OversightService's district-metrics query: a
    // user.locationDistrict relation filter plus a `select` projection.
    // `select` is honored (not just accepted and ignored) so a unit test
    // asserting on the returned shape reflects reality.
    findMany: async (args: {
      where: { user: { locationDistrict: string } };
      select?: Record<string, true>;
    }): Promise<Array<Partial<ReferralRow>>> => {
      const matches = this.referralRows.filter((r) => {
        const owner = this.userRows.find((u) => u.id === r.userId);
        return owner?.locationDistrict === args.where.user.locationDistrict;
      });
      if (!args.select) return matches.map((r) => ({ ...r }));
      return matches.map((r) => {
        const projected: Partial<ReferralRow> = {};
        for (const key of Object.keys(args.select!)) {
          (projected as Record<string, unknown>)[key] = (r as unknown as Record<string, unknown>)[key];
        }
        return projected;
      });
    },
  };

  taskRows: TaskRow[] = [];

  task = {
    create: async ({ data }: { data: Partial<TaskRow> }): Promise<TaskRow> => {
      const row: TaskRow = {
        id: nextId(),
        userId: data.userId ?? null,
        caseId: data.caseId ?? null,
        referralId: data.referralId ?? null,
        type: data.type!,
        priority: data.priority!,
        status: data.status ?? 'OPEN',
        assigneeStaffId: data.assigneeStaffId ?? null,
        createdByStaffId: data.createdByStaffId ?? null,
        slaDueAt: data.slaDueAt ?? null,
        ackedAt: data.ackedAt ?? null,
        completedAt: data.completedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.taskRows.push(row);
      return row;
    },

    findUnique: async ({
      where,
      include,
    }: {
      where: { id: string };
      include?: { case?: { include?: { user?: { select?: { locationDistrict?: boolean } } } } };
    }): Promise<
      (TaskRow & { case?: (CaseRow & { user?: { locationDistrict: string | null } | null }) | null }) | null
    > => {
      const row = this.taskRows.find((t) => t.id === where.id);
      if (!row) return null;
      const result: TaskRow & { case?: (CaseRow & { user?: { locationDistrict: string | null } | null }) | null } = {
        ...row,
      };
      if (include?.case) {
        const caseRow = row.caseId ? this.caseRows.find((c) => c.id === row.caseId) : undefined;
        if (caseRow) {
          const caseResult: CaseRow & { user?: { locationDistrict: string | null } | null } = { ...caseRow };
          if (include.case.include?.user) {
            const owner = this.userRows.find((u) => u.id === caseRow.userId);
            caseResult.user = owner ? { locationDistrict: owner.locationDistrict } : null;
          }
          result.case = caseResult;
        } else {
          result.case = null;
        }
      }
      return result;
    },

    findUniqueOrThrow: async (args: { where: { id: string } }): Promise<TaskRow> => {
      const row = this.taskRows.find((t) => t.id === args.where.id);
      if (!row) throw new Error('not found');
      return { ...row };
    },

    updateMany: async (args: {
      where: { id: string; status: string };
      data: Partial<TaskRow>;
    }): Promise<{ count: number }> => {
      const row = this.taskRows.find((t) => t.id === args.where.id);
      if (!row || row.status !== args.where.status) {
        return { count: 0 };
      }
      Object.assign(row, args.data);
      return { count: 1 };
    },

    // Supports TaskService.listTasks's two shapes: an
    // assignedCounsellorId match via `case`, or a
    // case.user.locationDistrict-in-list match — mirrors
    // console's own case.findMany fake.
    findMany: async (args: {
      where?: {
        case?: { assignedCounsellorId?: string; user?: { locationDistrict?: { in: string[] } } };
      };
      orderBy?: { createdAt?: 'asc' | 'desc' };
    }): Promise<TaskRow[]> => {
      let matches = [...this.taskRows];
      const caseFilter = args.where?.case;
      if (caseFilter?.assignedCounsellorId !== undefined) {
        matches = matches.filter((t) => {
          const caseRow = t.caseId ? this.caseRows.find((c) => c.id === t.caseId) : undefined;
          return caseRow?.assignedCounsellorId === caseFilter.assignedCounsellorId;
        });
      }
      if (caseFilter?.user?.locationDistrict?.in) {
        const allowed = caseFilter.user.locationDistrict.in;
        matches = matches.filter((t) => {
          const caseRow = t.caseId ? this.caseRows.find((c) => c.id === t.caseId) : undefined;
          const owner = caseRow?.userId ? this.userRows.find((u) => u.id === caseRow.userId) : undefined;
          return owner?.locationDistrict != null && allowed.includes(owner.locationDistrict);
        });
      }
      if (args.orderBy?.createdAt) {
        const dir = args.orderBy.createdAt;
        matches.sort((a, b) =>
          dir === 'desc' ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
      return matches.map((t) => ({ ...t }));
    },
  };

  milestoneRows: MilestoneRow[] = [];

  milestone = {
    create: async ({ data }: { data: Partial<MilestoneRow> }): Promise<MilestoneRow> => {
      const row: MilestoneRow = {
        id: nextId(),
        caseId: data.caseId!,
        type: data.type!,
        dueAt: data.dueAt ?? null,
        metAt: data.metAt ?? null,
        enteredByStaffId: data.enteredByStaffId!,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.milestoneRows.push(row);
      return row;
    },

    findUnique: async ({
      where,
      include,
    }: {
      where: { id: string };
      include?: { case?: { include?: { user?: { select?: { locationDistrict?: boolean } } } } };
    }): Promise<
      (MilestoneRow & { case?: (CaseRow & { user?: { locationDistrict: string | null } | null }) | null }) | null
    > => {
      const row = this.milestoneRows.find((m) => m.id === where.id);
      if (!row) return null;
      const result: MilestoneRow & {
        case?: (CaseRow & { user?: { locationDistrict: string | null } | null }) | null;
      } = { ...row };
      if (include?.case) {
        const caseRow = this.caseRows.find((c) => c.id === row.caseId);
        if (caseRow) {
          const caseResult: CaseRow & { user?: { locationDistrict: string | null } | null } = { ...caseRow };
          if (include.case.include?.user) {
            const owner = this.userRows.find((u) => u.id === caseRow.userId);
            caseResult.user = owner ? { locationDistrict: owner.locationDistrict } : null;
          }
          result.case = caseResult;
        } else {
          result.case = null;
        }
      }
      return result;
    },

    findUniqueOrThrow: async (args: { where: { id: string } }): Promise<MilestoneRow> => {
      const row = this.milestoneRows.find((m) => m.id === args.where.id);
      if (!row) throw new Error('not found');
      return { ...row };
    },

    updateMany: async (args: {
      where: { id: string; metAt: null };
      data: Partial<MilestoneRow>;
    }): Promise<{ count: number }> => {
      const row = this.milestoneRows.find((m) => m.id === args.where.id);
      if (!row || row.metAt !== null) {
        return { count: 0 };
      }
      Object.assign(row, args.data);
      return { count: 1 };
    },

    findMany: async (args: { where: { caseId: string }; orderBy?: { createdAt?: 'asc' | 'desc' } }): Promise<MilestoneRow[]> => {
      let matches = this.milestoneRows.filter((m) => m.caseId === args.where.caseId);
      if (args.orderBy?.createdAt) {
        const dir = args.orderBy.createdAt;
        matches = [...matches].sort((a, b) =>
          dir === 'desc' ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
      return matches.map((m) => ({ ...m }));
    },
  };

  /**
   * Not a real transaction — no atomicity or isolation, just runs the
   * callback against this same fake instance. Enough to unit-test
   * RegistrationService's orchestration logic (what gets called, in what
   * order, with what data); it does NOT prove rollback-on-failure, which is
   * why that guarantee is proven against real Postgres in
   * test/registration.integration-spec.ts instead, not claimed here.
   */
  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
