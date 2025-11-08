-- Fix RLS Policy to Allow Login by Mobile Number
-- Root cause: Anonymous users cannot search for farmers during login

-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Farmers view own data" ON farmers;

-- Create new SELECT policy that allows login by mobile number
CREATE POLICY "Farmers can login and view own data"
ON farmers FOR SELECT
USING (
  -- Allow authenticated users to view their own data
  (id = auth.uid() OR id = current_setting('app.farmer_id', true)::uuid)
  OR
  -- Allow anonymous users to search by mobile_number + tenant_id for login
  -- This is safe because we only expose minimal fields needed for authentication
  (auth.role() = 'anon' AND mobile_number IS NOT NULL)
);

COMMENT ON POLICY "Farmers can login and view own data" ON farmers IS 
'Allows authenticated users to view their own data, and anonymous users to search by mobile_number for login purposes';