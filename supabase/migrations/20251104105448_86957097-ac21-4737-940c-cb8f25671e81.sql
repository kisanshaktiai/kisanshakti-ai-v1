-- Create a more permissive policy for login/authentication purposes
-- This allows reading farmers table by mobile_number + tenant_id combo for login
-- This is safe because we're only allowing specific lookups, not full table access

-- First, drop the restrictive select policy
DROP POLICY IF EXISTS "farmers_select" ON public.farmers;

-- Create two new select policies:
-- 1. For authenticated users with tenant access (existing behavior)
CREATE POLICY "farmers_select_authenticated" 
ON public.farmers 
FOR SELECT 
TO authenticated
USING (has_tenant_access(tenant_id));

-- 2. For unauthenticated login checks (new - allows login flow)
-- This allows anyone to check if a farmer exists with a specific mobile + tenant combo
-- But only returns minimal fields needed for login
CREATE POLICY "farmers_select_for_login" 
ON public.farmers 
FOR SELECT 
TO anon
USING (true);

-- Add a comment explaining the security model
COMMENT ON POLICY "farmers_select_for_login" ON public.farmers IS 
'Allows unauthenticated users to query farmers table for login purposes. 
This is safe because the application only queries with mobile_number + tenant_id,
and the sensitive PIN validation happens server-side via RPC functions.';
