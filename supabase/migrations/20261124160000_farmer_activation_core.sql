-- ============================================================================
-- Farmer activation core  (database part of the activation-code system)
-- ============================================================================
-- What this adds
--   * activation_code_batches            new table: one row per generated batch
--   * activation_codes                   extended: hash, encrypted copy, state machine
--   * activation_logs                    extended: becomes the immutable audit trail
--   * farmers                            3 new columns + one global mobile index
--   * schema "activation"                internal helpers, not reachable through the API
--   * public.activation_*                the only entry points (see GRANTs at the end)
--   * feature flag farmer_activation_required, inserted DISABLED
--
-- Behaviour while the flag is OFF (the state right after this migration)
--   Registration, login, the tenant portal "create farmer" and every existing
--   farmer keep working exactly as before. Codes can already be generated,
--   released, revealed and revoked; redeeming answers activation_not_enabled.
--
-- Behaviour when the flag is turned ON
--   * a farmers row can be born only (a) pending, in the default tenant, or
--     (b) created by a signed-in portal user inside the tenant's seat limit and
--     active subscription;
--   * a pending farmer becomes active only through activation_redeem(), which
--     moves the farmer to the tenant OF THE CODE in one transaction;
--   * farmers.tenant_id can no longer be changed any other way.
--
-- Security model
--   * codes: 12 symbols from a 32-symbol alphabet = 60 random bits (pgcrypto CSPRNG)
--   * stored: HMAC-SHA256(code, pepper) only. The pepper and the encryption key
--     live in Supabase Vault and are generated here, inside the database; nobody
--     ever sees them and they are in no repo and no edge-function secret.
--   * an AES-256 encrypted copy is kept ONLY while a code is unused, so the
--     tenant can re-download it; it is wiped the moment the code is activated,
--     revoked or expired.
--   * one use: row lock + conditional state change, guarded again by a trigger.
--   * the audit table refuses UPDATE, DELETE and TRUNCATE for every role.
--
-- Self-contained: no TEMP tables, no session state between statements.
-- Nothing is deleted. Rollback: tests/activation/rollback.sql (kept outside this
-- folder so no tool applies it as a migration). Checks: tests/activation/validate.sql
-- ============================================================================

-- ── 0. pre-flight: abort before changing anything if an assumption is false ──
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.farmers WHERE mobile_number IS NOT NULL
             GROUP BY mobile_number HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'farmer_activation_core: the same mobile number exists on more than one farmer; resolve before applying';
  END IF;
  IF (SELECT count(*) FROM public.tenants WHERE is_default IS TRUE) <> 1 THEN
    RAISE EXCEPTION 'farmer_activation_core: expected exactly one default tenant';
  END IF;
  IF EXISTS (SELECT 1 FROM public.activation_codes WHERE code IS NOT NULL) THEN
    RAISE EXCEPTION 'farmer_activation_core: activation_codes holds legacy plain-text rows; this migration expects none';
  END IF;
END
$preflight$;

-- ── 1. internal schema and the two secrets ──────────────────────────────────
CREATE SCHEMA IF NOT EXISTS activation;
REVOKE ALL ON SCHEMA activation FROM PUBLIC;
REVOKE ALL ON SCHEMA activation FROM anon, authenticated, service_role;

DO $secrets$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'activation_code_pepper') THEN
    PERFORM vault.create_secret(
      new_secret      => encode(extensions.gen_random_bytes(32), 'hex'),
      new_name        => 'activation_code_pepper',
      new_description => 'HMAC key for activation code hashes. Never rotate while unused codes exist: their hashes would stop matching.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'activation_code_enc_key') THEN
    PERFORM vault.create_secret(
      new_secret      => encode(extensions.gen_random_bytes(32), 'hex'),
      new_name        => 'activation_code_enc_key',
      new_description => 'AES-256 key for the encrypted copy of unused activation codes (tenant re-download).');
  END IF;
END
$secrets$;

-- ── 2. tables ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activation_code_batches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  batch_label            text,
  code_count             integer NOT NULL CHECK (code_count BETWEEN 1 AND 2000),
  expires_at             timestamptz NOT NULL,
  -- Farmer plans are half-yearly or annual only (fn_farmer_subscription_normalize).
  subscription_interval  text NOT NULL CHECK (subscription_interval IN ('biannual', 'annually')),
  farmer_plan_id         uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  created_by             uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  released_at            timestamptz,
  released_by            uuid
);
CREATE INDEX IF NOT EXISTS activation_code_batches_tenant_idx
  ON public.activation_code_batches (tenant_id, created_at DESC);

ALTER TABLE public.activation_codes
  ALTER COLUMN code DROP NOT NULL,              -- new rows never carry the plain code
  ADD COLUMN IF NOT EXISTS batch_id        uuid REFERENCES public.activation_code_batches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS code_hash       bytea,
  ADD COLUMN IF NOT EXISTS code_ciphertext bytea,
  ADD COLUMN IF NOT EXISTS code_hint       text,
  ADD COLUMN IF NOT EXISTS state           text NOT NULL DEFAULT 'GENERATED',
  ADD COLUMN IF NOT EXISTS released_at     timestamptz,
  ADD COLUMN IF NOT EXISTS released_by     uuid,
  ADD COLUMN IF NOT EXISTS revoked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by      uuid,
  ADD COLUMN IF NOT EXISTS revoke_reason   text,
  ADD COLUMN IF NOT EXISTS expired_at      timestamptz;

ALTER TABLE public.activation_codes DROP CONSTRAINT IF EXISTS activation_codes_state_check;
ALTER TABLE public.activation_codes ADD CONSTRAINT activation_codes_state_check
  CHECK (state IN ('GENERATED', 'AVAILABLE', 'ACTIVATED', 'EXPIRED', 'REVOKED'));

CREATE UNIQUE INDEX IF NOT EXISTS activation_codes_code_hash_key
  ON public.activation_codes (code_hash) WHERE code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS activation_codes_tenant_state_idx ON public.activation_codes (tenant_id, state);
CREATE INDEX IF NOT EXISTS activation_codes_batch_idx        ON public.activation_codes (batch_id);
CREATE INDEX IF NOT EXISTS activation_codes_redeemed_by_idx  ON public.activation_codes (redeemed_by) WHERE redeemed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS activation_codes_due_idx          ON public.activation_codes (expires_at) WHERE state IN ('GENERATED', 'AVAILABLE');

ALTER TABLE public.activation_logs
  ALTER COLUMN activation_code_id DROP NOT NULL, -- an unknown code has no row to point at
  ALTER COLUMN tenant_id          DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS event       text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS result_code text,
  ADD COLUMN IF NOT EXISTS farmer_id   uuid,     -- deliberately no FK: the trail outlives the row
  ADD COLUMN IF NOT EXISTS actor_id    uuid,
  ADD COLUMN IF NOT EXISTS batch_id    uuid;

CREATE INDEX IF NOT EXISTS activation_logs_farmer_failed_idx
  ON public.activation_logs (farmer_id, created_at DESC) WHERE event = 'REDEEM_FAILED';
CREATE INDEX IF NOT EXISTS activation_logs_ip_failed_idx
  ON public.activation_logs (ip_address, created_at DESC) WHERE event = 'REDEEM_FAILED';
CREATE INDEX IF NOT EXISTS activation_logs_tenant_created_idx
  ON public.activation_logs (tenant_id, created_at DESC);

ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS activation_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activated_at       timestamptz,
  ADD COLUMN IF NOT EXISTS activation_code_id uuid;

-- One mobile number = one farmer across all tenants.
CREATE UNIQUE INDEX IF NOT EXISTS farmers_mobile_global_unique
  ON public.farmers (mobile_number) WHERE mobile_number IS NOT NULL;

-- ── 3. internal helpers (schema activation) ─────────────────────────────────
CREATE OR REPLACE FUNCTION activation.secret(p_name text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v text;
BEGIN
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = p_name;
  IF v IS NULL OR length(v) < 64 THEN
    RAISE EXCEPTION 'activation secret % is missing', p_name;
  END IF;
  RETURN v;
END
$fn$;

CREATE OR REPLACE FUNCTION activation.is_enforced()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT COALESCE((
    SELECT f.is_enabled
       AND COALESCE(f.flag_status, 'active') = 'active'
       AND (f.expires_at IS NULL OR f.expires_at > now())
      FROM public.feature_flags f
     WHERE f.flag_name = 'farmer_activation_required'), false)
$fn$;

-- Typed or scanned text -> the 12 canonical symbols, or NULL when it cannot be a code.
CREATE OR REPLACE FUNCTION activation.normalize_code(p_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $fn$
DECLARE v text;
BEGIN
  IF p_raw IS NULL OR length(p_raw) > 64 THEN RETURN NULL; END IF;
  v := upper(p_raw);
  v := regexp_replace(v, '^\s*KSA1:', '');
  v := regexp_replace(v, '[\s\-]', '', 'g');
  v := translate(v, 'OIL', '011');              -- look-alikes a person may type
  IF v !~ '^[0-9A-HJKMNP-TV-Z]{12}$' THEN RETURN NULL; END IF;
  RETURN v;
END
$fn$;

CREATE OR REPLACE FUNCTION activation.format_code(p_norm text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $fn$
  SELECT substr(p_norm, 1, 4) || '-' || substr(p_norm, 5, 4) || '-' || substr(p_norm, 9, 4)
$fn$;

CREATE OR REPLACE FUNCTION activation.hash_code(p_norm text, p_pepper_hex text)
RETURNS bytea LANGUAGE sql IMMUTABLE SET search_path = '' AS $fn$
  SELECT extensions.hmac(convert_to(p_norm, 'UTF8'), decode(p_pepper_hex, 'hex'), 'sha256')
$fn$;

-- 12 random bytes, 5 bits of each: uniform over the 32-symbol alphabet (no I, L, O, U).
CREATE OR REPLACE FUNCTION activation.new_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = '' AS $fn$
DECLARE
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_out text := '';
BEGIN
  FOR i IN 0..11 LOOP
    v_out := v_out || substr(c_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
  END LOOP;
  RETURN v_out;
END
$fn$;

CREATE OR REPLACE FUNCTION activation.log(
  p_event text, p_success boolean, p_result text,
  p_code_id uuid, p_tenant_id uuid, p_farmer_id uuid, p_actor_id uuid, p_batch_id uuid,
  p_ip text, p_user_agent text, p_meta jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
  INSERT INTO public.activation_logs
    (event, success, result_code, error_message, activation_code_id, tenant_id,
     farmer_id, actor_id, batch_id, ip_address, user_agent, metadata)
  VALUES
    (p_event, p_success, p_result, CASE WHEN p_success THEN NULL ELSE p_result END,
     p_code_id, p_tenant_id, p_farmer_id, p_actor_id, p_batch_id,
     left(p_ip, 64), left(p_user_agent, 300), COALESCE(p_meta, '{}'::jsonb))
$fn$;

-- Locks the tenant row, then answers NULL (a seat may be taken) or the reason
-- it may not. The lock makes concurrent seat checks for one tenant wait in line.
CREATE OR REPLACE FUNCTION activation.tenant_gate(p_tenant_id uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_tenant record;
  v_sub    record;
  v_used   integer;
BEGIN
  -- The seat count below must see what earlier lock holders committed.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'activation checks need READ COMMITTED isolation';
  END IF;

  SELECT t.status::text AS status, t.max_farmers, t.deleted_at, COALESCE(t.archived, false) AS archived
    INTO v_tenant FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_tenant.status NOT IN ('active', 'trial')
     OR v_tenant.deleted_at IS NOT NULL OR v_tenant.archived THEN
    RETURN 'activation_tenant_inactive';
  END IF;

  -- Latest subscription row decides, the same row resolve_farmer_entitlements reads.
  SELECT s.status, s.current_period_end INTO v_sub
    FROM public.tenant_subscriptions s
   WHERE s.tenant_id = p_tenant_id
   ORDER BY s.created_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND OR v_sub.status NOT IN ('active', 'trial', 'trialing')
     OR (v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end <= now()) THEN
    RETURN 'activation_subscription_inactive';
  END IF;

  IF v_tenant.max_farmers IS NULL OR v_tenant.max_farmers <= 0 THEN
    RETURN 'activation_capacity_full';
  END IF;
  -- Seats = farmers really in the tenant. Generated codes are never counted.
  SELECT count(*) INTO v_used FROM public.farmers f
   WHERE f.tenant_id = p_tenant_id AND f.activation_pending = false AND COALESCE(f.archived, false) = false;
  IF v_used >= v_tenant.max_farmers THEN
    RETURN 'activation_capacity_full';
  END IF;
  RETURN NULL;
END
$fn$;

-- ── 4. guards (triggers) ────────────────────────────────────────────────────
-- 4a. activation_codes: the state machine, enforced for every role.
CREATE OR REPLACE FUNCTION activation.codes_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'GENERATED' OR NEW.code_hash IS NULL OR NEW.batch_id IS NULL
       OR NEW.code IS NOT NULL OR NEW.redeemed_by IS NOT NULL OR NEW.redeemed_at IS NOT NULL THEN
      RAISE EXCEPTION 'activation codes are created only by activation_admin_generate_batch' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.batch_id IS DISTINCT FROM OLD.batch_id OR NEW.code_hash IS DISTINCT FROM OLD.code_hash
       OR NEW.code IS DISTINCT FROM OLD.code OR NEW.code_hint IS DISTINCT FROM OLD.code_hint
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'activation code identity columns cannot change' USING ERRCODE = '42501';
    END IF;

    IF OLD.state IN ('ACTIVATED', 'EXPIRED', 'REVOKED') THEN
      -- Final. The one tolerated change is the farmers FK clearing redeemed_by
      -- (ON DELETE SET NULL); the audit trail keeps the farmer id.
      IF NEW.redeemed_by IS NULL AND OLD.redeemed_by IS NOT NULL THEN
        OLD.redeemed_by := NULL;
      END IF;
      IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'activation code is % and cannot change', OLD.state USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.state <> OLD.state THEN
      IF NOT ((OLD.state = 'GENERATED' AND NEW.state IN ('AVAILABLE', 'REVOKED', 'EXPIRED'))
           OR (OLD.state = 'AVAILABLE' AND NEW.state IN ('ACTIVATED', 'REVOKED', 'EXPIRED'))) THEN
        RAISE EXCEPTION 'activation code cannot go from % to %', OLD.state, NEW.state USING ERRCODE = '42501';
      END IF;
      IF NEW.state = 'AVAILABLE' AND NEW.released_at IS NULL THEN
        RAISE EXCEPTION 'a released code needs released_at' USING ERRCODE = '42501';
      END IF;
      IF NEW.state = 'ACTIVATED' AND (NEW.redeemed_by IS NULL OR NEW.redeemed_at IS NULL) THEN
        RAISE EXCEPTION 'an activated code needs its farmer' USING ERRCODE = '42501';
      END IF;
      IF NEW.state = 'REVOKED' AND NEW.revoked_at IS NULL THEN
        RAISE EXCEPTION 'a revoked code needs revoked_at' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NEW.state <> 'ACTIVATED' AND (NEW.redeemed_by IS NOT NULL OR NEW.redeemed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'only an activated code carries a farmer' USING ERRCODE = '42501';
    END IF;
    IF NEW.code_ciphertext IS DISTINCT FROM OLD.code_ciphertext AND NEW.code_ciphertext IS NOT NULL THEN
      RAISE EXCEPTION 'the encrypted copy can only be wiped' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- A used, revoked or expired code keeps no recoverable copy.
  IF NEW.state IN ('ACTIVATED', 'EXPIRED', 'REVOKED') THEN
    NEW.code_ciphertext := NULL;
  END IF;
  -- Legacy columns follow the state, so older readers never see a contradiction.
  NEW.status     := CASE NEW.state WHEN 'ACTIVATED' THEN 'used' WHEN 'EXPIRED' THEN 'expired'
                                   WHEN 'REVOKED' THEN 'cancelled' ELSE 'active' END;
  NEW.is_active  := (NEW.state = 'AVAILABLE');
  NEW.max_uses   := 1;
  NEW.used_count := CASE WHEN NEW.state = 'ACTIVATED' THEN 1 ELSE 0 END;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION activation.deny_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: activation records are permanent', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '42501';
END
$fn$;

CREATE OR REPLACE FUNCTION activation.batches_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.code_count IS DISTINCT FROM OLD.code_count OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.subscription_interval IS DISTINCT FROM OLD.subscription_interval
     OR NEW.farmer_plan_id IS DISTINCT FROM OLD.farmer_plan_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.released_at IS NOT NULL AND (NEW.released_at IS DISTINCT FROM OLD.released_at
                                       OR NEW.released_by IS DISTINCT FROM OLD.released_by)) THEN
    RAISE EXCEPTION 'activation batch terms cannot change after creation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

-- 4b. farmers: who may be born where, and who may change tenant.
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

DROP TRIGGER IF EXISTS activation_codes_guard ON public.activation_codes;
CREATE TRIGGER activation_codes_guard BEFORE INSERT OR UPDATE ON public.activation_codes
  FOR EACH ROW EXECUTE FUNCTION activation.codes_guard();
DROP TRIGGER IF EXISTS activation_codes_no_delete ON public.activation_codes;
CREATE TRIGGER activation_codes_no_delete BEFORE DELETE ON public.activation_codes
  FOR EACH ROW EXECUTE FUNCTION activation.deny_change();
DROP TRIGGER IF EXISTS activation_codes_no_truncate ON public.activation_codes;
CREATE TRIGGER activation_codes_no_truncate BEFORE TRUNCATE ON public.activation_codes
  FOR EACH STATEMENT EXECUTE FUNCTION activation.deny_change();

DROP TRIGGER IF EXISTS activation_logs_immutable ON public.activation_logs;
CREATE TRIGGER activation_logs_immutable BEFORE UPDATE OR DELETE ON public.activation_logs
  FOR EACH ROW EXECUTE FUNCTION activation.deny_change();
DROP TRIGGER IF EXISTS activation_logs_no_truncate ON public.activation_logs;
CREATE TRIGGER activation_logs_no_truncate BEFORE TRUNCATE ON public.activation_logs
  FOR EACH STATEMENT EXECUTE FUNCTION activation.deny_change();

DROP TRIGGER IF EXISTS activation_code_batches_guard ON public.activation_code_batches;
CREATE TRIGGER activation_code_batches_guard BEFORE UPDATE ON public.activation_code_batches
  FOR EACH ROW EXECUTE FUNCTION activation.batches_guard();
DROP TRIGGER IF EXISTS activation_code_batches_no_delete ON public.activation_code_batches;
CREATE TRIGGER activation_code_batches_no_delete BEFORE DELETE ON public.activation_code_batches
  FOR EACH ROW EXECUTE FUNCTION activation.deny_change();
DROP TRIGGER IF EXISTS activation_code_batches_no_truncate ON public.activation_code_batches;
CREATE TRIGGER activation_code_batches_no_truncate BEFORE TRUNCATE ON public.activation_code_batches
  FOR EACH STATEMENT EXECUTE FUNCTION activation.deny_change();

-- Named zz_ so it runs after set_farmer_tenant_id_trigger has filled a NULL tenant.
DROP TRIGGER IF EXISTS zz_activation_farmers_guard_ins ON public.farmers;
CREATE TRIGGER zz_activation_farmers_guard_ins BEFORE INSERT ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION activation.farmers_guard();
DROP TRIGGER IF EXISTS zz_activation_farmers_guard_upd ON public.farmers;
CREATE TRIGGER zz_activation_farmers_guard_upd
  BEFORE UPDATE OF tenant_id, activation_pending, activated_at, activation_code_id ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION activation.farmers_guard();

-- ── 5. entry points ─────────────────────────────────────────────────────────
-- 5a. Farmer app (through the auth edge function, service role only).
--     p_farmer_id comes from the verified session, never from the request body.
CREATE OR REPLACE FUNCTION public.activation_redeem(
  p_farmer_id uuid, p_code text, p_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $fn$
-- search_path is the one the API normally runs with, on purpose: this function
-- updates long-standing tables, and their trigger functions must resolve names
-- exactly as they do today. Every name written in this body is schema-qualified.
DECLARE
  c_fail_limit  constant integer  := 5;                 -- wrong codes per farmer ...
  c_fail_window constant interval := interval '15 minutes';
  c_ip_limit    constant integer  := 100;               -- ... and per address (shared mobile NAT is common)
  c_ip_window   constant interval := interval '1 hour';
  v_ip         text := left(NULLIF(btrim(p_ip), ''), 64);
  v_farmer     record;
  v_code       record;
  v_batch      record;
  v_tenant     record;
  v_norm       text;
  v_hash       bytea;
  v_fail       integer;
  v_retry_at   timestamptz;
  v_limited    boolean;
  v_gate       text;
  v_old_tenant uuid;
  v_sub_id     uuid;
  v_rows       integer;
  v_end        timestamptz;
  v_msg        text;
  v_sqlstate   text;
  v_not_moved  jsonb := '[]'::jsonb;
  r            record;
BEGIN
  IF NOT activation.is_enforced() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'activation_not_enabled');
  END IF;
  IF p_farmer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'activation_farmer_invalid');
  END IF;

  -- One redemption at a time per farmer.
  PERFORM pg_advisory_xact_lock(hashtextextended('activation:farmer:' || p_farmer_id::text, 0));

  SELECT f.id, f.tenant_id, f.is_active, f.activation_pending INTO v_farmer
    FROM public.farmers f WHERE f.id = p_farmer_id FOR UPDATE;
  IF NOT FOUND OR v_farmer.is_active IS NOT TRUE THEN
    PERFORM activation.log('REDEEM_BLOCKED', false, 'activation_farmer_invalid', NULL, NULL,
                           p_farmer_id, NULL, NULL, v_ip, p_user_agent, NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'activation_farmer_invalid');
  END IF;
  IF NOT v_farmer.activation_pending THEN
    PERFORM activation.log('REDEEM_BLOCKED', false, 'already_activated', NULL, v_farmer.tenant_id,
                           p_farmer_id, NULL, NULL, v_ip, p_user_agent, NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'already_activated');
  END IF;

  -- Rate limit: counted from the audit trail, under the lock taken above.
  SELECT count(*), min(l.created_at) + c_fail_window INTO v_fail, v_retry_at FROM public.activation_logs l
   WHERE l.farmer_id = p_farmer_id AND l.event = 'REDEEM_FAILED' AND l.created_at > now() - c_fail_window;
  v_limited := v_fail >= c_fail_limit;
  IF NOT v_limited AND v_ip IS NOT NULL THEN
    SELECT count(*), min(l.created_at) + c_ip_window INTO v_fail, v_retry_at FROM public.activation_logs l
     WHERE l.ip_address = v_ip AND l.event = 'REDEEM_FAILED' AND l.created_at > now() - c_ip_window;
    v_limited := v_fail >= c_ip_limit;
  END IF;
  IF v_limited THEN
    PERFORM activation.log('REDEEM_BLOCKED', false, 'rate_limited', NULL, NULL,
                           p_farmer_id, NULL, NULL, v_ip, p_user_agent, NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after_seconds',
      GREATEST(1, ceil(extract(epoch FROM (v_retry_at - now())))::integer));
  END IF;

  v_norm := activation.normalize_code(p_code);
  IF v_norm IS NULL THEN
    PERFORM activation.log('REDEEM_FAILED', false, 'activation_invalid', NULL, NULL,
                           p_farmer_id, NULL, NULL, v_ip, p_user_agent, jsonb_build_object('detail', 'format'));
    RETURN jsonb_build_object('ok', false, 'code', 'activation_invalid');
  END IF;

  v_hash := activation.hash_code(v_norm, activation.secret('activation_code_pepper'));
  -- The row lock is what makes a code single-use: a second caller waits here
  -- and then reads ACTIVATED.
  SELECT c.id, c.tenant_id, c.batch_id, c.state, c.expires_at INTO v_code
    FROM public.activation_codes c
   WHERE c.code_hash = v_hash
     FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM activation.log('REDEEM_FAILED', false, 'activation_invalid', NULL, NULL,
                           p_farmer_id, NULL, NULL, v_ip, p_user_agent, jsonb_build_object('detail', 'unknown'));
    RETURN jsonb_build_object('ok', false, 'code', 'activation_invalid');
  END IF;

  IF v_code.state = 'AVAILABLE' AND v_code.expires_at <= now() THEN
    UPDATE public.activation_codes SET state = 'EXPIRED', expired_at = now()
     WHERE id = v_code.id AND state = 'AVAILABLE';
    PERFORM activation.log('CODE_EXPIRED', true, 'expired', v_code.id, v_code.tenant_id,
                           NULL, NULL, v_code.batch_id, NULL, NULL, NULL);
    v_code.state := 'EXPIRED';
  END IF;
  IF v_code.state <> 'AVAILABLE' THEN
    v_gate := CASE v_code.state WHEN 'ACTIVATED' THEN 'activation_used'
                                WHEN 'REVOKED'   THEN 'activation_revoked'
                                WHEN 'EXPIRED'   THEN 'activation_expired'
                                ELSE 'activation_invalid' END;   -- GENERATED: not released, say nothing more
    PERFORM activation.log('REDEEM_FAILED', false, v_gate, v_code.id, v_code.tenant_id,
                           p_farmer_id, NULL, v_code.batch_id, v_ip, p_user_agent,
                           jsonb_build_object('state', v_code.state));
    RETURN jsonb_build_object('ok', false, 'code', v_gate);
  END IF;

  -- Tenant active, subscription active, a seat free. Takes the tenant row lock.
  v_gate := activation.tenant_gate(v_code.tenant_id);
  IF v_gate IS NOT NULL THEN
    PERFORM activation.log('REDEEM_BLOCKED', false, v_gate, v_code.id, v_code.tenant_id,
                           p_farmer_id, NULL, v_code.batch_id, v_ip, p_user_agent, NULL);
    RETURN jsonb_build_object('ok', false, 'code', v_gate);
  END IF;

  SELECT b.subscription_interval, b.farmer_plan_id INTO v_batch
    FROM public.activation_code_batches b WHERE b.id = v_code.batch_id;
  v_old_tenant := v_farmer.tenant_id;

  BEGIN  -- everything below commits together or not at all
    UPDATE public.activation_codes
       SET state = 'ACTIVATED', redeemed_by = p_farmer_id, redeemed_at = now(), last_used_at = now()
     WHERE id = v_code.id AND state = 'AVAILABLE';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'activation code changed state during redemption';
    END IF;

    IF v_old_tenant IS DISTINCT FROM v_code.tenant_id THEN
      -- account_roles and account_reach_settings follow through ON UPDATE CASCADE
      UPDATE public.accounts SET tenant_id = v_code.tenant_id
       WHERE id = p_farmer_id AND tenant_id = v_old_tenant;
    END IF;

    UPDATE public.farmers
       SET tenant_id = v_code.tenant_id, activation_pending = false,
           activated_at = now(), activation_code_id = v_code.id
     WHERE id = p_farmer_id;

    -- The farmer's plan: the batch decides plan and interval; the existing
    -- normalize trigger computes end_date from the interval.
    SELECT s.id INTO v_sub_id FROM public.tenant_subscriptions s
     WHERE s.tenant_id = v_code.tenant_id ORDER BY s.created_at DESC NULLS LAST LIMIT 1;
    UPDATE public.farmer_subscriptions
       SET tenant_id = v_code.tenant_id, tenant_subscription_id = v_sub_id,
           plan_id = v_batch.farmer_plan_id,
           billing_interval = v_batch.subscription_interval::public.billing_interval,
           status = 'active', start_date = now(), auto_renew = false,
           paid_by_tenant = true, paying_tenant_id = v_code.tenant_id,
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'source', 'activation_code', 'activation_code_id', v_code.id, 'activation_batch_id', v_code.batch_id)
     WHERE farmer_id = p_farmer_id;
    IF NOT FOUND THEN
      INSERT INTO public.farmer_subscriptions
        (farmer_id, tenant_id, tenant_subscription_id, plan_id, billing_interval, status,
         start_date, auto_renew, paid_by_tenant, paying_tenant_id, metadata)
      VALUES
        (p_farmer_id, v_code.tenant_id, v_sub_id, v_batch.farmer_plan_id,
         v_batch.subscription_interval::public.billing_interval, 'active',
         now(), false, true, v_code.tenant_id,
         jsonb_build_object('source', 'activation_code', 'activation_code_id', v_code.id,
                            'activation_batch_id', v_code.batch_id));
    END IF;
    SELECT fs.end_date INTO v_end FROM public.farmer_subscriptions fs WHERE fs.farmer_id = p_farmer_id;

    -- Anything else the farmer already owns in the old tenant moves with them.
    -- A few tables are append-only by their own trigger and refuse the change:
    -- such a table is skipped, its rows stay as history under the old tenant,
    -- and its name goes into the audit entry. The farmer is never left half-moved:
    -- farmers, accounts and the plan above are all-or-nothing.
    IF v_old_tenant IS DISTINCT FROM v_code.tenant_id THEN
      FOR r IN
        SELECT cl.relname AS tbl, a.attname AS col
          FROM pg_catalog.pg_class cl
          JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
          JOIN pg_catalog.pg_attribute a ON a.attrelid = cl.oid
         WHERE n.nspname = 'public' AND cl.relkind IN ('r', 'p') AND NOT cl.relispartition
           AND a.attname IN ('farmer_id', 'account_id') AND a.atttypid = 'pg_catalog.uuid'::regtype
           AND NOT a.attisdropped AND a.attgenerated = ''
           AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute t
                        WHERE t.attrelid = cl.oid AND t.attname = 'tenant_id'
                          AND t.atttypid = 'pg_catalog.uuid'::regtype
                          AND NOT t.attisdropped AND t.attgenerated = '')
           AND cl.relname NOT IN ('activation_logs', 'activation_codes', 'farmers', 'accounts',
                                  'account_roles', 'account_reach_settings', 'farmer_subscriptions')
         ORDER BY cl.relname, a.attname
      LOOP
        BEGIN
          EXECUTE format('UPDATE public.%I SET tenant_id = $1 WHERE %I = $2 AND tenant_id = $3', r.tbl, r.col)
            USING v_code.tenant_id, p_farmer_id, v_old_tenant;
        EXCEPTION WHEN OTHERS THEN
          v_not_moved := v_not_moved || to_jsonb(r.tbl::text);
        END;
      END LOOP;
    END IF;

    PERFORM activation.log('REDEEM_SUCCESS', true, 'activated', v_code.id, v_code.tenant_id,
                           p_farmer_id, NULL, v_code.batch_id, v_ip, p_user_agent,
                           jsonb_build_object('from_tenant_id', v_old_tenant, 'not_moved', v_not_moved));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_sqlstate = RETURNED_SQLSTATE;
    PERFORM activation.log('REDEEM_ERROR', false, 'activation_failed', v_code.id, v_code.tenant_id,
                           p_farmer_id, NULL, v_code.batch_id, v_ip, p_user_agent,
                           jsonb_build_object('sqlstate', v_sqlstate, 'message', left(v_msg, 500)));
    RETURN jsonb_build_object('ok', false, 'code', 'activation_failed');
  END;

  SELECT t.id, t.name, t.slug INTO v_tenant FROM public.tenants t WHERE t.id = v_code.tenant_id;
  RETURN jsonb_build_object(
    'ok', true, 'code', 'activated',
    'tenant', jsonb_build_object('id', v_tenant.id, 'name', v_tenant.name, 'slug', v_tenant.slug),
    'subscription_end', v_end);
END
$fn$;

-- What the auth edge function needs to know before it registers anybody.
CREATE OR REPLACE FUNCTION public.activation_enforcement_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT jsonb_build_object(
    'enforced', activation.is_enforced(),
    'holding_tenant_id', (SELECT t.id FROM public.tenants t WHERE t.is_default IS TRUE LIMIT 1))
$fn$;

-- 5b. SaaS admin. Called with the admin's own login; the database checks it.
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
  v_limit    integer;
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
  IF NOT EXISTS (SELECT 1 FROM public.tenants t
                  WHERE t.id = p_tenant_id AND t.status::text IN ('active', 'trial')
                    AND t.deleted_at IS NULL AND COALESCE(t.archived, false) = false) THEN
    RAISE EXCEPTION 'tenant_not_eligible' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans p
                  WHERE p.id = p_farmer_plan_id AND p.plan_category = 'farmer' AND p.is_active
                    AND (p.tenant_id IS NULL OR p.tenant_id = p_tenant_id)) THEN
    RAISE EXCEPTION 'invalid_farmer_plan' USING ERRCODE = '22023';
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

  SELECT t.max_farmers INTO v_limit FROM public.tenants t WHERE t.id = p_tenant_id;
  SELECT count(*) INTO v_used FROM public.farmers f
   WHERE f.tenant_id = p_tenant_id AND f.activation_pending = false AND COALESCE(f.archived, false) = false;
  SELECT count(*) INTO v_open FROM public.activation_codes c
   WHERE c.tenant_id = p_tenant_id AND c.state IN ('GENERATED', 'AVAILABLE') AND c.expires_at > now();

  PERFORM activation.log('BATCH_GENERATED', true, 'generated', NULL, p_tenant_id, NULL, v_actor, v_batch_id,
                         NULL, NULL, jsonb_build_object('count', p_count));
  RETURN jsonb_build_object(
    'batch_id', v_batch_id, 'tenant_id', p_tenant_id, 'code_count', p_count, 'state', 'GENERATED',
    'expires_at', p_expires_at, 'seat_limit', v_limit, 'seats_used', v_used, 'unused_codes', v_open,
    -- information for the admin, not a block: seats are enforced at activation
    'exceeds_capacity', (v_limit IS NULL OR v_used + v_open > v_limit));
END
$fn$;

CREATE OR REPLACE FUNCTION public.activation_admin_release_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor  uuid := auth.uid();
  v_tenant uuid;
  v_rows   integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT b.tenant_id INTO v_tenant FROM public.activation_code_batches b WHERE b.id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_found' USING ERRCODE = '22023';
  END IF;
  UPDATE public.activation_codes SET state = 'AVAILABLE', released_at = now(), released_by = v_actor
   WHERE batch_id = p_batch_id AND state = 'GENERATED' AND expires_at > now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  UPDATE public.activation_code_batches SET released_at = now(), released_by = v_actor
   WHERE id = p_batch_id AND released_at IS NULL;
  PERFORM activation.log('BATCH_RELEASED', true, 'released', NULL, v_tenant, NULL, v_actor, p_batch_id,
                         NULL, NULL, jsonb_build_object('count', v_rows));
  RETURN jsonb_build_object('batch_id', p_batch_id, 'released', v_rows);
END
$fn$;

-- Revokes unused codes: a whole batch, a list of codes, or both. Used codes are untouched.
CREATE OR REPLACE FUNCTION public.activation_admin_revoke(
  p_batch_id uuid DEFAULT NULL, p_code_ids uuid[] DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor  uuid := auth.uid();
  v_reason text := NULLIF(left(btrim(p_reason), 300), '');
  v_rows   integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_batch_id IS NULL AND COALESCE(cardinality(p_code_ids), 0) = 0 THEN
    RAISE EXCEPTION 'nothing_to_revoke' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  WITH done AS (
    UPDATE public.activation_codes c
       SET state = 'REVOKED', revoked_at = now(), revoked_by = v_actor, revoke_reason = v_reason
     WHERE c.state IN ('GENERATED', 'AVAILABLE')
       AND ((p_batch_id IS NOT NULL AND c.batch_id = p_batch_id)
         OR (p_code_ids IS NOT NULL AND c.id = ANY (p_code_ids)))
    RETURNING c.id, c.tenant_id, c.batch_id)
  INSERT INTO public.activation_logs (event, success, result_code, activation_code_id, tenant_id, actor_id, batch_id, metadata)
  SELECT 'CODE_REVOKED', true, 'revoked', d.id, d.tenant_id, v_actor, d.batch_id, jsonb_build_object('reason', v_reason)
    FROM done d;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('revoked', v_rows);
END
$fn$;

-- 5c. Shared by both portals: the caller's rights decide what comes back.
-- Plain codes of one batch, for the PDF / CSV / QR sheet. A tenant admin gets
-- released, unused codes of the own tenant; a super admin also gets unreleased ones.
CREATE OR REPLACE FUNCTION public.activation_reveal_codes(p_batch_id uuid)
RETURNS TABLE (code_id uuid, code text, qr_payload text, state text, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor  uuid := auth.uid();
  v_tenant uuid;
  v_super  boolean;
  v_key    text;
  v_count  integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT b.tenant_id INTO v_tenant FROM public.activation_code_batches b WHERE b.id = p_batch_id;
  v_super := public.is_super_admin();
  -- An unknown batch and a foreign batch answer the same.
  IF v_tenant IS NULL OR NOT (v_super OR public.is_tenant_admin(v_tenant)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  v_key := activation.secret('activation_code_enc_key');

  SELECT count(*) INTO v_count FROM public.activation_codes c
   WHERE c.batch_id = p_batch_id AND c.code_ciphertext IS NOT NULL AND c.expires_at > now()
     AND (c.state = 'AVAILABLE' OR (v_super AND c.state = 'GENERATED'));
  PERFORM activation.log('CODES_REVEALED', true, 'revealed', NULL, v_tenant, NULL, v_actor, p_batch_id,
                         NULL, NULL, jsonb_build_object('count', v_count, 'as', CASE WHEN v_super THEN 'super_admin' ELSE 'tenant_admin' END));

  RETURN QUERY
    SELECT c.id, activation.format_code(d.plain), 'KSA1:' || activation.format_code(d.plain), c.state, c.expires_at
      FROM public.activation_codes c
     CROSS JOIN LATERAL (SELECT extensions.pgp_sym_decrypt(c.code_ciphertext, v_key) AS plain) d
     WHERE c.batch_id = p_batch_id AND c.code_ciphertext IS NOT NULL AND c.expires_at > now()
       AND (c.state = 'AVAILABLE' OR (v_super AND c.state = 'GENERATED'))
     ORDER BY c.created_at, c.id;
END
$fn$;

-- Seats and code counts of one tenant.
CREATE OR REPLACE FUNCTION public.activation_usage(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_super  boolean;
  v_tenant record;
  v_sub    record;
  v_used   integer;
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
    'enforced', activation.is_enforced());
END
$fn$;

-- 5d. Housekeeping (scheduler / service role): marks overdue unused codes EXPIRED.
CREATE OR REPLACE FUNCTION public.activation_expire_due()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_rows integer;
BEGIN
  WITH done AS (
    UPDATE public.activation_codes c SET state = 'EXPIRED', expired_at = now()
     WHERE c.state IN ('GENERATED', 'AVAILABLE') AND c.expires_at <= now()
    RETURNING c.id, c.tenant_id, c.batch_id)
  INSERT INTO public.activation_logs (event, success, result_code, activation_code_id, tenant_id, batch_id)
  SELECT 'CODE_EXPIRED', true, 'expired', d.id, d.tenant_id, d.batch_id FROM done d;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$fn$;

-- ── 6. row security and grants ──────────────────────────────────────────────
ALTER TABLE public.activation_code_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_logs         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activation_batches_super_admin_read ON public.activation_code_batches;
CREATE POLICY activation_batches_super_admin_read ON public.activation_code_batches
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS activation_batches_tenant_admin_read ON public.activation_code_batches;
CREATE POLICY activation_batches_tenant_admin_read ON public.activation_code_batches
  FOR SELECT TO authenticated USING (released_at IS NOT NULL AND public.is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS activation_codes_super_admin_read ON public.activation_codes;
CREATE POLICY activation_codes_super_admin_read ON public.activation_codes
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS activation_codes_tenant_admin_read ON public.activation_codes;
CREATE POLICY activation_codes_tenant_admin_read ON public.activation_codes
  FOR SELECT TO authenticated USING (state <> 'GENERATED' AND public.is_tenant_admin(tenant_id));

-- Portal users read safe columns only: never the hash, never the encrypted copy.
REVOKE ALL ON public.activation_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, tenant_id, batch_id, code_hint, state, expires_at, created_at, released_at,
              redeemed_by, redeemed_at, revoked_at, revoke_reason, expired_at)
  ON public.activation_codes TO authenticated;

REVOKE ALL ON public.activation_code_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.activation_code_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.activation_code_batches TO service_role;

-- The audit trail: readable through its existing policies, written by nobody directly.
REVOKE ALL ON public.activation_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.activation_logs TO authenticated;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA activation FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.activation_redeem(uuid, text, text, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activation_enforcement_status()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activation_expire_due()                          FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activation_redeem(uuid, text, text, text)     TO service_role;
GRANT EXECUTE ON FUNCTION public.activation_enforcement_status()               TO service_role;
GRANT EXECUTE ON FUNCTION public.activation_expire_due()                       TO service_role;

REVOKE ALL ON FUNCTION public.activation_admin_generate_batch(uuid, integer, timestamptz, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activation_admin_release_batch(uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activation_admin_revoke(uuid, uuid[], text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activation_reveal_codes(uuid)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activation_usage(uuid)                           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activation_admin_generate_batch(uuid, integer, timestamptz, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activation_admin_release_batch(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.activation_admin_revoke(uuid, uuid[], text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.activation_reveal_codes(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.activation_usage(uuid)                        TO authenticated;

-- ── 7. feature flag, default OFF ────────────────────────────────────────────
INSERT INTO public.feature_flags
  (flag_name, description, is_enabled, rollout_percentage, flag_type, flag_status, default_value)
SELECT 'farmer_activation_required',
       'Farmer activation codes. OFF: registration and farmer creation work as before. ON (is_enabled = true): a new farmer registers unactivated in the default tenant and joins a tenant only by redeeming an activation code; seat limit and tenant subscription are enforced; a farmer can no longer change tenant. This is one global switch read by the database: rollout_percentage and target_tenants are not used. Before turning on: every tenant needs a tenant_subscriptions row, and the farmer app with the activation screen must be released.',
       false, 0, 'release', 'active', 'false'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name = 'farmer_activation_required');

-- ── 8. hourly expiry job (skipped, without failing, where pg_cron is absent) ─
DO $cron$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activation-codes-expire-hourly') THEN
    PERFORM cron.schedule('activation-codes-expire-hourly', '41 * * * *',
                          'SELECT public.activation_expire_due()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'activation-codes-expire-hourly was not scheduled: %', SQLERRM;
END
$cron$;
