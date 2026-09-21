-- Migration 016: Shadow Mode Scoring Evaluations
-- Creates a table to store side-by-side comparisons of the legacy vs fusion scoring engines.

CREATE TABLE IF NOT EXISTS shadow_scoring_evaluations (
    call_id TEXT PRIMARY KEY,
    legacy_score FLOAT,
    legacy_risk TEXT,
    fusion_score FLOAT,
    fusion_risk TEXT,
    delta FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying large discrepancies
CREATE INDEX IF NOT EXISTS idx_shadow_delta ON shadow_scoring_evaluations (delta);
