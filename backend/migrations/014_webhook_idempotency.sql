-- Migration 014: Webhook Idempotency
-- Creates a table to track processed webhook events and prevent duplicate processing

CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(provider, external_event_id)
);

-- Index for fast idempotency lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup ON webhook_events (provider, external_event_id);
