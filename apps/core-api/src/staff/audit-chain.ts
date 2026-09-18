import * as crypto from 'crypto';

/**
 * S11 — tamper-evident hash chaining for `staff_audit_log` (v0.2 §15:
 * "each row stores the hash of the previous row so tampering is
 * detectable"). See backend/migrations/0009_audit_hash_chain.sql's header
 * for the genesis-hash and chain-head-table design reasoning, and
 * staff-audit.service.ts for how this module is used inside a
 * concurrency-safe claim-and-retry write path.
 */

export const AUDIT_CHAIN_GENESIS_HASH = crypto
  .createHash('sha256')
  .update('AAVAZ_AUDIT_CHAIN_GENESIS')
  .digest('hex');

export interface AuditHashInput {
  prevHash: string;
  staffId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: Date;
}

/** Deterministic, order-sensitive — every field that identifies WHAT
 * happened and WHEN is included; nothing that could carry victim content
 * ever is (the same "IDs and codes only" discipline the audit log itself
 * already enforces at the type level, see StaffAuditAction/
 * StaffAuditResourceType). */
export function computeAuditHash(input: AuditHashInput): string {
  const canonical = [
    input.prevHash,
    input.staffId,
    input.action,
    input.resourceType,
    input.resourceId ?? '',
    input.createdAt.toISOString(),
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export interface AuditChainRow {
  id: string;
  staffId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: Date;
  prevHash: string | null;
  hash: string | null;
}

export interface ChainVerificationResult {
  valid: boolean;
  rowsVerified: number;
  totalRows: number;
  brokenRowId?: string;
  reason?: string;
}

/**
 * Verifies the chain by following hash POINTERS, starting from the fixed
 * genesis value, not by trusting `createdAt` ordering or row-insertion
 * order — the same principle any tamper-evident log verification uses.
 * A row's real position in the chain is entirely determined by which
 * other row's `hash` equals its own `prevHash`; two rows sharing a
 * `createdAt` (or being returned from the database in any particular
 * order) cannot affect the result.
 *
 * Detects, distinctly: a row whose stored `hash` doesn't match what its
 * own content recomputes to (content was modified after writing), a
 * "fork" (two rows claiming the same `prevHash` — should be
 * cryptographically near-impossible to occur legitimately, since
 * `prevHash` is itself only advanced by a successful, serialized claim of
 * the chain head), an orphaned row (its `prevHash` doesn't lead back to
 * genesis through any other verified row — e.g. a deleted row broke the
 * link), and a chain whose reconstructed end doesn't match the currently
 * stored chain-head tip (e.g. a row was deleted from the end).
 *
 * A row written before this migration (`prevHash`/`hash` both NULL) is
 * reported as broken rather than silently skipped — this module never
 * claims a chain is intact by quietly excluding rows it can't verify.
 */
export function verifyChain(rows: AuditChainRow[], currentTipHash: string): ChainVerificationResult {
  const byPrevHash = new Map<string, AuditChainRow>();
  for (const row of rows) {
    if (row.prevHash === null || row.hash === null) {
      return {
        valid: false,
        rowsVerified: 0,
        totalRows: rows.length,
        brokenRowId: row.id,
        reason: 'row predates hash-chaining (null prevHash/hash)',
      };
    }
    if (byPrevHash.has(row.prevHash)) {
      return {
        valid: false,
        rowsVerified: 0,
        totalRows: rows.length,
        brokenRowId: row.id,
        reason: 'fork detected: two rows claim the same prevHash',
      };
    }
    byPrevHash.set(row.prevHash, row);
  }

  let cursor = AUDIT_CHAIN_GENESIS_HASH;
  let verified = 0;
  while (byPrevHash.has(cursor)) {
    const row = byPrevHash.get(cursor)!;
    const recomputed = computeAuditHash({
      prevHash: row.prevHash!,
      staffId: row.staffId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      createdAt: row.createdAt,
    });
    if (recomputed !== row.hash) {
      return {
        valid: false,
        rowsVerified: verified,
        totalRows: rows.length,
        brokenRowId: row.id,
        reason: 'stored hash does not match recomputed hash — row content was modified',
      };
    }
    byPrevHash.delete(cursor);
    cursor = row.hash!;
    verified += 1;
  }

  if (byPrevHash.size > 0) {
    const orphan = [...byPrevHash.values()][0];
    return {
      valid: false,
      rowsVerified: verified,
      totalRows: rows.length,
      brokenRowId: orphan.id,
      reason: 'orphaned row: its prevHash does not chain from genesis through any verified row',
    };
  }

  if (cursor !== currentTipHash) {
    return {
      valid: false,
      rowsVerified: verified,
      totalRows: rows.length,
      reason: 'chain end does not match the stored chain-head tip — a row may have been deleted from the end',
    };
  }

  return { valid: true, rowsVerified: verified, totalRows: rows.length };
}
