-- Drop old RLS policies that use auth.uid() on crop_schedules
-- These conflict with the newer header-based access policies
DROP POLICY IF EXISTS tenant_isolation_schedules_select ON crop_schedules;
DROP POLICY IF EXISTS tenant_isolation_schedules_insert ON crop_schedules;
DROP POLICY IF EXISTS tenant_isolation_schedules_update ON crop_schedules;
DROP POLICY IF EXISTS tenant_isolation_schedules_delete ON crop_schedules;

-- Drop old RLS policies that use auth.uid() on schedule_tasks
-- These conflict with the newer header-based access policies
DROP POLICY IF EXISTS tenant_isolation_tasks_select ON schedule_tasks;
DROP POLICY IF EXISTS tenant_isolation_tasks_insert ON schedule_tasks;
DROP POLICY IF EXISTS tenant_isolation_tasks_update ON schedule_tasks;
DROP POLICY IF EXISTS tenant_isolation_tasks_delete ON schedule_tasks;

-- Note: The existing crop_schedules_access_policy and schedule_tasks_access_policy
-- policies already use header-based functions (get_current_farmer_id(), has_tenant_access())
-- and will now be the only policies, allowing proper data access with custom auth headers.