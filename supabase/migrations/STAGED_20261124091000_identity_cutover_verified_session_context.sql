-- ═══════════════════════════════════════════════════════════════════════════
-- STAGED_20261124091000_identity_cutover_verified_session_context.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1 — the M2 CUTOVER. NOT part of M1.
-- The STAGED_ prefix keeps a migration runner from picking this file up. It is
-- here so the exact statement can be reviewed with M1 and because the M1 tests
-- already run with it (to prove no existing farmer is locked out). It is applied
-- at M2, on its own approval, and renamed to its version number then.
--
-- Body change only. Name, arguments, result columns, language, volatility,
-- SECURITY DEFINER and search_path are identical to the live definition, so the
-- generated types of all three repos and _shared/sessionVerify.ts are unaffected.
--
-- Added to today's checks:
--   * the session's active_role is NULL or FARMER (a person who has switched to the
--     Provider or Customer workspace is not a farmer for that session);
--   * the account of the same id is ACTIVE and holds an ACTIVE FARMER membership.
-- get_current_farmer_id() and get_current_tenant_id() wrap this function, so every
-- existing farmer policy then denies a non-farmer session without being edited.
--
-- PRECONDITION (fail closed, but never lock out an existing farmer): apply only when
--   SELECT count(*) FROM public.v_identity_integrity_gaps
--    WHERE gap IN ('FARMER_WITHOUT_ACCOUNT', 'FARMER_ROLE_MISSING', 'FARMER_ACCOUNT_CLOSED');
-- returns 0. A farmer listed there would lose access the moment this is applied.
--
-- Rollback: ROLLBACK_20261124090000_identity_accounts.sql, statement 1, restores
-- the previous body.
-- ═══════════════════════════════════════════════════════════════════════════

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

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'verified_session_context() result columns' AS check_name,
       pg_get_function_result(p.oid) AS actual,
       'TABLE(session_id uuid, farmer_id uuid, tenant_id uuid)' AS expected
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname = 'verified_session_context'
UNION ALL
SELECT 'live farmer sessions that still resolve to their farmer',
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM public.accounts a
           JOIN public.account_roles r ON r.account_id = a.id AND r.role = 'FARMER' AND r.status = 'ACTIVE'
          WHERE a.id = f.id AND a.status = 'ACTIVE'))::text,
       count(*)::text
  FROM public.user_sessions s
  JOIN public.farmers f ON f.id = s.user_id AND f.is_active = true
 WHERE s.is_active = true AND s.expires_at > now()
   AND (s.active_role IS NULL OR s.active_role = 'FARMER');
