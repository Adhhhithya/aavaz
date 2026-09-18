-- 0008_referral_in_service_at.sql
-- S10 (Oversight) — adds a single nullable column to the S9 `referrals`
-- table: `in_service_at`, the real timestamp a referral actually reached
-- IN_SERVICE.
--
-- WHY THIS WASN'T IN 0007_referrals.sql: v0.2 Workflow H "H4" names
-- "median time to service" as one of exactly three nightly-aggregate
-- metrics oversight must report. S9's original design did not anticipate
-- that this specific metric needs to know WHEN service started, not just
-- THAT it started (sentAt + serviceDueAt only describe the deadline, not
-- the real outcome) — a gap discovered while implementing the metric
-- itself, not before. Rather than approximate "time to service" from a
-- timestamp that doesn't represent the real event (which would silently
-- misreport the metric), this migration adds the one column actually
-- needed, additively, and apps/core-api/src/referral/referral.service.ts
-- was updated in the same commit to stamp it on the IN_SERVICE
-- transition.
--
-- ADDITIVE ONLY: one nullable column on one existing table. No existing
-- row's `in_service_at` can be backfilled with a real value (no historical
-- event log exists to derive it from), so it is left NULL for any
-- referral that reached IN_SERVICE before this migration — an honest gap
-- for that (very small, pre-production) set of rows, not a fabricated
-- backfill.

ALTER TABLE referrals
    ADD COLUMN IF NOT EXISTS in_service_at TIMESTAMPTZ;
