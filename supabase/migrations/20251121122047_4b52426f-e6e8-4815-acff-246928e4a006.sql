-- =========================================================================
-- Phase 6: Database Hardening - Multi-Tenant Security Enforcement
-- =========================================================================

-- Drop existing security definer functions from previous attempts
DROP FUNCTION IF EXISTS public.user_belongs_to_tenant CASCADE;
DROP FUNCTION IF EXISTS public.get_user_tenant_id CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_user CASCADE;
DROP FUNCTION IF EXISTS public.is_tenant_active CASCADE;
DROP FUNCTION IF EXISTS public.user_owns_schedule CASCADE;

-- =========================================================================
-- Security Definer Functions (Prevent RLS Recursion)
-- =========================================================================

CREATE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.farmers WHERE id = _user_id LIMIT 1; $$;

CREATE FUNCTION public.is_tenant_active(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND status = 'active'); $$;

CREATE FUNCTION public.user_owns_schedule(_user_id uuid, _schedule_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.crop_schedules WHERE id = _schedule_id AND farmer_id = _user_id AND tenant_id = public.get_user_tenant_id(_user_id)); $$;

CREATE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE id = _user_id AND is_active = true AND role IN ('super_admin', 'admin')); $$;

-- =========================================================================
-- Drop & Recreate RLS Policies
-- =========================================================================

DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view their own lands" ON public.lands;
  DROP POLICY IF EXISTS "Users can insert their own lands" ON public.lands;
  DROP POLICY IF EXISTS "Users can update their own lands" ON public.lands;
  DROP POLICY IF EXISTS "Users can delete their own lands" ON public.lands;
  DROP POLICY IF EXISTS "Users can view their own schedules" ON public.crop_schedules;
  DROP POLICY IF EXISTS "Users can insert their own schedules" ON public.crop_schedules;
  DROP POLICY IF EXISTS "Users can update their own schedules" ON public.crop_schedules;
  DROP POLICY IF EXISTS "Users can delete their own schedules" ON public.crop_schedules;
  DROP POLICY IF EXISTS "Users can view their own tasks" ON public.schedule_tasks;
  DROP POLICY IF EXISTS "Users can insert their own tasks" ON public.schedule_tasks;
  DROP POLICY IF EXISTS "Users can update their own tasks" ON public.schedule_tasks;
  DROP POLICY IF EXISTS "Users can delete their own tasks" ON public.schedule_tasks;
  DROP POLICY IF EXISTS "Users can view their own chat sessions" ON public.ai_chat_sessions;
  DROP POLICY IF EXISTS "Users can insert their own chat sessions" ON public.ai_chat_sessions;
  DROP POLICY IF EXISTS "Users can update their own chat sessions" ON public.ai_chat_sessions;
  DROP POLICY IF EXISTS "Users can view their own chat messages" ON public.ai_chat_messages;
  DROP POLICY IF EXISTS "Users can insert their own chat messages" ON public.ai_chat_messages;
  DROP POLICY IF EXISTS "Users can update their own chat messages" ON public.ai_chat_messages;
END $$;

-- LANDS
CREATE POLICY "tenant_isolation_lands_select" ON public.lands FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_lands_insert" ON public.lands FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_lands_update" ON public.lands FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid()) WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_lands_delete" ON public.lands FOR DELETE USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid());

-- CROP SCHEDULES
CREATE POLICY "tenant_isolation_schedules_select" ON public.crop_schedules FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_schedules_insert" ON public.crop_schedules FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_schedules_update" ON public.crop_schedules FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid()) WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_schedules_delete" ON public.crop_schedules FOR DELETE USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid());

-- SCHEDULE TASKS
CREATE POLICY "tenant_isolation_tasks_select" ON public.schedule_tasks FOR SELECT USING (public.user_owns_schedule(auth.uid(), schedule_id));
CREATE POLICY "tenant_isolation_tasks_insert" ON public.schedule_tasks FOR INSERT WITH CHECK (public.user_owns_schedule(auth.uid(), schedule_id));
CREATE POLICY "tenant_isolation_tasks_update" ON public.schedule_tasks FOR UPDATE USING (public.user_owns_schedule(auth.uid(), schedule_id)) WITH CHECK (public.user_owns_schedule(auth.uid(), schedule_id));
CREATE POLICY "tenant_isolation_tasks_delete" ON public.schedule_tasks FOR DELETE USING (public.user_owns_schedule(auth.uid(), schedule_id));

-- AI CHAT SESSIONS
CREATE POLICY "tenant_isolation_sessions_select" ON public.ai_chat_sessions FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_sessions_insert" ON public.ai_chat_sessions FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_sessions_update" ON public.ai_chat_sessions FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid()) WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));

-- AI CHAT MESSAGES
CREATE POLICY "tenant_isolation_messages_select" ON public.ai_chat_messages FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_messages_insert" ON public.ai_chat_messages FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));
CREATE POLICY "tenant_isolation_messages_update" ON public.ai_chat_messages FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid()) WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND farmer_id = auth.uid() AND public.is_tenant_active(tenant_id));

-- =========================================================================
-- Performance Indexes
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_lands_tenant_farmer ON public.lands(tenant_id, farmer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lands_tenant_active ON public.lands(tenant_id) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_tenant_farmer ON public.crop_schedules(tenant_id, farmer_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_schedules_land_tenant ON public.crop_schedules(land_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_schedule_status ON public.schedule_tasks(schedule_id, status) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_tasks_schedule_date ON public.schedule_tasks(schedule_id, task_date);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant_farmer ON public.ai_chat_sessions(tenant_id, farmer_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_farmer ON public.ai_chat_messages(tenant_id, farmer_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON public.ai_chat_messages(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_farmers_tenant ON public.farmers(tenant_id) WHERE is_active = true;

-- =========================================================================
-- Data Integrity Constraints
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lands_tenant_id_not_null') THEN ALTER TABLE public.lands ADD CONSTRAINT lands_tenant_id_not_null CHECK (tenant_id IS NOT NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crop_schedules_tenant_id_not_null') THEN ALTER TABLE public.crop_schedules ADD CONSTRAINT crop_schedules_tenant_id_not_null CHECK (tenant_id IS NOT NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_sessions_tenant_id_not_null') THEN ALTER TABLE public.ai_chat_sessions ADD CONSTRAINT ai_chat_sessions_tenant_id_not_null CHECK (tenant_id IS NOT NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_messages_tenant_id_not_null') THEN ALTER TABLE public.ai_chat_messages ADD CONSTRAINT ai_chat_messages_tenant_id_not_null CHECK (tenant_id IS NOT NULL); END IF;
END $$;

-- =========================================================================
-- Security Audit Log
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid,
  user_tenant_id uuid,
  attempted_tenant_id uuid,
  table_name text,
  operation text,
  ip_address inet,
  user_agent text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_user ON public.security_audit_log(user_id, created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_audit_log" ON public.security_audit_log FOR SELECT USING (public.is_admin_user(auth.uid()));

-- =========================================================================
-- Permissions
-- =========================================================================

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_active TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user TO authenticated;
REVOKE ALL ON public.security_audit_log FROM PUBLIC;
GRANT SELECT ON public.security_audit_log TO authenticated;