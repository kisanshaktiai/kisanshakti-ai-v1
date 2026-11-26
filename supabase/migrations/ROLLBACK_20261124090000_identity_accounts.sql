-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK_20261124090000_identity_accounts.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Reviewable SQL, never applied automatically (the ROLLBACK_ prefix keeps a
-- migration runner from picking it up). It switches the identity layer OFF and puts
-- the farmer login path back exactly as it was before 20261124090000 … 090700 and
-- the staged cutover.
--
-- It deletes NO data. Every new table, column and row stays where it is, so the
-- identity layer can be switched on again by re-applying files 090100, 090200,
-- 090300 and 090400 (and then the cutover). Statements are independent and safe
-- to run twice. Farmers deleted while it is switched off keep an un-revoked FARMER
-- role; v_identity_integrity_gaps lists them (LIVE_FARMER_ROLE_WITHOUT_FARMER_ROW).
--
-- What "back as it was" means, statement by statement:
--   1. verified_session_context() gets its previous body (copied from the live
--      definition read on 2026-11-24; compare with PRECHECK statement 4).
--   2. The three identity triggers leave public.farmers; its six original triggers
--      were never changed.
--   3. Sessions stop depending on accounts.
--   4. pin_reset_codes.farmer_id is NOT NULL again (skipped while a reset row
--      without farmer_id exists, which can only happen after M2).
--
-- Not undone, on purpose: the new tables and their rows, user_sessions.active_role
-- and role_verified_at (NULL means FARMER, which is what the old code assumes),
-- pin_reset_codes.account_id, and the system_config row. Dropping those would
-- delete data; if that is ever wanted it is a separate, reviewed decision.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verified_session_context()
 RETURNS TABLE(session_id uuid, farmer_id uuid, tenant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, f.id, f.tenant_id
  FROM public.user_sessions s
  JOIN public.farmers f ON f.id = s.user_id
  WHERE s.access_token_hash = public.hash_session_token(
          current_setting('request.headers', true)::json ->> 'x-session-token')
    AND s.is_active = true
    AND s.expires_at > now()
    AND f.is_active = true
  LIMIT 1
$function$;

-- 2 ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_farmer_account_created        ON public.farmers;
DROP TRIGGER IF EXISTS on_farmer_account_deleted        ON public.farmers;
DROP TRIGGER IF EXISTS on_farmer_account_mobile_changed ON public.farmers;

-- 3 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_account_fkey;

-- 4 ─────────────────────────────────────────────────────────────────────────
DO $rollback$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pin_reset_codes WHERE farmer_id IS NULL) THEN
    ALTER TABLE public.pin_reset_codes ALTER COLUMN farmer_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'pin_reset_codes.farmer_id left nullable: reset rows without a farmer_id exist';
  END IF;
END
$rollback$;

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'identity triggers left on farmers' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM pg_trigger
 WHERE tgrelid = 'public.farmers'::regclass AND NOT tgisinternal AND tgname LIKE 'on_farmer_account%'
UNION ALL
SELECT 'verified_session_context() reads accounts', (position('accounts' IN p.prosrc) > 0)::text, 'false'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname = 'verified_session_context'
UNION ALL
SELECT 'user_sessions_account_fkey present', count(*)::text, '0'
  FROM pg_constraint
 WHERE conrelid = 'public.user_sessions'::regclass AND conname = 'user_sessions_account_fkey';
