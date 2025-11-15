
-- ============================================================================
-- PHASE 2: RLS FIX FOR CUSTOM AUTHENTICATION (Mobile + PIN)
-- Fix get_current_farmer_id() to work with custom auth (NOT auth.users)
-- ============================================================================

-- ============================================================================
-- STEP 1: Fix get_current_farmer_id() to check session config first
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_current_farmer_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  farmer_id_value uuid;
  config_value text;
BEGIN
  -- Try 1: Session config (set by edge functions via set_app_session RPC)
  -- This is the PRIMARY method for custom auth
  BEGIN
    config_value := current_setting('app.farmer_id', true);
    IF config_value IS NOT NULL AND config_value != '' AND config_value != '00000000-0000-0000-0000-000000000000' THEN
      RETURN config_value::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try 2: Custom header (for direct frontend calls via Supabase client)
  BEGIN
    farmer_id_value := current_setting('request.headers', true)::json->>'x-farmer-id';
    IF farmer_id_value IS NOT NULL AND farmer_id_value::text != '' THEN
      RETURN farmer_id_value;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try 3: JWT claims (fallback for future use)
  BEGIN
    farmer_id_value := current_setting('request.jwt.claims', true)::json->>'farmer_id';
    IF farmer_id_value IS NOT NULL AND farmer_id_value::text != '' THEN
      RETURN farmer_id_value;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- REMOVED: auth.uid() fallback (custom auth doesn't use auth.users)
  
  -- Return NULL if no farmer_id found (will be handled by policies)
  RETURN NULL;
END;
$$;

-- ============================================================================
-- STEP 2: Create get_current_tenant_id() helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant_id_value uuid;
  config_value text;
BEGIN
  -- Try 1: Session config (set by edge functions)
  BEGIN
    config_value := current_setting('app.tenant_id', true);
    IF config_value IS NOT NULL AND config_value != '' AND config_value != '00000000-0000-0000-0000-000000000000' THEN
      RETURN config_value::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try 2: Custom header
  BEGIN
    tenant_id_value := current_setting('request.headers', true)::json->>'x-tenant-id';
    IF tenant_id_value IS NOT NULL AND tenant_id_value::text != '' THEN
      RETURN tenant_id_value;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try 3: JWT claims
  BEGIN
    tenant_id_value := current_setting('request.jwt.claims', true)::json->>'tenant_id';
    IF tenant_id_value IS NOT NULL AND tenant_id_value::text != '' THEN
      RETURN tenant_id_value;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  RETURN NULL;
END;
$$;

-- ============================================================================
-- STEP 3: Fix has_tenant_access() to use new helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_tenant_access(check_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role always has access
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;
  
  -- Check if current tenant matches
  RETURN get_current_tenant_id() = check_tenant_id;
END;
$$;

-- ============================================================================
-- STEP 4: Fix is_tenant_admin() - Check correct enum values
-- ============================================================================

-- First check if get_jwt_tenant_id exists, if not create it
CREATE OR REPLACE FUNCTION public.get_jwt_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN get_current_tenant_id();
END;
$$;

-- Now fix is_tenant_admin to check correct roles
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_farmer_id uuid;
BEGIN
  v_tenant_id := get_current_tenant_id();
  v_farmer_id := get_current_farmer_id();
  
  IF v_tenant_id IS NULL OR v_farmer_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if farmer has admin role in user_tenants table
  -- Fixed to check correct enum values: 'tenant_admin', 'tenant_owner'
  RETURN EXISTS (
    SELECT 1 FROM public.user_tenants
    WHERE user_id = v_farmer_id
    AND tenant_id = v_tenant_id
    AND role IN ('tenant_admin', 'tenant_owner', 'super_admin')
    AND is_active = true
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- ============================================================================
-- STEP 5: Fix farmers table policies for custom auth
-- ============================================================================

ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing farmers policies
DROP POLICY IF EXISTS "farmers_select_authenticated" ON public.farmers;
DROP POLICY IF EXISTS "farmers_select_for_login" ON public.farmers;
DROP POLICY IF EXISTS "farmers_select_own" ON public.farmers;
DROP POLICY IF EXISTS "farmers_insert" ON public.farmers;
DROP POLICY IF EXISTS "farmers_insert_authenticated" ON public.farmers;
DROP POLICY IF EXISTS "farmers_update" ON public.farmers;
DROP POLICY IF EXISTS "farmers_update_own" ON public.farmers;
DROP POLICY IF EXISTS "farmers_delete" ON public.farmers;
DROP POLICY IF EXISTS "farmers_delete_service_only" ON public.farmers;

-- SELECT: Individual farmers can see own record, admins can see all in tenant
CREATE POLICY "farmers_select_policy"
ON public.farmers
FOR SELECT
USING (
  -- Service role has full access
  auth.role() = 'service_role'
  OR
  -- Farmer can see own record
  (id = get_current_farmer_id() AND has_tenant_access(tenant_id))
  OR
  -- Tenant admin can see all farmers in their tenant
  (is_tenant_admin() AND has_tenant_access(tenant_id))
);

-- INSERT: Anon can register (self-registration), admins can add farmers, service role can do anything
CREATE POLICY "farmers_insert_policy"
ON public.farmers
FOR INSERT
WITH CHECK (
  -- Service role can insert anything
  auth.role() = 'service_role'
  OR
  -- Anon role can self-register (mobile + PIN registration)
  (auth.role() = 'anon' AND has_tenant_access(tenant_id))
  OR
  -- Tenant admin can add farmers to their tenant
  (is_tenant_admin() AND has_tenant_access(tenant_id))
);

-- UPDATE: Farmers can update own record, admins can update any farmer in tenant
CREATE POLICY "farmers_update_policy"
ON public.farmers
FOR UPDATE
USING (
  -- Service role has full access
  auth.role() = 'service_role'
  OR
  -- Farmer can update own record
  (id = get_current_farmer_id() AND has_tenant_access(tenant_id))
  OR
  -- Tenant admin can update farmers in their tenant
  (is_tenant_admin() AND has_tenant_access(tenant_id))
)
WITH CHECK (
  -- Same conditions for the updated data
  auth.role() = 'service_role'
  OR
  (id = get_current_farmer_id() AND has_tenant_access(tenant_id))
  OR
  (is_tenant_admin() AND has_tenant_access(tenant_id))
);

-- DELETE: Only admins and service role can delete
CREATE POLICY "farmers_delete_policy"
ON public.farmers
FOR DELETE
USING (
  -- Service role has full access
  auth.role() = 'service_role'
  OR
  -- Tenant admin can delete farmers in their tenant
  (is_tenant_admin() AND has_tenant_access(tenant_id))
);

-- ============================================================================
-- STEP 6: Update lands policies to remove risky NULL fallback
-- ============================================================================

ALTER TABLE public.lands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lands_unified_access" ON public.lands;
DROP POLICY IF EXISTS "lands_select_own" ON public.lands;
DROP POLICY IF EXISTS "lands_insert_own" ON public.lands;
DROP POLICY IF EXISTS "lands_update_own" ON public.lands;
DROP POLICY IF EXISTS "lands_delete_own" ON public.lands;

-- Unified policy for all operations on lands
CREATE POLICY "lands_access_policy"
ON public.lands
FOR ALL
USING (
  -- Service role has full access
  auth.role() = 'service_role'
  OR
  -- Farmer can access own lands
  (has_tenant_access(tenant_id) AND farmer_id = get_current_farmer_id())
  OR
  -- Tenant admin can access all lands in their tenant
  (is_tenant_admin() AND has_tenant_access(tenant_id))
)
WITH CHECK (
  -- Same for inserts/updates
  auth.role() = 'service_role'
  OR
  (has_tenant_access(tenant_id) AND farmer_id = get_current_farmer_id())
  OR
  (is_tenant_admin() AND has_tenant_access(tenant_id))
);

-- ============================================================================
-- STEP 7: Update crop_schedules policies
-- ============================================================================

ALTER TABLE public.crop_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crop_schedules_unified_access" ON public.crop_schedules;
DROP POLICY IF EXISTS "Farmers can view their own schedules" ON public.crop_schedules;
DROP POLICY IF EXISTS "Farmers can create their own schedules" ON public.crop_schedules;
DROP POLICY IF EXISTS "Farmers can update their own schedules" ON public.crop_schedules;
DROP POLICY IF EXISTS "Farmers can delete their own schedules" ON public.crop_schedules;

-- Access via land ownership
CREATE POLICY "crop_schedules_access_policy"
ON public.crop_schedules
FOR ALL
USING (
  auth.role() = 'service_role'
  OR
  EXISTS (
    SELECT 1 FROM lands
    WHERE lands.id = crop_schedules.land_id
    AND has_tenant_access(lands.tenant_id)
    AND (
      lands.farmer_id = get_current_farmer_id()
      OR is_tenant_admin()
    )
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR
  EXISTS (
    SELECT 1 FROM lands
    WHERE lands.id = crop_schedules.land_id
    AND has_tenant_access(lands.tenant_id)
    AND (
      lands.farmer_id = get_current_farmer_id()
      OR is_tenant_admin()
    )
  )
);

-- ============================================================================
-- STEP 8: Update schedule_tasks policies
-- ============================================================================

ALTER TABLE public.schedule_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_tasks_unified_access" ON public.schedule_tasks;
DROP POLICY IF EXISTS "Farmers can view tasks for their schedules" ON public.schedule_tasks;
DROP POLICY IF EXISTS "Farmers can manage tasks for their schedules" ON public.schedule_tasks;

-- Access via schedule -> land ownership
CREATE POLICY "schedule_tasks_access_policy"
ON public.schedule_tasks
FOR ALL
USING (
  auth.role() = 'service_role'
  OR
  EXISTS (
    SELECT 1 FROM crop_schedules
    JOIN lands ON lands.id = crop_schedules.land_id
    WHERE crop_schedules.id = schedule_tasks.schedule_id
    AND has_tenant_access(lands.tenant_id)
    AND (
      lands.farmer_id = get_current_farmer_id()
      OR is_tenant_admin()
    )
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR
  EXISTS (
    SELECT 1 FROM crop_schedules
    JOIN lands ON lands.id = crop_schedules.land_id
    WHERE crop_schedules.id = schedule_tasks.schedule_id
    AND has_tenant_access(lands.tenant_id)
    AND (
      lands.farmer_id = get_current_farmer_id()
      OR is_tenant_admin()
    )
  )
);

-- ============================================================================
-- STEP 9: Update ai_chat_sessions policies
-- ============================================================================

ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_chat_sessions_select_own" ON public.ai_chat_sessions;
DROP POLICY IF EXISTS "ai_chat_sessions_insert_own" ON public.ai_chat_sessions;
DROP POLICY IF EXISTS "ai_chat_sessions_update_own" ON public.ai_chat_sessions;
DROP POLICY IF EXISTS "ai_chat_sessions_delete_own" ON public.ai_chat_sessions;

CREATE POLICY "ai_chat_sessions_access_policy"
ON public.ai_chat_sessions
FOR ALL
USING (
  auth.role() = 'service_role'
  OR
  (has_tenant_access(tenant_id) AND farmer_id = get_current_farmer_id())
  OR
  (is_tenant_admin() AND has_tenant_access(tenant_id))
)
WITH CHECK (
  auth.role() = 'service_role'
  OR
  (has_tenant_access(tenant_id) AND farmer_id = get_current_farmer_id())
  OR
  (is_tenant_admin() AND has_tenant_access(tenant_id))
);

-- ============================================================================
-- STEP 10: Update ai_chat_messages policies
-- ============================================================================

ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_chat_messages_select_via_session" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "ai_chat_messages_insert_via_session" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "ai_chat_messages_update_via_session" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "ai_chat_messages_delete_via_session" ON public.ai_chat_messages;

CREATE POLICY "ai_chat_messages_access_policy"
ON public.ai_chat_messages
FOR ALL
USING (
  auth.role() = 'service_role'
  OR
  EXISTS (
    SELECT 1 FROM ai_chat_sessions
    WHERE ai_chat_sessions.id = ai_chat_messages.session_id
    AND has_tenant_access(ai_chat_sessions.tenant_id)
    AND (
      ai_chat_sessions.farmer_id = get_current_farmer_id()
      OR is_tenant_admin()
    )
  )
)
WITH CHECK (
  auth.role() = 'service_role'
  OR
  EXISTS (
    SELECT 1 FROM ai_chat_sessions
    WHERE ai_chat_sessions.id = ai_chat_messages.session_id
    AND has_tenant_access(ai_chat_sessions.tenant_id)
    AND (
      ai_chat_sessions.farmer_id = get_current_farmer_id()
      OR is_tenant_admin()
    )
  )
);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_current_farmer_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_tenant_access(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_jwt_tenant_id() TO anon, authenticated, service_role;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION public.get_current_farmer_id() IS 'Phase 2: Custom auth - retrieves farmer_id from session config (set by edge functions) → headers → JWT. NO auth.uid() fallback.';
COMMENT ON FUNCTION public.get_current_tenant_id() IS 'Phase 2: Custom auth - retrieves tenant_id from session config → headers → JWT.';
COMMENT ON FUNCTION public.has_tenant_access(uuid) IS 'Phase 2: Validates tenant access for custom auth using session config.';
COMMENT ON FUNCTION public.is_tenant_admin() IS 'Phase 2: Fixed to check correct enum values (tenant_admin, tenant_owner) for custom auth.';

-- ============================================================================
-- MIGRATION COMPLETE FOR CUSTOM AUTH
-- ============================================================================