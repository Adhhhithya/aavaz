import { Injectable, Logger } from '@nestjs/common';
import { Counsellor, Prisma } from '@prisma/client';

/** Anything with the subset of PrismaClient's query surface this service
 * needs — satisfied by both `PrismaService` (standalone calls) and a
 * `Prisma.TransactionClient` (calls made inside `prisma.$transaction`).
 * Registration always calls this from within a transaction — see
 * registration.service.ts — so victim creation, case creation, and the
 * counsellor caseload increment either all commit or all roll back
 * together (Phase 6). */
type QueryClient = Pick<Prisma.TransactionClient, 'counsellor'>;

/**
 * Counsellor auto-assignment — ported from
 * backend/api/assignment/auto_assign.py::assign_counsellor, per Phase 5's
 * explicit instruction to port the existing algorithm rather than invent a
 * new one, with one deliberate addition: a caseload cap.
 *
 * Ported unchanged from the existing algorithm:
 *   1. Look at every counsellor in the given district, cheapest caseload
 *      first.
 *   2. Prefer the lowest-caseload counsellor who supports the requested
 *      language.
 *   3. If none support the language, fall back to the district's overall
 *      lowest-caseload counsellor (regardless of language) rather than
 *      leaving the case unassigned.
 *   4. If the district has no counsellors at all, the case is created
 *      unassigned (`assignedCounsellorId: null`) — no error is thrown, same
 *      as today.
 *
 * Deliberately changed from the existing algorithm, per Phase 2/5's
 * instruction to follow v0.2 where it is explicit rather than silently
 * preserve obsolete behavior: v0.2 Workflow A6 requires "lowest active
 * caseload below the cap (default 80)", and v0.2's own data model (§12)
 * makes `caseload_cap` a column on the staff/counsellor row itself, not a
 * single system-wide constant — "default 80" describes the column's
 * default value, not a global ceiling every counsellor shares. This service
 * therefore reads each candidate's OWN `caseloadCap` column
 * (backend/migrations/0003_counsellor_caseload_cap.sql), not a shared
 * config value. The existing Python implementation has no cap concept at
 * all — it will keep piling cases onto one counsellor forever. A counsellor
 * at or over their own cap is treated exactly like a counsellor who doesn't
 * exist for matching purposes.
 *
 * Deliberately NOT ported, and explicitly flagged (not silently dropped),
 * per Phase 5: v0.2 also says "No match creates an unassigned task for the
 * district supervisor." There is no `tasks` table or task domain in this
 * codebase yet (building one is out of this slice's scope per the S5 STOP
 * conditions), so "no match" still resolves to a silently-unassigned case,
 * identical to existing behavior — see
 * docs/S5_REGISTRATION_MIGRATION.md Phase 5 for this gap.
 *
 * Concurrency (Phase 7): the existing Python implementation reads
 * `current_caseload` and then issues a separate, unconditional `UPDATE`,
 * which is a classic read-then-write race — two concurrent assignments can
 * both read the same caseload, both write `caseload + 1`, and one
 * increment is silently lost (or, worse, both writes can push a counsellor
 * over any notional cap since neither write re-checks it). This service
 * instead claims a candidate with a single atomic, conditionally-guarded
 * `updateMany` (`WHERE id = ... AND currentCaseload < caseloadCap`) —
 * Postgres evaluates the WHERE clause against the latest committed row when
 * it takes the row's write lock, so two concurrent claims for the same
 * counsellor can never both succeed, and a counsellor can never be pushed
 * over their own cap by a race. If the claim fails (lost the race, or
 * another request filled the last slot under the cap), this service tries
 * the next candidate in order rather than giving up immediately.
 *
 * Prisma's query API cannot compare two columns of the same row in a
 * `where` filter (there is no "currentCaseload < caseloadCap" clause), so
 * the initial candidate fetch is scoped by district only and the cap check
 * is applied in memory — the district-sized candidate list is small, this
 * is not a performance concern. The atomic claim step (`updateMany`) can
 * and does check the winning candidate's own cap directly, since that
 * candidate's cap value is already known by then.
 */
@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  async assign(client: QueryClient, district: string, language: string): Promise<Counsellor | null> {
    const inDistrict = await client.counsellor.findMany({
      where: { district },
      orderBy: { currentCaseload: 'asc' },
    });

    const candidates = inDistrict.filter((c) => (c.currentCaseload ?? 0) < c.caseloadCap);

    if (candidates.length === 0) {
      this.logger.log(`No counsellor under their caseload cap in district "${district}" — case will be unassigned`);
      return null;
    }

    const languageMatches = candidates.filter((c) => c.languages.includes(language));
    const orderedCandidates = languageMatches.length > 0 ? languageMatches : candidates;

    for (const candidate of orderedCandidates) {
      const claim = await client.counsellor.updateMany({
        where: { id: candidate.id, currentCaseload: { lt: candidate.caseloadCap } },
        data: { currentCaseload: { increment: 1 } },
      });
      if (claim.count === 1) {
        return { ...candidate, currentCaseload: (candidate.currentCaseload ?? 0) + 1 };
      }
      // Lost the race for this candidate (another concurrent assignment
      // claimed the last slot under their cap between our SELECT and our
      // UPDATE) — try the next-best candidate instead of failing outright.
    }

    this.logger.log(`All caseload-eligible candidates in district "${district}" were claimed concurrently`);
    return null;
  }
}
