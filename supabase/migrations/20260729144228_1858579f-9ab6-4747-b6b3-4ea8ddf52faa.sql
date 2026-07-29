-- ═══════════════════════════════════════════════════════════════════════════
-- S1 — Demote DAS in resolve_crop_phenology (function body only; signature,
--      return columns and all TS contracts unchanged).
--      Resolution order: (a) biological ledger  (b) evidence transitions
--                        (c) DAS window (provisional, confidence <= 0.5)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(
  p_crop_code text, p_crop_cycle text, p_cultivation_method text,
  p_variety_id uuid, p_sow_date date, p_transplant_date date,
  p_current_gdd numeric, p_as_of date DEFAULT CURRENT_DATE,
  p_land_id uuid DEFAULT NULL::uuid)
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
  v_cycle_key          text;
BEGIN
  IF v_crop_code = '' OR p_sow_date IS NULL THEN RETURN; END IF;

  v_das := (p_as_of - p_sow_date);
  v_dat := CASE WHEN p_transplant_date IS NOT NULL THEN (p_as_of - p_transplant_date) END;
  v_cycle_key := v_crop_code || ':' || p_sow_date::text;

  IF v_cultivation_method IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY['cultivation_method:' || v_cultivation_method];
  END IF;

  -- ── [A] Biological ledger — previously confirmed stage for this land+cycle ─
  IF p_land_id IS NOT NULL THEN
    SELECT stl.to_stage_uuid, stl.confidence
      INTO v_ledger
      FROM public.stage_transition_log stl
     WHERE stl.land_id = p_land_id
       AND coalesce(stl.evidence->>'cycle_key', '') = v_cycle_key
       AND stl.to_stage_uuid IS NOT NULL
     ORDER BY stl.evaluated_at DESC
     LIMIT 1;

    IF v_ledger.to_stage_uuid IS NOT NULL THEN
      SELECT csm.* INTO v_stage
        FROM public.crop_stage_master csm
       WHERE csm.id = v_ledger.to_stage_uuid;
      IF FOUND THEN
        v_source     := 'biological_ledger';
        v_confidence := greatest(0.85, coalesce(v_ledger.confidence, 0.85));
        v_evidence   := v_evidence || ARRAY['biological_ledger:' || v_cycle_key];
      END IF;
    END IF;
  END IF;

  -- ── [C] DAS window — PROVISIONAL fallback only (never above 0.5) ──────────
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
       AND v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999)
     ORDER BY
       (v_cultivation_method IS NOT NULL AND lower(csm.cultivation_method) = v_cultivation_method) DESC,
       (lower(csm.cultivation_method) = 'any') DESC,
       (lower(csm.crop_cycle) = v_crop_cycle) DESC NULLS LAST,
       (coalesce(csm.stage_node_type,'') = 'biological') DESC,
       csm.das_min ASC
     LIMIT 1;

    IF NOT FOUND THEN RETURN; END IF;
    v_source     := 'das_provisional';
    v_confidence := 0.5;
    v_evidence   := v_evidence || ARRAY['das_window:' || v_das::text];
  END IF;

  -- ── [B] Evidence-driven transition (observation / event / composite / gdd) ─
  IF p_land_id IS NOT NULL THEN
    SELECT est.rule_id, est.to_stage_uuid, est.confidence AS match_confidence, est.trigger_type
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
        -- DAS-triggered transitions stay provisional; evidence triggers promote.
        IF v_transition_match.trigger_type IN ('das','dat') THEN
          v_confidence := least(0.5, greatest(v_confidence, coalesce(v_transition_match.match_confidence, 0.5)));
        ELSE
          v_confidence := greatest(v_confidence, coalesce(v_transition_match.match_confidence, 0.85));
          v_source     := 'evidence_transition';
        END IF;
        v_stage := v_new_stage;
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
      IF v_source <> 'das_provisional' THEN
        v_confidence := greatest(v_confidence, 0.90);
      END IF;
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
     AND csm.das_max IS NOT NULL
     AND csm.das_max < coalesce(v_stage.das_min, 0)
   ORDER BY csm.das_max DESC
   LIMIT 1;

  SELECT csm.id, csm.das_min
    INTO v_next, v_next_das_min
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
     AND csm.das_min IS NOT NULL
     AND csm.das_min > coalesce(v_stage.das_max, 9999)
   ORDER BY csm.das_min ASC
   LIMIT 1;

  IF p_current_gdd IS NOT NULL AND v_stage.gdd_max IS NOT NULL AND v_stage.gdd_max > 0 THEN
    v_gdd_target := v_stage.gdd_max;
    v_phen_index := least(1.0, greatest(0.0, p_current_gdd / v_gdd_target));
  ELSIF v_stage.das_max IS NOT NULL AND v_stage.das_max > coalesce(v_stage.das_min, 0) THEN
    v_phen_index := least(1.0, greatest(0.0,
      (v_das - coalesce(v_stage.das_min, 0))::numeric
      / greatest(1, v_stage.das_max - coalesce(v_stage.das_min, 0))::numeric));
  ELSE
    v_phen_index := NULL;
  END IF;

  IF v_variety_source IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY[v_variety_source];
  END IF;

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
    CASE WHEN v_next_das_min IS NOT NULL THEN (p_sow_date + v_next_das_min) END,
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
    8;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- S6 — evaluate_stage_validation: read weather from the populated tables.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.evaluate_stage_validation(p_land_id uuid, p_target_stage text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land record;
  v_crop text;
  v_lat numeric;
  v_das int;
  v_gdd numeric;
  v_tmax numeric;
  v_tmin numeric;
  v_moisture numeric;
  v_day_len numeric;
  r record;
  rule_passed boolean;
  rule_value numeric;
  results jsonb := '[]'::jsonb;
  blocked boolean := false;
  warn_count int := 0;
BEGIN
  SELECT id, current_crop, center_lat, current_gdd,
         planting_date, last_sowing_date
    INTO v_land
    FROM public.lands
   WHERE id = p_land_id;

  IF v_land.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'land_not_found');
  END IF;

  v_crop := upper(coalesce(v_land.current_crop, ''));
  v_lat  := v_land.center_lat;
  v_gdd  := v_land.current_gdd;

  v_das := CASE
    WHEN coalesce(v_land.planting_date, v_land.last_sowing_date) IS NOT NULL
    THEN (current_date - coalesce(v_land.planting_date, v_land.last_sowing_date))::int
    ELSE NULL
  END;

  v_day_len := public.calc_day_length_hours(v_lat, current_date);

  -- Weather: prefer daily aggregates, fall back to raw observations.
  SELECT max(wa.temp_max_celsius), min(wa.temp_min_celsius)
    INTO v_tmax, v_tmin
    FROM public.weather_aggregates wa
   WHERE wa.land_id = p_land_id
     AND wa.aggregate_date >= current_date - 7;

  IF v_tmax IS NULL THEN
    SELECT max(wo.temperature_celsius), min(wo.temperature_celsius)
      INTO v_tmax, v_tmin
      FROM public.weather_observations wo
     WHERE wo.land_id = p_land_id
       AND wo.observation_date >= current_date - 7;
  END IF;

  SELECT soil_moisture_surface_percent
    INTO v_moisture
    FROM public.soil_health
   WHERE land_id = p_land_id
   ORDER BY coalesce(moisture_measurement_date, updated_at, created_at) DESC
   LIMIT 1;

  FOR r IN
    SELECT svr.*
      FROM public.stage_validation_rules svr
     WHERE svr.active
       AND upper(svr.crop_code) = v_crop
       AND upper(coalesce(svr.stage_code, '')) IN (upper(coalesce(p_target_stage,'')), '')
  LOOP
    rule_passed := true;
    rule_value  := NULL;

    IF r.rule_type = 'gdd_range' THEN
      rule_value := v_gdd;
    ELSIF r.rule_type = 'das_range' THEN
      rule_value := v_das;
    ELSIF r.rule_type = 'temperature_range' THEN
      rule_value := v_tmax;
    ELSIF r.rule_type = 'temperature_min' THEN
      rule_value := v_tmin;
    ELSIF r.rule_type = 'soil_moisture_range' THEN
      rule_value := v_moisture;
    ELSIF r.rule_type = 'day_length_range' THEN
      rule_value := v_day_len;
    END IF;

    IF rule_value IS NULL THEN
      rule_passed := true;  -- no data → cannot invalidate
    ELSE
      IF (r.rule_config ? 'min')
         AND rule_value < (r.rule_config->>'min')::numeric THEN
        rule_passed := false;
      END IF;
      IF (r.rule_config ? 'max')
         AND rule_value > (r.rule_config->>'max')::numeric THEN
        rule_passed := false;
      END IF;
    END IF;

    IF NOT rule_passed THEN
      IF upper(coalesce(r.severity,'WARN')) = 'BLOCK' THEN
        blocked := true;
      ELSE
        warn_count := warn_count + 1;
      END IF;
    END IF;

    results := results || jsonb_build_object(
      'rule_code', r.rule_code,
      'rule_type', r.rule_type,
      'severity',  r.severity,
      'value',     rule_value,
      'passed',    rule_passed
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'blocked', blocked,
    'warnings', warn_count,
    'target_stage', p_target_stage,
    'inputs', jsonb_build_object(
      'das', v_das, 'gdd', v_gdd, 'tmax', v_tmax, 'tmin', v_tmin,
      'soil_moisture', v_moisture, 'day_length', v_day_len
    ),
    'rules', results
  );
END;
$function$;