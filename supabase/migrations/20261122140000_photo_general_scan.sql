-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122140000_photo_general_scan.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- General Scan (land-less identification) — database side.
--
-- Already applied on 2026-11-22 (photo_land_id_nullable_for_general_scan):
--   crop_growth_uploads.land_id and crop_photo_diagnosis.land_id are nullable.
-- That alone is not enough: three BEFORE INSERT triggers look the land up and
-- raise when land_id is NULL. This migration gives each of them a land-less
-- branch. EVERY ROW WITH A land_id TAKES EXACTLY THE SAME CODE PATH AS BEFORE
-- (the land branches below are copied verbatim from the live definitions).
--
-- 1. crop_photo_fill_context()            — uploads: identity from the edge
--    function's guarded farmer/tenant, verified against farmers.tenant_id;
--    must be upload_type 'general', no schedule/task; land context
--    (phenology, weather, NDVI, soil, farm state) is skipped; consent is
--    resolved exactly as for land photos.
-- 2. crop_photo_diagnosis_fill_identity()  — diagnosis: same identity check,
--    no schedule/task.
-- 3. crop_photo_diagnosis_photo_same_land() — link: land-less diagnosis may
--    only link land-less photos of the same farmer and tenant.
-- 4. crop_growth_uploads_path_owner_chk    — land-less storage paths must sit
--    under <tenant>/<farmer>/_general/ (land paths unchanged).
-- 5. vision_diagnosis_policy.general_scan  — General Scan settings (config, not code):
--    max_output_tokens 4000 (farmer-language text + management in Indic scripts),
--    timeout_ms 45000 per model attempt (longer output than land perception),
--    local_script_min_ratio 0.6 (share of letters in the farmer's script below
--    which the *_local text is rewritten once), spray_plan (app-side spray
--    calculator: pump sizes offered, default pump, litres of stock solution per
--    pump, minimum dilution of the stock = stock volume ÷ product volume).
--    Confidence floor stays photo_diagnosis_policy.observation_min_confidence.
--
-- Additive and reversible. No data is changed or deleted. No session state,
-- no TEMP tables (SQL runner rule). Run PRECHECK_20261122140000_photo_general_scan.sql first.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crop_photo_fill_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land       record;
  v_tz         text;
  v_tz_source  text;
  v_local      date;
  v_ph         record;
  v_crop_id    uuid;
  v_match_id   uuid;
  v_match_n    integer;
  v_sched      record;
  v_ws         record;
  v_ndvi       record;
  v_soil_id    uuid;
  v_fs_id      uuid;
  v_consent    record;
  j_ph         jsonb;
  j_sched      jsonb;
  j_ws         jsonb;
  j_ndvi       jsonb;
BEGIN
  -- 2026-11-22 — General Scan: a land-less photo of the verified farmer.
  IF NEW.land_id IS NULL THEN
    IF NEW.farmer_id IS NULL OR NEW.tenant_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.farmers f
                       WHERE f.id = NEW.farmer_id AND f.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'general photo requires a farmer that belongs to the tenant' USING errcode = '23503';
    END IF;
    IF NEW.upload_type IS DISTINCT FROM 'general' THEN
      RAISE EXCEPTION 'a photo without a land must have upload_type general' USING errcode = '23514';
    END IF;
    IF NEW.schedule_id IS NOT NULL OR NEW.task_id IS NOT NULL THEN
      RAISE EXCEPTION 'a general photo cannot carry a schedule or task' USING errcode = '23514';
    END IF;
    NEW.captured_at := coalesce(NEW.captured_at, NEW.upload_timestamp, now());
    SELECT f.timezone INTO v_tz FROM public.farmers f WHERE f.id = NEW.farmer_id;
    IF v_tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = v_tz) THEN
      v_tz_source := 'farmer';
    ELSE
      v_tz := 'UTC';
      v_tz_source := 'utc_fallback';
    END IF;
    v_local := (NEW.captured_at AT TIME ZONE v_tz)::date;
    NEW.crop_id := NULL;
    NEW.crop_value := NULL;
    SELECT c.id, c.consent_given INTO v_consent
      FROM public.farmer_consent_log c
     WHERE c.farmer_id = NEW.farmer_id AND c.consent_type = 'photo_ai_training'
     ORDER BY c.created_at DESC
     LIMIT 1;
    IF FOUND THEN
      NEW.consent_log_id   := v_consent.id;
      NEW.training_consent := coalesce(v_consent.consent_given, false);
    ELSE
      NEW.consent_log_id   := NULL;
      NEW.training_consent := false;
    END IF;
    NEW.context_snapshot := jsonb_build_object(
      'contract',           NEW.contract_version,
      'scan_scope',         'general',
      'capture_local_date', v_local,
      'timezone',           v_tz,
      'timezone_source',    v_tz_source,
      'crop_resolution',    'not_applicable'
    );
    RETURN NEW;
  END IF;

  -- Land photo — unchanged from the live definition.
  SELECT l.tenant_id, l.farmer_id, l.current_crop_id, l.current_crop
    INTO v_land
    FROM public.lands l
   WHERE l.id = NEW.land_id;
  IF NOT FOUND OR v_land.tenant_id IS NULL OR v_land.farmer_id IS NULL THEN
    RAISE EXCEPTION 'land % not found or has no owner', NEW.land_id USING errcode = '23503';
  END IF;
  NEW.tenant_id := v_land.tenant_id;
  NEW.farmer_id := v_land.farmer_id;
  IF NEW.schedule_id IS NULL THEN
    SELECT s.id INTO NEW.schedule_id
      FROM public.crop_schedules s
     WHERE s.land_id = NEW.land_id AND s.is_active
     LIMIT 1;
  ELSIF NOT EXISTS (SELECT 1 FROM public.crop_schedules s
                     WHERE s.id = NEW.schedule_id AND s.land_id = NEW.land_id) THEN
    RAISE EXCEPTION 'schedule % does not belong to land %', NEW.schedule_id, NEW.land_id USING errcode = '23514';
  END IF;
  NEW.captured_at := coalesce(NEW.captured_at, NEW.upload_timestamp, now());
  SELECT f.timezone INTO v_tz FROM public.farmers f WHERE f.id = NEW.farmer_id;
  IF v_tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = v_tz) THEN
    v_tz_source := 'farmer';
  ELSE
    v_tz := 'UTC';
    v_tz_source := 'utc_fallback';
  END IF;
  v_local := (NEW.captured_at AT TIME ZONE v_tz)::date;
  SELECT r.* INTO v_ph
    FROM public.resolve_crop_phenology_for_land(NEW.land_id, v_local) r
   LIMIT 1;
  IF FOUND THEN
    j_ph := to_jsonb(v_ph);
    NEW.stage_uuid         := v_ph.stage_uuid;
    NEW.stage_code         := v_ph.stage_code;
    NEW.das                := v_ph.current_das;
    NEW.dat                := v_ph.current_dat;
    NEW.gdd                := v_ph.current_gdd;
    NEW.cultivation_method := v_ph.cultivation_method;
  END IF;
  v_crop_id := v_land.current_crop_id;
  IF v_crop_id IS NULL AND (j_ph ->> 'crop_code') IS NOT NULL THEN
    SELECT c.id INTO v_crop_id FROM public.crops c WHERE lower(c.value) = lower(j_ph ->> 'crop_code') LIMIT 1;
  END IF;
  IF v_crop_id IS NULL AND nullif(btrim(v_land.current_crop), '') IS NOT NULL THEN
    SELECT (array_agg(c.id))[1], count(*)
      INTO v_match_id, v_match_n
      FROM public.crops c
     WHERE lower(btrim(v_land.current_crop)) IN (
             lower(c.value), lower(c.label), lower(c.label_local), lower(c.local_name),
             lower(c.label_hi), lower(c.label_mr), lower(c.label_pa), lower(c.label_ta),
             lower(c.label_te), lower(c.label_bn), lower(c.label_gu), lower(c.label_kn),
             lower(c.label_ml), lower(c.label_or), lower(c.label_as), lower(c.label_ur),
             lower(c.label_sa));
    IF v_match_n = 1 THEN v_crop_id := v_match_id; END IF;
  END IF;
  NEW.crop_id := v_crop_id;
  NEW.crop_value := (SELECT c.value FROM public.crops c WHERE c.id = v_crop_id);
  IF NEW.schedule_id IS NOT NULL THEN
    SELECT s.variety_id, s.crop_variety INTO v_sched
      FROM public.crop_schedules s WHERE s.id = NEW.schedule_id;
    IF FOUND THEN j_sched := to_jsonb(v_sched); END IF;
  END IF;
  SELECT w.* INTO v_ws
    FROM public.land_weather_state w
   WHERE w.land_id = NEW.land_id AND w.metric_date <= v_local
   ORDER BY w.metric_date DESC, w.computed_at DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN
    j_ws := to_jsonb(v_ws);
    NEW.weather_at_capture := j_ws;
  END IF;
  SELECT n.id, n.acquisition_date, n.date, n.ndvi_value, n.mean_ndvi INTO v_ndvi
    FROM public.ndvi_data n
   WHERE n.land_id = NEW.land_id
     AND ((n.acquisition_date IS NOT NULL AND n.acquisition_date <= v_local)
          OR (n.acquisition_date IS NULL AND n.date <= v_local))
   ORDER BY n.acquisition_date DESC NULLS LAST, n.date DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN j_ndvi := to_jsonb(v_ndvi); END IF;
  SELECT s.id INTO v_soil_id
    FROM public.soil_health s
   WHERE s.land_id = NEW.land_id
   ORDER BY s.test_date DESC NULLS LAST, s.created_at DESC
   LIMIT 1;
  SELECT fs.id INTO v_fs_id
    FROM public.land_farm_state fs
   WHERE fs.land_id = NEW.land_id AND fs.state_date <= v_local
   ORDER BY fs.state_date DESC, fs.computed_at DESC NULLS LAST
   LIMIT 1;
  SELECT c.id, c.consent_given INTO v_consent
    FROM public.farmer_consent_log c
   WHERE c.farmer_id = NEW.farmer_id AND c.consent_type = 'photo_ai_training'
   ORDER BY c.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    NEW.consent_log_id   := v_consent.id;
    NEW.training_consent := coalesce(v_consent.consent_given, false);
  ELSE
    NEW.consent_log_id   := NULL;
    NEW.training_consent := false;
  END IF;
  NEW.context_snapshot := jsonb_build_object(
    'contract',           NEW.contract_version,
    'capture_local_date', v_local,
    'timezone',           v_tz,
    'timezone_source',    v_tz_source,
    'phenology',          j_ph,
    'crop_resolution',    CASE WHEN v_land.current_crop_id IS NOT NULL THEN 'land_crop_id'
                               WHEN v_crop_id IS NOT NULL THEN 'matched'
                               ELSE 'unresolved' END,
    'variety',            j_sched,
    'ndvi',               j_ndvi,
    'refs', jsonb_build_object(
       'weather_state_id', j_ws ->> 'id',
       'ndvi_data_id',     j_ndvi ->> 'id',
       'soil_health_id',   v_soil_id,
       'farm_state_id',    v_fs_id)
  );
  RETURN NEW;
END
$function$;

-- 2 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crop_photo_diagnosis_fill_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 2026-11-22 — General Scan: identity supplied by the edge function, verified here.
  IF NEW.land_id IS NULL THEN
    IF NEW.farmer_id IS NULL OR NEW.tenant_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.farmers f
                       WHERE f.id = NEW.farmer_id AND f.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'general diagnosis requires a farmer that belongs to the tenant' USING errcode = '23503';
    END IF;
    IF NEW.schedule_id IS NOT NULL OR NEW.task_id IS NOT NULL THEN
      RAISE EXCEPTION 'a general diagnosis cannot carry a schedule or task' USING errcode = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Land diagnosis — unchanged from the live definition.
  SELECT l.tenant_id, l.farmer_id INTO NEW.tenant_id, NEW.farmer_id
    FROM public.lands l WHERE l.id = NEW.land_id;
  IF NEW.tenant_id IS NULL OR NEW.farmer_id IS NULL THEN
    RAISE EXCEPTION 'land % not found or has no owner', NEW.land_id USING errcode = '23503';
  END IF;
  IF NEW.schedule_id IS NULL THEN
    SELECT s.id INTO NEW.schedule_id FROM public.crop_schedules s
     WHERE s.land_id = NEW.land_id AND s.is_active LIMIT 1;
  ELSIF NOT EXISTS (SELECT 1 FROM public.crop_schedules s WHERE s.id = NEW.schedule_id AND s.land_id = NEW.land_id) THEN
    RAISE EXCEPTION 'schedule % does not belong to land %', NEW.schedule_id, NEW.land_id USING errcode = '23514';
  END IF;
  RETURN NEW;
END
$function$;

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crop_photo_diagnosis_photo_same_land()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Land rows: same condition as before (d.land_id = u.land_id).
  -- 2026-11-22 — General Scan: both land-less, same farmer and tenant.
  IF NOT EXISTS (SELECT 1 FROM public.crop_photo_diagnosis d
                   JOIN public.crop_growth_uploads u ON u.id = NEW.upload_id
                  WHERE d.id = NEW.diagnosis_id
                    AND (d.land_id = u.land_id
                         OR (d.land_id IS NULL AND u.land_id IS NULL
                             AND d.farmer_id = u.farmer_id AND d.tenant_id = u.tenant_id))) THEN
    RAISE EXCEPTION 'photo % and diagnosis % are not on the same land', NEW.upload_id, NEW.diagnosis_id
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END
$function$;

-- 4 ─────────────────────────────────────────────────────────────────────────
-- Before: storage_path LIKE tenant/farmer/land_id/%  — with land_id NULL that
-- expression is NULL and the CHECK passed any path. Land paths are unchanged
-- (coalesce returns land_id); land-less paths must sit under _general/.
ALTER TABLE public.crop_growth_uploads DROP CONSTRAINT IF EXISTS crop_growth_uploads_path_owner_chk;
ALTER TABLE public.crop_growth_uploads ADD CONSTRAINT crop_growth_uploads_path_owner_chk
  CHECK ((storage_path IS NULL)
         OR (storage_path ~~ ((tenant_id)::text || '/' || (farmer_id)::text || '/'
                              || coalesce((land_id)::text, '_general') || '/%')));

-- 5 ─────────────────────────────────────────────────────────────────────────
-- Farmer-language explanations and management need a larger output budget and a
-- longer attempt window than land perception (Indic scripts use more tokens per
-- word). Merge, not replace: every existing key is kept.
UPDATE public.system_config
   SET config_value = config_value || '{"general_scan": {"max_output_tokens": 4000, "timeout_ms": 45000, "local_script_min_ratio": 0.6, "spray_plan": {"pump_sizes_l": [16, 18, 20], "default_pump_l": 18, "stock_l_per_pump": 1, "stock_min_dilution": 10}}}'::jsonb,
       updated_at = now()
 WHERE config_key = 'vision_diagnosis_policy';

-- POST-CHECK (read-only, run after applying):
-- select pg_get_functiondef('public.crop_photo_fill_context'::regproc) ilike '%scan_scope%';                 -- true
-- select pg_get_functiondef('public.crop_photo_diagnosis_fill_identity'::regproc) ilike '%general diagnosis%'; -- true
-- select pg_get_functiondef('public.crop_photo_diagnosis_photo_same_land'::regproc) ilike '%land_id IS NULL%'; -- true
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'crop_growth_uploads_path_owner_chk';   -- contains _general
-- select config_value->'general_scan' from system_config where config_key = 'vision_diagnosis_policy';         -- {"spray_plan": {"pump_sizes_l": [16, 18, 20], "default_pump_l": 18, "stock_l_per_pump": 1, "stock_min_dilution": 10}, "timeout_ms": 45000, "max_output_tokens": 4000, "local_script_min_ratio": 0.6}
--
-- ROLLBACK (only if needed): re-run the three function definitions as they were
-- before this file (git history of this migration's predecessors / pg_get_functiondef
-- captured in PRECHECK output), restore the old CHECK
--   storage_path ~~ tenant_id || '/' || farmer_id || '/' || land_id || '/%'
-- and remove general_scan:  config_value - 'general_scan'.
