import { Injectable, Logger } from '@nestjs/common';
import { Staff } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isStaffRole, StaffRole } from './staff-roles';

/**
 * The application-visible shape of a resolved staff identity. Deliberately
 * exposes only what authorization logic needs — never the raw Prisma row
 * (which would also carry `orgId`/`onCallSchedule`/`caseloadCap`, none of
 * which any S7 authorization decision reads).
 */
export interface ResolvedStaff {
  id: string;
  userId: string;
  counsellorId: string | null;
  role: StaffRole;
  districtScope: string[];
  languages: string[];
}

export interface CreateStaffParams {
  userId: string;
  role: StaffRole;
  counsellorId?: string | null;
  districtScope?: string[];
  languages?: string[];
  caseloadCap?: number | null;
  orgId?: string | null;
}

/**
 * Decision 1's bridge, resolved: authenticated user -> staff identity ->
 * existing counsellor identity (where applicable). Every lookup here is by
 * `userId` (the authenticated identity) — nothing in this service ever
 * looks up or compares by `counsellors.id` as if it were a user identity.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the CURRENT staff identity for an authenticated user, fresh
   * from the database on every call — never cached across requests, never
   * trusted from a token claim (see staff-token.service.ts). Returns null
   * if the user has no `staff` row at all, i.e. is not staff.
   */
  async getStaffForUser(userId: string): Promise<ResolvedStaff | null> {
    const row = await this.prisma.staff.findUnique({ where: { userId } });
    if (!row) return null;
    if (!isStaffRole(row.role)) {
      // Fail closed rather than trust an unrecognized value that must have
      // been written outside this service's own validation (e.g. a manual
      // DB edit) — never authorize against a role this code doesn't
      // understand. Treated identically to "not staff at all" so the
      // caller (StaffAuthGuard) gets one consistent 403, not a 500.
      this.logger.warn(`Staff row ${row.id} has an unrecognized role "${row.role}" — treating as not staff`);
      return null;
    }
    return this.toResolvedFromValidatedRow(row, row.role);
  }

  /**
   * Creates a new staff identity, bridging an existing `users` row to an
   * optional existing `counsellors` row. Does NOT create, modify, or
   * infer either side — both ids must already exist (the database's own
   * foreign key constraints enforce this; a nonexistent `userId` or
   * `counsellorId` fails the insert rather than silently succeeding).
   * `staff.userId` is UNIQUE at the database level, so calling this twice
   * for the same user fails rather than silently creating a second staff
   * identity for one person.
   *
   * No production provisioning endpoint calls this in this slice (see
   * docs/S7_STAFF_CONSOLE_MIGRATION.md) — it exists for tests and as the
   * building block a future provisioning flow would use.
   */
  async createStaff(params: CreateStaffParams): Promise<ResolvedStaff> {
    if (!isStaffRole(params.role)) {
      throw new Error(`Unrecognized staff role: ${params.role}`);
    }
    const row = await this.prisma.staff.create({
      data: {
        userId: params.userId,
        counsellorId: params.counsellorId ?? null,
        role: params.role,
        districtScope: params.districtScope ?? [],
        languages: params.languages ?? [],
        caseloadCap: params.caseloadCap ?? null,
        orgId: params.orgId ?? null,
      },
    });
    // params.role was already validated above, so row.role is known-good —
    // no need to re-check.
    return this.toResolvedFromValidatedRow(row, params.role);
  }

  /** Assembles the public-shaped result once the caller has already
   * confirmed `role` is a recognized StaffRole — kept as one place so the
   * field list can't drift between the two call sites. */
  private toResolvedFromValidatedRow(row: Staff, role: StaffRole): ResolvedStaff {
    return {
      id: row.id,
      userId: row.userId,
      counsellorId: row.counsellorId,
      role,
      districtScope: row.districtScope,
      languages: row.languages,
    };
  }
}
