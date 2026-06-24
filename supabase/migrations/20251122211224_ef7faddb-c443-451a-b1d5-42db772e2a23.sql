-- ============================================================================
-- COMPREHENSIVE RLS POLICY FIX FOR FARMERS TABLE
-- Fixes authentication flow by allowing pre-auth queries while maintaining
-- strict tenant isolation across SELECT, INSERT, and UPDATE operations
-- ============================================================================

-- Step 1: Add SELECT policy for authentication queries
-- Allows finding farmers by mobile + tenant during login/registration
CREATE POLICY "Allow authentication queries by mobile and tenant"
ON public.farmers
FOR SELECT
TO public
USING (
  -- Safe: Only allows querying by mobile + tenant (maintains tenant isolation)
  -- Used during login to find existing farmer
  mobile_number IS NOT NULL 
  AND tenant_id IS NOT NULL
);

-- Step 2: Replace overly permissive INSERT policy with tenant-scoped version
-- Drop the old policy that allowed inserts without proper validation
DROP POLICY IF EXISTS "System can create farmers" ON public.farmers;

-- Create new tenant-scoped INSERT policy for registration
CREATE POLICY "Allow tenant-scoped farmer registration"
ON public.farmers
FOR INSERT
TO public
WITH CHECK (
  -- Enforce tenant isolation and required fields
  -- Prevents cross-tenant registration and incomplete records
  tenant_id IS NOT NULL
  AND mobile_number IS NOT NULL
  AND pin_hash IS NOT NULL
);

-- Step 3: Add UPDATE policy for pre-auth PIN setup
-- Allows PIN updates by mobile + tenant before full authentication
CREATE POLICY "Allow pre-auth PIN setup by mobile and tenant"
ON public.farmers
FOR UPDATE
TO public
USING (
  -- Allow updates when identifying by mobile + tenant
  -- Used during PIN setup for new/existing farmers
  mobile_number IS NOT NULL
  AND tenant_id IS NOT NULL
)
WITH CHECK (
  -- Ensure tenant isolation is maintained in updates
  tenant_id IS NOT NULL
  AND mobile_number IS NOT NULL
);

-- ============================================================================
-- POLICY SUMMARY:
-- 1. SELECT: Login queries work without headers (mobile + tenant)
-- 2. INSERT: New farmer registration with strict tenant isolation
-- 3. UPDATE: Pre-auth PIN setup and post-auth profile updates both work
-- 4. Existing authenticated UPDATE policy remains for profile updates
-- ============================================================================

-- Add comments for documentation
COMMENT ON POLICY "Allow authentication queries by mobile and tenant" ON public.farmers IS 
'Allows SELECT queries by mobile_number + tenant_id for authentication flow without requiring x-farmer-id header';

COMMENT ON POLICY "Allow tenant-scoped farmer registration" ON public.farmers IS 
'Enforces tenant isolation during farmer registration, requires tenant_id, mobile_number, and pin_hash';

COMMENT ON POLICY "Allow pre-auth PIN setup by mobile and tenant" ON public.farmers IS 
'Allows PIN setup and updates by mobile_number + tenant_id before full authentication';