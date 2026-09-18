-- 0009_audit_hash_chain.sql
-- S11 (Audit hash-chaining) — adds tamper-evidence to S7's existing
-- `staff_audit_log`, per v0.2 §15: "each row stores the hash of the
-- previous row so tampering is detectable."
--
-- ADDITIVE ONLY: two new nullable columns on `staff_audit_log`, plus one
-- new, tiny singleton table (`staff_audit_chain_head`) that tracks the
-- current tip of the chain. No existing column, table, or row is altered.
--
-- WHY A SEPARATE "CHAIN HEAD" TABLE, not just "read the latest
-- staff_audit_log row and chain off it": every prior concurrency-safe
-- write in this codebase (S5's counsellor-caseload claim, S8's lifecycle
-- transition, S9's referral transition) uses the SAME pattern — an atomic
-- conditional `UPDATE ... WHERE <column> = <value this request just
-- read>` — because it is the one pattern already proven safe here against
-- real concurrent Postgres writes. A hash chain has no natural row to
-- run that conditional UPDATE against (each new entry is a fresh INSERT,
-- not an update to an existing row), so this migration introduces one
-- single-row table whose sole purpose is to BE that row: `UPDATE
-- staff_audit_chain_head SET tip_hash = <new> WHERE tip_hash = <expected
-- prev>` is the exact same conditional-claim pattern, reused rather than
-- inventing a new concurrency strategy (e.g. `SELECT ... FOR UPDATE`, an
-- approach not used anywhere else in this codebase). See
-- apps/core-api/src/staff/staff-audit.service.ts for the retry-on-
-- conflict logic this enables.
--
-- GENESIS HASH: a fixed, deterministic, well-known constant —
-- sha256('AAVAZ_AUDIT_CHAIN_GENESIS'), precomputed in Node (matching
-- consent-copy.ts's own SHA-256-in-application-code precedent) rather
-- than computed in SQL via pgcrypto's digest(), since pgcrypto is not
-- enabled anywhere in this repository (confirmed absent from
-- backend/schema.sql) and enabling it would be a new infrastructure
-- dependency this single constant doesn't justify. NOT derived from any
-- real data, NOT random — every fresh deployment's chain starts from the
-- identical genesis value, so two independent deployments' chains are
-- only distinguishable by their actual content, the correct property for
-- a verifiable chain. Recomputable independently:
-- `node -e "console.log(require('crypto').createHash('sha256').update('AAVAZ_AUDIT_CHAIN_GENESIS').digest('hex'))"`
-- also asserted by a dedicated test
-- (apps/core-api/src/staff/audit-chain.spec.ts).

ALTER TABLE staff_audit_log
    ADD COLUMN IF NOT EXISTS prev_hash TEXT,
    ADD COLUMN IF NOT EXISTS hash TEXT;

CREATE TABLE IF NOT EXISTS staff_audit_chain_head (
    id INT PRIMARY KEY DEFAULT 1,
    tip_hash TEXT NOT NULL,
    CONSTRAINT staff_audit_chain_head_singleton CHECK (id = 1)
);

INSERT INTO staff_audit_chain_head (id, tip_hash)
VALUES (1, 'f60ab132aafb26848316d3e8ad3395d0dc40d7a93049d4d84a4145cc01e79171')
ON CONFLICT (id) DO NOTHING;

-- RLS note (same convention as every migration since 0002_otp_codes.sql):
-- enabled with deliberately no permissive policy attached on the new
-- table; the service-role connection bypasses RLS regardless.
ALTER TABLE staff_audit_chain_head ENABLE ROW LEVEL SECURITY;
