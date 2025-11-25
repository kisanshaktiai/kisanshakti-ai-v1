-- Fix schedule_tasks RLS policies to work with headers
-- The current policy uses complex JOIN through crop_schedules which doesn't work well with headers
-- Add simpler policies that check through subquery

-- Drop existing complex policy
DROP POLICY IF EXISTS schedule_tasks_access_policy ON schedule_tasks;

-- Create simpler SELECT policy with subquery
CREATE POLICY "schedule_tasks_select_policy" ON schedule_tasks
FOR SELECT USING (
  auth.role() = 'service_role'
  OR (schedule_id IN (
    SELECT id FROM crop_schedules 
    WHERE has_tenant_access(tenant_id) 
    AND farmer_id = get_current_farmer_id()
  ))
  OR is_tenant_admin()
);

-- Create INSERT policy
CREATE POLICY "schedule_tasks_insert_policy" ON schedule_tasks
FOR INSERT WITH CHECK (
  auth.role() = 'service_role'
  OR (schedule_id IN (
    SELECT id FROM crop_schedules 
    WHERE has_tenant_access(tenant_id) 
    AND farmer_id = get_current_farmer_id()
  ))
  OR is_tenant_admin()
);

-- Create UPDATE policy  
CREATE POLICY "schedule_tasks_update_policy" ON schedule_tasks
FOR UPDATE USING (
  auth.role() = 'service_role'
  OR (schedule_id IN (
    SELECT id FROM crop_schedules 
    WHERE has_tenant_access(tenant_id) 
    AND farmer_id = get_current_farmer_id()
  ))
  OR is_tenant_admin()
);

-- Create DELETE policy
CREATE POLICY "schedule_tasks_delete_policy" ON schedule_tasks
FOR DELETE USING (
  auth.role() = 'service_role'
  OR (schedule_id IN (
    SELECT id FROM crop_schedules 
    WHERE has_tenant_access(tenant_id) 
    AND farmer_id = get_current_farmer_id()
  ))
  OR is_tenant_admin()
);