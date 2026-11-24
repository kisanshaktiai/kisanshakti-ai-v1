-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124110000_identity_breaker_fixes.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1 — fixes for paths the independent verifier broke
-- (tests/identity/breaker). Three existing functions get a new body; names,
-- arguments, result types, SECURITY DEFINER, search_path and grants are
-- unchanged. No table, column, policy or data is changed by this file.
--
--   1. link_farmer_account            a farmer added by a portal whose number is
--                                     already registered as provider or customer
--                                     only now ADOPTS that account instead of
--                                     being left without one and unable to log
--                                     in (verifier C05, C06, C07, C20); and a
--                                     mobile-number edit no longer switches a
--                                     REVOKED Farmer role back on (D11).
--   2. handle_farmer_account_mobile_changed
--                                     passes the source 'FARMER_MOBILE_CHANGE'.
--   3. account_add_role_self          a person cannot give themselves back a
--                                     REVOKED Farmer role (D09, D10, D24), and a
--                                     person with no ACTIVE role cannot add one
--                                     (A26).
--
-- Rollback: re-run the three CREATE OR REPLACE FUNCTION statements from
-- 20261124090100_identity_farmer_triggers.sql and
-- 20261124100000_identity_account_auth_functions.sql.
-- ═══════════════════════════════════════════════════════════════════════════

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
    -- The number is held by another open account of the tenant.
    --   * That account belongs to another farmer, or this farmer already has an
    --     account of its own: a real conflict, recorded for a person to resolve.
    --   * Otherwise it is the account of a person registered as provider or
    --     customer only, and the same person is now being added as a farmer
    --     (one login per person). The account is adopted: its id becomes the
    --     farmer's id, so its roles, Reach, sessions and reset codes follow
    --     through ON UPDATE CASCADE. The farmer row's PIN is the one credential
    --     (single-copy rule); the account's copy is cleared, every session it
    --     had is ended and its unused reset codes are consumed, so whoever
    --     registered the number first keeps no way in.
    IF v_has_own OR EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = v_other) THEN
      PERFORM public.note_account_link_conflict(p_farmer_id, p_tenant_id, p_mobile, v_other, 'MOBILE_ACCOUNT_EXISTS');
      RETURN;
    END IF;

    UPDATE public.user_sessions
       SET is_active = false
     WHERE user_id = v_other AND is_active = true;

    UPDATE public.pin_reset_codes
       SET consumed_at = now()
     WHERE account_id = v_other AND consumed_at IS NULL;

    UPDATE public.accounts
       SET id = p_farmer_id,
           pin_hash = NULL,
           pin_updated_at = NULL,
           failed_login_attempts = 0,
           last_failed_login = NULL
     WHERE id = v_other;

    SELECT * INTO v_own FROM public.accounts WHERE id = p_farmer_id;
    v_has_own := FOUND;
    v_other := NULL;
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
   WHERE account_roles.status = 'REVOKED'
     AND p_source <> 'FARMER_MOBILE_CHANGE';

  UPDATE public.account_link_conflicts
     SET resolved_at = now(), resolution = 'LINKED'
   WHERE farmer_id = p_farmer_id AND resolved_at IS NULL;
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
    PERFORM public.link_farmer_account(NEW.id, NEW.tenant_id, NEW.mobile_number::text, 'FARMER_MOBILE_CHANGE');
  END IF;
  RETURN NULL;
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
    -- Adding a role is for a person in good standing: someone whose every role
    -- is suspended, pending or removed cannot open a fresh one for themselves.
    IF NOT EXISTS (SELECT 1 FROM public.account_roles r
                    WHERE r.account_id = p_account_id AND r.status = 'ACTIVE') THEN
      RAISE EXCEPTION 'ROLE_NOT_AVAILABLE' USING errcode = '42501';
    END IF;
    INSERT INTO public.account_roles (account_id, tenant_id, role, status, source)
    VALUES (p_account_id, v_acc.tenant_id, p_role, 'ACTIVE', 'SELF_ADDED');
    RETURN 'ACTIVE';
  END IF;

  -- FARMER ──────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = p_account_id) THEN
    RETURN coalesce(v_status, 'REVOKED');    -- already a farmer: nothing to create
  END IF;
  -- REVOKED included: a Farmer role the tenant took away (the farmers row was
  -- deleted) is given back only by the tenant creating the farmer again.
  IF v_status IN ('SUSPENDED', 'PENDING', 'REVOKED') THEN
    RAISE EXCEPTION 'ROLE_NOT_AVAILABLE' USING errcode = '42501';
  END IF;
  -- Adding a role is for a person in good standing: someone whose every role
  -- is suspended, pending or removed cannot open a fresh one for themselves.
  IF NOT EXISTS (SELECT 1 FROM public.account_roles r
                  WHERE r.account_id = p_account_id AND r.status = 'ACTIVE') THEN
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
