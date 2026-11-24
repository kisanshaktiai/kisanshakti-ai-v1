-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124090100_identity_farmer_triggers.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M1 — file 2 of 8: keep accounts in step
-- with farmers, whoever writes farmers (farmer app, tenant portal, admin import).
--
-- Adds three triggers to public.farmers. No existing trigger, function, column,
-- policy or grant on farmers is changed:
--   on_farmer_account_created         AFTER INSERT
--   on_farmer_account_deleted         AFTER DELETE
--   on_farmer_account_mobile_changed  AFTER UPDATE OF mobile_number, only when the
--                                     number really changed
--
-- Behaviour:
--   INSERT  → account with the SAME id as the farmer, plus an ACTIVE FARMER role,
--             in the inserting transaction. If the insert rolls back, so do they.
--   DELETE  → the FARMER role becomes REVOKED. Nothing is deleted. If the person
--             holds another live role the credential moves from the deleted
--             farmers row to the account (single copy); otherwise the account is
--             CLOSED so the number is free for a new farmers row.
--   UPDATE of mobile_number → the account follows the new number.
--
-- A farmers write is never failed for a reason this file knows about. A farmer with
-- no tenant, with no mobile number, or whose number is already held by another
-- open account in the tenant gets a row in account_link_conflicts instead, and
-- appears in v_identity_integrity_gaps. No tenant is invented and no account is
-- re-keyed. An error this file does not know about is NOT swallowed: it fails the
-- write, so a farmer can never exist silently without an account.
--
-- on_farmer_account_mobile_changed is column-specific, so it does not fire for the
-- UPDATE that handle_farmer_creation() runs inside the insert, nor for the login
-- counters the auth core updates.
--
-- Safe to run twice. Plain statements, no session state.
-- ═══════════════════════════════════════════════════════════════════════════

-- Records why a farmer could not be linked. One open note per farmer and reason.
CREATE OR REPLACE FUNCTION public.note_account_link_conflict(
  p_farmer_id uuid, p_tenant_id uuid, p_mobile text, p_account_id uuid, p_reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  INSERT INTO public.account_link_conflicts (farmer_id, tenant_id, mobile_number, account_id, reason)
  VALUES (p_farmer_id, p_tenant_id, p_mobile, p_account_id, p_reason)
  ON CONFLICT (farmer_id, reason) WHERE resolved_at IS NULL
  DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                mobile_number = EXCLUDED.mobile_number,
                account_id = EXCLUDED.account_id,
                detected_at = now();
$fn$;

-- Makes sure the farmer has an account with the same id and a FARMER role.
-- Used by the insert trigger, the mobile-change trigger and the backfill.
CREATE OR REPLACE FUNCTION public.link_farmer_account(
  p_farmer_id uuid, p_tenant_id uuid, p_mobile text, p_source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_own     public.accounts%ROWTYPE;
  v_has_own boolean;
  v_other   uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    PERFORM public.note_account_link_conflict(p_farmer_id, NULL, p_mobile, NULL, 'NULL_TENANT');
    RETURN;
  END IF;
  IF p_mobile IS NULL THEN
    PERFORM public.note_account_link_conflict(p_farmer_id, p_tenant_id, NULL, NULL, 'NULL_MOBILE');
    RETURN;
  END IF;

  SELECT * INTO v_own FROM public.accounts WHERE id = p_farmer_id;
  v_has_own := FOUND;

  IF v_has_own AND v_own.tenant_id <> p_tenant_id THEN
    PERFORM public.note_account_link_conflict(p_farmer_id, p_tenant_id, p_mobile, p_farmer_id, 'TENANT_MISMATCH');
    RETURN;
  END IF;

  SELECT a.id INTO v_other
    FROM public.accounts a
   WHERE a.tenant_id = p_tenant_id AND a.mobile_number = p_mobile
     AND a.status <> 'CLOSED' AND a.id <> p_farmer_id
   LIMIT 1;
  IF v_other IS NOT NULL THEN
    PERFORM public.note_account_link_conflict(p_farmer_id, p_tenant_id, p_mobile, v_other, 'MOBILE_ACCOUNT_EXISTS');
    RETURN;
  END IF;

  BEGIN
    IF NOT v_has_own THEN
      INSERT INTO public.accounts (id, tenant_id, mobile_number)
      VALUES (p_farmer_id, p_tenant_id, p_mobile);
    ELSIF v_own.mobile_number <> p_mobile OR v_own.status = 'CLOSED' THEN
      UPDATE public.accounts
         SET mobile_number = p_mobile,
             status = CASE WHEN status = 'CLOSED' THEN 'ACTIVE' ELSE status END
       WHERE id = p_farmer_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Another transaction took the number between the check above and the write.
    SELECT a.id INTO v_other
      FROM public.accounts a
     WHERE a.tenant_id = p_tenant_id AND a.mobile_number = p_mobile
       AND a.status <> 'CLOSED' AND a.id <> p_farmer_id
     LIMIT 1;
    PERFORM public.note_account_link_conflict(p_farmer_id, p_tenant_id, p_mobile, v_other, 'MOBILE_ACCOUNT_EXISTS');
    RETURN;
  END;

  -- A REVOKED farmer role comes back to ACTIVE (the farmers row exists again).
  -- A SUSPENDED or PENDING one is left exactly as it is.
  INSERT INTO public.account_roles (account_id, tenant_id, role, status, source)
  VALUES (p_farmer_id, p_tenant_id, 'FARMER', 'ACTIVE', p_source)
  ON CONFLICT (account_id, role)
  DO UPDATE SET status = 'ACTIVE', source = EXCLUDED.source, granted_at = now()
   WHERE account_roles.status = 'REVOKED';

  UPDATE public.account_link_conflicts
     SET resolved_at = now(), resolution = 'LINKED'
   WHERE farmer_id = p_farmer_id AND resolved_at IS NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.handle_farmer_account_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM public.link_farmer_account(NEW.id, NEW.tenant_id, NEW.mobile_number::text, 'FARMER_TRIGGER');
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.handle_farmer_account_mobile_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.mobile_number IS NULL THEN
    -- accounts.mobile_number cannot be NULL: keep the account as it is and report.
    PERFORM public.note_account_link_conflict(NEW.id, NEW.tenant_id, OLD.mobile_number::text, NEW.id, 'MOBILE_CLEARED');
  ELSE
    PERFORM public.link_farmer_account(NEW.id, NEW.tenant_id, NEW.mobile_number::text, 'FARMER_TRIGGER');
  END IF;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.handle_farmer_account_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  UPDATE public.account_roles
     SET status = 'REVOKED'
   WHERE account_id = OLD.id AND role = 'FARMER' AND status <> 'REVOKED';

  IF EXISTS (SELECT 1 FROM public.account_roles r
              WHERE r.account_id = OLD.id AND r.role <> 'FARMER' AND r.status <> 'REVOKED') THEN
    -- The person stays as a provider or customer. The farmers row was the one copy
    -- of the credential and it is gone now, so the account takes it over.
    UPDATE public.accounts
       SET pin_hash = OLD.pin_hash,
           pin_updated_at = OLD.pin_updated_at,
           failed_login_attempts = COALESCE(OLD.failed_login_attempts, 0),
           last_failed_login = OLD.last_failed_login
     WHERE id = OLD.id AND pin_hash IS NULL;
  ELSE
    -- Nothing else is held: close the account so the number is free for a new
    -- farmers row. A SUSPENDED account stays SUSPENDED and keeps holding the number.
    UPDATE public.accounts SET status = 'CLOSED' WHERE id = OLD.id AND status = 'ACTIVE';
  END IF;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE TRIGGER on_farmer_account_created
  AFTER INSERT ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.handle_farmer_account_created();

CREATE OR REPLACE TRIGGER on_farmer_account_deleted
  AFTER DELETE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.handle_farmer_account_deleted();

CREATE OR REPLACE TRIGGER on_farmer_account_mobile_changed
  AFTER UPDATE OF mobile_number ON public.farmers
  FOR EACH ROW WHEN (OLD.mobile_number IS DISTINCT FROM NEW.mobile_number)
  EXECUTE FUNCTION public.handle_farmer_account_mobile_changed();

-- These run only from the triggers above and the backfill. Nobody calls them over the API:
-- link_farmer_account() would otherwise let any caller create an account for any id.
REVOKE EXECUTE ON FUNCTION public.note_account_link_conflict(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_farmer_account(uuid, uuid, text, text)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_farmer_account_created()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_farmer_account_mobile_changed()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_farmer_account_deleted()                         FROM PUBLIC, anon, authenticated;

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'identity triggers on farmers' AS check_name, count(*)::text AS actual, '3' AS expected
  FROM pg_trigger
 WHERE tgrelid = 'public.farmers'::regclass AND NOT tgisinternal
   AND tgname IN ('on_farmer_account_created', 'on_farmer_account_deleted', 'on_farmer_account_mobile_changed')
UNION ALL
SELECT 'client roles able to call the link functions', count(*)::text, '0'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
 WHERE p.proname IN ('note_account_link_conflict', 'link_farmer_account', 'handle_farmer_account_created',
                     'handle_farmer_account_mobile_changed', 'handle_farmer_account_deleted')
   AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
