-- =============================================================================
-- AAVAZ MISSING MIGRATIONS SCRIPT (0002 through 0013)
-- =============================================================================
-- Run this in your Supabase SQL Editor to install all currently missing tables,
-- columns, indexes, and RLS policies.
-- =============================================================================

-- 1. ADD CASELOAD CAP TO COUNSELLORS (0003)
ALTER TABLE counsellors ADD COLUMN IF NOT EXISTS caseload_cap INT NOT NULL DEFAULT 80;

-- 2. OTP STATE TABLE (0002)
CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_hash TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login',
    ip_hash TEXT,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_purpose_created ON otp_codes (phone_hash, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_hash_created ON otp_codes (phone_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_codes_ip_hash_created ON otp_codes (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- 3. CONSENT, VICTIM PROFILE & SAFETY SETTINGS (0004 & 0006)
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    granted BOOLEAN NOT NULL,
    text_version_hash TEXT NOT NULL,
    channel TEXT NOT NULL,
    captured_by TEXT NOT NULL DEFAULT 'self',
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consents_user_scope_captured ON consents (user_id, scope, captured_at DESC);
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS victim_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    relation_type TEXT,
    preferred_channel TEXT,
    safe_windows JSONB,
    safe_to_call BOOLEAN,
    opted_out_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE victim_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS safety_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    duress_pin_hash TEXT,
    disguise_enabled BOOLEAN NOT NULL DEFAULT false,
    safe_word_hash TEXT,
    trusted_contact_name TEXT,
    trusted_contact_phone TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE safety_settings ENABLE ROW LEVEL SECURITY;

-- 4. CASES LIFECYCLE FIELDS (0006)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'REGISTERED';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lifecycle_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 5. STAFF & CONSOLE TABLES (0005 & 0009)
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    counsellor_id UUID REFERENCES counsellors(id) ON DELETE SET NULL,
    role TEXT NOT NULL,
    org_id TEXT,
    district_scope TEXT[] NOT NULL DEFAULT '{}',
    languages TEXT[] NOT NULL DEFAULT '{}',
    caseload_cap INT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff (user_id);
CREATE INDEX IF NOT EXISTS idx_staff_counsellor_id ON staff (counsellor_id);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff (role);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    reason TEXT,
    prev_hash TEXT,
    hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_audit_log_staff_created ON staff_audit_log (staff_id, created_at DESC);
ALTER TABLE staff_audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_audit_chain_head (
    id INT PRIMARY KEY DEFAULT 1,
    tip_hash TEXT NOT NULL,
    CONSTRAINT staff_audit_chain_head_singleton CHECK (id = 1)
);

INSERT INTO staff_audit_chain_head (id, tip_hash)
VALUES (1, 'f60ab132aafb26848316d3e8ad3395d0dc40d7a93049d4d84a4145cc01e79171')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE staff_audit_chain_head ENABLE ROW LEVEL SECURITY;

-- 6. REFERRALS TABLE (0007, 0008, 0013)
CREATE TABLE IF NOT EXISTS referrals (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id                UUID NOT NULL REFERENCES cases(id),
    user_id                UUID NOT NULL REFERENCES users(id),
    destination_type       TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'DRAFTED',
    packet_data            JSONB NOT NULL,
    created_by_staff_id    UUID NOT NULL REFERENCES staff(id),
    attempt_count          INT NOT NULL DEFAULT 0,
    idempotency_key        TEXT,
    sent_at                TIMESTAMPTZ,
    ack_due_at             TIMESTAMPTZ,
    acked_at               TIMESTAMPTZ,
    service_due_at         TIMESTAMPTZ,
    in_service_at          TIMESTAMPTZ,
    delivered_at           TIMESTAMPTZ,
    verified_at            TIMESTAMPTZ,
    ack_token_hash         TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_case_id ON referrals(case_id);
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_ack_token_hash ON referrals(ack_token_hash);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- 7. TASKS TABLE (0010)
CREATE TABLE IF NOT EXISTS tasks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES users(id),
    case_id             UUID REFERENCES cases(id),
    referral_id         UUID REFERENCES referrals(id),
    type                TEXT NOT NULL,
    priority            TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'OPEN',
    assignee_staff_id   UUID REFERENCES staff(id),
    created_by_staff_id UUID REFERENCES staff(id),
    sla_due_at          TIMESTAMPTZ,
    acked_at            TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_case_id ON tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_referral_id ON tasks(referral_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_staff_id ON tasks(assignee_staff_id);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 8. MILESTONES TABLE (0011)
CREATE TABLE IF NOT EXISTS milestones (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id              UUID NOT NULL REFERENCES cases(id),
    type                 TEXT NOT NULL,
    due_at               TIMESTAMPTZ,
    met_at               TIMESTAMPTZ,
    entered_by_staff_id  UUID NOT NULL REFERENCES staff(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_case_id ON milestones(case_id);
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

-- 9. BREAK GLASS GRANTS TABLE (0012)
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
ALTER TABLE break_glass_grants ENABLE ROW LEVEL SECURITY;
