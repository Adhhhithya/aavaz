-- =============================================================================
-- AAVAZ COMPLETE UNIFIED DATABASE MIGRATION SCRIPT
-- =============================================================================
-- Run this single file in your Supabase SQL Editor.
-- This script is 100% IDEMPOTENT:
--   * It checks for existing types, tables, columns, indexes, and policies.
--   * Safe to run on a fresh database OR on an already partially-migrated database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- 2. ENUMS (Created safely via DO blocks to prevent duplicate type errors)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_type_enum') THEN
        CREATE TYPE role_type_enum AS ENUM ('victim', 'witness', 'family');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lang_enum') THEN
        CREATE TYPE lang_enum AS ENUM ('hi', 'ta', 'ml', 'en');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_source_enum') THEN
        CREATE TYPE location_source_enum AS ENUM ('ivr', 'sms', 'app');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intake_channel_enum') THEN
        CREATE TYPE intake_channel_enum AS ENUM ('nhaa_sim', 'fir_sim', 'ivr', 'app', 'sms', 'chatbot');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_stage_enum') THEN
        CREATE TYPE case_stage_enum AS ENUM ('registered', 'investigation', 'trial', 'compensation', 'rehabilitation', 'closed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channel_enum') THEN
        CREATE TYPE channel_enum AS ENUM ('ivr', 'sms', 'chatbot', 'app');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'emotion_tag_enum') THEN
        CREATE TYPE emotion_tag_enum AS ENUM ('fear', 'anger', 'sadness', 'hopelessness', 'neutral');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'update_source_enum') THEN
        CREATE TYPE update_source_enum AS ENUM ('manual', 'simulated_cctns', 'simulated_ecourts');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resolved_by_enum') THEN
        CREATE TYPE resolved_by_enum AS ENUM ('user', 'counsellor');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. BASE TABLES (schema.sql)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role_type role_type_enum NOT NULL,
    preferred_language lang_enum NOT NULL,
    consent_given BOOLEAN DEFAULT false,
    consent_timestamp TIMESTAMPTZ,
    location_district TEXT,
    location_state TEXT,
    location_source location_source_enum,
    location_lat FLOAT,
    location_lng FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS counsellors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    languages TEXT[] NOT NULL,
    current_caseload INT DEFAULT 0,
    caseload_cap INT NOT NULL DEFAULT 80
);

CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    case_type TEXT NOT NULL,
    intake_channel intake_channel_enum NOT NULL,
    case_stage case_stage_enum DEFAULT 'registered',
    assigned_counsellor_id UUID REFERENCES counsellors(id) ON DELETE SET NULL,
    current_distress_score FLOAT DEFAULT 0.0,
    priority_rank INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    channel channel_enum NOT NULL,
    acoustic_score FLOAT,
    sentiment_score FLOAT NOT NULL,
    emotion_tag emotion_tag_enum NOT NULL,
    engagement_score FLOAT NOT NULL,
    history_score FLOAT NOT NULL,
    final_score FLOAT NOT NULL,
    score_breakdown JSONB NOT NULL,
    transcript_ref TEXT,
    audio_ref TEXT,
    intervention_recommended TEXT
);

CREATE TABLE IF NOT EXISTS case_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    previous_stage TEXT NOT NULL,
    new_stage TEXT NOT NULL,
    update_source update_source_enum NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS sos_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    location_lat FLOAT NOT NULL,
    location_lng FLOAT NOT NULL,
    assigned_counsellor_id UUID REFERENCES counsellors(id) ON DELETE SET NULL,
    escalated BOOLEAN DEFAULT false,
    escalated_at TIMESTAMPTZ,
    escalated_to_counsellor_id UUID REFERENCES counsellors(id) ON DELETE SET NULL,
    resolved BOOLEAN DEFAULT false,
    resolved_by resolved_by_enum,
    resolved_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 4. IDENTITY, ONBOARDING & SAFETY TABLES (0002, 0004)
-- -----------------------------------------------------------------------------

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

CREATE TABLE IF NOT EXISTS victim_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    relation_type TEXT,
    preferred_channel TEXT,
    safe_windows JSONB,
    safe_to_call BOOLEAN,
    opted_out_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    duress_pin_hash TEXT,
    disguise_enabled BOOLEAN NOT NULL DEFAULT false,
    safe_word_hash TEXT,
    trusted_contact_name TEXT,
    trusted_contact_phone TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. STAFF & CONSOLE TABLES (0005, 0009)
-- -----------------------------------------------------------------------------

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

CREATE TABLE IF NOT EXISTS staff_audit_chain_head (
    id INT PRIMARY KEY DEFAULT 1,
    tip_hash TEXT NOT NULL,
    CONSTRAINT staff_audit_chain_head_singleton CHECK (id = 1)
);

INSERT INTO staff_audit_chain_head (id, tip_hash)
VALUES (1, 'f60ab132aafb26848316d3e8ad3395d0dc40d7a93049d4d84a4145cc01e79171')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. REFERRALS, TASKS, MILESTONES & BREAK-GLASS (0007, 0008, 0010, 0011, 0012, 0013)
-- -----------------------------------------------------------------------------

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

CREATE TABLE IF NOT EXISTS break_glass_grants (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id     UUID NOT NULL REFERENCES staff(id),
    case_id      UUID NOT NULL REFERENCES cases(id),
    reason       TEXT NOT NULL,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. VECTOR MEMORY & LEGAL RAG TABLES (004)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS victim_memory (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    victim_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    memory_type     TEXT NOT NULL CHECK (memory_type IN (
                        'IDENTITY','INCIDENT','EMOTIONAL_STATE','SAFETY_RISK',
                        'PREVIOUS_ACTION','LEGAL_CONTEXT','PREFERENCE','FOLLOW_UP'
                    )),
    content         TEXT NOT NULL,
    metadata        JSONB DEFAULT '{}',
    embedding       VECTOR(1024),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legal_documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source       TEXT NOT NULL,
    title        TEXT NOT NULL,
    category     TEXT NOT NULL CHECK (category IN (
                     'compensation','legal_procedure','welfare_scheme',
                     'legal_rights','emergency_contact','rehabilitation'
                 )),
    jurisdiction TEXT NOT NULL DEFAULT 'IN',
    language     TEXT NOT NULL DEFAULT 'en',
    content      TEXT NOT NULL,
    metadata     JSONB DEFAULT '{}',
    embedding    VECTOR(1024),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8. SCHEDULED CALLS TABLE (005)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scheduled_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_id         TEXT,
    status          TEXT NOT NULL DEFAULT 'dispatched',
    reason          TEXT DEFAULT '',
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_seconds FLOAT,
    UNIQUE (case_id, attempted_at)
);

-- -----------------------------------------------------------------------------
-- 9. ADDITIVE COLUMNS (Ensures existing tables have all latest fields)
-- -----------------------------------------------------------------------------
ALTER TABLE counsellors ADD COLUMN IF NOT EXISTS caseload_cap INT NOT NULL DEFAULT 80;

ALTER TABLE cases ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'REGISTERED';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS lifecycle_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMPTZ;

ALTER TABLE victim_profiles ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS in_service_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ack_token_hash TEXT;

ALTER TABLE staff_audit_log ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE staff_audit_log ADD COLUMN IF NOT EXISTS hash TEXT;

-- -----------------------------------------------------------------------------
-- 10. INDEXES (All idempotent)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_location_district ON users(location_district);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_counsellor_id ON cases(assigned_counsellor_id);
CREATE INDEX IF NOT EXISTS idx_cases_case_stage ON cases(case_stage);
CREATE INDEX IF NOT EXISTS idx_cases_current_distress_score ON cases(current_distress_score);
CREATE INDEX IF NOT EXISTS idx_interactions_case_id_timestamp ON interactions(case_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sos_events_resolved_false ON sos_events(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_counsellors_district_caseload ON counsellors(district, current_caseload);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_purpose_created ON otp_codes (phone_hash, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_hash_created ON otp_codes (phone_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_codes_ip_hash_created ON otp_codes (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consents_user_scope_captured ON consents (user_id, scope, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff (user_id);
CREATE INDEX IF NOT EXISTS idx_staff_counsellor_id ON staff (counsellor_id);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff (role);
CREATE INDEX IF NOT EXISTS idx_staff_audit_log_staff_created ON staff_audit_log (staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_case_id ON referrals(case_id);
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_ack_token_hash ON referrals(ack_token_hash);

CREATE INDEX IF NOT EXISTS idx_tasks_case_id ON tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_referral_id ON tasks(referral_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_staff_id ON tasks(assignee_staff_id);

CREATE INDEX IF NOT EXISTS idx_milestones_case_id ON milestones(case_id);

CREATE INDEX IF NOT EXISTS idx_break_glass_grants_staff_id ON break_glass_grants(staff_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_grants_case_id ON break_glass_grants(case_id);

CREATE INDEX IF NOT EXISTS idx_victim_memory_victim_id ON victim_memory (victim_id);
CREATE INDEX IF NOT EXISTS idx_victim_memory_type ON victim_memory (victim_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_legal_documents_category ON legal_documents (category);
CREATE INDEX IF NOT EXISTS idx_legal_documents_jurisdiction ON legal_documents (jurisdiction, category);

CREATE INDEX IF NOT EXISTS idx_scheduled_calls_case_id ON scheduled_calls (case_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_user_id ON scheduled_calls (user_id, attempted_at DESC);

-- Vector IVFFlat Indexes (Cosine distance)
CREATE INDEX IF NOT EXISTS idx_victim_memory_embedding
    ON victim_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_legal_documents_embedding
    ON legal_documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- -----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) & POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE counsellors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE victim_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_audit_chain_head ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_glass_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_calls ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Victims can view own cases" ON cases;
CREATE POLICY "Victims can view own cases" ON cases FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Counsellors can view assigned cases" ON cases;
CREATE POLICY "Counsellors can view assigned cases" ON cases FOR SELECT USING (
    auth.uid() = assigned_counsellor_id
    OR auth.jwt() ->> 'role_type' IN ('admin_district', 'admin_state', 'admin_national')
);

DROP POLICY IF EXISTS "Victims can view own interactions" ON interactions;
CREATE POLICY "Victims can view own interactions" ON interactions FOR SELECT USING (
    case_id IN (SELECT id FROM cases WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Counsellors can view assigned interactions" ON interactions;
CREATE POLICY "Counsellors can view assigned interactions" ON interactions FOR SELECT USING (
    case_id IN (SELECT id FROM cases WHERE assigned_counsellor_id = auth.uid())
    OR auth.jwt() ->> 'role_type' IN ('admin_district', 'admin_state', 'admin_national')
);

DROP POLICY IF EXISTS "Victims can view own SOS" ON sos_events;
CREATE POLICY "Victims can view own SOS" ON sos_events FOR SELECT USING (
    case_id IN (SELECT id FROM cases WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Counsellors can view assigned SOS" ON sos_events;
CREATE POLICY "Counsellors can view assigned SOS" ON sos_events FOR SELECT USING (
    assigned_counsellor_id = auth.uid()
    OR auth.jwt() ->> 'role_type' IN ('admin_district', 'admin_state', 'admin_national')
);

DROP POLICY IF EXISTS scheduled_calls_staff_only ON scheduled_calls;
CREATE POLICY scheduled_calls_staff_only ON scheduled_calls USING (
    auth.jwt() ->> 'role' IN ('counsellor', 'district_officer', 'state_officer', 'national_officer', 'superadmin')
);

-- -----------------------------------------------------------------------------
-- RPC Vector Similarity Functions for RAG
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_legal_documents(
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.28,
    match_count INT DEFAULT 5,
    filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    source TEXT,
    category TEXT,
    jurisdiction TEXT,
    language TEXT,
    distance FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ld.id,
        ld.title,
        ld.content,
        ld.source,
        ld.category,
        ld.jurisdiction,
        ld.language,
        (ld.embedding <=> query_embedding)::FLOAT AS distance
    FROM legal_documents ld
    WHERE (filter_category IS NULL OR ld.category = filter_category)
      AND (ld.embedding IS NULL OR (ld.embedding <=> query_embedding) <= match_threshold)
    ORDER BY (ld.embedding <=> query_embedding) ASC
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_victim_memories(
    victim_id_filter UUID,
    query_embedding VECTOR(1024),
    match_threshold FLOAT DEFAULT 0.45,
    match_count INT DEFAULT 8,
    memory_type_filter TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    conversation_id TEXT,
    memory_type TEXT,
    content TEXT,
    metadata JSONB,
    distance FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vm.id,
        vm.conversation_id,
        vm.memory_type,
        vm.content,
        vm.metadata,
        (vm.embedding <=> query_embedding)::FLOAT AS distance
    FROM victim_memory vm
    WHERE vm.victim_id = victim_id_filter
      AND (memory_type_filter IS NULL OR vm.memory_type = ANY(memory_type_filter))
      AND (vm.embedding IS NULL OR (vm.embedding <=> query_embedding) <= match_threshold)
    ORDER BY (vm.embedding <=> query_embedding) ASC
    LIMIT match_count;
END;
$$;

