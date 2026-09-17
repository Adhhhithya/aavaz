-- Supabase Row Level Security (RLS) Setup

-- 1. Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE counsellors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_updates ENABLE ROW LEVEL SECURITY;

-- 2. Define Policies for `users`
-- Note: 'service_role' bypasses RLS by default.
-- End-users can read/update their own profile.
CREATE POLICY "Users can view own profile" 
ON users FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON users FOR UPDATE USING (auth.uid() = id);

-- 3. Define Policies for `cases`
-- End-users can see their own cases.
CREATE POLICY "Victims can view own cases" 
ON cases FOR SELECT USING (auth.uid() = user_id);

-- Counsellors can see cases assigned to them.
CREATE POLICY "Counsellors can view assigned cases" 
ON cases FOR SELECT USING (
  auth.uid() = assigned_counsellor_id
  OR auth.jwt() ->> 'role_type' IN ('admin_district', 'admin_state', 'admin_national')
);

-- 4. Define Policies for `interactions`
-- Victims can see their own interactions.
CREATE POLICY "Victims can view own interactions" 
ON interactions FOR SELECT USING (
  case_id IN (SELECT id FROM cases WHERE user_id = auth.uid())
);

-- Counsellors can see interactions for their assigned cases.
CREATE POLICY "Counsellors can view assigned interactions" 
ON interactions FOR SELECT USING (
  case_id IN (SELECT id FROM cases WHERE assigned_counsellor_id = auth.uid())
  OR auth.jwt() ->> 'role_type' IN ('admin_district', 'admin_state', 'admin_national')
);

-- 5. Define Policies for `sos_events`
CREATE POLICY "Victims can view own SOS" 
ON sos_events FOR SELECT USING (
  case_id IN (SELECT id FROM cases WHERE user_id = auth.uid())
);

CREATE POLICY "Counsellors can view assigned SOS" 
ON sos_events FOR SELECT USING (
  assigned_counsellor_id = auth.uid()
  OR auth.jwt() ->> 'role_type' IN ('admin_district', 'admin_state', 'admin_national')
);
