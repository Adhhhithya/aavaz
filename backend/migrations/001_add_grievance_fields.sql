-- Add personal and address details to users
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN middle_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
ALTER TABLE users ADD COLUMN father_name TEXT;
ALTER TABLE users ADD COLUMN dob DATE;
ALTER TABLE users ADD COLUMN category TEXT;
ALTER TABLE users ADD COLUMN nationality TEXT DEFAULT 'Indian';
ALTER TABLE users ADD COLUMN aadhaar_number TEXT;
ALTER TABLE users ADD COLUMN address_pincode TEXT;
ALTER TABLE users ADD COLUMN address_taluka TEXT;
ALTER TABLE users ADD COLUMN address_full TEXT;

-- Add grievance details to cases
ALTER TABLE cases ADD COLUMN grievance_related_to TEXT;
ALTER TABLE cases ADD COLUMN has_fir BOOLEAN DEFAULT false;
ALTER TABLE cases ADD COLUMN submitter_role TEXT;
ALTER TABLE cases ADD COLUMN cnr_number TEXT;
ALTER TABLE cases ADD COLUMN grievance_description TEXT;
