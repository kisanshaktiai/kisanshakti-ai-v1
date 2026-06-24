-- Fix crop_schedules RLS policies to work with headers
-- The current policy uses complex JOIN with lands table which doesn't work well with headers
-- Add simpler policies that check tenant_id and farmer_id directly

-- Drop existing policy
DROP POLICY IF EXISTS crop_schedules_access_policy ON crop_schedules;

-- Create new simpler policies
CREATE POLICY "crop_schedules_select_policy" ON crop_schedules
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR (
    has_tenant_access(tenant_id) 
    AND farmer_id = get_current_farmer_id()
  )
  OR is_tenant_admin()
);

CREATE POLICY "crop_schedules_insert_policy" ON crop_schedules
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR (
    has_tenant_access(tenant_id) 
    AND farmer_id = get_current_farmer_id()
  )
  OR is_tenant_admin()
);

CREATE POLICY "crop_schedules_update_policy" ON crop_schedules
FOR UPDATE
USING (
  auth.role() = 'service_role'
  OR (
    has_tenant_access(tenant_id) 
    AND farmer_id = get_current_farmer_id()
  )
  OR is_tenant_admin()
);

CREATE POLICY "crop_schedules_delete_policy" ON crop_schedules
FOR DELETE
USING (
  auth.role() = 'service_role'
  OR (
    has_tenant_access(tenant_id) 
    AND farmer_id = get_current_farmer_id()
  )
  OR is_tenant_admin()
);