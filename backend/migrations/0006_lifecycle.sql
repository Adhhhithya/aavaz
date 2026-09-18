-- 0006_lifecycle.sql
-- S8 (Case/victim lifecycle foundation) — adds a Node-owned lifecycle
-- state to the existing `cases` table, and a minimal victim-level
-- opt-out marker to the existing `victim_profiles` table (S6).
--
-- This is an ADDITIVE migration only: it adds three nullable-or-defaulted
-- columns to two existing tables. It does not alter, rename, or drop any
-- existing column or table from backend/schema.sql or any prior migration
-- (0002-0005). No row is fabricated: the DEFAULT value backfilled onto
-- existing `cases` rows by this ALTER TABLE is a genuine, uncontroversial
-- starting state (every existing case really did go through registration),
-- not an invented fact about any individual case.
--
-- See docs/S8_DEPENDENCY_AUDIT.md (the read-only pre-implementation audit)
-- and docs/S8_LIFECYCLE_MIGRATION.md (this implementation's own record)
-- for the full trace, the transition-matrix reconstruction methodology,
-- and the reasoning below.
--
-- DATA OWNERSHIP DECISION (see docs/S8_LIFECYCLE_MIGRATION.md section B):
-- `cases.case_stage` (schema.sql's `case_stage_enum`, 6 values:
-- registered/investigation/trial/compensation/rehabilitation/closed) is
-- NOT reused or extended for this purpose. It remains exactly what it has
-- always been — a litigation/case-processing stage, still written by
-- FastAPI's `backend/api/cases/lifecycle_routes.py` with no validation
-- (a known, documented, UNCHANGED gap — see the migration doc's
-- "Known cutover gap" section). v0.2's OWN data model (§12) already
-- treats `victims.lifecycle_state` and `cases.stage` as two DIFFERENT
-- columns for two DIFFERENT concepts (a victim-wide support-workflow
-- state vs. a case-specific litigation stage) — adding a NEW
-- `lifecycle_state` column here is therefore not a duplicate of
-- `case_stage`, it is the missing SECOND concept v0.2 itself already
-- distinguishes. This column is physically placed on `cases` (not a new
-- `victims`-shaped table) because S5 already owns case creation and S7's
-- authorization pattern (staff.counsellorId / staff.districtScope) is
-- already keyed off `cases`, not `users` — placing it here reuses that
-- proven ownership/authorization boundary instead of inventing a second
-- one for a new table, which Phase-level instruction explicitly warned
-- against ("do not create a second case table").
--
-- `lifecycle_state` is free TEXT, not a new Postgres enum — the same
-- choice, for the same reason, already made repeatedly in this codebase
-- (`otp_codes.purpose`, `consents.scope`, `staff.role`): avoids an
-- `ALTER TYPE` on a column type shared with other code, and application-
-- layer validation (apps/core-api/src/lifecycle/lifecycle-states.ts) is
-- the actual enforcement point either way. It is NOT the same column as
-- `case_stage`, and no code in this slice reads or writes `case_stage`.

ALTER TABLE cases
    ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'REGISTERED';

ALTER TABLE cases
    ADD COLUMN IF NOT EXISTS lifecycle_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Minimal victim-level opt-out foundation (S8 scope item 7). Distinct from
-- a case's own `lifecycle_state` reaching 'OPTED_OUT': this records that
-- THE VICTIM (not just one case) has opted out, matching v0.2's own
-- victim-level placement of this concept. Nullable — NULL means "has not
-- opted out"; a real timestamp means "opted out at this time." No
-- scheduling-cancellation, purge, or event-integration behavior is
-- implemented against this column in this slice — see
-- docs/S8_LIFECYCLE_MIGRATION.md section K for why those remain future
-- work, not silently treated as done.
ALTER TABLE victim_profiles
    ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

-- RLS note (applies to the columns above, same as every migration since
-- 0002_otp_codes.sql): `cases` and `victim_profiles` already have RLS
-- enabled with deliberately no permissive policies attached (set by
-- schema.sql / 0004_consent_profile_safety.sql respectively) — adding a
-- column does not change that. The service-role connection this
-- application always uses bypasses RLS regardless. Application-layer
-- authorization (apps/core-api/src/lifecycle/lifecycle.service.ts, reusing
-- S7's staff/district/assignment pattern) is what actually enforces who
-- may transition a case's lifecycle — not Postgres RLS. See
-- docs/S8_DEPENDENCY_AUDIT.md section H and
-- docs/S7_STAFF_CONSOLE_MIGRATION.md's RLS-deferral section for the full
-- reasoning; nothing about that deferral changes in this slice.
