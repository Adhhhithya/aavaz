-- 0012_break_glass_grants.sql
-- S15 (Break-glass access foundation) — adds a new, Node-owned
-- `break_glass_grants` table. No FastAPI equivalent exists anywhere in
-- the real schema — net-new capability, per v0.2 §15: "Break-glass:
-- out-of-scope access needs a typed reason, expires in 2 hours, and
-- notifies the supervisor." (Also referenced in §15's access-by-role
-- table: "Case manager: ... Cannot see: Victims outside scope without
-- break-glass.")
--
-- ADDITIVE ONLY: one new table. Does not alter, rename, or drop any
-- existing column or table.
--
-- SCOPE NOTE (see docs/S15_BREAK_GLASS_MIGRATION.md for the full
-- record): this migration and its Node module are the REQUEST/RECORD/
-- NOTIFY half of break-glass only. No existing domain's authorization
-- check (console, lifecycle, referral, task, milestone) is modified in
-- this slice to actually HONOR an active grant — that is a deliberate,
-- separate follow-up (touching five already-tested domains' security
-- logic is not something to rush into the same slice that builds the
-- grant mechanism itself). `BreakGlassService.isActive()` exists as a
-- real, tested building block for that future wiring.
--
-- `reason` is real, staff-typed free text — UNLIKE `staff_audit_log`'s
-- own strict "IDs and codes only" discipline. This is a deliberate,
-- documented exception: a break-glass justification ("victim's sister
-- called in crisis, on-call counsellor unreachable") is inherently
-- human-authored explanation, the same "genuine staff-entered content"
-- category `docs/S9_REFERRAL_MIGRATION.md`/`docs/S13_MILESTONE_MIGRATION.md`
-- already established for other domains' own staff-typed fields — kept
-- on its OWN table, never written into `staff_audit_log.reason`
-- (which stays reserved and NULL for every row, per S7's original
-- design), so the audit log's own "never free text" invariant is not
-- violated by this addition.

CREATE TABLE IF NOT EXISTS break_glass_grants (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id     UUID NOT NULL REFERENCES staff(id),
    case_id      UUID NOT NULL REFERENCES cases(id),
    reason       TEXT NOT NULL,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_break_glass_grants_staff_id ON break_glass_grants(staff_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_grants_case_id ON break_glass_grants(case_id);

-- RLS note (same convention as every migration since 0002_otp_codes.sql):
-- enabled with deliberately no permissive policies attached. The
-- service-role connection this application always uses bypasses RLS
-- regardless. Application-layer authorization
-- (apps/core-api/src/break-glass/break-glass.service.ts) is what
-- actually enforces this domain's own rules — not Postgres RLS.
ALTER TABLE break_glass_grants ENABLE ROW LEVEL SECURITY;
