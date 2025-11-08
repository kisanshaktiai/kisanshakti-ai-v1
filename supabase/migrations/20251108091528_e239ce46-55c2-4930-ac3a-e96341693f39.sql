-- Drop conflicting INSERT policy that prevents anon registration
DROP POLICY IF EXISTS "farmers_insert_policy" ON farmers;

-- Add proper authenticated INSERT policy for tenant admins only
CREATE POLICY "farmers_admin_insert"
ON farmers
FOR INSERT
TO authenticated
WITH CHECK (
  is_tenant_admin() 
  AND has_tenant_access(tenant_id)
);