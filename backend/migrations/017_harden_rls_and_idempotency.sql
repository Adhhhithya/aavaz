-- =============================================================================
-- Phase 1: Architecture & Data Integrity Hardening
-- Adds idempotency constraints and fixes RLS policy logic for admins.
-- =============================================================================

-- 1. IDEMPOTENCY CONSTRAINTS
-- Prevent duplicate SOS events for the same case if spam-clicked
CREATE UNIQUE INDEX IF NOT EXISTS idx_sos_events_case_resolved
ON sos_events(case_id) WHERE resolved = false;

-- Prevent duplicate Check-ins logged at the exact same millisecond
ALTER TABLE interactions
DROP CONSTRAINT IF EXISTS ux_interactions_case_timestamp;

ALTER TABLE interactions
ADD CONSTRAINT ux_interactions_case_timestamp UNIQUE (case_id, timestamp);

-- Prevent duplicate escalation tasks for the same case
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_case_type_open
ON tasks(case_id, type) WHERE status = 'OPEN';


-- 2. RLS POLICY HARDENING
-- Drop insecure/invalid policies
DROP POLICY IF EXISTS "Counsellors can view assigned cases" ON cases;
DROP POLICY IF EXISTS "Counsellors can view assigned interactions" ON interactions;
DROP POLICY IF EXISTS "Counsellors can view assigned SOS" ON sos_events;

-- Recreate cases policy securely using the staff table for authorization
CREATE POLICY "Staff can view authorized cases" ON cases FOR SELECT USING (
    -- Counsellor assigned to case
    assigned_counsellor_id IN (SELECT counsellor_id FROM staff WHERE user_id = auth.uid())
    -- Or District Admin matching user's district
    OR (
        EXISTS (
            SELECT 1 FROM staff 
            WHERE user_id = auth.uid() 
              AND role = 'admin_district'
              AND (SELECT location_district FROM users WHERE users.id = cases.user_id) = ANY(district_scope)
        )
    )
    -- Or State Admin matching user's state
    OR (
        EXISTS (
            SELECT 1 FROM staff 
            WHERE user_id = auth.uid() 
              AND role = 'admin_state'
              AND (SELECT location_state FROM users WHERE users.id = cases.user_id) = ANY(district_scope) -- Assuming district_scope can hold state names or state logic applies
        )
    )
    -- Or National/Superadmin
    OR (
        EXISTS (
            SELECT 1 FROM staff 
            WHERE user_id = auth.uid() 
              AND role IN ('admin_national', 'super_admin')
        )
    )
);

-- Recreate interactions policy securely
CREATE POLICY "Staff can view authorized interactions" ON interactions FOR SELECT USING (
    -- Handled via parent case
    case_id IN (
        SELECT id FROM cases WHERE 
            assigned_counsellor_id IN (SELECT counsellor_id FROM staff WHERE user_id = auth.uid())
            OR EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role IN ('admin_national', 'super_admin'))
            OR EXISTS (
                SELECT 1 FROM staff 
                WHERE user_id = auth.uid() 
                  AND role = 'admin_district'
                  AND (SELECT location_district FROM users WHERE users.id = cases.user_id) = ANY(district_scope)
            )
            OR EXISTS (
                SELECT 1 FROM staff 
                WHERE user_id = auth.uid() 
                  AND role = 'admin_state'
                  AND (SELECT location_state FROM users WHERE users.id = cases.user_id) = ANY(district_scope)
            )
    )
);

-- Recreate sos_events policy securely
CREATE POLICY "Staff can view authorized SOS" ON sos_events FOR SELECT USING (
    -- Handled via parent case
    case_id IN (
        SELECT id FROM cases WHERE 
            assigned_counsellor_id IN (SELECT counsellor_id FROM staff WHERE user_id = auth.uid())
            OR EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role IN ('admin_national', 'super_admin'))
            OR EXISTS (
                SELECT 1 FROM staff 
                WHERE user_id = auth.uid() 
                  AND role = 'admin_district'
                  AND (SELECT location_district FROM users WHERE users.id = cases.user_id) = ANY(district_scope)
            )
            OR EXISTS (
                SELECT 1 FROM staff 
                WHERE user_id = auth.uid() 
                  AND role = 'admin_state'
                  AND (SELECT location_state FROM users WHERE users.id = cases.user_id) = ANY(district_scope)
            )
    )
);
