-- Restore Simple Working RLS Policies from September 9, 2024
-- This reverts the complex policies that broke registration and login

-- ============================================================================
-- STEP 1: Drop all complex RLS policies added after September 9, 2024
-- ============================================================================

-- Drop farmers table policies
DROP POLICY IF EXISTS "farmers_select_for_login" ON farmers;
DROP POLICY IF EXISTS "farmers_anon_insert_for_registration" ON farmers;
DROP POLICY IF EXISTS "farmers_admin_insert" ON farmers;
DROP POLICY IF EXISTS "farmers_update_own" ON farmers;
DROP POLICY IF EXISTS "farmers_delete_own" ON farmers;
DROP POLICY IF EXISTS "farmers_service_role_all" ON farmers;
DROP POLICY IF EXISTS "farmers_insert_policy" ON farmers;

-- Drop user_profiles table policies
DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete" ON user_profiles;

-- ============================================================================
-- STEP 2: Re-create simple working policies for farmers table
-- ============================================================================

-- Policy: Farmers can view their own data
CREATE POLICY "Farmers view own data"
ON farmers FOR SELECT
USING (id = auth.uid() OR id = current_setting('app.farmer_id', true)::uuid);

-- Policy: Farmers can update their own data
CREATE POLICY "Farmers update own data"
ON farmers FOR UPDATE
USING (id = auth.uid() OR id = current_setting('app.farmer_id', true)::uuid);

-- Policy: Allow system to create farmers (for registration)
-- This is the key policy that allows anon registration
CREATE POLICY "System can create farmers"
ON farmers FOR INSERT
WITH CHECK (true);

-- Policy: Tenant admins can manage farmers in their tenant
CREATE POLICY "Tenant admins manage farmers"
ON farmers FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM user_tenants 
    WHERE user_id = auth.uid() 
    AND role IN ('tenant_admin', 'tenant_owner')
  )
);

-- ============================================================================
-- STEP 3: Re-create simple working policies for user_profiles table
-- ============================================================================

-- Policy: Users can view their own profile
CREATE POLICY "Users view own profile"
ON user_profiles FOR SELECT
USING (farmer_id = auth.uid() OR farmer_id = current_setting('app.farmer_id', true)::uuid);

-- Policy: Users can update their own profile
CREATE POLICY "Users update own profile"
ON user_profiles FOR UPDATE
USING (farmer_id = auth.uid() OR farmer_id = current_setting('app.farmer_id', true)::uuid);

-- Policy: Allow system to create profiles (for registration)
-- This is the key policy that allows anon registration
CREATE POLICY "System can create profiles"
ON user_profiles FOR INSERT
WITH CHECK (true);

-- ============================================================================
-- Add helpful comments
-- ============================================================================

COMMENT ON POLICY "System can create farmers" ON farmers IS 
'Allows anonymous users to register by inserting into farmers table';

COMMENT ON POLICY "System can create profiles" ON user_profiles IS 
'Allows anonymous users to create profile during registration';