-- 0004_consent_profile_safety.sql
-- S6 (Consent + Profile + Safety domain extraction) — adds three new,
-- Node-owned tables.
--
-- This is an ADDITIVE migration only: it creates three new tables and
-- touches nothing existing. It does not alter, rename, or drop any column
-- or table from backend/schema.sql or any prior migration
-- (0002_otp_codes.sql, 0003_counsellor_caseload_cap.sql).
--
-- Why this is needed: prior to S6, "consent" in this codebase meant a
-- single `users.consent_given` boolean with no scope, no captured text/
-- version, and no audit trail — and "profile"/"safety settings" (relation
-- to case, preferred contact channel, safe contact windows, app disguise,
-- duress PIN, trusted contact, safe word) did not exist anywhere at all.
-- See docs/S6_ONBOARDING_MIGRATION.md for the full trace and the v0.2
-- (docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf, Workflow A steps A2/A3/A5)
-- comparison.
--
-- Per project instruction (same as 0002/0003), this file is NOT applied
-- automatically or against any production database as part of this change.
-- Apply it the same way the prior migrations are applied (per README.md:
-- run it in the Supabase SQL editor for the target project) before relying
-- on these Node endpoints in that environment.
--
-- Design notes (see docs/S6_ONBOARDING_MIGRATION.md for full rationale):
--   * All three tables reference `users(id)` — the existing, real victim
--     row (Node already owns this table as of S4) — not a new, separate
--     "victim" identity. `ON DELETE CASCADE` is used throughout so a future
--     purge/opt-out workflow (not implemented in this slice) is never
--     blocked by an orphaned row in one of these tables.
--   * `consents` is APPEND-ONLY: v0.2 says "each grant writes a row", so
--     every grant/revoke is a new row, giving a full history. The current
--     state for a given (user, scope) is the most recent row.
--   * `scope` and `channel` are free TEXT, not Postgres enums — the exact
--     same choice already made for `otp_codes.purpose` in
--     0002_otp_codes.sql, and for the exact same reason (documented there):
--     avoids an `ALTER TYPE` migration if a scope/channel value is ever
--     added, and application-layer validation (NestJS DTOs) is the actual
--     enforcement point either way.
--   * `safety_settings.trusted_contact_name` / `_phone` are PLAIN TEXT, not
--     `_enc` as v0.2's data model names them (`trusted_contact_enc`). This
--     is a deliberate, documented gap, not an oversight: this codebase has
--     no KMS-backed, per-victim envelope encryption anywhere yet (a known
--     v0.2 gap already recorded in docs/AAVAZ_MIGRATION_PLAN.md §7), and
--     naming the column as if it were encrypted when it is not would be
--     exactly the kind of false claim CLAUDE.md's rules prohibit. This is
--     consistent with the existing, unencrypted storage of
--     `users.phone_number` — not a new regression.

CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- One of: monitoring, store_transcripts, voice_recording,
    -- share_mental_health, share_legal_aid, share_welfare, share_protection
    -- (docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf Workflow A2). Enforced at
    -- the application layer (apps/core-api/src/consent/consent-copy.ts),
    -- not a DB constraint — see the file header note on `otp_codes.purpose`.
    scope TEXT NOT NULL,

    granted BOOLEAN NOT NULL,

    -- SHA-256 hash of the exact consent copy text+version shown to the
    -- victim at capture time, resolved SERVER-SIDE from
    -- apps/core-api/src/consent/consent-copy.ts — never accepted from the
    -- client. See docs/S6_ONBOARDING_MIGRATION.md Phase 4.
    text_version_hash TEXT NOT NULL,

    -- What channel this specific grant was captured over (e.g. "app",
    -- "web", "ivr", "sms") — a distinct concept from the existing
    -- `channel_enum` (case interaction channel), so not reused; see this
    -- file's header note.
    channel TEXT NOT NULL,

    -- 'self' (victim captured their own consent) or a staff/case-manager
    -- identifier for assisted onboarding. Only 'self' is produced by this
    -- slice's code — assisted-onboarding consent capture is not
    -- implemented yet.
    captured_by TEXT NOT NULL DEFAULT 'self',

    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup pattern: "the most recent grant for this user+scope"
-- (i.e. current consent state), same shape as otp_codes' own
-- most-recent-row index.
CREATE INDEX IF NOT EXISTS idx_consents_user_scope_captured
    ON consents (user_id, scope, captured_at DESC);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

-- 1:1 extension of `users` for victim profile/preference fields that are
-- genuinely new in this slice. Deliberately does NOT duplicate
-- name/preferred_language/location_district, which already exist on
-- `users` and are identity/registration-owned (S4/S5) — see
-- docs/S6_ONBOARDING_MIGRATION.md Phase 5 for why those are not
-- re-modeled here.
CREATE TABLE IF NOT EXISTS victim_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- v0.2's "relation to case (survivor or family member)" — a narrower,
    -- profile-specific concept than the existing broader
    -- users.role_type_enum (victim/witness/family), which is an
    -- identity/registration-time field and is left untouched. Free TEXT,
    -- same enum-avoidance reasoning as `consents.scope`.
    relation_type TEXT,

    -- e.g. "app", "web", "ivr", "sms" — free TEXT, same reasoning.
    preferred_channel TEXT,

    -- v0.2: "safe contact windows (for example weekdays 11:00-13:00)".
    -- Stored as-is (an array of {day, start, end}-shaped objects); no
    -- attempt is made to validate real-world time semantics beyond basic
    -- shape in this slice.
    safe_windows JSONB,

    -- v0.2: "whether calls are safe at all".
    safe_to_call BOOLEAN,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE victim_profiles ENABLE ROW LEVEL SECURITY;

-- 1:1 extension of `users` for the v0.2 A5 safety-setup fields that
-- currently exist nowhere in this codebase.
CREATE TABLE IF NOT EXISTS safety_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Argon2id hash, never plaintext. Verified server-side only
    -- (apps/core-api/src/safety/safety.service.ts). v0.2 also requires this
    -- to "differ from the login PIN" — this codebase has no PIN-based login
    -- mechanism at all (only phone+OTP), so that specific constraint is not
    -- enforceable and is documented as a gap, not silently skipped.
    duress_pin_hash TEXT,

    disguise_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Argon2id hash, matching the v0.2 data model's own `safe_word_hash`
    -- column name — never plaintext, same handling as the duress PIN.
    safe_word_hash TEXT,

    -- PLAIN TEXT, not `_enc` — see this file's header note.
    trusted_contact_name TEXT,
    trusted_contact_phone TEXT,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE safety_settings ENABLE ROW LEVEL SECURITY;

-- RLS note (applies to all three tables above, same as
-- 0002_otp_codes.sql's own note): these tables are only ever accessed by
-- Node using a service-role-equivalent connection, never a client-side key,
-- and RLS is enabled with deliberately NO permissive policies attached —
-- the service role bypasses RLS, so this changes nothing about how Node's
-- consent/profile/safety modules function today. It is defense-in-depth
-- only: if a client-side key were ever accidentally used against these
-- tables, the default is deny, not allow. This is NOT the v0.2
-- district-scoped RLS model (docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf
-- §12's `app.district_scope`/`district_code` pattern) — these tables carry
-- no `district_code` column and no district-scoped policy exists.
-- Victim-level ownership (a victim can only read/write their own row) is
-- enforced entirely at the application layer (VictimAuthGuard + querying by
-- the authenticated victim's own id), not by Postgres RLS. See
-- docs/S6_ONBOARDING_MIGRATION.md Phase 7 for the full, honest account of
-- what is and is not implemented.
