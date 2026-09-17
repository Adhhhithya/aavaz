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

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fake-id-${idCounter}`;
}

export class FakePrismaService {
  otpRows: OtpCodeRow[] = [];
  userRows: UserRow[] = [];

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
}
