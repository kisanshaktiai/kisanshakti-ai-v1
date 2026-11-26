-- ============================================================================
-- Farmer activation: licence lock
-- (second database part; needs 20261124160000_farmer_activation_core.sql)
-- ============================================================================
-- Why
--   The activation core trusts two existing values as "the licence":
--     * tenants.max_farmers            = how many farmers the tenant paid for
--     * the latest tenant_subscriptions row = whether the tenant is active
--   Both could be written by the tenant itself. Proven on the live project on
--   2026-11-25, inside a rolled-back transaction, as a tenant admin who is not
--   a platform admin: UPDATE tenants SET max_farmers = 999999 succeeded, and
--   INSERT of an 'active' tenant_subscriptions row valid for 10 years succeeded.
--
-- What this does
--   1. tenants: a signed-in user who is not a platform super admin can no longer
--      change max_farmers, status or is_default. Every other column is untouched.
--   2. tenant_subscriptions: such a user can no longer insert or delete a row,
--      and can change status only to cancel. Plan, payment and renewal fields
--      stay editable as before.
--   3. activation_admin_set_entitlement(): the one audited way to record what a
--      tenant bought - number of licences and valid-until date. Super admin only.
--   4. activation_admin_generate_batch(): now refuses to issue more codes than
--      the tenant has licences left (used seats + unused codes + new codes must
--      fit inside the licence count) and refuses a tenant without an active
--      subscription.
--   5. activation_usage(): also reports how many codes can still be issued.
--
-- Not affected: the service role (edge functions) and platform super admins.
-- No screen of the tenant portal or the admin portal writes the locked fields
-- as a tenant user (checked in both repos on 2026-11-25).
--
-- Self-contained: no TEMP tables, no session state. Nothing is deleted.
-- Rollback: tests/activation/rollback_licence_lock.sql
-- ============================================================================

-- ── 0. pre-flight ───────────────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regprocedure('activation.is_enforced()') IS NULL
     OR to_regprocedure('public.activation_usage(uuid)') IS NULL THEN
    RAISE EXCEPTION 'farmer_activation_licence_lock: apply 20261124160000_farmer_activation_core.sql first';
  END IF;
END
$preflight$;

-- ── 1. tenants: the licence fields ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION activation.tenant_licence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  -- auth.uid() is NULL for the service role and for database jobs.
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.max_farmers IS DISTINCT FROM OLD.max_farmers
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_default IS DISTINCT FROM OLD.is_default THEN
    RAISE EXCEPTION 'licence_locked' USING ERRCODE = '42501',
      DETAIL = 'licence count, tenant status and the default-tenant mark are set by the platform admin only';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS activation_tenant_licence_guard ON public.tenants;
CREATE TRIGGER activation_tenant_licence_guard
  BEFORE UPDATE OF max_farmers, status, is_default ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION activation.tenant_licence_guard();

-- ── 2. tenant_subscriptions: what makes a tenant "active" ───────────────────
CREATE OR REPLACE FUNCTION activation.tenant_subscription_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'licence_locked' USING ERRCODE = '42501',
      DETAIL = 'a tenant subscription is created and removed by the platform admin only';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at            -- the latest row decides
     OR NEW.current_period_start IS DISTINCT FROM OLD.current_period_start
     OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
     OR NEW.grace_period_ends_at IS DISTINCT FROM OLD.grace_period_ends_at
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('canceled', 'cancelled')) THEN
    RAISE EXCEPTION 'licence_locked' USING ERRCODE = '42501',
      DETAIL = 'subscription status and validity are set by the platform admin only';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS activation_tenant_subscription_guard ON public.tenant_subscriptions;
CREATE TRIGGER activation_tenant_subscription_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION activation.tenant_subscription_guard();

REVOKE ALL ON FUNCTION activation.tenant_licence_guard()      FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION activation.tenant_subscription_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. recording what a tenant bought ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activation_admin_set_entitlement(
  p_tenant_id uuid, p_licences integer, p_valid_until timestamptz, p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor   uuid := auth.uid();
  v_reason  text := NULLIF(left(btrim(p_reason), 300), '');
  v_tenant  record;
  v_sub     record;
  v_sub_id  uuid;
  v_used    integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF p_licences IS NULL OR p_licences < 0 OR p_licences > 1000000 THEN
    RAISE EXCEPTION 'invalid_licences' USING ERRCODE = '22023';
  END IF;
  IF p_valid_until IS NULL OR p_valid_until <= now() OR p_valid_until > now() + interval '5 years' THEN
    RAISE EXCEPTION 'invalid_valid_until' USING ERRCODE = '22023';
  END IF;

  SELECT t.id, t.max_farmers, t.deleted_at INTO v_tenant
    FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_tenant.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_not_eligible' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_used FROM public.farmers f
   WHERE f.tenant_id = p_tenant_id AND f.activation_pending = false AND COALESCE(f.archived, false) = false;
  IF p_licences < v_used THEN
    RAISE EXCEPTION 'licences_below_used' USING ERRCODE = '22023',
      DETAIL = format('%s farmers are already active in this tenant', v_used);
  END IF;

  UPDATE public.tenants SET max_farmers = p_licences WHERE id = p_tenant_id;

  SELECT s.id, s.status, s.current_period_end INTO v_sub
    FROM public.tenant_subscriptions s
   WHERE s.tenant_id = p_tenant_id
   ORDER BY s.created_at DESC NULLS LAST LIMIT 1
     FOR UPDATE;
  IF FOUND THEN
    v_sub_id := v_sub.id;
    UPDATE public.tenant_subscriptions
       SET status = 'active', current_period_end = p_valid_until
     WHERE id = v_sub_id;
  ELSE
    -- billing_interval is NOT NULL on this table; the validity date above is
    -- what activation reads, the interval is only a label here.
    INSERT INTO public.tenant_subscriptions
      (tenant_id, billing_interval, status, current_period_start, current_period_end, auto_renew, metadata)
    VALUES
      (p_tenant_id, 'annually', 'active', now(), p_valid_until, false,
       jsonb_build_object('source', 'activation_admin_set_entitlement'))
    RETURNING id INTO v_sub_id;
  END IF;

  PERFORM activation.log('ENTITLEMENT_SET', true, 'entitlement_set', NULL, p_tenant_id, NULL, v_actor, NULL,
    NULL, NULL, jsonb_build_object(
      'reason', v_reason,
      'licences_before', v_tenant.max_farmers, 'licences_after', p_licences,
      'subscription_id', v_sub_id,
      'status_before', v_sub.status, 'valid_until_before', v_sub.current_period_end,
      'valid_until_after', p_valid_until));

  RETURN jsonb_build_object('tenant_id', p_tenant_id, 'licences', p_licences, 'seats_used', v_used,
                            'valid_until', p_valid_until, 'subscription_id', v_sub_id);
END
$fn$;

REVOKE ALL ON FUNCTION public.activation_admin_set_entitlement(uuid, integer, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activation_admin_set_entitlement(uuid, integer, timestamptz, text) TO authenticated;

-- ── 4. issuing codes: never more than the licences left ─────────────────────
CREATE OR REPLACE FUNCTION public.activation_admin_generate_batch(
  p_tenant_id uuid, p_count integer, p_expires_at timestamptz,
  p_subscription_interval text, p_farmer_plan_id uuid, p_label text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor    uuid := auth.uid();
  v_batch_id uuid;
  v_pepper   text;
  v_key      text;
  v_plain    text;
  v_tenant   record;
  v_sub      record;
  v_used     integer;
  v_open     integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 2000 THEN
    RAISE EXCEPTION 'invalid_count' USING ERRCODE = '22023', DETAIL = 'a batch holds 1 to 2000 codes';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + interval '3 years' THEN
    RAISE EXCEPTION 'invalid_expiry' USING ERRCODE = '22023';
  END IF;
  IF p_subscription_interval IS NULL OR p_subscription_interval NOT IN ('biannual', 'annually') THEN
    RAISE EXCEPTION 'invalid_interval' USING ERRCODE = '22023';
  END IF;

  -- The tenant row lock puts concurrent batches, and activations, in line.
  SELECT t.status::text AS status, t.max_farmers, t.deleted_at, COALESCE(t.archived, false) AS archived
    INTO v_tenant FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_tenant.status NOT IN ('active', 'trial')
     OR v_tenant.deleted_at IS NOT NULL OR v_tenant.archived THEN
    RAISE EXCEPTION 'tenant_not_eligible' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans p
                  WHERE p.id = p_farmer_plan_id AND p.plan_category = 'farmer' AND p.is_active
                    AND (p.tenant_id IS NULL OR p.tenant_id = p_tenant_id)) THEN
    RAISE EXCEPTION 'invalid_farmer_plan' USING ERRCODE = '22023';
  END IF;

  SELECT s.status, s.current_period_end INTO v_sub
    FROM public.tenant_subscriptions s
   WHERE s.tenant_id = p_tenant_id
   ORDER BY s.created_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND OR v_sub.status NOT IN ('active', 'trial', 'trialing')
     OR (v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end <= now()) THEN
    RAISE EXCEPTION 'subscription_inactive' USING ERRCODE = '22023',
      DETAIL = 'record the tenant''s licences and validity first';
  END IF;

  SELECT count(*) INTO v_used FROM public.farmers f
   WHERE f.tenant_id = p_tenant_id AND f.activation_pending = false AND COALESCE(f.archived, false) = false;
  SELECT count(*) INTO v_open FROM public.activation_codes c
   WHERE c.tenant_id = p_tenant_id AND c.state IN ('GENERATED', 'AVAILABLE') AND c.expires_at > now();
  IF v_tenant.max_farmers IS NULL OR v_used + v_open + p_count > v_tenant.max_farmers THEN
    RAISE EXCEPTION 'exceeds_licences' USING ERRCODE = '22023',
      DETAIL = format('licences %s, active farmers %s, unused codes %s, can still issue %s',
                      COALESCE(v_tenant.max_farmers, 0), v_used, v_open,
                      GREATEST(0, COALESCE(v_tenant.max_farmers, 0) - v_used - v_open));
  END IF;

  INSERT INTO public.activation_code_batches
    (tenant_id, batch_label, code_count, expires_at, subscription_interval, farmer_plan_id, created_by)
  VALUES
    (p_tenant_id, NULLIF(left(btrim(p_label), 120), ''), p_count, p_expires_at,
     p_subscription_interval, p_farmer_plan_id, v_actor)
  RETURNING id INTO v_batch_id;

  v_pepper := activation.secret('activation_code_pepper');
  v_key    := activation.secret('activation_code_enc_key');
  FOR i IN 1..p_count LOOP
    LOOP
      v_plain := activation.new_code();
      BEGIN
        INSERT INTO public.activation_codes
          (tenant_id, batch_id, code_hash, code_ciphertext, code_hint, state, expires_at, created_by)
        VALUES
          (p_tenant_id, v_batch_id, activation.hash_code(v_plain, v_pepper),
           extensions.pgp_sym_encrypt(v_plain, v_key, 'cipher-algo=aes256, s2k-mode=1'),
           right(v_plain, 4), 'GENERATED', p_expires_at, v_actor);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        NULL;                                    -- 1 in 2^60: draw again
      END;
    END LOOP;
  END LOOP;

  PERFORM activation.log('BATCH_GENERATED', true, 'generated', NULL, p_tenant_id, NULL, v_actor, v_batch_id,
                         NULL, NULL, jsonb_build_object('count', p_count));
  RETURN jsonb_build_object(
    'batch_id', v_batch_id, 'tenant_id', p_tenant_id, 'code_count', p_count, 'state', 'GENERATED',
    'expires_at', p_expires_at, 'seat_limit', v_tenant.max_farmers, 'seats_used', v_used,
    'unused_codes', v_open + p_count,
    'can_still_issue', v_tenant.max_farmers - v_used - v_open - p_count);
END
$fn$;

-- ── 5. usage: also how many codes can still be issued ───────────────────────
CREATE OR REPLACE FUNCTION public.activation_usage(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_super  boolean;
  v_tenant record;
  v_sub    record;
  v_used   integer;
  v_open   integer;
  v_codes  jsonb;
  v_sub_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  v_super := public.is_super_admin();
  IF NOT (v_super OR public.is_tenant_admin(p_tenant_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT t.status::text AS status, t.max_farmers INTO v_tenant FROM public.tenants t WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT s.status, s.current_period_end INTO v_sub FROM public.tenant_subscriptions s
   WHERE s.tenant_id = p_tenant_id ORDER BY s.created_at DESC NULLS LAST LIMIT 1;
  v_sub_ok := FOUND AND v_sub.status IN ('active', 'trial', 'trialing')
              AND (v_sub.current_period_end IS NULL OR v_sub.current_period_end > now());
  SELECT count(*) INTO v_used FROM public.farmers f
   WHERE f.tenant_id = p_tenant_id AND f.activation_pending = false AND COALESCE(f.archived, false) = false;
  SELECT count(*) INTO v_open FROM public.activation_codes c
   WHERE c.tenant_id = p_tenant_id AND c.state IN ('GENERATED', 'AVAILABLE') AND c.expires_at > now();
  SELECT jsonb_build_object(
           'available', count(*) FILTER (WHERE c.state = 'AVAILABLE' AND c.expires_at > now()),
           'activated', count(*) FILTER (WHERE c.state = 'ACTIVATED'),
           'revoked',   count(*) FILTER (WHERE c.state = 'REVOKED'),
           'expired',   count(*) FILTER (WHERE c.state = 'EXPIRED'
                                            OR (c.state = 'AVAILABLE' AND c.expires_at <= now())))
         || CASE WHEN v_super THEN jsonb_build_object(
              'generated', count(*) FILTER (WHERE c.state = 'GENERATED' AND c.expires_at > now()))
            ELSE '{}'::jsonb END
    INTO v_codes FROM public.activation_codes c WHERE c.tenant_id = p_tenant_id;
  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_status', v_tenant.status,
    'subscription', jsonb_build_object('status', v_sub.status, 'period_end', v_sub.current_period_end, 'active', v_sub_ok),
    'seat_limit', v_tenant.max_farmers,
    'seats_used', v_used,
    'seats_remaining', GREATEST(0, COALESCE(v_tenant.max_farmers, 0) - v_used),
    'capacity_exhausted', (v_tenant.max_farmers IS NULL OR v_used >= v_tenant.max_farmers),
    'codes', v_codes,
    'enforced', activation.is_enforced())
    || CASE WHEN v_super THEN jsonb_build_object(
         'can_still_issue', GREATEST(0, COALESCE(v_tenant.max_farmers, 0) - v_used - v_open))
       ELSE '{}'::jsonb END;
END
$fn$;
