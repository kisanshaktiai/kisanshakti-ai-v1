-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2 — Repair Phase G SQL (BUG-1, BUG-2, BUG-3, BUG-4)
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- evaluate_stage_validation: use real columns only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_stage_validation(
  p_land_id uuid,
  p_target_stage text
)
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

  -- Derive DAS from sowing/planting date (no lands.days_since_sowing column).
  v_das := CASE
    WHEN coalesce(v_land.planting_date, v_land.last_sowing_date) IS NOT NULL
    THEN (current_date - coalesce(v_land.planting_date, v_land.last_sowing_date))::int
    ELSE NULL
  END;

  v_day_len := public.calc_day_length_hours(v_lat, current_date);

  -- Weather aggregate: real schema is (metric_date, temperature_c). No min/max
  -- split, no soil moisture in this table.
  SELECT max(temperature_c), min(temperature_c)
    INTO v_tmax, v_tmin
    FROM public.land_weather_metrics
   WHERE land_id = p_land_id
     AND metric_date >= current_date - 7;

  -- Soil moisture from most recent soil_health snapshot.
  SELECT soil_moisture_surface_percent
    INTO v_moisture
    FROM public.soil_health
   WHERE land_id = p_land_id
     AND soil_moisture_surface_percent IS NOT NULL
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  FOR r IN
    SELECT * FROM public.stage_validation_rules
     WHERE active
       AND stage_code = p_target_stage
       AND (crop_code = v_crop OR crop_code = '*')
     ORDER BY severity DESC, rule_code
  LOOP
    rule_passed := true;
    rule_value  := NULL;

    CASE r.rule_type
      WHEN 'photoperiod_min' THEN
        rule_value := v_day_len;
        rule_passed := v_day_len IS NOT NULL AND v_day_len >= (r.rule_config->>'hours')::numeric;
      WHEN 'photoperiod_max' THEN
        rule_value := v_day_len;
        rule_passed := v_day_len IS NOT NULL AND v_day_len <= (r.rule_config->>'hours')::numeric;
      WHEN 'temp_min_c' THEN
        rule_value := v_tmin;
        rule_passed := v_tmin IS NOT NULL AND v_tmin >= (r.rule_config->>'celsius')::numeric;
      WHEN 'temp_max_c' THEN
        rule_value := v_tmax;
        rule_passed := v_tmax IS NOT NULL AND v_tmax <= (r.rule_config->>'celsius')::numeric;
      WHEN 'moisture_min_pct' THEN
        rule_value := v_moisture;
        rule_passed := v_moisture IS NOT NULL AND v_moisture >= (r.rule_config->>'pct')::numeric;
      WHEN 'moisture_max_pct' THEN
        rule_value := v_moisture;
        rule_passed := v_moisture IS NOT NULL AND v_moisture <= (r.rule_config->>'pct')::numeric;
      WHEN 'gdd_min' THEN
        rule_value := v_gdd;
        rule_passed := v_gdd IS NOT NULL AND v_gdd >= (r.rule_config->>'gdd')::numeric;
      WHEN 'das_min' THEN
        rule_value := v_das;
        rule_passed := v_das IS NOT NULL AND v_das >= (r.rule_config->>'days')::numeric;
      WHEN 'event_present' THEN
        rule_passed := EXISTS (
          SELECT 1 FROM public.crop_lifecycle_events
           WHERE land_id = p_land_id
             AND event_type = (r.rule_config->>'event_type')
        );
      WHEN 'observation_present' THEN
        -- weather_observations has no observation_code column in this schema.
        -- Treat as insufficient-evidence rather than raising a runtime error.
        rule_passed := false;
      ELSE
        rule_passed := true;
    END CASE;

    IF NOT rule_passed AND r.severity = 'block' THEN blocked := true; END IF;
    IF NOT rule_passed AND r.severity = 'warn'  THEN warn_count := warn_count + 1; END IF;

    results := results || jsonb_build_object(
      'rule_code',   r.rule_code,
      'rule_type',   r.rule_type,
      'severity',    r.severity,
      'passed',      rule_passed,
      'observed',    rule_value,
      'config',      r.rule_config,
      'description', r.description,
      'confidence',  r.confidence
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'land_id', p_land_id,
    'target_stage', p_target_stage,
    'crop', v_crop,
    'context', jsonb_build_object(
      'day_length_hours', v_day_len,
      'tmax_c',    v_tmax,
      'tmin_c',    v_tmin,
      'moisture_pct', v_moisture,
      'gdd',       v_gdd,
      'das',       v_das
    ),
    'blocked', blocked,
    'warn_count', warn_count,
    'rules_evaluated', jsonb_array_length(results),
    'results', results
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- apply_stage_transitions: consume TABLE result, write real log columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stage_transitions(p_land_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_top          record;   -- top-priority matched transition row
  v_from_uuid    uuid;
  v_to_uuid      uuid;
  v_from_code    text;
  v_to_code      text;
  v_validation   jsonb;
  v_blocked      boolean;
  v_evidence     jsonb;
  v_reason       text;
BEGIN
  -- evaluate_stage_transitions RETURNS TABLE — must be SELECTed from.
  SELECT rule_id, from_stage_uuid, to_stage_uuid, trigger_type,
         priority, confidence, matched, evidence
    INTO v_top
    FROM public.evaluate_stage_transitions(p_land_id, NULL)
   WHERE matched = true
   ORDER BY priority DESC NULLS LAST, confidence DESC NULLS LAST
   LIMIT 1;

  IF v_top IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_match');
  END IF;

  v_from_uuid := v_top.from_stage_uuid;
  v_to_uuid   := v_top.to_stage_uuid;

  -- Resolve human-readable stage_code for the validator + log payload.
  SELECT stage_code INTO v_from_code
    FROM public.crop_stage_master WHERE id = v_from_uuid;
  SELECT stage_code INTO v_to_code
    FROM public.crop_stage_master WHERE id = v_to_uuid;

  v_validation := public.evaluate_stage_validation(p_land_id, v_to_code);
  v_blocked    := coalesce((v_validation->>'blocked')::boolean, false);
  v_reason     := CASE WHEN v_blocked THEN 'blocked_by_validation' ELSE 'matched' END;

  v_evidence := jsonb_build_object(
    'applied',        NOT v_blocked,
    'blocked',        v_blocked,
    'reason',         v_reason,
    'from_stage_code',v_from_code,
    'to_stage_code',  v_to_code,
    'priority',       v_top.priority,
    'trigger',        v_top.trigger_type,
    'transition',     v_top.evidence,
    'validation',     v_validation
  );

  INSERT INTO public.stage_transition_log(
    land_id, from_stage_uuid, to_stage_uuid, rule_id,
    trigger_type, confidence, evidence
  ) VALUES (
    p_land_id, v_from_uuid, v_to_uuid, v_top.rule_id,
    v_top.trigger_type, v_top.confidence, v_evidence
  );

  IF v_blocked THEN
    RETURN jsonb_build_object(
      'ok', true, 'applied', false, 'reason', 'blocked_by_validation',
      'from_stage', v_from_code, 'to_stage', v_to_code,
      'validation', v_validation
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true,
    'from_stage', v_from_code, 'to_stage', v_to_code,
    'validation', v_validation
  );
END;
$function$;