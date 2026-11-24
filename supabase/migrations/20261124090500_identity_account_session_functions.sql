-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124090500_identity_account_session_functions.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M1 — file 6 of 8: the verified session
-- context for provider and customer code.
--
-- New functions only. verified_session_context(), get_current_farmer_id() and
-- get_current_tenant_id() are NOT touched here: the farmer context changes only in
-- the staged cutover file, at M2, after its own approval.
--
--   verified_account_context()  → (session_id, account_id, tenant_id, active_role)
--     Reads the same x-session-token header and applies the same token, is_active
--     and expiry checks as verified_session_context(). It returns a row only when
--     the account is ACTIVE and holds an ACTIVE membership for the session's active
--     role (NULL active_role means FARMER). For a FARMER session it also requires
--     the farmers row to be active, so the two contexts never disagree about a
--     farmer. The role comes from account_roles on every call: a forged or stale
--     active_role, a suspended role or a suspended account returns no row on the
--     next request.
--   get_current_account_id()    → that account id, or NULL
--   get_current_role()          → that role code, or NULL
--
-- They are executable by anon and authenticated because the browser calls the
-- database with the anon key plus the session header (as it does for the farmer
-- functions) and later policies will call them. They return nothing without a
-- valid session token and never return anything about another account.
--
-- Lookup cost: user_sessions by idx_user_sessions_token_hash, accounts by primary
-- key, account_roles by account_roles_account_role_key (account_id, role).
--
-- Safe to run twice. Plain statements, no session state.
-- ═══════════════════════════════════════════════════════════════════════════

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

CREATE OR REPLACE FUNCTION public.get_current_account_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT account_id FROM public.verified_account_context()
$function$;

CREATE OR REPLACE FUNCTION public.get_current_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT active_role FROM public.verified_account_context()
$function$;

REVOKE EXECUTE ON FUNCTION public.verified_account_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_account_id()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_role()         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verified_account_context() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_account_id()   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_role()         TO anon, authenticated, service_role;

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'verified_session_context() still has its original three result columns' AS check_name,
       pg_get_function_result(p.oid) AS actual,
       'TABLE(session_id uuid, farmer_id uuid, tenant_id uuid)' AS expected
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname = 'verified_session_context';
