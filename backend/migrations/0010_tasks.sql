-- 0010_tasks.sql
-- S12 (Task domain foundation) — adds a new, Node-owned `tasks` table.
-- No FastAPI equivalent exists anywhere in the real 12-table schema
-- (confirmed absent, same enumeration docs/S8_DEPENDENCY_AUDIT.md section
-- E already performed) — this is entirely net-new capability.
--
-- ADDITIVE ONLY: one new table. Does not alter, rename, or drop any
-- existing column or table. See docs/S12_TASK_MIGRATION.md for the full
-- design record, including which task types/triggers are evidenced by
-- v0.2's actual text (Workflow A "A7" unassigned-case handoff, Workflow B
-- "B4" stale-court-sync, Workflow H "H2"/"H3" referral review/stalled-
-- escalation, and the silence-ladder code sample on PDF page 17) versus
-- which are deliberately NOT wired to an automatic trigger in this slice.
--
-- Column shape follows v0.2's own data-model table (§12) exactly:
-- "tasks: id, victim_id, type, priority, assignee_id, sla_due_at,
-- acked_at, completed_at, status" — plus `case_id`/`referral_id`
-- (nullable FKs; not named in that table's terse column list but required
-- by how this slice's actual, evidenced task-creation triggers work: a
-- referral-stalled task must reference the specific referral, and every
-- evidenced trigger in this slice already has a real case in hand) and
-- `created_by_staff_id` (nullable — NULL means system-created, matching
-- how v0.2's own examples describe tasks created by workflow code, not a
-- person).

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

-- RLS note (same convention as every migration since 0002_otp_codes.sql):
-- enabled with deliberately no permissive policies attached. The
-- service-role connection this application always uses bypasses RLS
-- regardless. Application-layer authorization
-- (apps/core-api/src/task/task.service.ts, reusing S7-S9's staff/
-- district/assignment pattern) is what actually enforces who may read or
-- mutate a task — not Postgres RLS.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
