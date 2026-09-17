-- 0002_otp_codes.sql
-- S2 (Victim Authentication and Identity) — adds real OTP state storage.
--
-- This is an ADDITIVE migration only: it creates one new table and touches
-- nothing existing. It does not alter, rename, or drop any column or table from
-- backend/schema.sql or scripts/apply_rls.sql.
--
-- Why this is needed: prior to S2, OTP "verification" only checked whether a
-- phone number already existed in `users` — no code was ever generated, sent, or
-- checked (see docs/AAVAZ_IMPLEMENTATION_AUDIT.md). Real OTP issuance needs
-- somewhere to persist a hashed code, its expiry, and its attempt count so it
-- survives across the two separate HTTP requests (request -> verify) and across
-- however many backend worker processes are running.
--
-- Per project instruction, this file is NOT applied automatically or against any
-- production database as part of this change. Apply it the same way
-- backend/schema.sql and scripts/apply_rls.sql are applied today (per README.md:
-- run it in the Supabase SQL editor for the target project) before relying on the
-- OTP endpoints in that environment.
--
-- IMPORTANT: `schema.sql` may not reflect the live database schema exactly (see
-- docs/AAVAZ_IMPLEMENTATION_AUDIT.md §9) — this migration only assumes the
-- `uuid_generate_v4()` extension used elsewhere in schema.sql is already enabled,
-- which it must be for the rest of the app to work at all.

CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- HMAC-SHA256(phone_number, server pepper). Never the raw phone number —
    -- see backend/services/otp_service.py. This is a lookup key for THIS table
    -- only; it does not change how `users.phone_number` itself is stored.
    phone_hash TEXT NOT NULL,

    -- HMAC-SHA256(salt || code, server pepper). The plaintext 6-digit code is
    -- never persisted anywhere, only its salted hash.
    code_hash TEXT NOT NULL,
    salt TEXT NOT NULL,

    -- What this code is for: "login" (existing victim) or "registration"
    -- (new victim completing sign-up). Kept as free text rather than an enum so
    -- this migration doesn't need an ALTER TYPE later if a new purpose is added.
    purpose TEXT NOT NULL DEFAULT 'login',

    -- HMAC-SHA256(requesting IP, server pepper), for per-IP rate limiting.
    -- Nullable because the requesting IP is not always available (e.g. some
    -- deployment/proxy configurations).
    ip_hash TEXT,

    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,

    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup pattern: "most recent unconsumed code for this phone+purpose".
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_purpose_created
    ON otp_codes (phone_hash, purpose, created_at DESC);

-- Rate-limiting lookup patterns (count recent rows per phone / per IP).
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_hash_created
    ON otp_codes (phone_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_codes_ip_hash_created
    ON otp_codes (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;

-- This table is only ever accessed by the backend using the Supabase
-- service-role key (never by a client-side Supabase key), same as every other
-- table in this app today. RLS is enabled anyway as defense-in-depth, with
-- deliberately NO permissive policies attached: the service role bypasses RLS
-- (per Supabase's documented behavior, same note already in
-- scripts/apply_rls.sql), so this changes nothing about how the app functions —
-- it only ensures that if a client-side (anon/authenticated) Supabase key were
-- ever accidentally used against this table, the default is deny, not allow.
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
