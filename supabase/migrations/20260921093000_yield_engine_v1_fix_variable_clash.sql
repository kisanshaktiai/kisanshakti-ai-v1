-- Fix for 20260921090000_yield_engine_v1 (function body only; no logic change).
-- PL/pgSQL variables water_regime, factors, evidence, explanation, gaps and week_start shared
-- their names (canopy too) with columns of crop_yield_potential / land_farm_state / yield_predictions and raised 42702
-- (ambiguous reference) — the first manual run failed on water_regime and rolled back, so the
-- faulty version wrote no yield_predictions row. Variables are now prefixed v_; INSERT target
-- columns, ON CONFLICT target and RETURNING now name the table columns explicitly.

CREATE OR REPLACE FUNCTION public.compute_land_yield_estimate(p_land_id uuid, p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  pol          jsonb;
  land         record;
  sched        record;
  lfs          record;
  stage        record;
  potential    numeric;
  pot_src      jsonb;
  v_water_regime text;
  v_factors      jsonb := '{}'::jsonb;
  v_evidence     jsonb := '{}'::jsonb;
  v_explanation  jsonb := '[]'::jsonb;
  v_gaps         text[] := '{}';
  canopy_f     numeric := 1.0;
  v_canopy       jsonb;
  ky           numeric;
  shortfall    numeric;
  conf         numeric;
  pred         numeric;
  band         numeric;
  v_week_start   date := date_trunc('week', p_as_of)::date;
  prev         record;
  out_row      jsonb;
BEGIN
  SELECT config_value INTO pol FROM system_config WHERE config_key = 'yield_model_policy';
  IF pol IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no_policy');
  END IF;

  SELECT l.id, l.tenant_id, l.farmer_id, l.area_acres, l.active_schedule_id,
         l.irrigation_source, l.water_source, l.irrigation_type, l.state_id
    INTO land
    FROM lands l
   WHERE l.id = p_land_id AND l.deleted_at IS NULL;
  IF NOT FOUND OR land.active_schedule_id IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no_active_schedule', 'land_id', p_land_id);
  END IF;

  SELECT cs.id, cs.crop_name, cs.variety_id, cs.cultivation_method, cs.sowing_date, cs.expected_harvest_date
    INTO sched
    FROM crop_schedules cs
   WHERE cs.id = land.active_schedule_id AND cs.is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', 'schedule_inactive', 'land_id', p_land_id);
  END IF;

  SELECT f.crop_code, f.stage_code, f.das, f.canopy, f.state_date
    INTO lfs
    FROM land_farm_state f
   WHERE f.land_id = p_land_id
   ORDER BY f.state_date DESC
   LIMIT 1;
  IF NOT FOUND OR lfs.crop_code IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no_farm_state', 'land_id', p_land_id);
  END IF;

  -- Water regime from the land's own irrigation fields (rainfed only when stated)
  v_water_regime := CASE
    WHEN coalesce(land.irrigation_type, land.irrigation_source, land.water_source, '') ILIKE '%rain%' THEN 'rainfed'
    WHEN coalesce(land.irrigation_type, land.irrigation_source, land.water_source, '') <> '' THEN 'irrigated'
    ELSE 'unknown' END;

  -- Potential: variety first, then crop-level SSOT (state, then national)
  IF sched.variety_id IS NOT NULL THEN
    SELECT CASE v_water_regime WHEN 'rainfed'   THEN coalesce(mp.yield_rainfed_qtl_per_acre,   mp.yield_potential_qtl_per_acre)
                             WHEN 'irrigated' THEN coalesce(mp.yield_irrigated_qtl_per_acre, mp.yield_potential_qtl_per_acre)
                             ELSE mp.yield_potential_qtl_per_acre END,
           jsonb_build_object('source', 'master_products', 'id', mp.id, 'name', mp.name, 'water_regime', v_water_regime)
      INTO potential, pot_src
      FROM master_products mp WHERE mp.id = sched.variety_id;
  END IF;
  IF potential IS NULL THEN
    SELECT cyp.yield_qtl_per_acre,
           jsonb_build_object('source', 'crop_yield_potential', 'id', cyp.id, 'scope_level', cyp.scope_level, 'yield_basis', cyp.yield_basis, 'water_regime', v_water_regime)
      INTO potential, pot_src
      FROM crop_yield_potential cyp
     WHERE cyp.is_active AND cyp.crop_code = lfs.crop_code
       AND (cyp.cultivation_method IS NULL OR cyp.cultivation_method = sched.cultivation_method)
       AND (cyp.water_regime = 'any' OR cyp.water_regime = v_water_regime)
       AND (cyp.scope_level = 'national' OR (cyp.scope_level = 'state' AND cyp.state_id = land.state_id))
       AND cyp.effective_from <= p_as_of
     ORDER BY CASE cyp.scope_level WHEN 'state' THEN 0 ELSE 1 END,
              CASE WHEN cyp.cultivation_method IS NOT NULL THEN 0 ELSE 1 END,
              cyp.effective_from DESC
     LIMIT 1;
  END IF;
  IF potential IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no_yield_potential', 'land_id', p_land_id, 'crop_code', lfs.crop_code);
  END IF;
  IF v_water_regime = 'unknown' THEN v_gaps := v_gaps || 'water_regime_unknown'; END IF;

  -- Stage row (Ky and expected NDVI band live here)
  SELECT csm.stage_code, csm.growth_stage, csm.yield_response_ky, csm.expected_ndvi_min, csm.expected_ndvi_max
    INTO stage
    FROM crop_stage_master csm
   WHERE csm.stage_code = lfs.stage_code
   LIMIT 1;

  -- Canopy factor -----------------------------------------------------------
  v_canopy := lfs.canopy;
  IF NOT coalesce((pol->'canopy'->>'enabled')::boolean, false) THEN
    v_gaps := v_gaps || 'canopy_disabled_by_policy';
  ELSIF v_canopy IS NULL OR (v_canopy->>'ndvi') IS NULL THEN
    v_gaps := v_gaps || 'canopy_no_observation';
  ELSIF coalesce(v_canopy->>'status', '') NOT LIKE (pol->'canopy'->>'observed_status_prefix') || '%' THEN
    v_gaps := v_gaps || 'canopy_not_observed';
  ELSIF coalesce((v_canopy->>'age_days')::int, 999) > (pol->'canopy'->>'max_age_days')::int THEN
    v_gaps := v_gaps || 'canopy_too_old';
  ELSIF coalesce((v_canopy->>'confidence')::numeric, 0) < (pol->'canopy'->>'min_confidence')::numeric THEN
    v_gaps := v_gaps || 'canopy_low_confidence';
  ELSE
    ky := coalesce(stage.yield_response_ky, (pol->'canopy'->>'default_ky')::numeric);
    IF v_canopy->>'vs_expected' = 'below' AND (v_canopy->>'expected_min') IS NOT NULL THEN
      shortfall := ((v_canopy->>'expected_min')::numeric - (v_canopy->>'ndvi')::numeric) / (v_canopy->>'expected_min')::numeric;
      canopy_f  := greatest((pol->'canopy'->>'floor')::numeric, 1 - ky * shortfall);
      v_explanation := v_explanation || jsonb_build_object(
        'code', 'canopy_below_normal',
        'ndvi', (v_canopy->>'ndvi')::numeric, 'expected_min', (v_canopy->>'expected_min')::numeric,
        'stage_code', lfs.stage_code, 'observed_on', v_canopy->>'date', 'factor', round(canopy_f, 3));
    ELSE
      canopy_f := 1.0;
      v_explanation := v_explanation || jsonb_build_object(
        'code', 'canopy_normal', 'ndvi', (v_canopy->>'ndvi')::numeric,
        'stage_code', lfs.stage_code, 'observed_on', v_canopy->>'date');
    END IF;
    v_factors  := v_factors  || jsonb_build_object('canopy', jsonb_build_object('value', round(canopy_f, 3), 'ky', ky, 'vs_expected', v_canopy->>'vs_expected'));
    v_evidence := v_evidence || jsonb_build_object('canopy', jsonb_build_object('table', 'land_farm_state', 'state_date', lfs.state_date, 'canopy', v_canopy));
  END IF;

  -- Factors present in policy but off: record the gap with the policy reason
  IF NOT coalesce((pol->'water'->>'enabled')::boolean, false)      THEN v_gaps := v_gaps || 'water_disabled_by_policy';      END IF;
  IF NOT coalesce((pol->'thermal'->>'enabled')::boolean, false)    THEN v_gaps := v_gaps || 'thermal_disabled_by_policy';    END IF;
  IF NOT coalesce((pol->'soil'->>'enabled')::boolean, false)       THEN v_gaps := v_gaps || 'soil_disabled_by_policy';       END IF;
  IF NOT coalesce((pol->'pest'->>'enabled')::boolean, false)       THEN v_gaps := v_gaps || 'pest_disabled_by_policy';       END IF;
  IF NOT coalesce((pol->'compliance'->>'enabled')::boolean, false) THEN v_gaps := v_gaps || 'compliance_disabled_by_policy'; END IF;

  pred := round(potential * canopy_f, 2);
  band := (pol->>'band_pct')::numeric;
  conf := least(1.0, greatest(0.0,
            (pol->>'confidence_base')::numeric
            * CASE WHEN v_factors ? 'canopy' THEN coalesce((v_canopy->>'confidence')::numeric, 1.0) ELSE 0.8 END));

  -- Previous week's row for the trend code
  SELECT yp.predicted_yield_per_acre INTO prev
    FROM yield_predictions yp
   WHERE yp.land_id = p_land_id AND yp.schedule_id = sched.id AND yp.week_start < v_week_start
   ORDER BY yp.week_start DESC LIMIT 1;
  IF FOUND AND prev.predicted_yield_per_acre IS NOT NULL THEN
    v_explanation := v_explanation || jsonb_build_object('code',
      CASE WHEN pred < prev.predicted_yield_per_acre * 0.98 THEN 'trend_down'
           WHEN pred > prev.predicted_yield_per_acre * 1.02 THEN 'trend_up'
           ELSE 'trend_flat' END,
      'previous_per_acre', prev.predicted_yield_per_acre, 'current_per_acre', pred);
  END IF;

  INSERT INTO yield_predictions
    (land_id, farmer_id, tenant_id, schedule_id, crop_name, crop_code, variety, cultivation_method,
     prediction_date, week_start, harvest_date_estimate, area_acres,
     potential_yield_per_acre, potential_source, predicted_yield_per_acre,
     predicted_yield_low_per_acre, predicted_yield_high_per_acre,
     confidence_score, factors, evidence, explanation, gaps, factors_considered, model_version, computed_at, updated_at)
  VALUES
    (land.id, land.farmer_id, land.tenant_id, sched.id, sched.crop_name, lfs.crop_code, pot_src->>'name', sched.cultivation_method,
     p_as_of, v_week_start, sched.expected_harvest_date, land.area_acres,
     potential, pot_src, pred,
     round(pred * (1 - band), 2), round(pred * (1 + band), 2),
     conf, v_factors, v_evidence, v_explanation, v_gaps, v_factors, pol->>'model_version', now(), now())
  ON CONFLICT (land_id, schedule_id, week_start) DO UPDATE SET
     prediction_date = EXCLUDED.prediction_date, crop_name = EXCLUDED.crop_name, crop_code = EXCLUDED.crop_code,
     variety = EXCLUDED.variety, cultivation_method = EXCLUDED.cultivation_method,
     harvest_date_estimate = EXCLUDED.harvest_date_estimate, area_acres = EXCLUDED.area_acres,
     potential_yield_per_acre = EXCLUDED.potential_yield_per_acre, potential_source = EXCLUDED.potential_source,
     predicted_yield_per_acre = EXCLUDED.predicted_yield_per_acre,
     predicted_yield_low_per_acre = EXCLUDED.predicted_yield_low_per_acre, predicted_yield_high_per_acre = EXCLUDED.predicted_yield_high_per_acre,
     confidence_score = EXCLUDED.confidence_score, factors = EXCLUDED.factors, evidence = EXCLUDED.evidence,
     explanation = EXCLUDED.explanation, gaps = EXCLUDED.gaps, factors_considered = EXCLUDED.factors_considered,
     model_version = EXCLUDED.model_version, computed_at = EXCLUDED.computed_at, updated_at = now()
  RETURNING jsonb_build_object('land_id', yield_predictions.land_id, 'week_start', yield_predictions.week_start, 'potential', potential_yield_per_acre,
             'predicted_per_acre', predicted_yield_per_acre, 'low', predicted_yield_low_per_acre, 'high', predicted_yield_high_per_acre,
             'total_qtl', round(predicted_yield_per_acre * coalesce(area_acres, 0), 1),
             'confidence', confidence_score, 'factors', yield_predictions.factors, 'gaps', yield_predictions.gaps, 'explanation', yield_predictions.explanation)
    INTO out_row;

  RETURN out_row;
END;
$fn$;

