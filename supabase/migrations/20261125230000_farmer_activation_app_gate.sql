-- ============================================================================
-- Farmer activation: app gate
-- (third database part; needs 20261124160000_farmer_activation_core.sql)
-- ============================================================================
-- Why
--   The core migration decides WHO may become a farmer of a tenant. It does not
--   yet stop a farmer who registered but has not redeemed a code from using
--   the app: such a farmer holds a normal session, and every farmer RLS policy
--   and every edge function resolves that session through
--   public.verified_session_context().
--
-- What this does (all three only while the flag farmer_activation_required is ON)
--   1. verified_session_context(): a farmer whose activation is pending resolves
--      to nobody. get_current_farmer_id() / get_current_tenant_id() return NULL,
--      so every farmer RLS policy, every RPC and every edge function built on
--      them stays closed until a code is redeemed. This is the database-side
--      "block all features"; the app's Activate screen is only the way in.
--   2. verified_account_context(): the same for a session whose active role is
--      FARMER. Sessions in the Service Provider or Customer role are NOT
--      touched: activation applies to farmers only.
--   3. activation.farmers_guard(): a farmers row written by the service role
--      (app self-registration, and account_add_role_self when a provider adds
--      the Farmer role) into the default tenant is born unactivated, whatever
--      the caller wrote. Before, such a row was refused unless the caller set
--      activation_pending itself. Into any other tenant it is still refused.
--
-- Flag OFF: all three behave exactly as before this file.
-- Not affected: the service role itself (the auth edge function still reads the
-- farmer to sign in, and still calls activation_redeem), portal users, and the
-- sign-in / PIN / role actions of the auth edge function.
--
-- Self-contained: no TEMP tables, no session state. Nothing is deleted. No
-- table, column, policy, grant or trigger is added, changed or dropped: only
-- three function bodies are replaced.
-- Re-runnable. Rollback: tests/activation/rollback_app_gate.sql
-- ============================================================================

-- ── 0. pre-flight ───────────────────────────────────────────────────────────
-- The three functions are replaced whole, so each must still be exactly the
-- body that was audited on the live project on 2026-11-25 (or already the body
-- from this file, on a re-run). Anything else means somebody changed it in
-- between: stop, change nothing, and re-audit.
DO $preflight$
DECLARE
  v_fn   text;
  v_ok   text[];
  v_got  text;
BEGIN
  IF to_regprocedure('activation.is_enforced()') IS NULL
     OR to_regprocedure('activation.farmers_guard()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'farmers'
                       AND column_name = 'activation_pending') THEN
    RAISE EXCEPTION 'activation core is missing: apply 20261124160000_farmer_activation_core.sql first';
  END IF;

  FOR v_fn, v_ok IN
    SELECT * FROM (VALUES
      ('public.verified_session_context()',
         ARRAY['b552df0538c73e0e9ee20a24d93d7927', 'bc2ceb3cc5e5a0ca15205dac39cb72eb']),
      ('public.verified_account_context()',
         ARRAY['f3c467c88a67b5e93c956c40266c7385', 'eb30c2d0d144551a9d83cba5bd1ec98f']),
      ('activation.farmers_guard()',
         ARRAY['feb83c68681f8444c3a6791982cb1503', '65462f07b57dd959b73d10e327d58231'])
    ) AS t(fn, ok)
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'app gate pre-flight: % does not exist', v_fn;
    END IF;
    -- Line endings are ignored: pasting through the SQL editor adds CR.
    SELECT md5(replace(p.prosrc, E'\r', '')) INTO v_got
      FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure(v_fn);
    IF NOT (v_got = ANY (v_ok)) THEN
      RAISE EXCEPTION 'app gate pre-flight: % is not the audited version (found %). Nothing was changed.', v_fn, v_got;
    END IF;
  END LOOP;
END
$preflight$;

-- ── 1. farmer session context ───────────────────────────────────────────────
-- Same signature, same owner, same grants. One condition added (the last one).
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
    -- Farmer activation: while it is enforced, a farmer who has not redeemed a
    -- code is nobody here. The flag is read only for such a farmer.
    AND (f.activation_pending IS NOT TRUE OR NOT activation.is_enforced())
  LIMIT 1
$function$;

-- ── 2. account session context ──────────────────────────────────────────────
-- Same signature, same owner, same grants. The FARMER branch gets the same
-- condition; the Service Provider and Customer branches are unchanged.
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
         OR EXISTS (SELECT 1 FROM public.farmers f
                     WHERE f.id = a.id AND f.is_active = true
                       -- Farmer activation: see verified_session_context().
                       AND (f.activation_pending IS NOT TRUE OR NOT activation.is_enforced())))
  LIMIT 1
$function$;

-- ── 3. farmers guard ────────────────────────────────────────────────────────
-- Identical to the core migration except the block marked "app gate".
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
    -- app gate: the service role (no signed-in portal user) writing a farmer
    -- into the default tenant is app self-registration. That farmer is born
    -- unactivated whatever the caller wrote, so no code path of the app can
    -- create an active farmer without a code.
    IF NOT NEW.activation_pending AND auth.uid() IS NULL
       AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = NEW.tenant_id AND t.is_default IS TRUE) THEN
      NEW.activation_pending := true;
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

-- The internal schema stays closed: CREATE OR REPLACE keeps the existing
-- privileges, this only states them again.
REVOKE ALL ON FUNCTION activation.farmers_guard() FROM PUBLIC, anon, authenticated, service_role;
