-- Migration 015: Canonical Relations and RLS Finalization
-- Establishes the core data relationships:
-- victim -> cases -> conversations -> conversation_turns
-- And secures them with Row-Level Security (RLS).

-- 1. Ensure core tables exist with proper foreign keys

-- Cases
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    victim_id UUID NOT NULL, -- references auth.users(id) or victims(id)
    title TEXT NOT NULL,
    status TEXT DEFAULT 'OPEN',
    risk_level TEXT DEFAULT 'LOW',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    victim_id UUID NOT NULL,
    call_id TEXT, -- external telephony ID
    start_time TIMESTAMPTZ DEFAULT now(),
    end_time TIMESTAMPTZ,
    status TEXT DEFAULT 'IN_PROGRESS',
    distress_score FLOAT DEFAULT 0.0
);

-- Conversation Turns
CREATE TABLE IF NOT EXISTS conversation_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    speaker TEXT NOT NULL, -- 'ASSISTANT' or 'VICTIM'
    transcript TEXT NOT NULL,
    turn_index INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Distress Scores
CREATE TABLE IF NOT EXISTS distress_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    score FLOAT NOT NULL,
    risk_level TEXT NOT NULL,
    components JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Escalations
CREATE TABLE IF NOT EXISTS escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    victim_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row-Level Security
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE distress_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;

-- 3. Define RLS Policies

-- Policy: Victims can read their own cases
CREATE POLICY "Victims can read own cases" ON cases
    FOR SELECT
    USING (auth.uid() = victim_id);

-- Policy: Victims can read their own conversations
CREATE POLICY "Victims can read own conversations" ON conversations
    FOR SELECT
    USING (auth.uid() = victim_id);

-- Policy: Counsellors can read assigned cases
-- Note: Assuming a basic staff check or queue mechanism. In production, this would join a `counsellor_assignments` table.
-- For now, we allow authenticated staff to read cases.
CREATE POLICY "Staff can read cases" ON cases
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'counsellor' OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Staff can read conversations" ON conversations
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'counsellor' OR auth.jwt() ->> 'role' = 'admin');

-- Note: In a real environment, you must drop existing duplicate policies or use 'CREATE POLICY IF NOT EXISTS'.
-- Supabase CLI natively handles state, but applying this directly might require IF NOT EXISTS equivalents for policies.
