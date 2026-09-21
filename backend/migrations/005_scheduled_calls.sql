-- Migration 005: Scheduled outbound calls table
-- Run in Supabase SQL Editor after migration 004.
--
-- Tracks every check-in call dispatched by the telephony scheduler.
-- Allows idempotency (upsert on case_id + attempted_at), audit trail,
-- and retry logic if the scheduler crashes mid-cycle.

CREATE TABLE IF NOT EXISTS scheduled_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_id         TEXT,                              -- Bolna call_id (null if dispatch failed)
    status          TEXT NOT NULL DEFAULT 'dispatched',  -- dispatched | failed | completed | no_answer
    reason          TEXT DEFAULT '',                      -- error message if failed
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_seconds FLOAT,
    UNIQUE (case_id, attempted_at)
);

-- Index for dashboard queries: "all calls for a case"
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_case_id
    ON scheduled_calls (case_id, attempted_at DESC);

-- Index for the scheduler's "last contact" query
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_user_id
    ON scheduled_calls (user_id, attempted_at DESC);

-- Add last_check_in_at column to cases (used by scheduler for interval calculation)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMPTZ;

-- RLS: Scheduled calls are staff-only.
-- Victims cannot read their own call log (privacy protection).
ALTER TABLE scheduled_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_calls_staff_only ON scheduled_calls;
CREATE POLICY scheduled_calls_staff_only
    ON scheduled_calls
    USING (
        auth.jwt() ->> 'role' IN ('counsellor', 'district_officer',
                                    'state_officer', 'national_officer', 'superadmin')
    );

