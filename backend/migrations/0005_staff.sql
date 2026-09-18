-- 0005_staff.sql
-- S7 (Staff + Console Authorization Foundation) — adds two new,
-- Node-owned tables: `staff` and `staff_audit_log`.
--
-- This is an ADDITIVE migration only: it creates two new tables and
-- touches nothing existing. It does not alter, rename, or drop any column
-- or table from backend/schema.sql or any prior migration (0002-0004).
--
-- See docs/S7_STAFF_CONSOLE_AUDIT.md (the read-only pre-implementation
-- audit) and docs/S7_STAFF_CONSOLE_MIGRATION.md (this implementation's own
-- record) for the full trace and rationale. Summary of the two locked
-- decisions this migration implements:
--
-- DECISION 1 — STAFF IDENTITY. The audit found two pre-existing,
-- structurally unlinked concepts both loosely called "counsellor": (a)
-- `users` rows with a staff-shaped `role_type` (authentication), and (b)
-- the `counsellors` table (a pure assignment-target record with no login
-- capability, used by auto_assign.py / assignment.service.ts). Neither
-- alone is v0.2's `staff` table, and nothing anywhere links them. This
-- migration does NOT replace or duplicate `counsellors`. It adds `staff`
-- as an explicit BRIDGE: `staff.user_id` -> `users.id` (the authenticated
-- identity) and `staff.counsellor_id` -> `counsellors.id` (the existing
-- assignment identity, NULLABLE — only set "where applicable", i.e. for
-- staff whose role actually carries a caseload). The invariant this
-- enforces: authenticated user -> staff identity -> existing counsellor
-- identity, never a direct users.id-to-counsellors.id comparison anywhere
-- in application code (see apps/core-api/src/staff/).
--
-- `role` is a NEW, free-TEXT column on `staff` — NOT a reuse of
-- `users.role_type_enum`. The audit independently re-confirmed (a third
-- time, via real introspection) that `role_type_enum`'s only members are
-- `victim`, `witness`, `family` — the staff-shaped values
-- (`counsellor`/`district_admin`/`state_admin`/`national_admin`/
-- `supervisor`) used by `backend/api/auth/dependencies.py`'s `STAFF_ROLES`
-- (and this migration's own `role` column) are NOT members of that enum.
-- Reusing `role_type_enum` for staff would therefore require altering a
-- type also used by victim identity rows, a materially larger and riskier
-- change than this slice calls for. `role` is free TEXT instead — the
-- exact same choice, for the exact same reason, already made for
-- `otp_codes.purpose` (0002) and `consents.scope` (0004): avoids an
-- `ALTER TYPE`, application-layer validation
-- (apps/core-api/src/staff/staff-roles.ts) is the actual enforcement point
-- either way.
--
-- NO HISTORICAL DATA IS FABRICATED. This migration creates the `staff`
-- table EMPTY. It does not attempt to backfill or infer a mapping between
-- any existing `users` row and any existing `counsellors` row — the audit
-- found no authoritative evidence anywhere in the repository for what that
-- mapping should be (no shared id, no matching name/phone convention, no
-- seed script that ever created both halves of a real pair). Any such
-- inference would be a fabricated link, which is explicitly prohibited.
-- Existing rows remain unmapped until a real, evidenced mapping is
-- established by a future, explicit action — not by this migration.
--
-- DECISION 2 — RLS. `ENABLE ROW LEVEL SECURITY` is set below with
-- deliberately NO permissive policies, identical to the defense-in-depth
-- pattern already used for `otp_codes`/`consents`/`victim_profiles`/
-- `safety_settings`. This is NOT v0.2's district-scoped RLS model
-- (`current_setting('app.district_scope')`) — the audit found the current
-- Prisma connection/pooling design cannot safely support session-scoped
-- district context yet (no per-request `SET LOCAL` inside an atomic
-- transaction exists anywhere in this codebase). District-scope,
-- role, and case-ownership enforcement for S7 are implemented entirely at
-- the APPLICATION layer (apps/core-api/src/console/console.service.ts),
-- exactly like victim-ownership enforcement already is for every
-- Node-owned table since S4. Real Postgres RLS remains explicitly
-- deferred, not faked.

CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- The bridge to the authenticated identity. UNIQUE: exactly one staff
    -- row per user — this is what makes "staff identity mapping is unique
    -- and deterministic" true by construction, not merely by convention.
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    -- The bridge to the existing assignment identity. NULLABLE: only
    -- roles that actually carry an assignable caseload (today: the
    -- `counsellor` role) are expected to have this set. A district/state/
    -- national admin or supervisor role is not required to have a
    -- `counsellors` row at all.
    counsellor_id UUID REFERENCES counsellors(id) ON DELETE SET NULL,

    -- Free TEXT, not an enum — see the file header note above. Validated
    -- at the application layer against a small, explicit allow-list
    -- (apps/core-api/src/staff/staff-roles.ts).
    role TEXT NOT NULL,

    -- v0.2 §12 requires `org_id` on `staff`. No product decision exists
    -- yet on what an "org" is in this codebase (there is no `orgs` table
    -- anywhere), so this is a nullable placeholder column, populated by
    -- nothing in this slice — present in the schema (closing the
    -- structural gap) without fabricating a value or a concept that
    -- doesn't exist yet.
    org_id TEXT,

    -- v0.2 §12: "district_scope (text[])" — an array, since a staff member
    -- can cover multiple districts. Defaults to an empty array (no scope
    -- granted) rather than NULL, so application-layer checks never need a
    -- null-handling special case — an empty array simply authorizes
    -- nothing, which is the correct fail-closed default for a newly
    -- created staff row.
    district_scope TEXT[] NOT NULL DEFAULT '{}',

    -- v0.2 §12: "languages" — mirrors counsellors.languages in shape, but
    -- lives on `staff` because not every staff role has (or should be
    -- required to have) a linked `counsellors` row.
    languages TEXT[] NOT NULL DEFAULT '{}',

    -- v0.2 §12: "caseload_cap". Deliberately independent of
    -- `counsellors.caseload_cap` (S5) — that column is read by
    -- AssignmentService's auto-assignment algorithm and this slice does
    -- not change its meaning or its callers. This column is a separate,
    -- oversight-facing declared value; nullable since it is only
    -- meaningful for caseload-carrying roles.
    caseload_cap INT,

    -- v0.2 §12: "on_call_schedule". No format is specified by v0.2 beyond
    -- the column's existence; stored as JSONB, populated by nothing in
    -- this slice.
    on_call_schedule JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_counsellor_id
    ON staff (counsellor_id) WHERE counsellor_id IS NOT NULL;

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Minimal, append-only audit hook for staff authorization-sensitive reads
-- — NOT v0.2's full §12 `audit_log` table and NOT its hash-chain/WORM
-- design (no `prev_hash`/`hash` columns are included here; adding empty or
-- placeholder hash columns would itself be a false claim of tamper-evidence
-- that doesn't exist yet). This table only ever stores IDs and short
-- action/resource-type codes — see
-- apps/core-api/src/staff/staff-audit.service.ts, which is the only writer
-- and is structurally incapable of accepting free-text victim content
-- (no such parameter exists on its interface).
CREATE TABLE IF NOT EXISTS staff_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,

    -- e.g. 'console.queue.read', 'console.victim.read' — short codes, never
    -- free text.
    action TEXT NOT NULL,

    -- e.g. 'victim', 'queue' — what kind of resource was read.
    resource_type TEXT NOT NULL,

    -- The id of the resource read (e.g. the victim's user id), NOT its
    -- content. Nullable for actions with no single-resource target (e.g. a
    -- queue listing).
    resource_id UUID,

    -- Reserved for a future break-glass/typed-reason flow (v0.2 §15) — not
    -- implemented in this slice, always NULL for every row this slice's
    -- code writes.
    reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_audit_log_staff_created
    ON staff_audit_log (staff_id, created_at DESC);

ALTER TABLE staff_audit_log ENABLE ROW LEVEL SECURITY;
