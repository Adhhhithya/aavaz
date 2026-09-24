-- =============================================================================
-- MIGRATION: 018_phase2_data_integrity.sql
-- PURPOSE: Fix schema mismatch between Python Pydantic models and PostgreSQL
-- =============================================================================

-- Add missing columns to `users` for GrievanceRegistrationPayload
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dob TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Indian';
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_pincode TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_taluka TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_full TEXT;

-- Add missing columns to `cases` for GrievanceRegistrationPayload
ALTER TABLE cases ADD COLUMN IF NOT EXISTS grievance_related_to TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS has_fir BOOLEAN;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS submitter_role TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cnr_number TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS cnr TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS grievance_description TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ecourts_data JSONB;
