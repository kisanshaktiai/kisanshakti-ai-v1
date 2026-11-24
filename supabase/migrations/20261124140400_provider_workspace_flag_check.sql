-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124140400_provider_workspace_flag_check.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Provider Workspace, part A, file 5 — lets the app ask one question: "is the
-- provider_workspace flag on for the tenant of this session?".
--
-- The browser cannot read public.feature_flags, and this task adds no edge
-- function, so the answer comes from this function. It follows the tenant rules
-- of supabase/functions/_shared/featureFlags.ts: the flag must be enabled,
-- active and not expired, and the session's tenant must be in target_tenants or
-- the rollout must be 100. The per-farmer percentage bucket is not used: a
-- provider is an account, not a farmer.
--
-- The caller comes from verified_account_context() — the session token — and
-- never from an argument. No session, or a flag that is off, returns false; the
-- function raises no error and returns nothing else.
--
-- Adds one function.  Safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provider_workspace_enabled()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid;
  f        record;
BEGIN
  SELECT c.tenant_id INTO v_tenant FROM public.verified_account_context() c;
  IF NOT FOUND OR v_tenant IS NULL THEN
    RETURN false;
  END IF;

  SELECT ff.is_enabled, ff.rollout_percentage, ff.target_tenants, ff.flag_status, ff.expires_at
    INTO f
    FROM public.feature_flags ff
   WHERE ff.flag_name = 'provider_workspace';
  IF NOT FOUND OR NOT coalesce(f.is_enabled, false) THEN
    RETURN false;
  END IF;
  IF f.flag_status IS NOT NULL AND f.flag_status <> 'active' THEN
    RETURN false;
  END IF;
  IF f.expires_at IS NOT NULL AND f.expires_at < now() THEN
    RETURN false;
  END IF;

  RETURN v_tenant = ANY (coalesce(f.target_tenants, '{}'::uuid[]))
      OR coalesce(f.rollout_percentage, 0) >= 100;
END
$fn$;

REVOKE ALL ON FUNCTION public.provider_workspace_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_workspace_enabled() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.provider_workspace_enabled() IS
  'True when the provider_workspace feature flag is on for the tenant of the calling session. False without a session.';

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'provider_workspace_enabled without a session' AS check_name,
       public.provider_workspace_enabled()::text AS actual, 'false' AS expected;
