-- =====================================================
-- Phase 1: Critical Security Fixes (Revised)
-- =====================================================

-- 1. Create admin check function (for account_lockouts)
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid()
    AND is_active = true
  )
$$;

-- 2. Drop overly permissive farmers policies
DROP POLICY IF EXISTS "Allow authentication queries by mobile and tenant" ON public.farmers;

-- 3. Create restricted authentication policy (only for specific auth flows)
CREATE POLICY "Auth: lookup by mobile within tenant"
ON public.farmers
FOR SELECT
TO anon
USING (
  mobile_number IS NOT NULL 
  AND tenant_id IS NOT NULL
  AND tenant_id = get_current_tenant_id()
);

-- 4. Fix account_lockouts RLS - restrict to admins only
ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view lockouts" ON public.account_lockouts;
DROP POLICY IF EXISTS "Admins can manage lockouts" ON public.account_lockouts;

CREATE POLICY "Admins can view lockouts"
ON public.account_lockouts
FOR SELECT
TO authenticated
USING (public.is_admin_user());

CREATE POLICY "Admins can manage lockouts"
ON public.account_lockouts
FOR ALL
TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

CREATE POLICY "Service role full access lockouts"
ON public.account_lockouts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- Phase 2: Archive Backup Tables
-- =====================================================

-- Create archive schema
CREATE SCHEMA IF NOT EXISTS archive;

-- Grant usage to service_role only
GRANT USAGE ON SCHEMA archive TO service_role;

-- Move backup tables to archive schema
DO $$
DECLARE
  tbl_name text;
BEGIN
  FOR tbl_name IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename LIKE '%backup%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA archive', tbl_name);
    RAISE NOTICE 'Moved % to archive schema', tbl_name;
  END LOOP;
END $$;

-- Add comment for retention policy
COMMENT ON SCHEMA archive IS 'Archived backup tables - scheduled for deletion after 30 days (created 2026-03-09)';