-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124140200_provider_workspace_functions.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Provider Workspace, part A, file 3 of 4 — the only way the browser reads or
-- writes a provider's data.
--
-- Every function below that a browser may call:
--   * takes the caller from verified_account_context() — the session token —
--     and never from an argument, so nobody can act for another provider;
--   * requires the session to be in the SERVICE_PROVIDER workspace;
--   * validates every code against the lookup tables of file 1;
--   * writes only the columns a provider owns. Verification, rating, jobs
--     completed, response time and listing status have no parameter anywhere.
--
-- Error codes (the client turns them into i18n text; none carries data):
--   NOT_AUTHENTICATED, PROVIDER_ROLE_NOT_ACTIVE, PROVIDER_POLICY_MISSING,
--   PROVIDER_PROFILE_MISSING, PROVIDER_INPUT_INVALID, PROVIDER_TYPE_INVALID,
--   PROVIDER_NAME_INVALID, PROVIDER_LANGUAGES_INVALID, PROVIDER_CATEGORY_INVALID,
--   PROVIDER_UNIT_INVALID, PROVIDER_RATE_REQUIRED, PROVIDER_CAPACITY_INVALID,
--   PROVIDER_SKILL_TIER_INVALID, PROVIDER_EQUIPMENT_INVALID,
--   PROVIDER_PAYMENT_METHOD_INVALID, PROVIDER_LIMIT_REACHED,
--   PROVIDER_SERVICE_NOT_FOUND, PROVIDER_STATUS_INVALID, PROVIDER_HOURS_INVALID,
--   PROVIDER_BLACKOUT_INVALID, PROVIDER_BLACKOUT_OVERLAP, PROVIDER_BLACKOUT_NOT_FOUND,
--   PROVIDER_EQUIPMENT_TYPE_INVALID, PROVIDER_EQUIPMENT_ATTRIBUTE_INVALID,
--   PROVIDER_EQUIPMENT_NOT_FOUND, PROVIDER_NO_ACTIVE_SERVICE, PROVIDER_HOURS_NOT_SET,
--   PROVIDER_REACH_NOT_SET, PROVIDER_REVIEW_NOT_ALLOWED,
--   NURSERY_CROP_INVALID, NURSERY_KIND_INVALID, NURSERY_PRICE_REQUIRED,
--   NURSERY_PRODUCT_NOT_FOUND, NURSERY_BATCH_INVALID, NURSERY_BATCH_NOT_FOUND,
--   NURSERY_BATCH_BELOW_RESERVED.
--
-- Adds functions only.  Safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── internal helpers (not callable by the browser) ──────────────────────────
CREATE OR REPLACE FUNCTION public.provider_workspace_policy()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v jsonb;
BEGIN
  SELECT c.config_value INTO v FROM public.system_config c
   WHERE c.config_key = 'provider_workspace_policy' AND jsonb_typeof(c.config_value) = 'object';
  IF v IS NULL
     OR NOT (v ? 'max_services' AND v ? 'max_equipment' AND v ? 'max_nursery_products'
             AND v ? 'max_blackout_days' AND v ? 'max_live_blackouts' AND v ? 'lead_time_days_default'
             AND v ? 'same_day_cutoff' AND v ? 'availability_horizon_days' AND v ? 'timezone') THEN
    RAISE EXCEPTION 'PROVIDER_POLICY_MISSING';
  END IF;
  RETURN v;
END
$fn$;

-- The caller: a verified session whose workspace is SERVICE_PROVIDER.
CREATE OR REPLACE FUNCTION public.provider_session_account()
RETURNS TABLE(account_id uuid, tenant_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.verified_account_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING errcode = '42501';
  END IF;
  IF v.active_role IS DISTINCT FROM 'SERVICE_PROVIDER' THEN
    RAISE EXCEPTION 'PROVIDER_ROLE_NOT_ACTIVE' USING errcode = '42501';
  END IF;
  account_id := v.account_id; tenant_id := v.tenant_id;
  RETURN NEXT;
END
$fn$;

-- The caller, who must already have a profile. Locks the profile row, so two
-- saves by one provider run one after the other (the count limits rely on it).
CREATE OR REPLACE FUNCTION public.provider_session_profile_locked()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_account uuid;
BEGIN
  SELECT s.account_id INTO v_account FROM public.provider_session_account() s;
  PERFORM 1 FROM public.service_provider_profiles p WHERE p.account_id = v_account FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_MISSING';
  END IF;
  RETURN v_account;
END
$fn$;

-- D13: the availability state of one provider. Derived, never stored, and it
-- returns a state code and a date and nothing else. A day is free when it is a
-- working day, its working window is not over, and no live blackout (the
-- provider's own, or a confirmed job's) overlaps that window.
CREATE OR REPLACE FUNCTION public.provider_availability(p_account_id uuid)
RETURNS TABLE(state text, next_free_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_pol     jsonb := public.provider_workspace_policy();
  v_tz      text  := v_pol ->> 'timezone';
  v_today   date  := (now() AT TIME ZONE v_tz)::date;
  v_accepts boolean;
  v_wh      record;
  v_win     tstzrange;
  d         date;
BEGIN
  SELECT p.accepts_requests INTO v_accepts
    FROM public.service_provider_profiles p
    JOIN public.accounts a ON a.id = p.account_id AND a.status = 'ACTIVE'
    JOIN public.account_roles r ON r.account_id = p.account_id AND r.role = 'SERVICE_PROVIDER' AND r.status = 'ACTIVE'
   WHERE p.account_id = p_account_id;
  IF NOT FOUND
     OR NOT EXISTS (SELECT 1 FROM public.provider_working_hours w WHERE w.account_id = p_account_id AND w.is_working) THEN
    state := 'OFFLINE'; next_free_date := NULL; RETURN NEXT; RETURN;
  END IF;
  IF NOT v_accepts THEN
    state := 'NOT_ACCEPTING'; next_free_date := NULL; RETURN NEXT; RETURN;
  END IF;

  FOR i IN 0 .. (v_pol ->> 'availability_horizon_days')::integer LOOP
    d := v_today + i;
    SELECT w.start_time, w.end_time INTO v_wh
      FROM public.provider_working_hours w
     WHERE w.account_id = p_account_id AND w.weekday = extract(dow FROM d)::smallint AND w.is_working;
    CONTINUE WHEN NOT FOUND;
    v_win := tstzrange((d + v_wh.start_time) AT TIME ZONE v_tz, (d + v_wh.end_time) AT TIME ZONE v_tz);
    CONTINUE WHEN upper(v_win) <= now();
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.provider_blackouts b
                           WHERE b.account_id = p_account_id AND b.cancelled_at IS NULL AND b.period && v_win);
    state := CASE WHEN d = v_today THEN 'AVAILABLE' ELSE 'BUSY' END;
    next_free_date := d; RETURN NEXT; RETURN;
  END LOOP;

  state := 'BUSY'; next_free_date := NULL; RETURN NEXT;
END
$fn$;

-- ── read: everything the workspace shows about the caller's own business ────
CREATE OR REPLACE FUNCTION public.provider_workspace_get()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid;
  v_pol     jsonb := public.provider_workspace_policy();
  v_profile jsonb;
  v_avail   record;
BEGIN
  SELECT s.account_id INTO v_account FROM public.provider_session_account() s;

  SELECT jsonb_build_object(
           'provider_type', p.provider_type, 'public_name', p.public_name,
           'experience_years', p.experience_years, 'about_text', p.about_text,
           'about_language', p.about_language, 'languages_spoken', to_jsonb(p.languages_spoken),
           'accepts_requests', p.accepts_requests, 'listing_status', p.listing_status,
           'submitted_at', p.submitted_at, 'listed_at', p.listed_at, 'review_note_code', p.review_note_code,
           'verification_level', p.verification_level, 'rating_average', p.rating_average,
           'rating_count', p.rating_count, 'jobs_completed', p.jobs_completed)
    INTO v_profile
    FROM public.service_provider_profiles p WHERE p.account_id = v_account;

  SELECT * INTO v_avail FROM public.provider_availability(v_account);

  RETURN jsonb_build_object(
    'profile', v_profile,
    'availability', jsonb_build_object('state', v_avail.state, 'next_free_date', v_avail.next_free_date),
    'reach_set', EXISTS (SELECT 1 FROM public.account_reach_settings r
                          WHERE r.account_id = v_account AND r.role = 'SERVICE_PROVIDER'),
    'services', coalesce((
      SELECT jsonb_agg(to_jsonb(s) - 'account_id' - 'created_at' ORDER BY s.created_at)
        FROM public.provider_services s WHERE s.account_id = v_account AND s.status <> 'REMOVED'), '[]'::jsonb),
    'working_hours', coalesce((
      SELECT jsonb_agg(jsonb_build_object('weekday', w.weekday, 'is_working', w.is_working,
                                          'start_time', to_char(w.start_time, 'HH24:MI'),
                                          'end_time', to_char(w.end_time, 'HH24:MI')) ORDER BY w.weekday)
        FROM public.provider_working_hours w WHERE w.account_id = v_account), '[]'::jsonb),
    'blackouts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'from', lower(b.period), 'to', upper(b.period),
                                          'source', b.source, 'reason_code', b.reason_code) ORDER BY lower(b.period))
        FROM public.provider_blackouts b
       WHERE b.account_id = v_account AND b.cancelled_at IS NULL AND upper(b.period) > now()), '[]'::jsonb),
    'equipment', coalesce((
      SELECT jsonb_agg(to_jsonb(e) - 'account_id' - 'created_at' - 'verified_by' ORDER BY e.created_at)
        FROM public.provider_equipment e WHERE e.account_id = v_account AND e.status = 'ACTIVE'), '[]'::jsonb),
    'nursery_products', coalesce((
      SELECT jsonb_agg((to_jsonb(n) - 'account_id' - 'created_at') || jsonb_build_object('batches', coalesce((
               SELECT jsonb_agg(jsonb_build_object('id', b.id, 'total_qty', b.total_qty, 'reserved_qty', b.reserved_qty,
                                                   'ready_date', b.ready_date, 'status', b.status) ORDER BY b.ready_date)
                 FROM public.nursery_batches b WHERE b.product_id = n.id), '[]'::jsonb)) ORDER BY n.created_at)
        FROM public.nursery_products n WHERE n.account_id = v_account AND n.status <> 'REMOVED'), '[]'::jsonb),
    'policy', jsonb_build_object('lead_time_days_default', v_pol -> 'lead_time_days_default',
                                 'same_day_cutoff', v_pol -> 'same_day_cutoff',
                                 'max_services', v_pol -> 'max_services',
                                 'max_blackout_days', v_pol -> 'max_blackout_days'));
END
$fn$;

-- ── profile ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_save_profile(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ctx   record;
  v_name  text := btrim(coalesce(p ->> 'public_name', ''));
  v_langs text[];
BEGIN
  SELECT * INTO v_ctx FROM public.provider_session_account();
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'PROVIDER_INPUT_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_types t WHERE t.code = p ->> 'provider_type' AND t.is_active) THEN
    RAISE EXCEPTION 'PROVIDER_TYPE_INVALID';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'PROVIDER_NAME_INVALID'; END IF;

  IF p ? 'languages_spoken' AND jsonb_typeof(p -> 'languages_spoken') = 'array' THEN
    SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_langs
      FROM jsonb_array_elements_text(p -> 'languages_spoken') x;
  ELSE
    v_langs := '{}';
  END IF;
  IF cardinality(v_langs) > 20
     OR EXISTS (SELECT 1 FROM unnest(v_langs) x WHERE x !~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$') THEN
    RAISE EXCEPTION 'PROVIDER_LANGUAGES_INVALID';
  END IF;

  BEGIN
    INSERT INTO public.service_provider_profiles
      (account_id, tenant_id, provider_type, public_name, experience_years, about_text, about_language, languages_spoken)
    VALUES (v_ctx.account_id, v_ctx.tenant_id, p ->> 'provider_type', v_name,
            (p ->> 'experience_years')::integer, nullif(btrim(p ->> 'about_text'), ''),
            nullif(p ->> 'about_language', ''), v_langs)
    ON CONFLICT (account_id) DO UPDATE
      SET provider_type = EXCLUDED.provider_type, public_name = EXCLUDED.public_name,
          experience_years = EXCLUDED.experience_years, about_text = EXCLUDED.about_text,
          about_language = EXCLUDED.about_language, languages_spoken = EXCLUDED.languages_spoken,
          updated_at = now();
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'PROVIDER_INPUT_INVALID';
  END;
  RETURN public.provider_workspace_get();
END
$fn$;

CREATE OR REPLACE FUNCTION public.provider_set_accepting(p_accepting boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_account uuid := public.provider_session_profile_locked();
BEGIN
  IF p_accepting IS NULL THEN RAISE EXCEPTION 'PROVIDER_INPUT_INVALID'; END IF;
  UPDATE public.service_provider_profiles SET accepts_requests = p_accepting, updated_at = now()
   WHERE account_id = v_account;
  RETURN public.provider_workspace_get();
END
$fn$;

-- ── services ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_save_service(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid := public.provider_session_profile_locked();
  v_pol     jsonb := public.provider_workspace_policy();
  v_id      uuid;
  v_unit    record;
  v_rate    numeric;
  v_methods text[];
  v_equip   uuid;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'PROVIDER_INPUT_INVALID'; END IF;

  -- a service is offered in a leaf of the taxonomy: active, has a parent, has no active child
  IF NOT EXISTS (
       SELECT 1 FROM public.service_categories c
        WHERE c.code = p ->> 'category_code' AND c.is_active AND c.parent_code IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.service_categories k WHERE k.parent_code = c.code AND k.is_active)) THEN
    RAISE EXCEPTION 'PROVIDER_CATEGORY_INVALID';
  END IF;

  SELECT u.code, u.is_negotiable INTO v_unit FROM public.pricing_units u
   WHERE u.code = p ->> 'pricing_unit' AND u.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_UNIT_INVALID'; END IF;

  IF (p ->> 'capacity_unit') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.pricing_units u
                      WHERE u.code = p ->> 'capacity_unit' AND u.is_active AND NOT u.is_negotiable) THEN
    RAISE EXCEPTION 'PROVIDER_CAPACITY_INVALID';
  END IF;
  IF (p ->> 'skill_tier') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.skill_tiers t WHERE t.code = p ->> 'skill_tier' AND t.is_active) THEN
    RAISE EXCEPTION 'PROVIDER_SKILL_TIER_INVALID';
  END IF;

  IF p ? 'payment_methods' AND jsonb_typeof(p -> 'payment_methods') = 'array' THEN
    SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_methods FROM jsonb_array_elements_text(p -> 'payment_methods') x;
  ELSE
    v_methods := '{}';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_methods) x
              WHERE NOT EXISTS (SELECT 1 FROM public.provider_payment_methods m WHERE m.code = x AND m.is_active)) THEN
    RAISE EXCEPTION 'PROVIDER_PAYMENT_METHOD_INVALID';
  END IF;

  BEGIN
    v_id    := nullif(p ->> 'id', '')::uuid;
    v_equip := nullif(p ->> 'equipment_id', '')::uuid;
    v_rate  := CASE WHEN v_unit.is_negotiable THEN NULL ELSE (p ->> 'base_rate')::numeric END;
    IF NOT v_unit.is_negotiable AND v_rate IS NULL THEN RAISE EXCEPTION 'PROVIDER_RATE_REQUIRED'; END IF;
    IF v_equip IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.provider_equipment e
          WHERE e.id = v_equip AND e.account_id = v_account AND e.status = 'ACTIVE') THEN
      RAISE EXCEPTION 'PROVIDER_EQUIPMENT_INVALID';
    END IF;

    IF v_id IS NULL THEN
      IF (SELECT count(*) FROM public.provider_services s WHERE s.account_id = v_account AND s.status <> 'REMOVED')
         >= (v_pol ->> 'max_services')::integer THEN
        RAISE EXCEPTION 'PROVIDER_LIMIT_REACHED';
      END IF;
      INSERT INTO public.provider_services (account_id, category_code, title, pricing_unit)
      VALUES (v_account, p ->> 'category_code', btrim(coalesce(p ->> 'title', '')), v_unit.code)
      RETURNING id INTO v_id;
    ELSIF NOT EXISTS (SELECT 1 FROM public.provider_services s
                       WHERE s.id = v_id AND s.account_id = v_account AND s.status <> 'REMOVED') THEN
      RAISE EXCEPTION 'PROVIDER_SERVICE_NOT_FOUND';
    END IF;

    UPDATE public.provider_services SET
      category_code        = p ->> 'category_code',
      title                = btrim(coalesce(p ->> 'title', '')),
      description          = nullif(btrim(p ->> 'description'), ''),
      description_language = nullif(p ->> 'description_language', ''),
      pricing_unit         = v_unit.code,
      base_rate            = v_rate,
      min_charge           = (p ->> 'min_charge')::numeric,
      min_billable_qty     = (p ->> 'min_billable_qty')::numeric,
      advance_percent      = (p ->> 'advance_percent')::integer,
      includes_operator    = coalesce((p ->> 'includes_operator')::boolean, false),
      includes_fuel        = coalesce((p ->> 'includes_fuel')::boolean, false),
      includes_material    = coalesce((p ->> 'includes_material')::boolean, false),
      capacity_value       = (p ->> 'capacity_value')::numeric,
      capacity_unit        = p ->> 'capacity_unit',
      capacity_period      = p ->> 'capacity_period',
      travel_charge        = (p ->> 'travel_charge')::numeric,
      free_travel_km       = (p ->> 'free_travel_km')::integer,
      lead_time_days       = (p ->> 'lead_time_days')::integer,
      same_day_cutoff      = (p ->> 'same_day_cutoff')::time,
      cancellation_hours   = (p ->> 'cancellation_hours')::integer,
      season_start_month   = (p ->> 'season_start_month')::smallint,
      season_end_month     = (p ->> 'season_end_month')::smallint,
      crew_size            = (p ->> 'crew_size')::integer,
      skill_tier           = p ->> 'skill_tier',
      equipment_id         = v_equip,
      payment_methods      = v_methods,
      updated_at           = now()
    WHERE id = v_id;
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range
              OR invalid_datetime_format OR datetime_field_overflow OR not_null_violation THEN
    RAISE EXCEPTION 'PROVIDER_INPUT_INVALID';
  END;
  RETURN public.provider_workspace_get();
END
$fn$;

CREATE OR REPLACE FUNCTION public.provider_set_service_status(p_service_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_account uuid := public.provider_session_profile_locked();
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('ACTIVE', 'PAUSED', 'REMOVED') THEN
    RAISE EXCEPTION 'PROVIDER_STATUS_INVALID';
  END IF;
  UPDATE public.provider_services SET status = p_status, updated_at = now()
   WHERE id = p_service_id AND account_id = v_account AND status <> 'REMOVED';
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_SERVICE_NOT_FOUND'; END IF;
  RETURN public.provider_workspace_get();
END
$fn$;

-- ── working hours and blackouts ─────────────────────────────────────────────
-- p_days: [{"weekday":1,"is_working":true,"start_time":"07:00","end_time":"18:00"}, …]
CREATE OR REPLACE FUNCTION public.provider_set_working_hours(p_days jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_account uuid := public.provider_session_profile_locked();
BEGIN
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'PROVIDER_HOURS_INVALID';
  END IF;
  BEGIN
    IF (SELECT count(DISTINCT (d ->> 'weekday')::smallint) FROM jsonb_array_elements(p_days) d)
       <> jsonb_array_length(p_days) THEN
      RAISE EXCEPTION 'PROVIDER_HOURS_INVALID';
    END IF;
    INSERT INTO public.provider_working_hours (account_id, weekday, is_working, start_time, end_time)
    SELECT v_account, (d ->> 'weekday')::smallint, coalesce((d ->> 'is_working')::boolean, false),
           (d ->> 'start_time')::time, (d ->> 'end_time')::time
      FROM jsonb_array_elements(p_days) d
    ON CONFLICT (account_id, weekday) DO UPDATE
      SET is_working = EXCLUDED.is_working, start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time, updated_at = now();
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range
              OR invalid_datetime_format OR datetime_field_overflow OR not_null_violation THEN
    RAISE EXCEPTION 'PROVIDER_HOURS_INVALID';
  END;
  RETURN public.provider_workspace_get();
END
$fn$;

CREATE OR REPLACE FUNCTION public.provider_add_blackout(p_from timestamptz, p_to timestamptz, p_reason_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid  := public.provider_session_profile_locked();
  v_pol     jsonb := public.provider_workspace_policy();
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to <= now()
     OR p_to - p_from > make_interval(days => (v_pol ->> 'max_blackout_days')::integer)
     OR (p_reason_code IS NOT NULL AND p_reason_code !~ '^[A-Z][A-Z0-9_]{1,31}$') THEN
    RAISE EXCEPTION 'PROVIDER_BLACKOUT_INVALID';
  END IF;
  IF (SELECT count(*) FROM public.provider_blackouts b
       WHERE b.account_id = v_account AND b.cancelled_at IS NULL AND upper(b.period) > now())
     >= (v_pol ->> 'max_live_blackouts')::integer THEN
    RAISE EXCEPTION 'PROVIDER_LIMIT_REACHED';
  END IF;
  BEGIN
    INSERT INTO public.provider_blackouts (account_id, period, source, reason_code)
    VALUES (v_account, tstzrange(p_from, p_to), 'MANUAL', p_reason_code);
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'PROVIDER_BLACKOUT_OVERLAP';
  END;
  RETURN public.provider_workspace_get();
END
$fn$;

-- A provider can lift only a blackout they added; a JOB blackout ends with its job.
CREATE OR REPLACE FUNCTION public.provider_cancel_blackout(p_blackout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_account uuid := public.provider_session_profile_locked();
BEGIN
  UPDATE public.provider_blackouts SET cancelled_at = now()
   WHERE id = p_blackout_id AND account_id = v_account AND source = 'MANUAL' AND cancelled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_BLACKOUT_NOT_FOUND'; END IF;
  RETURN public.provider_workspace_get();
END
$fn$;

-- ── equipment ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_save_equipment(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid  := public.provider_session_profile_locked();
  v_pol     jsonb := public.provider_workspace_policy();
  v_defs    jsonb;
  v_attrs   jsonb := coalesce(p -> 'attributes', '{}'::jsonb);
  v_id      uuid;
  v_reg     text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR jsonb_typeof(v_attrs) <> 'object' THEN
    RAISE EXCEPTION 'PROVIDER_INPUT_INVALID';
  END IF;
  SELECT t.attribute_definitions INTO v_defs FROM public.equipment_types t
   WHERE t.code = p ->> 'equipment_type' AND t.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_EQUIPMENT_TYPE_INVALID'; END IF;

  -- every attribute sent must be defined for this type, with the defined kind of value
  IF EXISTS (
       SELECT 1 FROM jsonb_each(v_attrs) a
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_defs) d
           WHERE d ->> 'code' = a.key
             AND jsonb_typeof(a.value) = CASE d ->> 'type' WHEN 'text' THEN 'string' ELSE d ->> 'type' END
             AND (jsonb_typeof(a.value) <> 'string' OR char_length(a.value #>> '{}') <= 60))) THEN
    RAISE EXCEPTION 'PROVIDER_EQUIPMENT_ATTRIBUTE_INVALID';
  END IF;

  -- keep only the last four letters or digits of a registration number
  v_reg := nullif(right(regexp_replace(upper(coalesce(p ->> 'registration', '')), '[^A-Z0-9]', '', 'g'), 4), '');

  BEGIN
    v_id := nullif(p ->> 'id', '')::uuid;
    IF v_id IS NULL THEN
      IF (SELECT count(*) FROM public.provider_equipment e WHERE e.account_id = v_account AND e.status = 'ACTIVE')
         >= (v_pol ->> 'max_equipment')::integer THEN
        RAISE EXCEPTION 'PROVIDER_LIMIT_REACHED';
      END IF;
      INSERT INTO public.provider_equipment (account_id, equipment_type)
      VALUES (v_account, p ->> 'equipment_type') RETURNING id INTO v_id;
    ELSIF NOT EXISTS (SELECT 1 FROM public.provider_equipment e
                       WHERE e.id = v_id AND e.account_id = v_account AND e.status = 'ACTIVE') THEN
      RAISE EXCEPTION 'PROVIDER_EQUIPMENT_NOT_FOUND';
    END IF;

    UPDATE public.provider_equipment SET
      equipment_type     = p ->> 'equipment_type',
      make               = nullif(btrim(p ->> 'make'), ''),
      model              = nullif(btrim(p ->> 'model'), ''),
      year_made          = (p ->> 'year_made')::integer,
      attributes         = v_attrs,
      ownership          = coalesce(p ->> 'ownership', 'OWNED'),
      condition          = p ->> 'condition',
      registration_last4 = CASE WHEN p ? 'registration' THEN v_reg ELSE registration_last4 END,
      updated_at         = now()
    WHERE id = v_id;
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'PROVIDER_INPUT_INVALID';
  END;
  RETURN public.provider_workspace_get();
END
$fn$;

CREATE OR REPLACE FUNCTION public.provider_remove_equipment(p_equipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_account uuid := public.provider_session_profile_locked();
BEGIN
  UPDATE public.provider_equipment SET status = 'REMOVED', updated_at = now()
   WHERE id = p_equipment_id AND account_id = v_account AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_EQUIPMENT_NOT_FOUND'; END IF;
  UPDATE public.provider_services SET equipment_id = NULL, updated_at = now()
   WHERE account_id = v_account AND equipment_id = p_equipment_id;
  RETURN public.provider_workspace_get();
END
$fn$;

-- ── nursery store ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nursery_save_product(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid  := public.provider_session_profile_locked();
  v_pol     jsonb := public.provider_workspace_policy();
  v_unit    record;
  v_id      uuid;
  v_crop    uuid;
  v_price   numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'PROVIDER_INPUT_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nursery_item_kinds k WHERE k.code = p ->> 'item_kind' AND k.is_active) THEN
    RAISE EXCEPTION 'NURSERY_KIND_INVALID';
  END IF;
  SELECT u.code, u.is_negotiable INTO v_unit FROM public.pricing_units u
   WHERE u.code = p ->> 'pricing_unit' AND u.is_active AND NOT u.is_per_area;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_UNIT_INVALID'; END IF;

  BEGIN
    v_id    := nullif(p ->> 'id', '')::uuid;
    v_crop  := nullif(p ->> 'crop_id', '')::uuid;
    v_price := CASE WHEN v_unit.is_negotiable THEN NULL ELSE (p ->> 'price')::numeric END;
    IF v_crop IS NULL OR NOT EXISTS (SELECT 1 FROM public.crops c WHERE c.id = v_crop) THEN
      RAISE EXCEPTION 'NURSERY_CROP_INVALID';
    END IF;
    IF NOT v_unit.is_negotiable AND v_price IS NULL THEN RAISE EXCEPTION 'NURSERY_PRICE_REQUIRED'; END IF;

    IF v_id IS NULL THEN
      IF (SELECT count(*) FROM public.nursery_products n WHERE n.account_id = v_account AND n.status <> 'REMOVED')
         >= (v_pol ->> 'max_nursery_products')::integer THEN
        RAISE EXCEPTION 'PROVIDER_LIMIT_REACHED';
      END IF;
      INSERT INTO public.nursery_products (account_id, crop_id, item_kind, pricing_unit)
      VALUES (v_account, v_crop, p ->> 'item_kind', v_unit.code) RETURNING id INTO v_id;
    ELSIF NOT EXISTS (SELECT 1 FROM public.nursery_products n
                       WHERE n.id = v_id AND n.account_id = v_account AND n.status <> 'REMOVED') THEN
      RAISE EXCEPTION 'NURSERY_PRODUCT_NOT_FOUND';
    END IF;

    UPDATE public.nursery_products SET
      crop_id = v_crop, item_kind = p ->> 'item_kind', pricing_unit = v_unit.code, price = v_price,
      min_order_qty = (p ->> 'min_order_qty')::integer,
      status = CASE WHEN p ->> 'status' IN ('ACTIVE', 'PAUSED', 'REMOVED') THEN p ->> 'status' ELSE status END,
      updated_at = now()
    WHERE id = v_id;
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'PROVIDER_INPUT_INVALID';
  END;
  RETURN public.provider_workspace_get();
END
$fn$;

-- Stock of a product. The batch row is locked, and total_qty can never be set
-- below what is already reserved, so stock promised to a farmer cannot vanish.
CREATE OR REPLACE FUNCTION public.nursery_save_batch(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account  uuid := public.provider_session_profile_locked();
  v_id       uuid;
  v_product  uuid;
  v_total    integer;
  v_reserved integer;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'PROVIDER_INPUT_INVALID'; END IF;
  BEGIN
    v_id      := nullif(p ->> 'id', '')::uuid;
    v_product := nullif(p ->> 'product_id', '')::uuid;
    v_total   := (p ->> 'total_qty')::integer;
    IF v_total IS NULL OR v_total < 0 OR (p ->> 'ready_date') IS NULL THEN
      RAISE EXCEPTION 'NURSERY_BATCH_INVALID';
    END IF;

    IF v_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.nursery_products n
                      WHERE n.id = v_product AND n.account_id = v_account AND n.status <> 'REMOVED') THEN
        RAISE EXCEPTION 'NURSERY_PRODUCT_NOT_FOUND';
      END IF;
      IF (SELECT count(*) FROM public.nursery_batches b WHERE b.product_id = v_product AND b.status = 'ACTIVE') >= 50 THEN
        RAISE EXCEPTION 'PROVIDER_LIMIT_REACHED';
      END IF;
      INSERT INTO public.nursery_batches (product_id, total_qty, ready_date)
      VALUES (v_product, v_total, (p ->> 'ready_date')::date);
    ELSE
      SELECT b.reserved_qty INTO v_reserved
        FROM public.nursery_batches b
        JOIN public.nursery_products n ON n.id = b.product_id AND n.account_id = v_account
       WHERE b.id = v_id
         FOR UPDATE OF b;
      IF NOT FOUND THEN RAISE EXCEPTION 'NURSERY_BATCH_NOT_FOUND'; END IF;
      IF v_total < v_reserved THEN RAISE EXCEPTION 'NURSERY_BATCH_BELOW_RESERVED'; END IF;
      UPDATE public.nursery_batches SET
        total_qty = v_total, ready_date = (p ->> 'ready_date')::date,
        status = CASE WHEN p ->> 'status' IN ('ACTIVE', 'CLOSED') THEN p ->> 'status' ELSE status END,
        updated_at = now()
      WHERE id = v_id;
    END IF;
  EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range
              OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'NURSERY_BATCH_INVALID';
  END;
  RETURN public.provider_workspace_get();
END
$fn$;

-- ── listing ─────────────────────────────────────────────────────────────────
-- The provider asks to be listed. Farmers see a provider only once a reviewer
-- has moved the listing to LISTED.
CREATE OR REPLACE FUNCTION public.provider_submit_for_review()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid := public.provider_session_profile_locked();
  v_status  text;
BEGIN
  SELECT p.listing_status INTO v_status FROM public.service_provider_profiles p WHERE p.account_id = v_account;
  IF v_status <> 'DRAFT' THEN
    RETURN public.provider_workspace_get();        -- already submitted, listed or suspended: nothing to do
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_services s WHERE s.account_id = v_account AND s.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'PROVIDER_NO_ACTIVE_SERVICE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_working_hours w WHERE w.account_id = v_account AND w.is_working) THEN
    RAISE EXCEPTION 'PROVIDER_HOURS_NOT_SET';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_reach_settings r
                  WHERE r.account_id = v_account AND r.role = 'SERVICE_PROVIDER') THEN
    RAISE EXCEPTION 'PROVIDER_REACH_NOT_SET';
  END IF;
  UPDATE public.service_provider_profiles
     SET listing_status = 'PENDING_REVIEW', submitted_at = now(), review_note_code = NULL, updated_at = now()
   WHERE account_id = v_account;
  RETURN public.provider_workspace_get();
END
$fn$;

-- Reviewer action. Service role only: there is no admin queue yet, so for now a
-- reviewer runs this as reviewable SQL.  p_decision: LIST | RETURN | SUSPEND.
CREATE OR REPLACE FUNCTION public.provider_review_listing(p_account_id uuid, p_decision text, p_note_code text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_status text; v_new text;
BEGIN
  IF p_note_code IS NOT NULL AND p_note_code !~ '^[A-Z][A-Z0-9_]{1,31}$' THEN
    RAISE EXCEPTION 'PROVIDER_INPUT_INVALID';
  END IF;
  SELECT p.listing_status INTO v_status FROM public.service_provider_profiles p
   WHERE p.account_id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVIDER_PROFILE_MISSING'; END IF;
  v_new := CASE
    WHEN p_decision = 'LIST'    AND v_status IN ('PENDING_REVIEW', 'SUSPENDED') THEN 'LISTED'
    WHEN p_decision = 'RETURN'  AND v_status = 'PENDING_REVIEW'                 THEN 'DRAFT'
    WHEN p_decision = 'SUSPEND' AND v_status IN ('PENDING_REVIEW', 'LISTED')    THEN 'SUSPENDED'
  END;
  IF v_new IS NULL THEN RAISE EXCEPTION 'PROVIDER_REVIEW_NOT_ALLOWED'; END IF;
  UPDATE public.service_provider_profiles
     SET listing_status = v_new, reviewed_at = now(), reviewed_by = auth.uid(), review_note_code = p_note_code,
         listed_at = CASE WHEN v_new = 'LISTED' THEN now() ELSE listed_at END, updated_at = now()
   WHERE account_id = p_account_id;
  RETURN v_new;
END
$fn$;

-- ── grants ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.provider_workspace_policy(), public.provider_session_account(), public.provider_session_profile_locked(),
  public.provider_availability(uuid), public.provider_review_listing(uuid, text, text),
  public.provider_workspace_get(), public.provider_save_profile(jsonb), public.provider_set_accepting(boolean),
  public.provider_save_service(jsonb), public.provider_set_service_status(uuid, text),
  public.provider_set_working_hours(jsonb), public.provider_add_blackout(timestamptz, timestamptz, text),
  public.provider_cancel_blackout(uuid), public.provider_save_equipment(jsonb), public.provider_remove_equipment(uuid),
  public.nursery_save_product(jsonb), public.nursery_save_batch(jsonb), public.provider_submit_for_review()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.provider_workspace_get(), public.provider_save_profile(jsonb), public.provider_set_accepting(boolean),
  public.provider_save_service(jsonb), public.provider_set_service_status(uuid, text),
  public.provider_set_working_hours(jsonb), public.provider_add_blackout(timestamptz, timestamptz, text),
  public.provider_cancel_blackout(uuid), public.provider_save_equipment(jsonb), public.provider_remove_equipment(uuid),
  public.nursery_save_product(jsonb), public.nursery_save_batch(jsonb), public.provider_submit_for_review()
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.provider_workspace_policy(), public.provider_session_account(), public.provider_session_profile_locked(),
  public.provider_availability(uuid), public.provider_review_listing(uuid, text, text)
  TO service_role;

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'internal provider functions callable by the browser' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('provider_workspace_policy', 'provider_session_account', 'provider_session_profile_locked',
                     'provider_availability', 'provider_review_listing')
   AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
