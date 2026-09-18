-- 0011_milestones.sql
-- S13 (Milestone domain foundation) — adds a new, Node-owned `milestones`
-- table. No FastAPI equivalent exists anywhere in the real 12-table
-- schema (confirmed absent, same enumeration docs/S8_DEPENDENCY_AUDIT.md
-- section E already performed) — net-new capability.
--
-- ADDITIVE ONLY: one new table. Does not alter, rename, or drop any
-- existing column or table.
--
-- SCOPE NOTE (see docs/S13_MILESTONE_MIGRATION.md for the full record):
-- v0.2 Workflow B "B5" describes TWO things under "Manual milestones":
-- (1) case-manager data entry ("Investigation milestones that have no
-- reliable public feed... are entered by the case manager") — THIS is
-- what this migration/slice implements; and (2) "Entering the FIR date
-- starts configurable milestone timers from a legal-reviewed template" —
-- NOT implemented here. Automated timer computation needs a
-- legal-reviewed template this repository has no legal-advisor sign-off
-- for (this master spec's own instruction: never invent legal
-- requirements), and timer EXPIRY handling needs the job-queue
-- infrastructure this repository still does not have (S8 audit section
-- F/I, unchanged since S8). This table's `due_at` column exists so a
-- case manager can record a real, known due date manually; nothing
-- currently computes one automatically or watches it for expiry.
--
-- Column shape follows v0.2's own data-model table (§12) exactly:
-- "milestones: id, case_id, type, due_at, met_at, entered_by" — plus
-- created_at/updated_at for the same bookkeeping every other table in
-- this schema already has.

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

-- RLS note (same convention as every migration since 0002_otp_codes.sql):
-- enabled with deliberately no permissive policies attached. The
-- service-role connection this application always uses bypasses RLS
-- regardless. Application-layer authorization
-- (apps/core-api/src/milestone/milestone.service.ts, reusing S7-S9's
-- staff/district/assignment pattern) is what actually enforces who may
-- read or mutate a milestone — not Postgres RLS.
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
