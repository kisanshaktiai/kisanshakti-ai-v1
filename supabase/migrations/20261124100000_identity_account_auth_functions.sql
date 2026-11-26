-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124100000_identity_account_auth_functions.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M2 — file 1 of 2: the three writes the
-- auth core (supabase/functions/_shared/farmer-auth-core.ts) must make in ONE
-- transaction. An edge function cannot hold a transaction across calls, so each
-- write is one database function, the same way ai-smart-schedule persists through
-- persist_ai_crop_schedule_atomic().
--
-- New functions only. No table, trigger, policy or existing function is changed.
--
--   account_register_self(tenant, mobile, pin_hash, roles[], language, display_name)
--       Creates an account for a person who is NOT a farmer, with the credential
--       on the account and the chosen SERVICE_PROVIDER / CUSTOMER memberships.
--       Refused when the tenant already has an open account or a farmer with that
--       mobile number. FARMER is not accepted here: a farmer is registered by the
--       existing register action (farmers insert, then the M1 trigger).
--
--   account_add_role_self(account, role)
--       Adds one of the three roles to an existing ACTIVE account.
--       SERVICE_PROVIDER / CUSTOMER: inserts an ACTIVE membership. A membership
--       that already exists is returned as it is: a SUSPENDED, PENDING or REVOKED
--       one is never switched back on by its owner.
--       FARMER: creates the farmers row with the SAME id and MOVES the credential
--       from the account into it (single copy), in one transaction. The M1 insert
--       trigger then makes the FARMER membership. Refused if the account's FARMER
--       membership is SUSPENDED or PENDING.
--
--   account_switch_session_role(token_hash, role)
--       Workspace switch. Points a live session at another role the account holds
--       as ACTIVE (and, for FARMER, an active farmers row), on the same token.
--
-- All three are callable by the service role only. The browser never calls them:
-- it reaches them through the auth core, which has already verified the PIN or
-- the session. They raise stable codes the auth core maps to client errors:
--   ACCOUNT_INPUT_INVALID, ACCOUNT_ROLE_INVALID, ACCOUNT_EXISTS, ACCOUNT_NOT_ACTIVE,
--   ACCOUNT_CREDENTIAL_MISSING, ROLE_NOT_AVAILABLE, ROLE_NOT_HELD, SESSION_INVALID.
--
-- Safe to run twice. Plain statements, no session state.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.account_register_self(
  p_tenant_id uuid, p_mobile text, p_pin_hash text, p_roles text[],
  p_language text, p_display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_id    uuid;
  v_name  text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_lang  text := CASE WHEN p_language ~ '^[a-z]{2,3}$' THEN p_language END;
BEGIN
  IF p_tenant_id IS NULL
     OR p_mobile IS NULL OR p_mobile !~ '^[0-9]{10}$'
     OR p_pin_hash IS NULL OR p_pin_hash !~ '^[0-9a-f]{64}$'
     OR (v_name IS NOT NULL AND char_length(v_name) > 80) THEN
    RAISE EXCEPTION 'ACCOUNT_INPUT_INVALID';
  END IF;

  IF p_roles IS NULL OR cardinality(p_roles) = 0
     OR EXISTS (SELECT 1 FROM unnest(p_roles) r
                 WHERE r IS NULL OR r NOT IN ('SERVICE_PROVIDER', 'CUSTOMER'))
     OR (SELECT count(DISTINCT r) FROM unnest(p_roles) r) <> cardinality(p_roles) THEN
    RAISE EXCEPTION 'ACCOUNT_ROLE_INVALID';
  END IF;

  -- One registration at a time for a (tenant, mobile) pair.
  PERFORM pg_advisory_xact_lock(hashtextextended('account_register:' || p_tenant_id::text || ':' || p_mobile, 0));

  IF EXISTS (SELECT 1 FROM public.accounts a
              WHERE a.tenant_id = p_tenant_id AND a.mobile_number = p_mobile AND a.status <> 'CLOSED')
     OR EXISTS (SELECT 1 FROM public.farmers f
                 WHERE f.tenant_id = p_tenant_id AND f.mobile_number = p_mobile) THEN
    RAISE EXCEPTION 'ACCOUNT_EXISTS';
  END IF;

  BEGIN
    INSERT INTO public.accounts (tenant_id, mobile_number, display_name, language_code, pin_hash, pin_updated_at)
    VALUES (p_tenant_id, p_mobile, v_name, v_lang, p_pin_hash, now())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ACCOUNT_EXISTS';
  END;

  INSERT INTO public.account_roles (account_id, tenant_id, role, status, source)
  SELECT v_id, p_tenant_id, r, 'ACTIVE', 'SELF_REGISTRATION'
    FROM unnest(p_roles) r;

  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.account_add_role_self(p_account_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_acc     public.accounts%ROWTYPE;
  v_status  text;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('FARMER', 'SERVICE_PROVIDER', 'CUSTOMER') THEN
    RAISE EXCEPTION 'ACCOUNT_ROLE_INVALID';
  END IF;

  SELECT * INTO v_acc FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR v_acc.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_ACTIVE' USING errcode = '42501';
  END IF;

  SELECT r.status INTO v_status
    FROM public.account_roles r
   WHERE r.account_id = p_account_id AND r.role = p_role;

  IF p_role <> 'FARMER' THEN
    IF v_status IS NOT NULL THEN
      RETURN v_status;                       -- never switched back on by its owner
    END IF;
    INSERT INTO public.account_roles (account_id, tenant_id, role, status, source)
    VALUES (p_account_id, v_acc.tenant_id, p_role, 'ACTIVE', 'SELF_ADDED');
    RETURN 'ACTIVE';
  END IF;

  -- FARMER ──────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = p_account_id) THEN
    RETURN coalesce(v_status, 'REVOKED');    -- already a farmer: nothing to create
  END IF;
  IF v_status IN ('SUSPENDED', 'PENDING') THEN
    RAISE EXCEPTION 'ROLE_NOT_AVAILABLE' USING errcode = '42501';
  END IF;
  IF v_acc.pin_hash IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_CREDENTIAL_MISSING';
  END IF;

  -- Same columns the auth core's register action writes for a new farmer, plus the
  -- id (equal to the account's) and the credential taken over from the account.
  BEGIN
    INSERT INTO public.farmers (
      id, mobile_number, tenant_id, pin_hash, pin_updated_at, language_preference, is_active,
      app_install_date, total_app_opens, login_attempts, failed_login_attempts, last_failed_login)
    VALUES (
      p_account_id, v_acc.mobile_number, v_acc.tenant_id, v_acc.pin_hash,
      coalesce(v_acc.pin_updated_at, now()), coalesce(v_acc.language_code, 'hi'), true,
      current_date, 0, 0, v_acc.failed_login_attempts, v_acc.last_failed_login);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ACCOUNT_EXISTS';
  END;

  -- The M1 insert trigger has linked the farmer to this account. Prove it before
  -- the account gives up its copy of the credential; otherwise undo everything.
  IF NOT EXISTS (SELECT 1 FROM public.account_roles r
                  WHERE r.account_id = p_account_id AND r.role = 'FARMER' AND r.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'ROLE_NOT_AVAILABLE' USING errcode = '42501';
  END IF;

  UPDATE public.accounts
     SET pin_hash = NULL, pin_updated_at = NULL, failed_login_attempts = 0, last_failed_login = NULL
   WHERE id = p_account_id;

  UPDATE public.account_roles SET source = 'SELF_ADDED'
   WHERE account_id = p_account_id AND role = 'FARMER';

  RETURN 'ACTIVE';
END
$fn$;

CREATE OR REPLACE FUNCTION public.account_switch_session_role(p_token_hash text, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_session_id  uuid;
  v_account_id  uuid;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('FARMER', 'SERVICE_PROVIDER', 'CUSTOMER') THEN
    RAISE EXCEPTION 'ACCOUNT_ROLE_INVALID';
  END IF;

  SELECT s.id, s.user_id INTO v_session_id, v_account_id
    FROM public.user_sessions s
   WHERE p_token_hash IS NOT NULL
     AND s.access_token_hash = p_token_hash
     AND s.is_active = true
     AND s.expires_at > now()
   LIMIT 1
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_INVALID' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
       SELECT 1
         FROM public.accounts a
         JOIN public.account_roles r
           ON r.account_id = a.id AND r.tenant_id = a.tenant_id
          AND r.role = p_role AND r.status = 'ACTIVE'
        WHERE a.id = v_account_id AND a.status = 'ACTIVE'
          AND (p_role <> 'FARMER'
               OR EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = a.id AND f.is_active = true))) THEN
    RAISE EXCEPTION 'ROLE_NOT_HELD' USING errcode = '42501';
  END IF;

  UPDATE public.user_sessions
     SET active_role = p_role, role_verified_at = now()
   WHERE id = v_session_id;

  RETURN p_role;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.account_register_self(uuid, text, text, text[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_add_role_self(uuid, text)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_switch_session_role(text, text)                    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_register_self(uuid, text, text, text[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_add_role_self(uuid, text)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.account_switch_session_role(text, text)                    TO service_role;

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'client roles able to call the account write functions' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
 WHERE p.proname IN ('account_register_self', 'account_add_role_self', 'account_switch_session_role')
   AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
