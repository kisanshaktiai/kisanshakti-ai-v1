CREATE OR REPLACE FUNCTION public.evaluate_stage_validation(p_land_id uuid, p_target_stage text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  -- FIX (2026-08-26): soil_health.moisture_measurement_date is a bigint epoch;
  -- coalescing it with timestamptz columns raised
  -- "COALESCE types bigint and timestamp with time zone cannot be matched",
  -- which aborted apply_stage_transitions / STAGE_PERSIST.
  SELECT soil_moisture_surface_percent
    INTO v_moisture
    FROM public.soil_health
   WHERE land_id = p_land_id
   ORDER BY COALESCE(
              CASE
                WHEN moisture_measurement_date IS NULL THEN NULL
                WHEN moisture_measurement_date > 100000000000
                  THEN to_timestamp(moisture_measurement_date / 1000.0)
                ELSE to_timestamp(moisture_measurement_date)
              END,
              updated_at,
              created_at
            ) DESC NULLS LAST
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
      rule_passed := true;
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