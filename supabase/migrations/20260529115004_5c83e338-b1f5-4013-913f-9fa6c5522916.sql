-- Sprint 6: Observability & Production Hardening
-- All additive. No changes to existing tables/policies that the app depends on.

-- ============================================================
-- 1. SYSTEM HEALTH EVENTS (centralized telemetry / error log)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_health_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,           -- 'error' | 'warning' | 'info' | 'health_check' | 'perf'
  source TEXT NOT NULL,               -- 'frontend' | 'edge:<fn>' | 'db' | 'cron'
  severity TEXT NOT NULL DEFAULT 'info', -- 'critical'|'error'|'warning'|'info'
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  tenant_id UUID,
  farmer_id UUID,
  user_agent TEXT,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.system_health_events TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.system_health_events_id_seq TO authenticated, anon;
GRANT ALL ON public.system_health_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.system_health_events_id_seq TO service_role;

ALTER TABLE public.system_health_events ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated/anon may INSERT their own telemetry; nobody may SELECT/UPDATE/DELETE except service_role.
CREATE POLICY "anyone can insert telemetry"
  ON public.system_health_events
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_health_events_created ON public.system_health_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_events_severity ON public.system_health_events (severity, created_at DESC) WHERE severity IN ('critical','error');
CREATE INDEX IF NOT EXISTS idx_health_events_source ON public.system_health_events (source, created_at DESC);

-- ============================================================
-- 2. AUDIT LOG for sensitive operations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensitive_audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,            -- INSERT/UPDATE/DELETE
  row_pk TEXT,
  actor UUID,                          -- auth.uid() if available
  tenant_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.sensitive_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sensitive_audit_log_id_seq TO service_role;
ALTER TABLE public.sensitive_audit_log ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role / SECURITY DEFINER functions can read/write.

CREATE INDEX IF NOT EXISTS idx_audit_table_time ON public.sensitive_audit_log (table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON public.sensitive_audit_log (actor, created_at DESC);

-- Generic audit trigger
CREATE OR REPLACE FUNCTION public.fn_sensitive_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_tenant UUID;
  v_pk TEXT;
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;

  IF TG_OP = 'DELETE' THEN
    v_tenant := (to_jsonb(OLD) ->> 'tenant_id')::UUID;
    v_pk := COALESCE(to_jsonb(OLD) ->> 'id', '');
    INSERT INTO public.sensitive_audit_log(table_name, operation, row_pk, actor, tenant_id, old_data)
      VALUES (TG_TABLE_NAME, TG_OP, v_pk, v_actor, v_tenant, to_jsonb(OLD));
    RETURN OLD;
  ELSE
    v_tenant := (to_jsonb(NEW) ->> 'tenant_id')::UUID;
    v_pk := COALESCE(to_jsonb(NEW) ->> 'id', '');
    INSERT INTO public.sensitive_audit_log(table_name, operation, row_pk, actor, tenant_id, old_data, new_data)
      VALUES (TG_TABLE_NAME, TG_OP, v_pk, v_actor, v_tenant,
              CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
              to_jsonb(NEW));
    RETURN NEW;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- never block business operation on audit failure
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to high-sensitivity tables if they exist
DO $$
BEGIN
  IF to_regclass('public.farmer_subscriptions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_farmer_subscriptions ON public.farmer_subscriptions;
    CREATE TRIGGER trg_audit_farmer_subscriptions
      AFTER INSERT OR UPDATE OR DELETE ON public.farmer_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.fn_sensitive_audit();
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
    CREATE TRIGGER trg_audit_user_roles
      AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
      FOR EACH ROW EXECUTE FUNCTION public.fn_sensitive_audit();
  END IF;

  IF to_regclass('public.white_label_configs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_audit_white_label_configs ON public.white_label_configs;
    CREATE TRIGGER trg_audit_white_label_configs
      AFTER UPDATE OR DELETE ON public.white_label_configs
      FOR EACH ROW EXECUTE FUNCTION public.fn_sensitive_audit();
  END IF;
END$$;

-- ============================================================
-- 3. RETENTION: prune old telemetry & audit rows
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_observability_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep 14 days of info/warning, 60 days of error/critical
  DELETE FROM public.system_health_events
    WHERE created_at < now() - INTERVAL '14 days'
      AND severity NOT IN ('error','critical');
  DELETE FROM public.system_health_events
    WHERE created_at < now() - INTERVAL '60 days';
  -- Keep 180 days of audit log
  DELETE FROM public.sensitive_audit_log
    WHERE created_at < now() - INTERVAL '180 days';
END;
$$;

-- Schedule daily 03:30 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-observability-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-observability-daily');
    PERFORM cron.schedule(
      'cleanup-observability-daily',
      '30 3 * * *',
      $cron$ SELECT public.cleanup_observability_data(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ============================================================
-- 4. HEALTH SNAPSHOT FUNCTION (used by health-check edge fn)
-- ============================================================
CREATE OR REPLACE FUNCTION public.system_health_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'ok', true,
    'db_time', now(),
    'errors_last_hour', (
      SELECT COUNT(*) FROM public.system_health_events
        WHERE severity IN ('error','critical') AND created_at > now() - INTERVAL '1 hour'
    ),
    'events_last_hour', (
      SELECT COUNT(*) FROM public.system_health_events
        WHERE created_at > now() - INTERVAL '1 hour'
    )
  ) INTO v_result;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.system_health_snapshot() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_observability_data() TO service_role;