-- ============================================
-- CRITICAL SECURITY FIXES MIGRATION - PART 2
-- Data Retention & DPDP Compliance
-- ============================================

-- 1. DATA RETENTION POLICIES (DPDP COMPLIANCE)
-- Create data retention configuration table
CREATE TABLE IF NOT EXISTS public.data_retention_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL UNIQUE,
  retention_days integer NOT NULL,
  date_column text NOT NULL DEFAULT 'created_at',
  soft_delete boolean DEFAULT true,
  archive_before_delete boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_retention_days CHECK (retention_days > 0 AND retention_days <= 3650)
);

-- Enable RLS on retention config
ALTER TABLE public.data_retention_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage retention config"
ON public.data_retention_config
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.id = auth.uid()
    AND admin_users.role = 'super_admin'
    AND admin_users.is_active = true
  )
);

-- Insert default retention policies (DPDP compliance)
INSERT INTO public.data_retention_config (table_name, retention_days, date_column, soft_delete) VALUES
  -- User data - 3 years after account deletion
  ('farmers', 1095, 'deleted_at', true),
  ('farmer_profiles', 1095, 'updated_at', true),
  
  -- Activity logs - 90 days
  ('api_logs', 90, 'created_at', false),
  ('audit_logs', 365, 'created_at', false),
  ('admin_audit_logs', 730, 'created_at', false),
  ('edge_invocation_logs', 30, 'created_at', false),
  
  -- Analytics - 2 years
  ('ai_chat_analytics', 730, 'created_at', false),
  ('campaign_analytics', 730, 'created_at', false),
  
  -- AI data - 180 days
  ('ai_chat_messages', 180, 'created_at', false),
  ('ai_chat_sessions', 180, 'created_at', false),
  ('ai_decision_log', 180, 'created_at', false),
  
  -- Temporary data - 30 days
  ('active_sessions', 30, 'expires_at', false),
  ('rate_limit_records', 7, 'created_at', false),
  ('idempotency_records', 7, 'created_at', false),
  
  -- Marketing data - 1 year
  ('campaign_executions', 365, 'created_at', false),
  ('notification_logs', 180, 'created_at', false)
ON CONFLICT (table_name) DO NOTHING;

-- Create archive tables for important data
CREATE TABLE IF NOT EXISTS public.archived_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  archived_data jsonb NOT NULL,
  original_id uuid,
  archived_at timestamptz DEFAULT now(),
  retention_expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.archived_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage archived data"
ON public.archived_data
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.id = auth.uid()
    AND admin_users.role IN ('super_admin', 'platform_admin')
    AND admin_users.is_active = true
  )
);

-- 2. ADD CONSENT TRACKING FOR DPDP COMPLIANCE
CREATE TABLE IF NOT EXISTS public.farmer_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  consent_type text NOT NULL,
  consent_given boolean NOT NULL,
  consent_version text NOT NULL DEFAULT '1.0',
  ip_address inet,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_consent_type CHECK (
    consent_type IN (
      'data_collection',
      'data_processing',
      'data_sharing',
      'marketing_communications',
      'location_tracking',
      'ai_analysis',
      'third_party_sharing'
    )
  )
);

CREATE INDEX idx_farmer_consent_farmer ON farmer_consent_log(farmer_id);
CREATE INDEX idx_farmer_consent_tenant ON farmer_consent_log(tenant_id);
CREATE INDEX idx_farmer_consent_type ON farmer_consent_log(consent_type);

ALTER TABLE public.farmer_consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farmers can view their own consents"
ON public.farmer_consent_log
FOR SELECT
TO public
USING (
  farmer_id::text = current_setting('request.headers', true)::json->>'x-farmer-id'
  AND tenant_id::text = current_setting('request.headers', true)::json->>'x-tenant-id'
);

CREATE POLICY "System can insert consent logs"
ON public.farmer_consent_log
FOR INSERT
TO public
WITH CHECK (
  tenant_id::text = current_setting('request.headers', true)::json->>'x-tenant-id'
);

CREATE POLICY "Tenant admins can view consents"
ON public.farmer_consent_log
FOR SELECT
TO public
USING (
  tenant_id IN (
    SELECT user_tenants.tenant_id FROM user_tenants
    WHERE user_tenants.user_id = auth.uid()
    AND user_tenants.role IN ('tenant_admin', 'tenant_owner')
    AND user_tenants.is_active = true
  )
);

-- 3. CREATE DATA RETENTION FUNCTION
CREATE OR REPLACE FUNCTION cleanup_old_data_with_retention()
RETURNS TABLE (
  table_name text,
  archived_count bigint,
  deleted_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  config_rec RECORD;
  sql_query text;
  arch_count bigint;
  del_count bigint;
BEGIN
  FOR config_rec IN 
    SELECT * FROM data_retention_config WHERE is_active = true
  LOOP
    table_name := config_rec.table_name;
    arch_count := 0;
    del_count := 0;
    
    -- Archive data if configured
    IF config_rec.archive_before_delete THEN
      BEGIN
        sql_query := format(
          'INSERT INTO archived_data (source_table, archived_data, original_id, retention_expires_at)
           SELECT %L, to_jsonb(t.*), t.id, now() + interval ''90 days''
           FROM %I t
           WHERE t.%I < now() - interval ''%s days''
           AND NOT EXISTS (
             SELECT 1 FROM archived_data a 
             WHERE a.source_table = %L AND a.original_id = t.id
           )',
          config_rec.table_name,
          config_rec.table_name,
          config_rec.date_column,
          config_rec.retention_days,
          config_rec.table_name
        );
        EXECUTE sql_query;
        GET DIAGNOSTICS arch_count = ROW_COUNT;
      EXCEPTION WHEN OTHERS THEN
        -- Skip tables that don't exist or have issues
        arch_count := 0;
      END;
    END IF;
    
    -- Delete or soft-delete old data
    BEGIN
      IF config_rec.soft_delete THEN
        sql_query := format(
          'UPDATE %I SET deleted_at = now(), is_active = false
           WHERE %I < now() - interval ''%s days''
           AND (deleted_at IS NULL OR is_active = true)',
          config_rec.table_name,
          config_rec.date_column,
          config_rec.retention_days
        );
      ELSE
        sql_query := format(
          'DELETE FROM %I WHERE %I < now() - interval ''%s days''',
          config_rec.table_name,
          config_rec.date_column,
          config_rec.retention_days
        );
      END IF;
      
      EXECUTE sql_query;
      GET DIAGNOSTICS del_count = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      -- Skip tables that don't exist or have issues
      del_count := 0;
    END;
    
    archived_count := arch_count;
    deleted_count := del_count;
    
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 4. CREATE SECURITY AUDIT VIEW
CREATE OR REPLACE VIEW security_audit_summary AS
SELECT 
  'Tables without RLS' as audit_category,
  COUNT(*) as issue_count
FROM pg_tables t
WHERE t.schemaname = 'public'
AND t.rowsecurity = false
UNION ALL
SELECT 
  'Tables with RLS but no policies',
  COUNT(DISTINCT t.tablename)
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public' AND t.rowsecurity = true
GROUP BY t.tablename
HAVING COUNT(p.policyname) = 0
UNION ALL
SELECT 
  'SECURITY DEFINER functions',
  COUNT(*)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true;

-- Grant access to security view
GRANT SELECT ON security_audit_summary TO authenticated;