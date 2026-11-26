-- ============================================================================
-- Rollback for 20261125230000_farmer_activation_app_gate.sql
-- ============================================================================
-- This file is NOT a migration. Run it by hand only to back the app gate out.
-- It puts the three function bodies back to what they were on 2026-11-25,
-- before the app gate. It deletes no data and changes no table, policy or grant.
--
-- After this, with the flag farmer_activation_required ON:
--   * a farmer who registered but has not redeemed a code can read and write
--     farmer data again (the app's Activate screen would be the only barrier);
--   * app self-registration is refused again unless the caller itself writes
--     activation_pending = true.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verified_session_context()
 RETURNS TABLE(session_id uuid, farmer_id uuid, tenant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, f.id, f.tenant_id
  FROM public.user_sessions s
  JOIN public.farmers f ON f.id = s.user_id
  JOIN public.accounts a
    ON a.id = f.id
   AND a.status = 'ACTIVE'
  JOIN public.account_roles r
    ON r.account_id = a.id
   AND r.role = 'FARMER'
   AND r.status = 'ACTIVE'
  WHERE s.access_token_hash = public.hash_session_token(
          current_setting('request.headers', true)::json ->> 'x-session-token')
    AND s.is_active = true
    AND s.expires_at > now()
    AND f.is_active = true
    AND (s.active_role IS NULL OR s.active_role = 'FARMER')
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.verified_account_context()
 RETURNS TABLE(session_id uuid, account_id uuid, tenant_id uuid, active_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, a.id, a.tenant_id, r.role
  FROM public.user_sessions s
  JOIN public.accounts a
    ON a.id = s.user_id
   AND a.status = 'ACTIVE'
  JOIN public.account_roles r
    ON r.account_id = a.id
   AND r.tenant_id = a.tenant_id
   AND r.role = COALESCE(s.active_role, 'FARMER')
   AND r.status = 'ACTIVE'
  WHERE s.access_token_hash = public.hash_session_token(
          current_setting('request.headers', true)::json ->> 'x-session-token')
    AND s.is_active = true
    AND s.expires_at > now()
    AND (r.role <> 'FARMER'
         OR EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = a.id AND f.is_active = true))
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION activation.farmers_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_gate text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.activated_at IS NOT NULL OR NEW.activation_code_id IS NOT NULL THEN
      RAISE EXCEPTION 'farmer_activation_locked' USING ERRCODE = '42501',
        DETAIL = 'activation fields are written only by code redemption';
    END IF;
    IF NOT activation.is_enforced() THEN
      RETURN NEW;                                   -- flag OFF: exactly as before
    END IF;
    IF NEW.activation_pending THEN
      -- Self-registration: always the default (holding) tenant, never a seat.
      IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = NEW.tenant_id AND t.is_default IS TRUE) THEN
        RAISE EXCEPTION 'activation_required' USING ERRCODE = '42501',
          DETAIL = 'an unactivated farmer can exist only in the default tenant';
      END IF;
      RETURN NEW;
    END IF;
    -- Born active: only a signed-in portal user may do that (RLS / the RPC has
    -- already decided WHICH user); the service role, i.e. app self-registration,
    -- may not. Then the tenant must have an active subscription and a free seat.
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'activation_required' USING ERRCODE = '42501',
        DETAIL = 'a farmer joins a tenant only with an activation code';
    END IF;
    v_gate := activation.tenant_gate(NEW.tenant_id);
    IF v_gate IS NOT NULL THEN
      RAISE EXCEPTION '%', v_gate USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.activation_pending AND NOT OLD.activation_pending THEN
    RAISE EXCEPTION 'farmer_activation_locked' USING ERRCODE = '42501';
  END IF;
  IF OLD.activation_pending AND NOT NEW.activation_pending THEN
    -- Becoming active needs proof: a code this farmer redeemed, for this tenant.
    IF NEW.activated_at IS NULL OR NEW.activation_code_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.activation_codes c
          WHERE c.id = NEW.activation_code_id AND c.state = 'ACTIVATED'
            AND c.redeemed_by = NEW.id AND c.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'farmer_activation_locked' USING ERRCODE = '42501',
        DETAIL = 'a farmer becomes active only by redeeming a code';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.activation_code_id IS DISTINCT FROM OLD.activation_code_id THEN
    RAISE EXCEPTION 'farmer_activation_locked' USING ERRCODE = '42501';
  END IF;
  IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     AND activation.is_enforced() THEN
    RAISE EXCEPTION 'farmer_tenant_locked' USING ERRCODE = '42501',
      DETAIL = 'a farmer changes tenant only by redeeming a code';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION activation.farmers_guard() FROM PUBLIC, anon, authenticated, service_role;

-- Verification (read-only): expected  false | false | false
SELECT (SELECT prosrc LIKE '%activation_pending%' FROM pg_proc WHERE oid = 'public.verified_session_context()'::regprocedure) AS session_gate,
       (SELECT prosrc LIKE '%activation_pending%' FROM pg_proc WHERE oid = 'public.verified_account_context()'::regprocedure) AS account_gate,
       (SELECT prosrc LIKE '%app gate%' FROM pg_proc WHERE oid = 'activation.farmers_guard()'::regprocedure) AS guard_forces_pending;
