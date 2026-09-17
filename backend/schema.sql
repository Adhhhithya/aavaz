-- schema.sql
-- Run this in your Supabase SQL Editor once you create the project.

-- 1. ENUMS
CREATE TYPE role_type_enum AS ENUM ('victim', 'witness', 'family');
CREATE TYPE lang_enum AS ENUM ('hi', 'ta', 'ml', 'en');
CREATE TYPE location_source_enum AS ENUM ('ivr', 'sms', 'app');
CREATE TYPE intake_channel_enum AS ENUM ('nhaa_sim', 'fir_sim', 'ivr', 'app', 'sms', 'chatbot');
CREATE TYPE case_stage_enum AS ENUM ('registered', 'investigation', 'trial', 'compensation', 'rehabilitation', 'closed');
CREATE TYPE channel_enum AS ENUM ('ivr', 'sms', 'chatbot', 'app');
CREATE TYPE emotion_tag_enum AS ENUM ('fear', 'anger', 'sadness', 'hopelessness', 'neutral');
CREATE TYPE update_source_enum AS ENUM ('manual', 'simulated_cctns', 'simulated_ecourts');
CREATE TYPE resolved_by_enum AS ENUM ('user', 'counsellor');

-- 2. TABLES
CREATE TABLE users (
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

CREATE TABLE counsellors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    languages TEXT[] NOT NULL,
    current_caseload INT DEFAULT 0
);

CREATE TABLE cases (
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

CREATE TABLE interactions (
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

CREATE TABLE case_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    previous_stage TEXT NOT NULL,
    new_stage TEXT NOT NULL,
    update_source update_source_enum NOT NULL,
    notes TEXT
);

CREATE TABLE sos_events (
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

-- 3. INDEXES
CREATE INDEX idx_users_location_district ON users(location_district);
CREATE INDEX idx_cases_assigned_counsellor_id ON cases(assigned_counsellor_id);
CREATE INDEX idx_cases_case_stage ON cases(case_stage);
CREATE INDEX idx_cases_current_distress_score ON cases(current_distress_score);
CREATE INDEX idx_cases_district_score ON cases(current_distress_score); -- Note: Needs join logic for district
CREATE INDEX idx_interactions_case_id_timestamp ON interactions(case_id, timestamp);
CREATE INDEX idx_sos_events_resolved_false ON sos_events(resolved) WHERE resolved = false;
CREATE INDEX idx_counsellors_district_caseload ON counsellors(district, current_caseload);
