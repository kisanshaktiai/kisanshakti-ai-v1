-- ============================================================================
-- 20260830_stage_evidence_authority_p1.sql
-- Repo: kisanshaktiai/kisanshakti-ai-v1  (branch kisanshakti-ai-update)
-- Crop Biological Growth Stage Engine — 2nd forensic audit reconciliation (R2), P1
-- ----------------------------------------------------------------------------
-- NO SCHEMA CHANGE. Function bodies + one system_config policy row + one feature flag.
-- Safe for the session-less SQL runner (no TEMP tables, no session settings, every
-- statement self-contained). Deploy AFTER 20260830_stage_authority_p0.sql and
-- 20260830_clock_alignment_and_cache.sql (both verified applied live 2026-08-30).
--
-- What this fixes (all FACT, row/source-verified against live 2026-08-30 05:20 UTC):
--   F1  Evidence confidence was replaced by rank weights at THREE layers:
--       resolve_crop_phenology [A] greatest(0.85, ledger) and [B] rule confidence,
--       resolve_crop_phenology variety-profile greatest(., 0.90),
--       apply_stage_transitions stored the RULE confidence (0.95 on all 181
--       morphology_stage rules), never the detector's. Now: ledger/resolver confidence
--       = least(rule_confidence, evidence_confidence); authority is a SEPARATE label
--       ('authority:<tier>') and confirmation a SEPARATE status
--       ('confirmation:ESTIMATED|OBSERVED|CONFIRMED'), both carried in evidence_sources
--       (no signature change) and in stage_transition_log.evidence.
--   F2  stc_eval_single('morphology_stage') treated a NULL photo confidence as 1.0,
--       matched photos of ANY crop cycle (land_id only), ignored provenance. Now every
--       photo used as stage evidence must be: this cycle (captured >= cycle start),
--       confidence NOT NULL and >= policy/rule minimum, location-validated against the
--       land geometry (policy), and free of identity/quality conflicts.
--   F3  A photo could only ever advance the crop by ONE rung (rules are from->next).
--       apply_stage_transitions now has a policy-gated morphology jump path: a
--       forward jump of <= photo.max_auto_jump_steps backed by >= photo.min_photos_for_jump
--       validated photos is applied as trigger_type='morphology_stage' (rule_id NULL,
--       evidence.jump=true); anything else (further, fewer photos, or BACKWARD) is
--       queued in stage_review_queue — never silently dropped, never auto-applied.
--   F4  Split-brain cultivation method: the 1-arg resolve_crop_phenology (nightly
--       writers, schedule-reconciler) applied a crop-taxonomy fallback that forced
--       sugarcane to 'direct_seeded' (every sugarcane stage row is 'sett_planted' ->
--       lands cbb82a43/ca9687fa could never resolve) while the chat path
--       (resolve_crop_phenology_for_land) had no fallback. Both now go through ONE
--       profile function: schedule method -> transplant-date inference -> UNKNOWN.
--   F5  No server-side geofence existed ("photo of that crop in that farm only"):
--       validate_growth_upload_location() measures the capture point against
--       lands.boundary (PostGIS geography; 0 m when inside) or lands.center and writes
--       crop_growth_uploads.location_validated / distance_from_land_meters.
--
-- Every threshold lives in system_config.stage_evidence_policy (jsonb). Missing policy
-- => photo evidence is UNAVAILABLE (fail closed), never defaulted in code.
-- Rollback: re-run the previous CREATE OR REPLACE bodies from
-- 20260830_stage_authority_p0.sql (sections 1, 2, 3) and 20260729145903 (stc_eval_single,
-- resolve_biological_profile, 1-arg resolver); delete the policy row and the flag.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Evidence policy (DB-governed; agronomist/ops-tunable; no code constant)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.system_config (config_key, config_value, description)
SELECT 'stage_evidence_policy',
       '{
         "version": 1,
         "authority_rank": ["morphology", "farmer_observation", "sensor", "thermal_model", "variety_calendar", "calendar", "unknown"],
         "trigger_authority": {
           "morphology_stage": "morphology",
           "observation": "farmer_observation",
           "event": "farmer_observation",
           "ndvi": "sensor",
           "gdd": "thermal_model",
           "das": "calendar",
           "dat": "calendar",
           "autonomous_init": "calendar"
         },
         "photo": {
           "require_location_validated": true,
           "max_distance_m": 150,
           "max_age_days": 21,
           "min_confidence": 0.6,
           "signal_confidence_high": 0.8,
           "min_photos_for_confirmation": 2,
           "confirmation_window_days": 10,
           "max_auto_jump_steps": 2,
           "min_photos_for_jump": 2,
           "require_crop_identity_match": true
         },
         "transition": {
           "age_decay_per_7_days": 0.05,
           "age_decay_floor": 0.30,
           "stale_after_days": 14
         },
         "semantics": {
           "ESTIMATED": "calendar / thermal model / sensor inference without field observation",
           "OBSERVED": "one validated field photo or farmer-reported event for this cycle",
           "CONFIRMED": "min_photos_for_confirmation validated photos agreeing on the stage within confirmation_window_days"
         }
       }'::jsonb,
       'Crop biological stage engine — evidence authority tiers, photo provenance gates, confirmation contract (2nd forensic audit R2, 2026-08-30). Authority and confidence are separate: authority ranks the SOURCE, confidence is the source''s own calibrated value.'
 WHERE NOT EXISTS (SELECT 1 FROM public.system_config sc WHERE sc.config_key = 'stage_evidence_policy');

INSERT INTO public.feature_flags
  (flag_name, description, is_enabled, rollout_percentage, flag_type, flag_status, default_value)
SELECT 'photo_stage_persist',
       'Allow ai-crop-scan (growth_tracking) to call apply_stage_transitions immediately after a location-validated photo is classified (default OFF: phenology-daily is the single stage writer; chat and scan only read).',
       false, 0, 'release', 'active', 'false'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name = 'photo_stage_persist');


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. resolve_biological_profile — v2: the ONLY place cultivation method is inferred
--    schedule.cultivation_method (SSOT) -> 'transplanted' when a transplant date is
--    recorded (a field event, not taxonomy) -> NULL (unknown; resolver then matches
--    'any' rows only and reports cultivation_method:unknown). The crop-taxonomy
--    fallback is GONE (F4).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_biological_profile(p_land_id uuid, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS TABLE(crop_code text, crop_cycle text, cultivation_method text, establishment_method text, production_system text, planting_method text, variety_id uuid, sowing_date date, sowing_source text, transplant_date date, current_gdd numeric, evidence text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land              record;
  v_schedule_sow_date date;
  v_schedule_method   text;
  v_schedule_tp       date;
  v_sow_date          date;
  v_sow_source        text;
  v_method            text;
  v_tp                date;
  v_evidence          text[] := ARRAY[]::text[];
BEGIN
  SELECT l.id, l.current_crop, l.crop_cycle, l.current_crop_variety_id,
         l.planting_date, l.last_sowing_date, l.transplant_date, l.current_gdd
    INTO v_land
    FROM public.lands l
   WHERE l.id = p_land_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT cs.sowing_date, lower(nullif(cs.cultivation_method, '')), cs.transplant_date
    INTO v_schedule_sow_date, v_schedule_method, v_schedule_tp
    FROM public.crop_schedules cs
   WHERE cs.land_id = p_land_id
     AND cs.is_active = true
     AND cs.sowing_date IS NOT NULL
   ORDER BY cs.sowing_date DESC
   LIMIT 1;

  v_sow_date := coalesce(v_land.planting_date, v_land.last_sowing_date, v_schedule_sow_date);

  IF v_sow_date IS NOT NULL THEN
    v_sow_source := CASE
      WHEN v_land.planting_date    IS NOT NULL THEN 'lands.planting_date'
      WHEN v_land.last_sowing_date IS NOT NULL THEN 'lands.last_sowing_date'
      ELSE                                          'crop_schedules.sowing_date'
    END;
    v_evidence := v_evidence || ARRAY['sowing_source:' || v_sow_source];
  END IF;

  -- transplant date: land record first, then the active schedule (was: land only on the
  -- chat path, coalesce(land, schedule) on the nightly path -> unified here)
  v_tp := coalesce(v_land.transplant_date, v_schedule_tp);
  IF v_tp IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY[
      'transplant_source:' || CASE WHEN v_land.transplant_date IS NOT NULL THEN 'lands.transplant_date' ELSE 'crop_schedules.transplant_date' END
    ];
  END IF;

  IF v_schedule_method IS NOT NULL THEN
    v_method   := v_schedule_method;
    v_evidence := v_evidence || ARRAY['cultivation_method:' || v_method || ':crop_schedules'];
    IF v_tp IS NOT NULL AND v_method <> 'transplanted' THEN
      -- contradiction surfaced, not silently resolved (schedule stays SSOT)
      v_evidence := v_evidence || ARRAY['cultivation_method_conflict:transplant_date_present:' || v_method];
    END IF;
  ELSIF v_tp IS NOT NULL THEN
    v_method   := 'transplanted';
    v_evidence := v_evidence || ARRAY['cultivation_method:transplanted:inferred_from_transplant_date'];
  ELSE
    v_method   := NULL;
    v_evidence := v_evidence || ARRAY['cultivation_method:unknown'];
  END IF;

  RETURN QUERY
  SELECT
    lower(coalesce(v_land.current_crop, '')),
    lower(coalesce(v_land.crop_cycle, '')),
    v_method,
    NULL::text,   -- establishment_method (future extension)
    NULL::text,   -- production_system    (future extension)
    NULL::text,   -- planting_method      (future extension)
    v_land.current_crop_variety_id,
    v_sow_date,
    v_sow_source,
    v_tp,
    v_land.current_gdd,
    v_evidence;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. resolve_crop_phenology(uuid) — 1-arg wrapper now delegates to the profile (F4).
--    Same semantics for run_daily_phenology / initialize_crop_cycle_stage /
--    evaluate_stage_transitions / reconcile_schedule_for_land / schedule-reconciler and
--    for the chat path (resolve_crop_phenology_for_land).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(p_land_id uuid)
 RETURNS TABLE(stage_uuid uuid, stage_code text, growth_stage text, crop_code text, crop_cycle text, cultivation_method text, previous_stage_uuid uuid, next_stage_uuid uuid, expected_transition_date date, reference_system text, phenology_model text, current_das integer, current_dat integer, current_gdd numeric, expected_height_cm_min numeric, expected_height_cm_max numeric, expected_leaf_count_min integer, expected_leaf_count_max integer, expected_ndvi_min numeric, expected_ndvi_max numeric, phenology_index numeric, confidence numeric, evidence_sources text[], source text, resolver_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bp record;
BEGIN
  SELECT * INTO v_bp FROM public.resolve_biological_profile(p_land_id, CURRENT_DATE);
  IF NOT FOUND THEN RETURN; END IF;
  IF coalesce(v_bp.crop_code, '') = '' OR v_bp.sowing_date IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT * FROM public.resolve_crop_phenology(
    v_bp.crop_code,
    v_bp.crop_cycle,
    v_bp.cultivation_method,
    v_bp.variety_id,
    v_bp.sowing_date,
    v_bp.transplant_date,
    v_bp.current_gdd,
    CURRENT_DATE,
    p_land_id
  );
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. stc_morphology_evidence — the single definition of "a photo that counts" (F2)
--    Used by stc_eval_single, evaluate_stage_transitions, apply_stage_transitions, the
--    jump candidate finder, AND the TS phenology reconciler (via rpc) so no layer can
--    drift from the provenance rules. Returns nothing when the policy row is missing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stc_morphology_evidence(
  p_land_id uuid,
  p_stage_uuid uuid DEFAULT NULL::uuid,
  p_stage_code text DEFAULT NULL::text,
  p_within_days integer DEFAULT NULL::integer,
  p_min_confidence numeric DEFAULT NULL::numeric)
 RETURNS TABLE(analysis_id uuid, upload_id uuid, stage_uuid uuid, stage_code text, confidence numeric, captured_at timestamp with time zone, location_validated boolean, distance_m numeric, detected_label text, cultivation_method text, phenology_index numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pol         jsonb;
  v_within      integer;
  v_min         numeric;
  v_req_loc     boolean;
  v_crop        text;
  v_cycle_start date;
BEGIN
  SELECT sc.config_value INTO v_pol
    FROM public.system_config sc WHERE sc.config_key = 'stage_evidence_policy' LIMIT 1;
  IF v_pol IS NULL THEN RETURN; END IF;                       -- fail closed: no policy, no photo authority

  v_within  := coalesce(p_within_days, NULLIF(v_pol->'photo'->>'max_age_days', '')::integer);
  v_min     := coalesce(p_min_confidence, NULLIF(v_pol->'photo'->>'min_confidence', '')::numeric);
  v_req_loc := coalesce(NULLIF(v_pol->'photo'->>'require_location_validated', '')::boolean, true);
  IF v_within IS NULL OR v_min IS NULL THEN RETURN; END IF;

  SELECT lower(coalesce(l.current_crop, '')), coalesce(l.planting_date, l.last_sowing_date)
    INTO v_crop, v_cycle_start
    FROM public.lands l WHERE l.id = p_land_id;
  IF coalesce(v_crop, '') = '' THEN RETURN; END IF;

  IF v_cycle_start IS NULL THEN
    SELECT cs.sowing_date INTO v_cycle_start
      FROM public.crop_schedules cs
     WHERE cs.land_id = p_land_id AND cs.is_active AND cs.sowing_date IS NOT NULL
     ORDER BY cs.sowing_date DESC LIMIT 1;
  END IF;
  IF v_cycle_start IS NULL THEN RETURN; END IF;                -- a photo cannot be tied to THIS cycle

  RETURN QUERY
  SELECT cga.id,
         cga.upload_id,
         csm.id,
         csm.stage_code,
         cga.confidence_score,
         coalesce(u.upload_timestamp, cga.created_at),
         coalesce(u.location_validated, false),
         u.distance_from_land_meters,
         cga.detected_growth_stage,
         csm.cultivation_method,
         csm.phenology_index
    FROM public.crop_growth_analysis cga
    LEFT JOIN public.crop_growth_uploads u ON u.id = cga.upload_id
    JOIN public.crop_stage_master csm
      ON csm.is_active
     AND lower(csm.crop_code) = v_crop
     AND coalesce(csm.stage_node_type, '') NOT IN ('operational', 'alias')
     AND (p_stage_uuid IS NULL OR csm.id = p_stage_uuid)
     AND (p_stage_code IS NULL OR upper(csm.stage_code) = upper(p_stage_code))
     AND (
           upper(regexp_replace(cga.detected_growth_stage, '[^a-zA-Z0-9]+', '_', 'g')) = upper(csm.stage_code)
        OR upper(regexp_replace(cga.detected_growth_stage, '[^a-zA-Z0-9]+', '_', 'g'))
           = upper(regexp_replace(coalesce(csm.growth_stage, ''), '[^a-zA-Z0-9]+', '_', 'g'))
        OR EXISTS (SELECT 1 FROM public.crop_stage_aliases csa
                    WHERE csa.canonical_id = csm.id
                      AND upper(regexp_replace(csa.alias_text, '[^a-zA-Z0-9]+', '_', 'g'))
                          = upper(regexp_replace(cga.detected_growth_stage, '[^a-zA-Z0-9]+', '_', 'g')))
     )
   WHERE cga.land_id = p_land_id
     AND cga.detected_growth_stage IS NOT NULL
     AND cga.confidence_score IS NOT NULL                       -- NULL is not 1.0 (was coalesce(., 1))
     AND cga.confidence_score >= v_min
     AND coalesce(u.upload_timestamp, cga.created_at) >= v_cycle_start::timestamp with time zone
     AND coalesce(u.upload_timestamp, cga.created_at) >= now() - make_interval(days => v_within)
     AND (NOT v_req_loc OR coalesce(u.location_validated, false))
     AND NOT (jsonb_typeof(cga.conflicting_signals) = 'array'
              AND cga.conflicting_signals ?| ARRAY['CROP_IDENTITY_MISMATCH', 'OFF_FARM_LOCATION', 'IMAGE_UNUSABLE', 'OUT_OF_LANE_STAGE', 'STAGE_UNDETERMINED'])
   ORDER BY coalesce(u.upload_timestamp, cga.created_at) DESC;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. stc_evidence_summary — evidence statistics for one rule/condition (jsonb)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stc_evidence_summary(p_type text, p_cfg jsonb, p_land_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb;
BEGIN
  IF lower(coalesce(p_type, '')) <> 'morphology_stage' OR p_cfg IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
           'photo_count',             count(*),
           'evidence_confidence',     max(e.confidence),
           'evidence_confidence_min', min(e.confidence),
           'latest_captured_at',      max(e.captured_at),
           'evidence_ids',            coalesce(jsonb_agg(e.analysis_id ORDER BY e.captured_at DESC), '[]'::jsonb))
    INTO v_out
    FROM public.stc_morphology_evidence(
           p_land_id,
           NULLIF(p_cfg->>'stage_uuid', '')::uuid,
           p_cfg->>'stage_code',
           NULLIF(p_cfg->>'within_days', '')::integer,
           NULLIF(p_cfg->>'min_confidence', '')::numeric) e;
  RETURN v_out;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. stc_eval_single — v2: morphology_stage delegates to stc_morphology_evidence.
--    das / dat / gdd / observation / event / ndvi branches are byte-for-byte the live body.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stc_eval_single(p_type text, p_cfg jsonb, p_land_id uuid, p_das integer, p_dat integer, p_gdd numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_min numeric; v_max numeric; v_code text; v_within int; v_event text; v_stage uuid; v_conf numeric;
BEGIN
  IF p_cfg IS NULL THEN RETURN false; END IF;
  IF p_type = 'das' THEN
    v_min := (p_cfg->>'min')::numeric; v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_das IS NULL THEN RETURN false; END IF;
    RETURN (v_min IS NULL OR p_das >= v_min) AND (v_max IS NULL OR p_das <= v_max);
  ELSIF p_type = 'dat' THEN
    v_min := (p_cfg->>'min')::numeric; v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_dat IS NULL THEN RETURN false; END IF;
    RETURN (v_min IS NULL OR p_dat >= v_min) AND (v_max IS NULL OR p_dat <= v_max);
  ELSIF p_type = 'gdd' THEN
    v_min := (p_cfg->>'min')::numeric; v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_gdd IS NULL THEN RETURN false; END IF;
    RETURN (v_min IS NULL OR p_gdd >= v_min) AND (v_max IS NULL OR p_gdd <= v_max);
  ELSIF p_type = 'observation' THEN
    v_code := p_cfg->>'code'; v_within := NULLIF(p_cfg->>'within_days','')::int;
    IF v_code IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.crop_lifecycle_events cle WHERE cle.land_id=p_land_id AND upper(cle.event_type)=upper(v_code) AND (v_within IS NULL OR cle.created_at >= now()-make_interval(days=>v_within)));
  ELSIF p_type = 'event' THEN
    v_event := p_cfg->>'event_type'; v_within := NULLIF(p_cfg->>'within_days','')::int;
    IF v_event IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.crop_lifecycle_events cle WHERE cle.land_id=p_land_id AND (upper(cle.event_type)=upper(v_event) OR upper(coalesce(cle.to_status,''))=upper(v_event)) AND (v_within IS NULL OR cle.created_at >= now()-make_interval(days=>v_within)));
  ELSIF p_type = 'morphology_stage' THEN
    -- P1-F2 (2026-08-30): provenance-gated, cycle-scoped, NULL confidence excluded.
    -- Rule-level within_days / min_confidence override the policy; policy is the default.
    v_stage := NULLIF(p_cfg->>'stage_uuid','')::uuid; v_code := p_cfg->>'stage_code';
    v_within := NULLIF(p_cfg->>'within_days','')::int; v_conf := NULLIF(p_cfg->>'min_confidence','')::numeric;
    IF v_stage IS NULL AND v_code IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.stc_morphology_evidence(p_land_id, v_stage, v_code, v_within, v_conf));
  ELSIF p_type = 'ndvi' THEN
    v_min := NULLIF(p_cfg->>'min','')::numeric; v_max := NULLIF(p_cfg->>'max','')::numeric; v_within := coalesce(NULLIF(p_cfg->>'within_days','')::int,21);
    RETURN EXISTS (
      SELECT 1 FROM public.ndvi_data nd
      WHERE nd.land_id=p_land_id AND nd.date >= current_date-v_within
        AND coalesce(nd.mean_ndvi,nd.ndvi_value) IS NOT NULL
        AND coalesce(nd.coverage_percentage,nd.coverage,0) > 15
        AND (coalesce(nd.cloud_cover,nd.cloud_coverage) IS NULL OR coalesce(nd.cloud_cover,nd.cloud_coverage) < 40)
        AND (v_min IS NULL OR coalesce(nd.mean_ndvi,nd.ndvi_value) >= v_min)
        AND (v_max IS NULL OR coalesce(nd.mean_ndvi,nd.ndvi_value) <= v_max)
    );
  END IF;
  RETURN false;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. evaluate_stage_transitions — v2: same gate logic as P0; every returned row now
--    carries evidence.authority, evidence.rule_confidence and, for morphology rules,
--    evidence_confidence / photo_count / evidence_ids (from stc_evidence_summary).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_stage_transitions(p_land_id uuid, p_from_stage uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rule_id uuid, from_stage_uuid uuid, to_stage_uuid uuid, trigger_type text, priority integer, confidence numeric, matched boolean, evidence jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land          record;
  v_crop          text;
  v_cycle         text;
  v_das           int;
  v_dat           int;
  v_gdd           numeric;
  v_rule          record;
  v_cond          jsonb;
  v_ok            boolean;
  v_all_ok        boolean;
  v_any_ok        boolean;
  v_child_ok      boolean;
  v_from          uuid;
  v_observational boolean;
  v_tgt           record;
  v_vpp_min       integer;
  v_gate_min      integer;
  v_grace         integer;
  v_day           integer;
  v_gate          jsonb;
  -- P1
  v_pol           jsonb;
  v_summary       jsonb;
  v_authority     text;
  v_child_type    text;
BEGIN
  SELECT l.id, l.current_crop, l.crop_cycle, l.planting_date, l.last_sowing_date,
         l.transplant_date, l.current_gdd, l.current_crop_variety_id
    INTO v_land
    FROM public.lands l WHERE l.id = p_land_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT sc.config_value INTO v_pol
    FROM public.system_config sc WHERE sc.config_key = 'stage_evidence_policy' LIMIT 1;

  v_crop  := upper(coalesce(v_land.current_crop,''));
  v_cycle := lower(coalesce(v_land.crop_cycle,''));
  v_gdd   := v_land.current_gdd;
  v_das   := CASE WHEN coalesce(v_land.planting_date, v_land.last_sowing_date) IS NOT NULL
                  THEN (current_date - coalesce(v_land.planting_date, v_land.last_sowing_date)) END;
  v_dat   := CASE WHEN v_land.transplant_date IS NOT NULL
                  THEN (current_date - v_land.transplant_date) END;

  IF p_from_stage IS NULL THEN
    v_from := (SELECT r.stage_uuid FROM public.resolve_crop_phenology(p_land_id) r LIMIT 1);
  ELSE
    v_from := p_from_stage;
  END IF;

  IF v_from IS NULL THEN RETURN; END IF;

  FOR v_rule IN
    SELECT stc.*
      FROM public.stage_transition_conditions stc
     WHERE stc.is_active
       AND upper(stc.crop_code) = v_crop
       AND (
             v_cycle = ''
          OR stc.crop_cycle IS NULL
          OR lower(stc.crop_cycle) IN ('', 'universal', 'any', 'all')
          OR lower(stc.crop_cycle) = v_cycle
       )
       AND stc.from_stage_uuid = v_from
     ORDER BY stc.priority DESC, stc.created_at ASC
  LOOP
    v_observational := lower(coalesce(v_rule.trigger_type,'')) IN ('morphology_stage','event','observation');
    v_summary       := NULL;
    v_authority     := NULL;

    IF v_rule.trigger_type = 'composite' THEN
      v_all_ok := true;
      v_any_ok := false;
      FOR v_cond IN SELECT jsonb_array_elements(coalesce(v_rule.trigger_config->'conditions','[]'::jsonb))
      LOOP
        v_child_type := lower(coalesce(v_cond->>'type',''));
        v_child_ok := public.stc_eval_single(
          v_cond->>'type', v_cond, p_land_id, v_das, v_dat, v_gdd
        );
        v_all_ok := v_all_ok AND v_child_ok;
        v_any_ok := v_any_ok OR v_child_ok;
        IF v_child_type IN ('morphology_stage','event','observation') THEN
          v_observational := true;
        END IF;
        IF v_child_type = 'morphology_stage' AND v_summary IS NULL THEN
          v_summary := public.stc_evidence_summary('morphology_stage', v_cond, p_land_id);
        END IF;
        IF v_authority IS NULL AND v_pol IS NOT NULL THEN
          v_authority := v_pol->'trigger_authority'->>v_child_type;
        END IF;
      END LOOP;
      v_ok := CASE WHEN v_rule.combinator = 'ANY' THEN v_any_ok ELSE v_all_ok END;
      IF v_summary IS NOT NULL THEN v_authority := 'morphology';
      ELSIF v_observational THEN v_authority := coalesce(v_authority, 'farmer_observation');
      END IF;
    ELSE
      v_ok := public.stc_eval_single(
        v_rule.trigger_type, v_rule.trigger_config, p_land_id, v_das, v_dat, v_gdd
      );
      v_summary := public.stc_evidence_summary(v_rule.trigger_type, v_rule.trigger_config, p_land_id);
      IF v_pol IS NOT NULL THEN
        v_authority := v_pol->'trigger_authority'->>lower(coalesce(v_rule.trigger_type,''));
      END IF;
    END IF;
    v_authority := coalesce(v_authority, CASE WHEN v_observational THEN 'farmer_observation' ELSE 'unknown' END);

    -- ── P0-RC3: DAS plausibility gate for non-observational evidence (unchanged) ──
    v_gate := NULL;
    IF v_ok AND NOT v_observational THEN
      SELECT csm.das_min, csm.boundary_grace_days,
             lower(coalesce(csm.das_reference,'sowing')) AS ref
        INTO v_tgt
        FROM public.crop_stage_master csm
       WHERE csm.id = v_rule.to_stage_uuid;

      v_vpp_min := NULL;
      IF v_land.current_crop_variety_id IS NOT NULL THEN
        SELECT vpp.das_min_override INTO v_vpp_min
          FROM public.variety_phenology_profile vpp
         WHERE vpp.is_active
           AND vpp.variety_id = v_land.current_crop_variety_id
           AND vpp.stage_uuid = v_rule.to_stage_uuid
           AND vpp.das_min_override IS NOT NULL
         ORDER BY (lower(coalesce(vpp.crop_cycle,'')) = v_cycle) DESC NULLS LAST
         LIMIT 1;
      END IF;

      v_gate_min := coalesce(v_vpp_min, v_tgt.das_min);
      v_grace    := coalesce(v_tgt.boundary_grace_days, 0);
      v_day      := CASE WHEN v_tgt.ref = 'transplanting' THEN v_dat ELSE v_das END;

      IF v_gate_min IS NOT NULL THEN
        IF v_day IS NULL THEN
          v_ok   := false;
          v_gate := jsonb_build_object(
            'blocked', true, 'reason', 'no_day_anchor', 'anchor', v_tgt.ref,
            'das_min_effective', v_gate_min, 'grace_days', v_grace);
        ELSIF v_day < (v_gate_min - v_grace) THEN
          v_ok   := false;
          v_gate := jsonb_build_object(
            'blocked', true, 'reason', 'before_plausible_window',
            'day', v_day, 'anchor', v_tgt.ref,
            'das_min_effective', v_gate_min, 'grace_days', v_grace,
            'min_source', CASE WHEN v_vpp_min IS NOT NULL
                               THEN 'variety_phenology_profile.das_min_override'
                               ELSE 'crop_stage_master.das_min' END);
        ELSE
          v_gate := jsonb_build_object(
            'blocked', false, 'day', v_day, 'anchor', v_tgt.ref,
            'das_min_effective', v_gate_min, 'grace_days', v_grace);
        END IF;
      END IF;
    END IF;

    rule_id         := v_rule.id;
    from_stage_uuid := v_rule.from_stage_uuid;
    to_stage_uuid   := v_rule.to_stage_uuid;
    trigger_type    := v_rule.trigger_type;
    priority        := v_rule.priority;
    confidence      := v_rule.confidence;
    matched         := v_ok;
    evidence        := jsonb_build_object(
      'das', v_das, 'dat', v_dat, 'gdd', v_gdd,
      'combinator', v_rule.combinator,
      'trigger_config', v_rule.trigger_config,
      'observational', v_observational,
      'authority', v_authority,
      'rule_confidence', v_rule.confidence,
      'policy_present', v_pol IS NOT NULL
    )
    || coalesce(v_summary, '{}'::jsonb)
    || CASE WHEN v_gate IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('das_gate', v_gate) END;
    RETURN NEXT;
  END LOOP;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. stc_morphology_jump_candidate — validated photo evidence for ANY biological stage
--    of the anchor's crop/lane/cycle other than the anchor itself (F3). Pure reader.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stc_morphology_jump_candidate(p_land_id uuid, p_anchor_stage_uuid uuid)
 RETURNS TABLE(to_stage_uuid uuid, to_stage_code text, direction text, steps integer, photo_count integer, evidence_confidence_min numeric, evidence_confidence_max numeric, latest_captured_at timestamp with time zone, evidence_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anchor record;
  v_cand   record;
  v_cnt    integer;
  v_min    numeric;
  v_max    numeric;
  v_latest timestamp with time zone;
  v_ids    uuid[];
  v_between integer;
BEGIN
  SELECT csm.id,
         csm.crop_code,
         lower(coalesce(csm.cultivation_method, '')) AS method,
         lower(coalesce(csm.crop_cycle, ''))         AS cycle,
         csm.phenology_index
    INTO v_anchor
    FROM public.crop_stage_master csm
   WHERE csm.id = p_anchor_stage_uuid;
  IF NOT FOUND OR v_anchor.phenology_index IS NULL THEN RETURN; END IF;

  FOR v_cand IN
    SELECT csm.id, csm.stage_code, csm.phenology_index
      FROM public.crop_stage_master csm
     WHERE csm.is_active
       AND lower(csm.crop_code) = lower(v_anchor.crop_code)
       AND csm.id <> v_anchor.id
       AND coalesce(csm.stage_node_type, '') = 'biological'
       AND csm.phenology_index IS NOT NULL
       AND csm.cultivation_method IS NOT NULL
       AND (v_anchor.method IN ('', 'any')
            OR lower(csm.cultivation_method) = v_anchor.method
            OR lower(csm.cultivation_method) = 'any')
       AND (v_anchor.cycle IN ('', 'universal', 'any', 'all')
            OR coalesce(lower(csm.crop_cycle), '') IN ('', 'universal', 'any', 'all')
            OR lower(csm.crop_cycle) = v_anchor.cycle)
  LOOP
    SELECT count(*)::integer, min(e.confidence), max(e.confidence), max(e.captured_at), array_agg(e.analysis_id)
      INTO v_cnt, v_min, v_max, v_latest, v_ids
      FROM public.stc_morphology_evidence(p_land_id, v_cand.id, NULL, NULL, NULL) e;
    IF coalesce(v_cnt, 0) = 0 THEN CONTINUE; END IF;

    SELECT count(*)::integer INTO v_between
      FROM public.crop_stage_master s
     WHERE s.is_active
       AND lower(s.crop_code) = lower(v_anchor.crop_code)
       AND coalesce(s.stage_node_type, '') = 'biological'
       AND s.phenology_index IS NOT NULL
       AND s.cultivation_method IS NOT NULL
       AND (v_anchor.method IN ('', 'any')
            OR lower(s.cultivation_method) = v_anchor.method
            OR lower(s.cultivation_method) = 'any')
       AND (v_anchor.cycle IN ('', 'universal', 'any', 'all')
            OR coalesce(lower(s.crop_cycle), '') IN ('', 'universal', 'any', 'all')
            OR lower(s.crop_cycle) = v_anchor.cycle)
       AND s.phenology_index > least(v_anchor.phenology_index, v_cand.phenology_index)
       AND s.phenology_index < greatest(v_anchor.phenology_index, v_cand.phenology_index);

    to_stage_uuid           := v_cand.id;
    to_stage_code           := v_cand.stage_code;
    direction               := CASE WHEN v_cand.phenology_index > v_anchor.phenology_index THEN 'forward' ELSE 'backward' END;
    steps                   := coalesce(v_between, 0) + 1;
    photo_count             := v_cnt;
    evidence_confidence_min := v_min;
    evidence_confidence_max := v_max;
    latest_captured_at      := v_latest;
    evidence_ids            := v_ids;
    RETURN NEXT;
  END LOOP;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. apply_stage_transitions — v2 (F1 write layer + F3 jump path)
--    Ledger confidence = least(rule_confidence, evidence_confidence). Authority and
--    confirmation are recorded in evidence. Photo evidence beyond the one-step ladder is
--    applied only inside policy, otherwise queued; BACKWARD evidence is always queued.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_stage_transitions(p_land_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_top            record;
  v_jump           record;
  v_gated          record;
  v_from_uuid      uuid;
  v_to_uuid        uuid;
  v_from_code      text;
  v_to_code        text;
  v_anchor_code    text;
  v_validation     jsonb;
  v_blocked        boolean;
  v_evidence       jsonb;
  v_reason         text;
  v_crop           text;
  v_sow            date;
  v_init           jsonb;
  v_anchor         uuid;
  v_pol            jsonb;
  v_max_jump       integer;
  v_min_photos_jump integer;
  v_min_photos_confirm integer;
  v_conf           numeric;
  v_ev_conf        numeric;
  v_rule_conf      numeric;
  v_photo_count    integer;
  v_confirmation   text;
  v_authority      text;
  v_trigger        text;
  v_rule_id        uuid;
  v_priority       integer;
  v_transition     jsonb;
  v_issue          text;
  v_detail         text;
BEGIN
  -- S4: autonomous initialization — anchor first stage for a new crop cycle
  v_init := public.initialize_crop_cycle_stage(p_land_id);

  SELECT lower(coalesce(l.current_crop, '')),
         coalesce(l.planting_date, l.last_sowing_date)
    INTO v_crop, v_sow
    FROM public.lands l
   WHERE l.id = p_land_id;

  IF v_sow IS NULL THEN
    SELECT cs.sowing_date INTO v_sow
      FROM public.crop_schedules cs
     WHERE cs.land_id = p_land_id AND cs.is_active AND cs.sowing_date IS NOT NULL
     ORDER BY cs.sowing_date DESC LIMIT 1;
  END IF;

  IF coalesce(v_crop,'') = '' OR v_sow IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_crop_or_sow_date', 'init', v_init);
  END IF;

  SELECT sc.config_value INTO v_pol
    FROM public.system_config sc WHERE sc.config_key = 'stage_evidence_policy' LIMIT 1;
  v_max_jump           := NULLIF(v_pol->'photo'->>'max_auto_jump_steps', '')::integer;
  v_min_photos_jump    := NULLIF(v_pol->'photo'->>'min_photos_for_jump', '')::integer;
  v_min_photos_confirm := NULLIF(v_pol->'photo'->>'min_photos_for_confirmation', '')::integer;

  -- P0-RC1: the persisted anchor, not the preview
  SELECT stl.to_stage_uuid INTO v_anchor
    FROM public.stage_transition_log stl
    JOIN public.crop_stage_master csm ON csm.id = stl.to_stage_uuid
   WHERE stl.land_id = p_land_id
     AND coalesce((stl.evidence->>'applied')::boolean, true)
     AND lower(csm.crop_code) = v_crop
     AND stl.evaluated_at::date >= v_sow
     AND coalesce(stl.trigger_type,'') NOT LIKE 'germination_gate%'
   ORDER BY stl.evaluated_at DESC
   LIMIT 1;

  IF v_anchor IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_anchor', 'init', v_init);
  END IF;
  SELECT csm.stage_code INTO v_anchor_code FROM public.crop_stage_master csm WHERE csm.id = v_anchor;

  SELECT e.rule_id, e.from_stage_uuid, e.to_stage_uuid, e.trigger_type,
         e.priority, e.confidence, e.matched, e.evidence
    INTO v_top
    FROM public.evaluate_stage_transitions(p_land_id, v_anchor) e
   WHERE e.matched = true
   ORDER BY e.priority DESC NULLS LAST, e.confidence DESC NULLS LAST
   LIMIT 1;

  IF v_top.rule_id IS NOT NULL THEN
    -- ── ladder rule matched ─────────────────────────────────────────────────
    v_from_uuid   := v_top.from_stage_uuid;
    v_to_uuid     := v_top.to_stage_uuid;
    v_trigger     := v_top.trigger_type;
    v_rule_id     := v_top.rule_id;
    v_priority    := v_top.priority;
    v_transition  := v_top.evidence;
    v_rule_conf   := coalesce(v_top.confidence, 0.5);
    v_ev_conf     := NULLIF(v_top.evidence->>'evidence_confidence', '')::numeric;
    v_photo_count := coalesce(NULLIF(v_top.evidence->>'photo_count', '')::integer, 0);
    -- F1: never above the evidence's own confidence; never above the rule's
    v_conf        := least(v_rule_conf, coalesce(v_ev_conf, v_rule_conf));
    v_authority   := coalesce(v_top.evidence->>'authority', 'unknown');
    v_confirmation := CASE
      WHEN v_authority = 'morphology' AND v_min_photos_confirm IS NOT NULL
           AND v_photo_count >= v_min_photos_confirm                     THEN 'confirmed'
      WHEN v_authority IN ('morphology', 'farmer_observation')           THEN 'observed'
      ELSE 'estimated'
    END;
  ELSE
    -- ── no ladder rule matched: does validated PHOTO evidence point elsewhere? (F3) ──
    SELECT j.to_stage_uuid, j.to_stage_code, j.direction, j.steps, j.photo_count,
           j.evidence_confidence_min, j.evidence_confidence_max, j.latest_captured_at, j.evidence_ids
      INTO v_jump
      FROM public.stc_morphology_jump_candidate(p_land_id, v_anchor) j
     ORDER BY j.photo_count DESC, j.latest_captured_at DESC
     LIMIT 1;

    IF v_jump.to_stage_uuid IS NOT NULL THEN
      IF v_jump.direction = 'forward'
         AND v_max_jump IS NOT NULL AND v_jump.steps <= v_max_jump
         AND v_min_photos_jump IS NOT NULL AND v_jump.photo_count >= v_min_photos_jump THEN
        v_from_uuid   := v_anchor;
        v_to_uuid     := v_jump.to_stage_uuid;
        v_trigger     := 'morphology_stage';
        v_rule_id     := NULL;
        v_priority    := NULL;
        v_rule_conf   := NULL;
        v_ev_conf     := v_jump.evidence_confidence_max;
        v_conf        := v_jump.evidence_confidence_min;              -- conservative: weakest agreeing photo
        v_photo_count := v_jump.photo_count;
        v_authority   := 'morphology';
        v_confirmation := CASE WHEN v_min_photos_confirm IS NOT NULL AND v_photo_count >= v_min_photos_confirm
                               THEN 'confirmed' ELSE 'observed' END;
        v_transition  := jsonb_build_object(
          'jump', true, 'jump_steps', v_jump.steps, 'direction', 'forward',
          'anchor_stage_code', v_anchor_code,
          'evidence_ids', to_jsonb(v_jump.evidence_ids),
          'latest_captured_at', v_jump.latest_captured_at,
          'policy_photo', v_pol->'photo');
      ELSE
        -- outside policy or backward: visible, reviewable, never auto-applied
        v_issue  := CASE WHEN v_jump.direction = 'backward' THEN 'stage_regression_evidence' ELSE 'morphology_stage_jump' END;
        v_detail := 'land=' || p_land_id::text
                 || ' anchor=' || coalesce(v_anchor_code, '?')
                 || ' photo_stage=' || coalesce(v_jump.to_stage_code, '?')
                 || ' direction=' || v_jump.direction
                 || ' steps=' || v_jump.steps::text
                 || ' photos=' || v_jump.photo_count::text
                 || ' conf=' || coalesce(v_jump.evidence_confidence_min::text, 'null') || '-' || coalesce(v_jump.evidence_confidence_max::text, 'null')
                 || ' latest=' || coalesce(v_jump.latest_captured_at::date::text, 'null');
        INSERT INTO public.stage_review_queue (crop_code, issue_type, detail, proposed_resolution, severity, status)
        SELECT v_crop, v_issue, v_detail,
               CASE WHEN v_jump.direction = 'backward'
                    THEN 'Validated photo shows an EARLIER stage than the ledger. Check: wrong field/photo, re-sowing, crop failure, or a wrong sowing/transplant date on the land. Resolve identity first; never auto-regress the ledger.'
                    ELSE 'Validated photo evidence beyond policy (max_auto_jump_steps / min_photos_for_jump). Confirm with a second geo-validated photo or an agronomist review; if the calendar is lagging, correct the anchor date.' END,
               CASE WHEN v_jump.direction = 'backward' THEN 'high' ELSE 'medium' END,
               'open'
         WHERE NOT EXISTS (
           SELECT 1 FROM public.stage_review_queue q
            WHERE q.status = 'open' AND q.issue_type = v_issue
              AND q.detail LIKE 'land=' || p_land_id::text || ' anchor=' || coalesce(v_anchor_code, '?') || ' photo_stage=' || coalesce(v_jump.to_stage_code, '?') || '%'
         );
        RETURN jsonb_build_object(
          'ok', true, 'applied', false,
          'reason', CASE WHEN v_jump.direction = 'backward' THEN 'regression_evidence_queued' ELSE 'jump_needs_review' END,
          'anchor', v_anchor_code, 'photo_stage', v_jump.to_stage_code, 'direction', v_jump.direction,
          'steps', v_jump.steps, 'photos', v_jump.photo_count,
          'policy_present', v_pol IS NOT NULL, 'init', v_init);
      END IF;
    ELSE
      -- Phase-6 conflict visibility: the strongest plausibility-blocked candidate, if any
      SELECT e.trigger_type, e.priority, e.to_stage_uuid, e.evidence
        INTO v_gated
        FROM public.evaluate_stage_transitions(p_land_id, v_anchor) e
       WHERE coalesce((e.evidence->'das_gate'->>'blocked')::boolean, false)
       ORDER BY e.priority DESC NULLS LAST
       LIMIT 1;

      IF v_gated.to_stage_uuid IS NOT NULL THEN
        INSERT INTO public.stage_review_queue (crop_code, issue_type, detail, proposed_resolution, severity, status)
        SELECT v_crop,
               'stage_evidence_conflict',
               'land=' || p_land_id::text || ' trigger=' || v_gated.trigger_type
                 || ' target=' || coalesce((SELECT c.stage_code FROM public.crop_stage_master c WHERE c.id = v_gated.to_stage_uuid), '?')
                 || ' gate=' || (v_gated.evidence->'das_gate')::text,
               'Confirm the stage in the field (photo/observation), or set crop_stage_master.boundary_grace_days / variety_phenology_profile.das_min_override with a source.',
               'medium', 'open'
         WHERE NOT EXISTS (
           SELECT 1 FROM public.stage_review_queue q
            WHERE q.status = 'open' AND q.issue_type = 'stage_evidence_conflict'
              AND q.detail LIKE 'land=' || p_land_id::text || ' trigger=' || v_gated.trigger_type || ' target=%'
         );
        RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_match_gated',
                                  'gated_trigger', v_gated.trigger_type,
                                  'gate', v_gated.evidence->'das_gate', 'init', v_init);
      END IF;

      RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_match', 'init', v_init);
    END IF;
  END IF;

  SELECT c.stage_code INTO v_from_code FROM public.crop_stage_master c WHERE c.id = v_from_uuid;
  SELECT c.stage_code INTO v_to_code   FROM public.crop_stage_master c WHERE c.id = v_to_uuid;

  v_validation := public.evaluate_stage_validation(p_land_id, v_to_code);
  v_blocked    := coalesce((v_validation->>'blocked')::boolean, false);
  v_reason     := CASE WHEN v_blocked THEN 'blocked_by_validation' ELSE 'matched' END;

  v_evidence := jsonb_build_object(
    'applied',            NOT v_blocked,
    'blocked',            v_blocked,
    'reason',             v_reason,
    'from_stage_code',    v_from_code,
    'to_stage_code',      v_to_code,
    'priority',           v_priority,
    'trigger',            v_trigger,
    'transition',         v_transition,
    'validation',         v_validation,
    'crop_code',          v_crop,
    'sow_date',           v_sow,
    'cycle_key',          v_crop || ':' || coalesce(v_sow::text, 'unknown'),
    'from_stage_source',  'ledger',
    'authority',          v_authority,
    'confirmation',       v_confirmation,
    'evidence_confidence', v_ev_conf,
    'rule_confidence',    v_rule_conf,
    'photo_count',        v_photo_count,
    'engine',             'apply_stage_transitions@p1-2026-08-30'
  );

  INSERT INTO public.stage_transition_log(
    land_id, from_stage_uuid, to_stage_uuid, rule_id,
    trigger_type, confidence, evidence
  ) VALUES (
    p_land_id, v_from_uuid, v_to_uuid, v_rule_id,
    v_trigger, v_conf, v_evidence
  );

  IF v_blocked THEN
    RETURN jsonb_build_object(
      'ok', true, 'applied', false, 'reason', 'blocked_by_validation',
      'from_stage', v_from_code, 'to_stage', v_to_code,
      'authority', v_authority, 'confirmation', v_confirmation, 'confidence', v_conf,
      'validation', v_validation, 'init', v_init
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true,
    'from_stage', v_from_code, 'to_stage', v_to_code,
    'authority', v_authority, 'confirmation', v_confirmation, 'confidence', v_conf,
    'jump', coalesce((v_transition->>'jump')::boolean, false),
    'validation', v_validation, 'init', v_init
  );
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. resolve_crop_phenology (9-arg) — v10 (F1 read layer)
--    Changes vs the live v9 body (everything else byte-for-byte):
--    [A]  biological ledger: confidence = the row's OWN confidence (was greatest(0.85, .));
--         authority/confirmation read from the ledger evidence (P1 rows) or mapped from
--         trigger_type via policy (legacy rows).
--    [B]  evidence preview: confidence = least(rule, evidence) (was greatest(current, rule)).
--    VPP  no greatest(., 0.90) — a variety profile is context, not evidence.
--    +    evidence_sources gains 'authority:<tier>' and 'confirmation:<STATUS>' and
--         'cultivation_method:unknown' when no method is known. resolver_version = 10.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(
  p_crop_code text, p_crop_cycle text, p_cultivation_method text, p_variety_id uuid,
  p_sow_date date, p_transplant_date date, p_current_gdd numeric,
  p_as_of date DEFAULT CURRENT_DATE, p_land_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stage_uuid uuid, stage_code text, growth_stage text, crop_code text, crop_cycle text, cultivation_method text, previous_stage_uuid uuid, next_stage_uuid uuid, expected_transition_date date, reference_system text, phenology_model text, current_das integer, current_dat integer, current_gdd numeric, expected_height_cm_min numeric, expected_height_cm_max numeric, expected_leaf_count_min integer, expected_leaf_count_max integer, expected_ndvi_min numeric, expected_ndvi_max numeric, phenology_index numeric, confidence numeric, evidence_sources text[], source text, resolver_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_crop_code          text := lower(coalesce(p_crop_code, ''));
  v_crop_cycle         text := lower(coalesce(p_crop_cycle, ''));
  v_cultivation_method text := lower(nullif(p_cultivation_method, ''));
  v_das                integer;
  v_dat                integer;
  v_stage              record;
  v_vpp                record;
  v_prev               uuid;
  v_next               uuid;
  v_next_das_min       integer;
  v_evidence           text[] := ARRAY[]::text[];
  v_confidence         numeric := 0.5;
  v_source             text := 'das_provisional';
  v_variety_source     text;
  v_gdd_target         numeric;
  v_phen_index         numeric;
  v_transition_match   record;
  v_new_stage          record;
  v_ledger             record;
  v_gate               record;
  v_stage_day          integer;
  v_next_ref           text;
  -- P1
  v_pol                jsonb;
  v_authority          text := 'calendar';
  v_confirmation       text := 'estimated';
  v_ev_conf            numeric;
  v_trigger            text;
BEGIN
  IF v_crop_code = '' OR p_sow_date IS NULL THEN RETURN; END IF;

  SELECT sc.config_value INTO v_pol
    FROM public.system_config sc WHERE sc.config_key = 'stage_evidence_policy' LIMIT 1;

  v_das := (p_as_of - p_sow_date);
  v_dat := CASE WHEN p_transplant_date IS NOT NULL THEN (p_as_of - p_transplant_date) END;

  IF v_cultivation_method IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY['cultivation_method:' || v_cultivation_method];
  ELSE
    v_evidence := v_evidence || ARRAY['cultivation_method:unknown'];
  END IF;

  -- ── [A] Biological ledger — last APPLIED transition for this crop cycle ───
  IF p_land_id IS NOT NULL THEN
    SELECT stl.to_stage_uuid, stl.confidence, stl.trigger_type, stl.evaluated_at, stl.evidence
      INTO v_ledger
      FROM public.stage_transition_log stl
      JOIN public.crop_stage_master csm ON csm.id = stl.to_stage_uuid
     WHERE stl.land_id = p_land_id
       AND coalesce((stl.evidence->>'applied')::boolean, true)
       AND lower(csm.crop_code) = v_crop_code
       AND stl.evaluated_at::date >= p_sow_date
       AND coalesce(stl.trigger_type,'') NOT LIKE 'germination_gate%'  -- gate rows are constraints, not stage evidence
     ORDER BY stl.evaluated_at DESC
     LIMIT 1;

    IF v_ledger.to_stage_uuid IS NOT NULL THEN
      SELECT csm.* INTO v_stage
        FROM public.crop_stage_master csm
       WHERE csm.id = v_ledger.to_stage_uuid;
      IF FOUND THEN
        v_trigger := lower(coalesce(v_ledger.trigger_type, ''));
        -- P0-RC2 (2026-08-30): 'autonomous_init' is a calendar anchor, not biological evidence.
        IF v_trigger IN ('das', 'dat', 'autonomous_init') THEN
          v_source       := 'das_ledger_provisional';
          v_confidence   := least(0.5, coalesce(v_ledger.confidence, 0.5));
          v_authority    := 'calendar';
          v_confirmation := 'estimated';
        ELSE
          v_source       := 'biological_ledger';
          -- P1-F1: the ledger row's own confidence, never floored
          v_confidence   := least(1.0, greatest(0.0, coalesce(v_ledger.confidence, 0.5)));
          v_authority    := coalesce(v_ledger.evidence->>'authority',
                                     v_pol->'trigger_authority'->>v_trigger,
                                     'unknown');
          v_confirmation := coalesce(v_ledger.evidence->>'confirmation',
                                     CASE WHEN v_authority IN ('morphology', 'farmer_observation')
                                          THEN 'observed' ELSE 'estimated' END);
        END IF;
        v_evidence := v_evidence || ARRAY[
          'ledger_trigger:' || coalesce(v_ledger.trigger_type, 'unknown'),
          'ledger_at:' || v_ledger.evaluated_at::date::text,
          'ledger_confidence:' || coalesce(v_ledger.confidence::text, 'null')
        ];
      END IF;
    END IF;
  END IF;

  -- ── [C] DAS window — PROVISIONAL fallback only ────────────────────────────
  IF v_stage IS NULL THEN
    SELECT csm.* INTO v_stage
      FROM public.crop_stage_master csm
     WHERE csm.is_active
       AND lower(csm.crop_code) = v_crop_code
       AND (
             v_crop_cycle = ''
          OR coalesce(lower(csm.crop_cycle),'') = ''
          OR lower(csm.crop_cycle) = v_crop_cycle
       )
       AND csm.cultivation_method IS NOT NULL
       AND (
             lower(csm.cultivation_method) = 'any'
          OR (v_cultivation_method IS NOT NULL
              AND lower(csm.cultivation_method) = v_cultivation_method)
       )
       AND coalesce(csm.stage_node_type,'') NOT IN ('operational','alias')
       AND (
             CASE lower(coalesce(csm.das_reference, 'sowing'))
               WHEN 'transplanting' THEN
                 -- transplant-anchored windows use DAT; INELIGIBLE until a real transplant_date exists
                 (v_dat IS NOT NULL AND v_dat BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
               WHEN 'nursery_sowing' THEN
                 -- nursery sowing IS the recorded sowing date for a transplanted cycle
                 (v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
               WHEN 'planting' THEN
                 (v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
               WHEN 'ratoon_initiation' THEN
                 -- EXPLICIT MAPPING (P1 residue, documented not hidden): for a ratoon
                 -- cycle the cycle-start date recorded as sowing/planting date IS the
                 -- ratoon initiation date in current data flow. If a dedicated
                 -- ratoon_date field is added later, this is the single line to change.
                 (v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
               ELSE
                 (v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
             END
           )
     ORDER BY
       (v_cultivation_method IS NOT NULL AND lower(csm.cultivation_method) = v_cultivation_method) DESC,
       (lower(csm.cultivation_method) = 'any') DESC,
       (lower(csm.crop_cycle) = v_crop_cycle) DESC NULLS LAST,
       (coalesce(csm.stage_node_type,'') = 'biological') DESC,
       csm.das_min ASC
     LIMIT 1;

    IF NOT FOUND THEN RETURN; END IF;
    v_source       := 'das_provisional';
    v_confidence   := 0.5;
    v_authority    := 'calendar';
    v_confirmation := 'estimated';
    v_evidence     := v_evidence || ARRAY[
      'das_window:' || v_das::text,
      'day_anchor:' || lower(coalesce(v_stage.das_reference,'sowing')),
      CASE WHEN v_dat IS NOT NULL THEN 'dat:' || v_dat::text ELSE 'dat:none' END
    ];
  END IF;

  -- ── [B] Evidence-driven transition on top of the anchor stage ─────────────
  -- P0-RC1/RC2 (2026-08-30): preview only on an ANCHORED cycle. Before the nightly
  -- init writes the first ledger row the resolver is a pure calendar estimate, so the
  -- init can never persist a stepped stage. From then on [B] is exactly the transition
  -- apply_stage_transitions would persist next (same from-stage, same evaluator).
  IF p_land_id IS NOT NULL AND v_ledger.to_stage_uuid IS NOT NULL THEN
    SELECT est.rule_id, est.to_stage_uuid, est.confidence AS match_confidence, est.trigger_type,
           est.evidence AS match_evidence
      INTO v_transition_match
      FROM public.evaluate_stage_transitions(p_land_id, v_stage.id) est
     WHERE est.matched
     ORDER BY est.priority DESC
     LIMIT 1;

    IF v_transition_match.to_stage_uuid IS NOT NULL THEN
      SELECT csm.* INTO v_new_stage
        FROM public.crop_stage_master csm
       WHERE csm.id = v_transition_match.to_stage_uuid;
      IF FOUND THEN
        v_evidence := v_evidence || ARRAY[
          'transition_rule:' || v_transition_match.rule_id::text,
          'transition_trigger:' || v_transition_match.trigger_type
        ];
        IF lower(coalesce(v_transition_match.trigger_type,'')) IN ('das','dat') THEN
          v_confidence := least(0.5, greatest(v_confidence, coalesce(v_transition_match.match_confidence, 0.5)));
        ELSE
          -- P1-F1: preview confidence = least(rule, evidence); never inflated by the ledger
          v_ev_conf      := NULLIF(v_transition_match.match_evidence->>'evidence_confidence', '')::numeric;
          v_confidence   := least(coalesce(v_transition_match.match_confidence, v_confidence),
                                  coalesce(v_ev_conf, coalesce(v_transition_match.match_confidence, v_confidence)));
          v_source       := 'evidence_transition';
          v_authority    := coalesce(v_transition_match.match_evidence->>'authority',
                                     v_pol->'trigger_authority'->>lower(coalesce(v_transition_match.trigger_type,'')),
                                     'unknown');
          -- a preview is never CONFIRMED: confirmation is a ledger property written by apply_stage_transitions
          v_confirmation := CASE WHEN v_authority IN ('morphology', 'farmer_observation') THEN 'observed' ELSE 'estimated' END;
          IF v_ev_conf IS NOT NULL THEN
            v_evidence := v_evidence || ARRAY['transition_evidence_confidence:' || v_ev_conf::text];
          END IF;
        END IF;
        v_stage := v_new_stage;
      END IF;
    END IF;
  END IF;

  -- ── [B2] Germination gate: a held gate blocks CALENDAR claims only ────────
  -- Biological evidence (morphology/ndvi/farmer transitions set v_source to
  -- 'evidence_transition'/'biological_ledger') always overrides the gate:
  -- if observation shows the crop, the gate must not argue with it.
  IF p_land_id IS NOT NULL AND v_source IN ('das_provisional','das_ledger_provisional') THEN
    SELECT gs.state, gs.held_stage_uuid INTO v_gate
      FROM public.stage_gate_state gs
     WHERE gs.land_id = p_land_id
       AND gs.gate = 'GERMINATION'
       AND gs.state IN ('waiting','conditions_favorable','failure_suspected');
    IF v_gate.held_stage_uuid IS NOT NULL AND v_gate.held_stage_uuid <> v_stage.id THEN
      SELECT csm.* INTO v_stage
        FROM public.crop_stage_master csm WHERE csm.id = v_gate.held_stage_uuid;
      IF FOUND THEN
        v_source       := 'gate_constrained_calendar';
        v_confidence   := least(v_confidence, 0.5);
        v_authority    := 'calendar';
        v_confirmation := 'estimated';
        v_evidence     := v_evidence || ARRAY['gate:GERMINATION:' || v_gate.state];
      END IF;
    END IF;
  END IF;

  IF p_variety_id IS NOT NULL THEN
    SELECT vpp.* INTO v_vpp
      FROM public.variety_phenology_profile vpp
     WHERE vpp.is_active
       AND lower(vpp.crop_code) = v_crop_code
       AND vpp.variety_id = p_variety_id
       AND vpp.stage_uuid = v_stage.id
     ORDER BY (lower(coalesce(vpp.crop_cycle,'')) = v_crop_cycle) DESC NULLS LAST
     LIMIT 1;

    IF FOUND THEN
      v_variety_source := 'variety_profile:' || p_variety_id::text;
      -- P1-F1: no confidence boost — a profile row is context for expected metrics, not
      -- evidence that THIS stage call is right.
    END IF;
  END IF;

  IF v_vpp IS NULL THEN
    SELECT vpp.* INTO v_vpp
      FROM public.variety_phenology_profile vpp
     WHERE vpp.is_active
       AND lower(vpp.crop_code) = v_crop_code
       AND vpp.variety_id IS NULL
       AND vpp.stage_uuid = v_stage.id
     ORDER BY (lower(coalesce(vpp.crop_cycle,'')) = v_crop_cycle) DESC NULLS LAST
     LIMIT 1;

    IF FOUND THEN
      v_variety_source := 'variety_profile:generic';
    END IF;
  END IF;

  -- Prefer the explicit biological graph (populated for 177/231 stages);
  -- numeric fallback is restricted to the SAME day-anchor so cross-anchor
  -- windows (nursery DAS vs establishment DAT) can never be ordered numerically.
  v_prev := v_stage.prev_stage_id;
  IF v_prev IS NULL THEN
    SELECT csm.id INTO v_prev
      FROM public.crop_stage_master csm
     WHERE csm.is_active
       AND lower(csm.crop_code) = v_crop_code
       AND csm.cultivation_method IS NOT NULL
       AND (
             lower(csm.cultivation_method) = 'any'
          OR (v_cultivation_method IS NOT NULL
              AND lower(csm.cultivation_method) = v_cultivation_method)
       )
       AND coalesce(csm.stage_node_type,'') NOT IN ('operational','alias')
       AND lower(coalesce(csm.das_reference,'sowing')) = lower(coalesce(v_stage.das_reference,'sowing'))
       AND csm.das_max IS NOT NULL
       AND csm.das_max < coalesce(v_stage.das_min, 0)
     ORDER BY csm.das_max DESC
     LIMIT 1;
  END IF;

  v_next := v_stage.next_stage_id;
  IF v_next IS NOT NULL THEN
    SELECT csm.das_min, lower(coalesce(csm.das_reference,'sowing'))
      INTO v_next_das_min, v_next_ref
      FROM public.crop_stage_master csm WHERE csm.id = v_next;
  ELSE
    SELECT csm.id, csm.das_min, lower(coalesce(csm.das_reference,'sowing'))
      INTO v_next, v_next_das_min, v_next_ref
      FROM public.crop_stage_master csm
     WHERE csm.is_active
       AND lower(csm.crop_code) = v_crop_code
       AND csm.cultivation_method IS NOT NULL
       AND (
             lower(csm.cultivation_method) = 'any'
          OR (v_cultivation_method IS NOT NULL
              AND lower(csm.cultivation_method) = v_cultivation_method)
       )
       AND coalesce(csm.stage_node_type,'') NOT IN ('operational','alias')
       AND lower(coalesce(csm.das_reference,'sowing')) = lower(coalesce(v_stage.das_reference,'sowing'))
       AND csm.das_min IS NOT NULL
       AND csm.das_min > coalesce(v_stage.das_max, 9999)
     ORDER BY csm.das_min ASC
     LIMIT 1;
  END IF;

  -- Anchor-correct day for THIS stage: DAT for transplant-anchored, DAS otherwise.
  v_stage_day := CASE
    WHEN lower(coalesce(v_stage.das_reference,'sowing')) = 'transplanting' THEN v_dat
    ELSE v_das
  END;

  IF p_current_gdd IS NOT NULL AND v_stage.gdd_max IS NOT NULL AND v_stage.gdd_max > 0 THEN
    v_gdd_target := v_stage.gdd_max;
    v_phen_index := least(1.0, greatest(0.0, p_current_gdd / v_gdd_target));
  ELSIF v_stage_day IS NOT NULL
        AND v_stage.das_max IS NOT NULL AND v_stage.das_max > coalesce(v_stage.das_min, 0) THEN
    v_phen_index := least(1.0, greatest(0.0,
      (v_stage_day - coalesce(v_stage.das_min, 0))::numeric
      / greatest(1, v_stage.das_max - coalesce(v_stage.das_min, 0))::numeric));
  ELSE
    v_phen_index := NULL;
  END IF;

  -- ── Boundary grace zone (system-limitation honesty): a computed stage near
  -- its window edge is an ESTIMATE in transition, not a precise fact. When the
  -- stage row defines boundary_grace_days (agronomist-populated; NULL = off),
  -- annotate the evidence so downstream UI/advisories present "approximately /
  -- transitioning" rather than false day-level precision. No numeric default
  -- is assumed here.
  IF v_stage.boundary_grace_days IS NOT NULL AND v_stage_day IS NOT NULL THEN
    IF v_stage.das_max IS NOT NULL
       AND (v_stage.das_max - v_stage_day) BETWEEN 0 AND v_stage.boundary_grace_days THEN
      v_evidence := v_evidence || ARRAY['boundary_zone:approaching_next_stage'];
    ELSIF (v_stage_day - coalesce(v_stage.das_min, 0)) BETWEEN 0 AND v_stage.boundary_grace_days THEN
      v_evidence := v_evidence || ARRAY['boundary_zone:recently_entered'];
    END IF;
  END IF;

  IF v_variety_source IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY[v_variety_source];
  END IF;

  -- P1: authority and confirmation are explicit outputs (carried in evidence_sources so
  -- the function signature is unchanged for every caller).
  v_evidence := v_evidence || ARRAY[
    'authority:' || coalesce(v_authority, 'unknown'),
    'confirmation:' || upper(coalesce(v_confirmation, 'estimated')),
    CASE WHEN v_pol IS NULL THEN 'policy:missing' ELSE 'policy:stage_evidence_policy' END
  ];

  RETURN QUERY
  SELECT
    v_stage.id,
    v_stage.stage_code,
    v_stage.growth_stage,
    upper(v_crop_code),
    nullif(v_crop_cycle, ''),
    coalesce(nullif(lower(v_stage.cultivation_method), ''), v_cultivation_method),
    v_prev,
    v_next,
    CASE
      WHEN v_next_das_min IS NULL THEN NULL
      WHEN v_next_ref = 'transplanting' THEN
        CASE WHEN p_transplant_date IS NOT NULL THEN (p_transplant_date + v_next_das_min) END
      ELSE (p_sow_date + v_next_das_min)
    END,
    coalesce(v_stage.reference_system, 'BBCH'),
    coalesce(v_stage.phenology_model, 'crop_stage_master'),
    v_das,
    v_dat,
    p_current_gdd,
    coalesce(v_vpp.expected_height_cm_min, v_stage.expected_height_cm_min),
    coalesce(v_vpp.expected_height_cm_max, v_stage.expected_height_cm_max),
    coalesce(v_vpp.expected_leaf_count_min, v_stage.expected_leaf_count_min),
    coalesce(v_vpp.expected_leaf_count_max, v_stage.expected_leaf_count_max),
    coalesce(v_vpp.expected_ndvi_min, v_stage.expected_ndvi_min),
    coalesce(v_vpp.expected_ndvi_max, v_stage.expected_ndvi_max),
    v_phen_index,
    v_confidence,
    v_evidence,
    v_source,
    10;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. validate_growth_upload_location — server-side geofence (F5). The capture point is
--    measured against lands.boundary (geography, 0 m when inside) or lands.center_*;
--    the result is persisted on the upload row. VOLATILE (writes), SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_growth_upload_location(p_upload_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_u      record;
  v_l      record;
  v_pol    jsonb;
  v_max    numeric;
  v_lat    numeric;
  v_lng    numeric;
  v_dist   numeric;
  v_method text;
  v_ok     boolean;
BEGIN
  SELECT u.id, u.land_id, u.capture_location INTO v_u
    FROM public.crop_growth_uploads u WHERE u.id = p_upload_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('validated', false, 'reason', 'upload_not_found');
  END IF;

  SELECT sc.config_value INTO v_pol
    FROM public.system_config sc WHERE sc.config_key = 'stage_evidence_policy' LIMIT 1;
  v_max := NULLIF(v_pol->'photo'->>'max_distance_m', '')::numeric;
  IF v_max IS NULL THEN
    RETURN jsonb_build_object('validated', false, 'reason', 'policy_missing');
  END IF;

  v_lat := NULLIF(coalesce(v_u.capture_location->>'lat', v_u.capture_location->>'latitude'), '')::numeric;
  v_lng := NULLIF(coalesce(v_u.capture_location->>'lng', v_u.capture_location->>'lon', v_u.capture_location->>'longitude'), '')::numeric;
  IF v_lat IS NULL OR v_lng IS NULL THEN
    UPDATE public.crop_growth_uploads SET location_validated = false, distance_from_land_meters = NULL, updated_at = now()
     WHERE id = p_upload_id;
    RETURN jsonb_build_object('validated', false, 'reason', 'no_capture_location');
  END IF;

  SELECT l.boundary, l.center_lat, l.center_lon INTO v_l
    FROM public.lands l WHERE l.id = v_u.land_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('validated', false, 'reason', 'land_not_found');
  END IF;

  IF v_l.boundary IS NOT NULL THEN
    v_dist   := ST_Distance(v_l.boundary, ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography);
    v_method := 'boundary';
  ELSIF v_l.center_lat IS NOT NULL AND v_l.center_lon IS NOT NULL THEN
    v_dist   := ST_Distance(ST_SetSRID(ST_MakePoint(v_l.center_lon, v_l.center_lat), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography);
    v_method := 'center';
  ELSE
    UPDATE public.crop_growth_uploads SET location_validated = false, distance_from_land_meters = NULL, updated_at = now()
     WHERE id = p_upload_id;
    RETURN jsonb_build_object('validated', false, 'reason', 'no_land_geometry');
  END IF;

  v_ok := v_dist <= v_max;
  UPDATE public.crop_growth_uploads
     SET location_validated = v_ok,
         distance_from_land_meters = round(v_dist::numeric, 1),
         updated_at = now()
   WHERE id = p_upload_id;

  RETURN jsonb_build_object('validated', v_ok, 'distance_m', round(v_dist::numeric, 1),
                            'method', v_method, 'max_distance_m', v_max);
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Residual gaps made visible (review queue; deduped)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.stage_review_queue (crop_code, issue_type, detail, proposed_resolution, severity, status)
SELECT 'all', 'legacy_photo_function_active',
       'Edge function ai-crop-growth-tracking (v13, 2025-12-19) is ACTIVE in Supabase but absent from the repo; it carries hardcoded per-crop DAS calendars and LLM-generated dosages and writes crop_growth_analysis with free-text stages and a defaulted 0.70 confidence.',
       'Delete the function (frees one of the 99 slots). ai-crop-scan growth_tracking is the only photo-evidence producer.',
       'high', 'open'
 WHERE NOT EXISTS (SELECT 1 FROM public.stage_review_queue q WHERE q.issue_type = 'legacy_photo_function_active' AND q.status = 'open');

INSERT INTO public.stage_review_queue (crop_code, issue_type, detail, proposed_resolution, severity, status)
SELECT 'all', 'variety_das_override_not_in_calendar_window',
       'resolve_crop_phenology [C] picks the DAS window from crop_stage_master.das_min/das_max only; variety_phenology_profile.das_min_override/das_max_override (363 rice rows) reach the evaluate_stage_transitions gate and expected metrics but NOT the calendar stage pick itself.',
       'Decide whether the provisional calendar pick should honour variety DAS overrides (then extend [C] to coalesce VPP overrides) — agronomic sign-off needed; no code change made here.',
       'medium', 'open'
 WHERE NOT EXISTS (SELECT 1 FROM public.stage_review_queue q WHERE q.issue_type = 'variety_das_override_not_in_calendar_window' AND q.status = 'open');


-- ============================================================================
-- VALIDATION (run after apply; expected results in comments)
-- ----------------------------------------------------------------------------
-- select config_key from system_config where config_key='stage_evidence_policy';      -> 1 row
-- select flag_name, is_enabled from feature_flags where flag_name='photo_stage_persist'; -> false
-- select substr(l.id::text,1,8), r.stage_code, r.source, r.confidence, r.resolver_version,
--        (select string_agg(x,' ') from unnest(r.evidence_sources) x where x like 'authority:%' or x like 'confirmation:%')
--   from lands l, lateral resolve_crop_phenology(l.id) r;
--   -> 8 rows, resolver_version 10; the 6 autonomous-init lands: das_ledger_provisional 0.50
--      authority:calendar confirmation:ESTIMATED; 30197c15: biological_ledger 0.85
--      authority:thermal_model confirmation:ESTIMATED (legacy gdd row, confidence PRESERVED)
-- select count(*) from stc_morphology_evidence('30197c15-0000-0000-0000-000000000000'::uuid) -> 0 today (no photos)
-- select * from stc_morphology_jump_candidate((select id from lands where id::text like '30197c15%'),
--        (select to_stage_uuid from stage_transition_log where land_id::text like '30197c15%' and trigger_type='gdd')) -> 0 rows
-- select apply_stage_transitions(id) from lands where id::text like '8897e53d%';       -> reason no_anchor / no_match (no photos)
-- select validate_growth_upload_location(gen_random_uuid());                             -> {"validated": false, "reason": "upload_not_found"}
-- ============================================================================
