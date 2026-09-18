import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChainVerificationResult, computeAuditHash, verifyChain } from './audit-chain';

/**
 * Closed sets of short codes — not free text — matching
 * backend/migrations/0005_staff.sql's "IDs and codes, never free text"
 * design intent (echoing v0.2's own event-catalog convention, §13:
 * "Events carry IDs and codes, never free-text victim content").
 *
 * S8 adds `lifecycle.case.transition`/`case` — see
 * apps/core-api/src/lifecycle/lifecycle.service.ts. S9 adds
 * `referral.drafted`/`referral.transition`/`referral.read`/`referral` —
 * see apps/core-api/src/referral/referral.service.ts. S10 adds
 * `oversight.metrics.read`/`district` — see
 * apps/core-api/src/oversight/oversight.service.ts. S12 adds
 * `task.created`/`task.transition`/`task.list.read`/`task` — see
 * apps/core-api/src/task/task.service.ts. Note: the SYSTEM-created
 * `referral_stalled` task (TaskService.createStalledReferralTaskTx) is
 * NOT separately audited under a staff id — see that method's own
 * comment for why. S13 adds
 * `milestone.created`/`milestone.marked_met`/`milestone.list.read`/
 * `milestone` — see apps/core-api/src/milestone/milestone.service.ts.
 * S15 adds `break_glass.requested` (resourceType `case`, reusing the
 * existing code rather than adding a new one) — see
 * apps/core-api/src/break-glass/break-glass.service.ts. The grant's real
 * reason text is NEVER passed to this method — it lives only on
 * `break_glass_grants.reason`, a deliberate exception to this codebase's
 * audit-log discipline documented on that table's own migration.
 */
export type StaffAuditAction =
  | 'console.queue.read'
  | 'console.victim.read'
  | 'lifecycle.case.transition'
  | 'referral.drafted'
  | 'referral.transition'
  | 'referral.read'
  | 'oversight.metrics.read'
  | 'task.created'
  | 'task.transition'
  | 'task.list.read'
  | 'milestone.created'
  | 'milestone.marked_met'
  | 'milestone.list.read'
  | 'break_glass.requested';
export type StaffAuditResourceType = 'queue' | 'victim' | 'case' | 'referral' | 'district' | 'task' | 'milestone';

/** See assignment.service.ts's QueryClient for why this accepts either a
 * standalone PrismaService or an in-flight transaction client. Extended
 * in S11 with `staffAuditChainHead` for the hash-chain claim. */
type QueryClient = Pick<Prisma.TransactionClient, 'staffAuditLog' | 'staffAuditChainHead'>;

/** Bounded, not infinite — every concurrent writer targeting the same
 * singleton chain-head row eventually gets its turn under Postgres's
 * normal row-locking behavior (see
 * backend/migrations/0009_audit_hash_chain.sql's header), so exhausting
 * this many attempts indicates a real problem (e.g. sustained, unusually
 * high concurrent audit-write volume this system is not yet sized for),
 * not an expected outcome to silently paper over.
 *
 * FOUND DURING THIS SLICE'S OWN TESTING, not theoretical: an earlier
 * value of 10 with no delay between attempts genuinely failed under a
 * real-Postgres, real-HTTP test firing 20 truly concurrent requests
 * (test/audit-chain.integration-spec.ts) — every loser re-reads and
 * retries in the same instant its predecessor commits, so many losers
 * collide again on the very next attempt (a "thundering herd" against one
 * singleton row), and a plain retry-with-no-delay loop needs up to N-1
 * rounds in the worst case for N truly simultaneous contenders. Fixed by
 * adding jittered backoff between attempts (below) — this is what
 * actually fixed the real, observed integration-test failure, not merely
 * a defensive-sounding value picked without evidence. */
const MAX_CHAIN_CLAIM_ATTEMPTS = 25;

/** Small, capped, randomized delay between retry attempts — breaks the
 * thundering-herd pattern described above by making concurrent losers'
 * next attempts land at different times instead of all retrying in
 * lockstep. Kept short (a few ms to tens of ms) because this delay
 * happens INSIDE the caller's open transaction/connection — a long delay
 * here would hold a pooled connection longer than necessary, trading one
 * contention problem for a connection-pool-exhaustion one. */
function jitterMs(attempt: number): number {
  const cap = 40;
  const base = Math.min(cap, 2 ** attempt);
  return Math.random() * base;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The ONLY writer of `staff_audit_log`. Its method signature is
 * structurally incapable of accepting victim transcript text, a token, a
 * PIN, or any other secret — there is no parameter for any of those, by
 * design, not by convention. `resourceId` is always an id (e.g. a victim's
 * `users.id`), never content.
 *
 * Records only SUCCESSFUL reads, matching v0.2 §15's own phrasing ("every
 * READ of victim content is logged") — denied attempts are not recorded
 * in this slice; a future milestone may extend this if denial-logging
 * becomes a requirement, but that is not claimed here.
 *
 * S11 adds hash chaining (v0.2 §15: "each row stores the hash of the
 * previous row so tampering is detectable") — see
 * apps/core-api/src/staff/audit-chain.ts for the hash computation and
 * verification logic, and
 * backend/migrations/0009_audit_hash_chain.sql for why a separate
 * `staff_audit_chain_head` singleton table exists. This is STILL NOT
 * v0.2's full audit subsystem — no WORM export, no non-staff actors, no
 * break-glass — see docs/S11_AUDIT_HASH_CHAIN_MIGRATION.md's "Known
 * limitations" for what remains deliberately out of scope and why.
 */
@Injectable()
export class StaffAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `client` defaults to the injected `PrismaService` for standalone
   * calls (S7's original usage, unchanged). Callers running inside a
   * `prisma.$transaction` — e.g. LifecycleService, so the audit row
   * commits/rolls back atomically with the mutation it records — pass
   * that transaction's own client instead, the same pattern S5's
   * `IdentityService`/`AssignmentService` already use.
   *
   * Appending to the hash chain is itself a concurrency-safe claim: the
   * chain-head row is read, this row's hash is computed from that value,
   * then an atomic conditional `UPDATE ... WHERE tipHash = <value just
   * read>` attempts to advance it — the exact same claim pattern S5/S8/S9
   * already use for their own concurrency-safe writes, applied to a
   * dedicated singleton row rather than a per-entity one (see the
   * migration file's header for why). A losing attempt (another writer's
   * append landed first) re-reads the now-current tip and retries, up to
   * `MAX_CHAIN_CLAIM_ATTEMPTS` times.
   */
  async record(
    staffId: string,
    action: StaffAuditAction,
    resourceType: StaffAuditResourceType,
    resourceId?: string,
    client: QueryClient = this.prisma,
  ): Promise<void> {
    const createdAt = new Date();

    for (let attempt = 0; attempt < MAX_CHAIN_CLAIM_ATTEMPTS; attempt += 1) {
      const head = await client.staffAuditChainHead.findUnique({ where: { id: 1 } });
      if (!head) {
        throw new InternalServerErrorException(
          'staff_audit_chain_head has no seeded row — backend/migrations/0009_audit_hash_chain.sql may not have been applied',
        );
      }
      const prevHash = head.tipHash;
      const hash = computeAuditHash({
        prevHash,
        staffId,
        action,
        resourceType,
        resourceId: resourceId ?? null,
        createdAt,
      });

      const claim = await client.staffAuditChainHead.updateMany({
        where: { id: 1, tipHash: prevHash },
        data: { tipHash: hash },
      });

      if (claim.count === 1) {
        await client.staffAuditLog.create({
          data: { staffId, action, resourceType, resourceId: resourceId ?? null, createdAt, prevHash, hash },
        });
        return;
      }
      // Another concurrent writer claimed the chain head first (its
      // UPDATE committed while this one waited on the row lock, so this
      // one's WHERE clause no longer matches) — back off briefly (see
      // jitterMs's own comment for why this is not merely decorative),
      // then retry against the now-current tip. Never silently drop this
      // audit entry.
      await sleep(jitterMs(attempt));
    }

    throw new InternalServerErrorException(
      'Failed to append to the audit hash chain after repeated concurrent-write conflicts',
    );
  }

  /**
   * Not exposed over HTTP in this slice — no v0.2 API-surface table names
   * an audit-verification endpoint, and adding an unrequested one would
   * be scope this milestone doesn't justify. Exists as a real, callable
   * building block (exercised directly by this domain's own tests,
   * including a real tamper-detection test) for whenever a compliance/
   * break-glass-auditing slice needs it.
   */
  async verifyChainIntegrity(): Promise<ChainVerificationResult> {
    const [rows, head] = await Promise.all([
      this.prisma.staffAuditLog.findMany({
        select: { id: true, staffId: true, action: true, resourceType: true, resourceId: true, createdAt: true, prevHash: true, hash: true },
      }),
      this.prisma.staffAuditChainHead.findUnique({ where: { id: 1 } }),
    ]);
    if (!head) {
      return { valid: false, rowsVerified: 0, totalRows: rows.length, reason: 'no chain-head row found' };
    }
    return verifyChain(rows, head.tipHash);
  }
}
