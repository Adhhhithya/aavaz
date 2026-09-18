-- 0007_referrals.sql
-- S9 (Referral domain foundation) — adds a new, Node-owned `referrals`
-- table. No FastAPI equivalent exists to diverge from (confirmed absent
-- from the real 12-table schema by docs/S8_DEPENDENCY_AUDIT.md section E).
--
-- ADDITIVE ONLY: creates one new table. Does not alter, rename, or drop
-- any existing table or column. See docs/S9_REFERRAL_MIGRATION.md for the
-- full design record (transition-matrix reconstruction, data-minimization
-- enforcement, and the known gaps in what a packet can and cannot contain
-- today).
--
-- `packet_data` stores the JSON packet built by
-- apps/core-api/src/referral/referral-packets.ts — already minimized to
-- exactly the fields v0.2's "Minimum necessary data per destination" table
-- allows for that `destination_type`, never the full case/victim row. No
-- PDF/Puppeteer rendering exists in this slice (v0.2's "G2"); this stores
-- the packet's data, not a rendered document.
--
-- `status` is free TEXT, not a Postgres enum — same choice, for the same
-- reason, as `cases.lifecycle_state` (0006_lifecycle.sql), `otp_codes.
-- purpose`, `consents.scope`, `staff.role`: avoids an `ALTER TYPE` on a
-- shared column type; application-layer validation
-- (apps/core-api/src/referral/referral-states.ts) is the actual
-- enforcement point.

CREATE TABLE IF NOT EXISTS referrals (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id                UUID NOT NULL REFERENCES cases(id),
    user_id                UUID NOT NULL REFERENCES users(id),
    destination_type       TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'DRAFTED',
    packet_data            JSONB NOT NULL,
    created_by_staff_id    UUID NOT NULL REFERENCES staff(id),
    -- attempt_count/idempotency_key: v0.2 Workflow G "G3" — "Every send
    -- uses an idempotency key referral_id:attempt". No delivery adapter
    -- exists in this slice to actually consume this key (see the
    -- migration doc's "Known limitations"); it is computed and stored so
    -- a future adapter has it from day one, the same "state now, behavior
    -- later" pattern 0006_lifecycle.sql used for opted_out_at.
    attempt_count          INT NOT NULL DEFAULT 0,
    idempotency_key        TEXT,
    sent_at                TIMESTAMPTZ,
    ack_due_at             TIMESTAMPTZ,
    acked_at               TIMESTAMPTZ,
    service_due_at         TIMESTAMPTZ,
    delivered_at           TIMESTAMPTZ,
    verified_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_case_id ON referrals(case_id);
CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- RLS note (same convention as every migration since 0002_otp_codes.sql):
-- enabled with deliberately no permissive policies attached. The
-- service-role connection this application always uses bypasses RLS
-- regardless. Application-layer authorization
-- (apps/core-api/src/referral/referral.service.ts, reusing S7/S8's staff/
-- district/assignment pattern) is what actually enforces who may read or
-- mutate a referral — not Postgres RLS. See
-- docs/S8_DEPENDENCY_AUDIT.md section H and
-- docs/S7_STAFF_CONSOLE_MIGRATION.md's RLS-deferral section.
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
