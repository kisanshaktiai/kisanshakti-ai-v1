-- Function to check if user has access to tenant data
-- Supports custom auth headers + JWT + Supabase auth
CREATE OR REPLACE FUNCTION public.has_tenant_access(check_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tenant_id uuid;
BEGIN
  -- Try 1: Get from custom header (for custom auth)
  BEGIN
    user_tenant_id := current_setting('request.headers', true)::json->>'x-tenant-id';
    IF user_tenant_id IS NOT NULL AND user_tenant_id::text != '' THEN
      RETURN user_tenant_id = check_tenant_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try 2: Get from JWT claims (for JWT-based auth)
  BEGIN
    user_tenant_id := current_setting('request.jwt.claims', true)::json->>'tenant_id';
    IF user_tenant_id IS NOT NULL AND user_tenant_id::text != '' THEN
      RETURN user_tenant_id = check_tenant_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try 3: Get from auth.uid() via user_tenants table (for Supabase auth)
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_tenants
      WHERE user_id = auth.uid() AND tenant_id = check_tenant_id
    );
  END IF;
  
  -- Default: no access
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_tenant_access(uuid) TO public, authenticated, anon;

COMMENT ON FUNCTION public.has_tenant_access(uuid) IS 'Checks if the current user has access to the specified tenant via headers, JWT, or Supabase auth';

-- Helper function to get farmer_id from various sources
CREATE OR REPLACE FUNCTION public.get_current_farmer_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  farmer_id_value uuid;
BEGIN
  -- Try 1: Custom header (primary for custom auth)
  BEGIN
    farmer_id_value := current_setting('request.headers', true)::json->>'x-farmer-id';
    IF farmer_id_value IS NOT NULL AND farmer_id_value::text != '' THEN
      RETURN farmer_id_value;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try 2: JWT claims
  BEGIN
    farmer_id_value := current_setting('request.jwt.claims', true)::json->>'farmer_id';
    IF farmer_id_value IS NOT NULL AND farmer_id_value::text != '' THEN
      RETURN farmer_id_value;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try 3: Supabase auth (fallback)
  IF auth.uid() IS NOT NULL THEN
    RETURN auth.uid();
  END IF;
  
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_farmer_id() TO public, authenticated, anon;

-- Update lands table RLS policies
DROP POLICY IF EXISTS "lands_select" ON public.lands;
DROP POLICY IF EXISTS "lands_insert" ON public.lands;
DROP POLICY IF EXISTS "lands_update" ON public.lands;
DROP POLICY IF EXISTS "lands_delete" ON public.lands;

CREATE POLICY "lands_unified_access" ON public.lands
FOR ALL
USING (
  has_tenant_access(tenant_id)
  AND
  (farmer_id = get_current_farmer_id() OR get_current_farmer_id() IS NULL)
);

-- Update crop_schedules table RLS policies
DROP POLICY IF EXISTS "crop_schedules_select" ON public.crop_schedules;
DROP POLICY IF EXISTS "crop_schedules_insert" ON public.crop_schedules;
DROP POLICY IF EXISTS "crop_schedules_update" ON public.crop_schedules;
DROP POLICY IF EXISTS "crop_schedules_delete" ON public.crop_schedules;

CREATE POLICY "crop_schedules_unified_access" ON public.crop_schedules
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM lands
    WHERE lands.id = crop_schedules.land_id
    AND has_tenant_access(lands.tenant_id)
    AND (lands.farmer_id = get_current_farmer_id() OR get_current_farmer_id() IS NULL)
  )
);

-- Update schedule_tasks table RLS policies
DROP POLICY IF EXISTS "schedule_tasks_select" ON public.schedule_tasks;
DROP POLICY IF EXISTS "schedule_tasks_insert" ON public.schedule_tasks;
DROP POLICY IF EXISTS "schedule_tasks_update" ON public.schedule_tasks;
DROP POLICY IF EXISTS "schedule_tasks_delete" ON public.schedule_tasks;

CREATE POLICY "schedule_tasks_unified_access" ON public.schedule_tasks
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM crop_schedules
    JOIN lands ON lands.id = crop_schedules.land_id
    WHERE crop_schedules.id = schedule_tasks.schedule_id
    AND has_tenant_access(lands.tenant_id)
    AND (lands.farmer_id = get_current_farmer_id() OR get_current_farmer_id() IS NULL)
  )
);