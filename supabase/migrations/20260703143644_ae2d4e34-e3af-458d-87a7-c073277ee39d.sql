
-- Drop old signature (return type changes)
DROP FUNCTION IF EXISTS public.apply_stage_transitions(uuid);

CREATE TABLE IF NOT EXISTS public.stage_validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code text NOT NULL,
  stage_code text NOT NULL,
  rule_code text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN (
    'photoperiod_min','photoperiod_max',
    'temp_min_c','temp_max_c',
    'moisture_min_pct','moisture_max_pct',
    'gdd_min','das_min',
    'event_present','observation_present'
  )),
  rule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'warn' CHECK (severity IN ('block','warn','info')),
  description text,
  confidence numeric NOT NULL DEFAULT 0.9,
  active boolean NOT NULL DEFAULT true,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crop_code, stage_code, rule_code)
);

GRANT SELECT ON public.stage_validation_rules TO authenticated;
GRANT ALL ON public.stage_validation_rules TO service_role;

ALTER TABLE public.stage_validation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "svr_read_all_authenticated" ON public.stage_validation_rules;
CREATE POLICY "svr_read_all_authenticated"
  ON public.stage_validation_rules
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "svr_service_role_write" ON public.stage_validation_rules;
CREATE POLICY "svr_service_role_write"
  ON public.stage_validation_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_svr_crop_stage
  ON public.stage_validation_rules(crop_code, stage_code) WHERE active;

DROP TRIGGER IF EXISTS trg_svr_updated_at ON public.stage_validation_rules;
CREATE TRIGGER trg_svr_updated_at
  BEFORE UPDATE ON public.stage_validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.calc_day_length_hours(p_lat numeric, p_date date)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  doy int; decl numeric; cos_h numeric; h numeric;
BEGIN
  IF p_lat IS NULL OR p_date IS NULL THEN RETURN NULL; END IF;
  doy := extract(doy FROM p_date)::int;
  decl := 23.45 * sin(radians(360.0/365.0 * (doy - 81)));
  cos_h := -tan(radians(p_lat)) * tan(radians(decl));
  cos_h := greatest(-1, least(1, cos_h));
  h := degrees(acos(cos_h));
  RETURN round((2.0 * h / 15.0)::numeric, 3);
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_stage_validation(
  p_land_id uuid, p_target_stage text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_land record;
  v_crop text; v_lat numeric; v_das int; v_gdd numeric;
  v_tmax numeric; v_tmin numeric; v_moisture numeric; v_day_len numeric;
  r record; rule_passed boolean; rule_value numeric;
  results jsonb := '[]'::jsonb;
  blocked boolean := false; warn_count int := 0;
BEGIN
  SELECT id, current_crop, center_lat, days_since_sowing, current_gdd, last_sowing_date
    INTO v_land FROM public.lands WHERE id = p_land_id;

  IF v_land.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'land_not_found');
  END IF;

  v_crop := upper(coalesce(v_land.current_crop, ''));
  v_lat := v_land.center_lat;
  v_das := coalesce(v_land.days_since_sowing,
    CASE WHEN v_land.last_sowing_date IS NOT NULL
      THEN (current_date - v_land.last_sowing_date)::int ELSE NULL END);
  v_gdd := v_land.current_gdd;
  v_day_len := public.calc_day_length_hours(v_lat, current_date);

  SELECT max(tmax_c), min(tmin_c), avg(soil_moisture_pct)
    INTO v_tmax, v_tmin, v_moisture
  FROM public.land_weather_metrics
  WHERE land_id = p_land_id
    AND obs_date >= current_date - 7;

  FOR r IN
    SELECT * FROM public.stage_validation_rules
    WHERE active AND stage_code = p_target_stage
      AND (crop_code = v_crop OR crop_code = '*')
    ORDER BY severity DESC, rule_code
  LOOP
    rule_passed := true;
    rule_value := NULL;

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
        rule_passed := EXISTS (
          SELECT 1 FROM public.weather_observations
          WHERE land_id = p_land_id
            AND observation_code = (r.rule_config->>'observation_code')
            AND obs_date >= current_date - coalesce((r.rule_config->>'window_days')::int, 30)
        );
      ELSE
        rule_passed := true;
    END CASE;

    IF NOT rule_passed AND r.severity = 'block' THEN blocked := true; END IF;
    IF NOT rule_passed AND r.severity = 'warn' THEN warn_count := warn_count + 1; END IF;

    results := results || jsonb_build_object(
      'rule_code', r.rule_code, 'rule_type', r.rule_type,
      'severity', r.severity, 'passed', rule_passed,
      'observed', rule_value, 'config', r.rule_config,
      'description', r.description, 'confidence', r.confidence
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'land_id', p_land_id, 'target_stage', p_target_stage, 'crop', v_crop,
    'context', jsonb_build_object(
      'day_length_hours', v_day_len,
      'tmax_c', v_tmax, 'tmin_c', v_tmin,
      'moisture_pct', v_moisture, 'gdd', v_gdd, 'das', v_das
    ),
    'blocked', blocked, 'warn_count', warn_count,
    'rules_evaluated', jsonb_array_length(results),
    'results', results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_stage_validation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_stage_validation(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_stage_transitions(p_land_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval jsonb; v_top jsonb;
  v_from_stage text; v_to_stage text;
  v_validation jsonb; v_blocked boolean;
BEGIN
  v_eval := public.evaluate_stage_transitions(p_land_id, NULL);
  IF v_eval IS NULL OR (v_eval->>'ok')::boolean IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'evaluator_failed', 'detail', v_eval);
  END IF;

  SELECT elem INTO v_top
  FROM jsonb_array_elements(coalesce(v_eval->'matched','[]'::jsonb)) AS elem
  ORDER BY (elem->>'priority')::int DESC NULLS LAST
  LIMIT 1;

  IF v_top IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_match');
  END IF;

  v_from_stage := v_top->>'from_stage';
  v_to_stage := v_top->>'to_stage';

  v_validation := public.evaluate_stage_validation(p_land_id, v_to_stage);
  v_blocked := coalesce((v_validation->>'blocked')::boolean, false);

  IF v_blocked THEN
    INSERT INTO public.stage_transition_log(
      land_id, from_stage, to_stage, matched_rule_id, applied, reason, evidence
    ) VALUES (
      p_land_id, v_from_stage, v_to_stage,
      NULLIF(v_top->>'rule_id','')::uuid, false,
      'blocked_by_validation',
      jsonb_build_object('transition', v_top, 'validation', v_validation)
    );
    RETURN jsonb_build_object(
      'ok', true, 'applied', false, 'reason', 'blocked_by_validation',
      'validation', v_validation
    );
  END IF;

  INSERT INTO public.stage_transition_log(
    land_id, from_stage, to_stage, matched_rule_id, applied, reason, evidence
  ) VALUES (
    p_land_id, v_from_stage, v_to_stage,
    NULLIF(v_top->>'rule_id','')::uuid, true,
    coalesce(v_top->>'reason','matched'),
    jsonb_build_object('transition', v_top, 'validation', v_validation)
  );

  RETURN jsonb_build_object(
    'ok', true, 'applied', true,
    'from_stage', v_from_stage, 'to_stage', v_to_stage,
    'validation', v_validation
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stage_transitions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_stage_transitions(uuid) TO authenticated, service_role;
