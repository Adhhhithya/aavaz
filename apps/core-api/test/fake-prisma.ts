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
    findUnique: async ({ where }: { where: { phoneNumber: string } }): Promise<UserRow | null> => {
      return this.userRows.find((u) => u.phoneNumber === where.phoneNumber) ?? null;
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
      };
      this.caseRows.push(row);
      return row;
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
