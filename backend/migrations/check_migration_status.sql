-- =============================================================================
-- AAVAZ DATABASE SCHEMA STATUS & HEALTH CHECK
-- =============================================================================
-- Run this in your Supabase SQL Editor to see exactly which tables, extensions,
-- and columns currently exist vs which are missing.
-- =============================================================================

WITH expected_items AS (
    -- Extensions
    SELECT 'uuid-ossp' AS item_name, '1. Extensions' AS category, EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') AS is_present
    UNION ALL SELECT 'vector (pgvector)', '1. Extensions', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
    
    -- Base Schema Tables
    UNION ALL SELECT 'users', '2. Base Schema Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')
    UNION ALL SELECT 'counsellors', '2. Base Schema Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'counsellors')
    UNION ALL SELECT 'cases', '2. Base Schema Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cases')
    UNION ALL SELECT 'interactions', '2. Base Schema Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interactions')
    UNION ALL SELECT 'case_updates', '2. Base Schema Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'case_updates')
    UNION ALL SELECT 'sos_events', '2. Base Schema Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sos_events')

    -- Identity, Safety & Console Migration Tables
    UNION ALL SELECT 'otp_codes (0002)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'otp_codes')
    UNION ALL SELECT 'consents (0004)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consents')
    UNION ALL SELECT 'victim_profiles (0004)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'victim_profiles')
    UNION ALL SELECT 'safety_settings (0004)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'safety_settings')
    UNION ALL SELECT 'staff (0005)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff')
    UNION ALL SELECT 'staff_audit_log (0005)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_audit_log')
    UNION ALL SELECT 'staff_audit_chain_head (0009)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_audit_chain_head')
    UNION ALL SELECT 'referrals (0007)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals')
    UNION ALL SELECT 'tasks (0010)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks')
    UNION ALL SELECT 'milestones (0011)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'milestones')
    UNION ALL SELECT 'break_glass_grants (0012)', '3. Migration Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'break_glass_grants')
    
    -- AAVAZ Voice, Memory & Telephony Tables
    UNION ALL SELECT 'victim_memory (004)', '4. Voice & RAG Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'victim_memory')
    UNION ALL SELECT 'legal_documents (004)', '4. Voice & RAG Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'legal_documents')
    UNION ALL SELECT 'scheduled_calls (005)', '4. Voice & RAG Tables', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scheduled_calls')

    -- Critical Additive Columns
    UNION ALL SELECT 'counsellors.caseload_cap (0003)', '5. Additive Columns', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'counsellors' AND column_name = 'caseload_cap')
    UNION ALL SELECT 'cases.lifecycle_state (0006)', '5. Additive Columns', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cases' AND column_name = 'lifecycle_state')
    UNION ALL SELECT 'cases.last_check_in_at (005)', '5. Additive Columns', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cases' AND column_name = 'last_check_in_at')
    UNION ALL SELECT 'victim_profiles.opted_out_at (0006)', '5. Additive Columns', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'victim_profiles' AND column_name = 'opted_out_at')
    UNION ALL SELECT 'referrals.in_service_at (0008)', '5. Additive Columns', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'in_service_at')
    UNION ALL SELECT 'referrals.ack_token_hash (0013)', '5. Additive Columns', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'ack_token_hash')
    UNION ALL SELECT 'staff_audit_log.hash (0009)', '5. Additive Columns', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff_audit_log' AND column_name = 'hash')
)
SELECT 
    category,
    item_name,
    CASE WHEN is_present THEN '✅ INSTALLED' ELSE '❌ MISSING' END AS status
FROM expected_items
ORDER BY category, item_name;
