-- YieldShield P0: safe staged migration for static baselines and dynamic decisions.
-- This migration is SOURCE ONLY; no production database statements run in this session.
-- Existing agronomic values are unchanged. Run migration on staging, replay schedules, then review.
BEGIN;

-- Preserve task completion attempt identities across network retries.
ALTER TABLE public.task_completions ADD COLUMN IF NOT EXISTS operation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_completions_operation_id
  ON public.task_completions(operation_id) WHERE operation_id IS NOT NULL;

-- The farmer client uses a signed app session, NOT the spoofable x-farmer-id header.
DROP POLICY IF EXISTS "Farmers can create completions" ON public.task_completions;
DROP POLICY IF EXISTS "Farmers can view their completions" ON public.task_completions;
REVOKE INSERT, UPDATE, DELETE ON public.task_completions FROM anon, authenticated;
CREATE POLICY "Verified farmers can view owned completions" ON public.task_completions
  FOR SELECT TO anon, authenticated
  USING (
    farmer_id = (SELECT public.get_current_farmer_id())
    AND EXISTS (
      SELECT 1 FROM public.schedule_tasks t
      JOIN public.crop_schedules s ON s.id = t.schedule_id
      WHERE t.id = task_id AND s.farmer_id = farmer_id
    )
  );

-- Only the session-verified server can create schedules; authenticated
-- browser clients may not invoke a SECURITY DEFINER persistence routine.
REVOKE ALL ON FUNCTION public.persist_ai_crop_schedule_atomic(jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_ai_crop_schedule_atomic(jsonb,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_schedule_for_land(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_schedule_for_land(uuid) TO service_role;

-- Preserve generated per-event water amount without converting stage totals
-- into single irrigation doses.
CREATE OR REPLACE FUNCTION public.persist_ai_crop_schedule_atomic(p_schedule jsonb, p_tasks jsonb, p_land jsonb)
 RETURNS TABLE(schedule_id uuid, task_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_schedule_id uuid;
  v_task_count integer;
  v_expected_count integer;
  v_land_id uuid;
begin
  if jsonb_typeof(p_schedule) <> 'object' then
    raise exception 'p_schedule must be a JSON object';
  end if;

  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) = 0 then
    raise exception 'p_tasks must be a non-empty JSON array';
  end if;

  v_land_id := nullif(p_schedule->>'land_id', '')::uuid;
  if v_land_id is null then
    raise exception 'p_schedule.land_id is required';
  end if;

  perform 1 from public.lands where id = v_land_id for update;
  if not found then raise exception 'land % not found', v_land_id; end if;

  insert into public.crop_schedules (
    land_id, farmer_id, tenant_id, crop_name, crop_variety, variety_id,
    cultivation_method, crop_cycle, sowing_date, transplant_date,
    expected_harvest_date, is_active, status, generation_language, ai_model,
    input_soil_data, input_weather_data, input_land_coordinates, agro_climatic_zone,
    calculated_for_area_acres, total_duration_days, seed_quantity_kg,
    fertilizer_n_kg, fertilizer_p_kg, fertilizer_k_kg, total_estimated_cost,
    state_region, district_name, farming_type, tasks_total_count,
    tasks_completed_count, backdated_consent, backdated_consent_at,
    generation_params, metadata
  )
  values (
    (p_schedule->>'land_id')::uuid,
    nullif(p_schedule->>'farmer_id', '')::uuid,
    nullif(p_schedule->>'tenant_id', '')::uuid,
    p_schedule->>'crop_name',
    p_schedule->>'crop_variety',
    nullif(p_schedule->>'variety_id', '')::uuid,
    p_schedule->>'cultivation_method',
    p_schedule->>'crop_cycle',
    (p_schedule->>'sowing_date')::date,
    nullif(p_schedule->>'transplant_date', '')::date,
    nullif(p_schedule->>'expected_harvest_date', '')::date,
    coalesce((p_schedule->>'is_active')::boolean, true),
    coalesce(p_schedule->>'status', 'active'),
    p_schedule->>'generation_language',
    p_schedule->>'ai_model',
    p_schedule->'input_soil_data',
    p_schedule->'input_weather_data',
    p_schedule->'input_land_coordinates',
    p_schedule->>'agro_climatic_zone',
    nullif(p_schedule->>'calculated_for_area_acres', '')::numeric,
    nullif(p_schedule->>'total_duration_days', '')::integer,
    nullif(p_schedule->>'seed_quantity_kg', '')::numeric,
    nullif(p_schedule->>'fertilizer_n_kg', '')::numeric,
    nullif(p_schedule->>'fertilizer_p_kg', '')::numeric,
    nullif(p_schedule->>'fertilizer_k_kg', '')::numeric,
    nullif(p_schedule->>'total_estimated_cost', '')::numeric,
    p_schedule->>'state_region',
    p_schedule->>'district_name',
    p_schedule->>'farming_type',
    nullif(p_schedule->>'tasks_total_count', '')::integer,
    coalesce(nullif(p_schedule->>'tasks_completed_count', '')::integer, 0),
    coalesce((p_schedule->>'backdated_consent')::boolean, false),
    nullif(p_schedule->>'backdated_consent_at', '')::timestamptz,
    coalesce(p_schedule->'generation_params', '{}'::jsonb),
    coalesce(p_schedule->'metadata', '{}'::jsonb)
  )
  returning id into v_schedule_id;

  insert into public.schedule_tasks (
    schedule_id, farmer_id, tenant_id, task_name, task_description,
    task_type, task_date, projected_date, days_from_sowing, anchor_type,
    anchor_stage, gdd_target, stage_key, stage_uuid, stage_name, stage_order,
    priority, weather_dependent, status, original_date, reschedule_reason,
    auto_rescheduled, sequence_order, instructions, precautions, resources,
    estimated_cost, currency, rule_ids, trigger_rule_id, confidence,
    source_refs, language, is_pinned, water_required_liters
  )
  select
    v_schedule_id, x.farmer_id, x.tenant_id, x.task_name, x.task_description,
    x.task_type, x.task_date, x.projected_date, x.days_from_sowing, x.anchor_type,
    x.anchor_stage, x.gdd_target, x.stage_key, x.stage_uuid, x.stage_name, x.stage_order,
    x.priority, x.weather_dependent, x.status, x.original_date, x.reschedule_reason,
    x.auto_rescheduled, x.sequence_order, x.instructions, x.precautions, x.resources,
    x.estimated_cost, x.currency, x.rule_ids, x.trigger_rule_id, x.confidence,
    x.source_refs, x.language, x.is_pinned, x.water_required_liters
  from jsonb_to_recordset(p_tasks) as x(
    farmer_id uuid,
    tenant_id uuid,
    task_name text,
    task_description text,
    task_type text,
    task_date date,
    projected_date date,
    days_from_sowing integer,
    anchor_type text,
    anchor_stage text,
    gdd_target numeric,
    stage_key text,
    stage_uuid uuid,
    stage_name text,
    stage_order integer,
    priority text,
    weather_dependent boolean,
    status text,
    original_date date,
    reschedule_reason text,
    auto_rescheduled boolean,
    sequence_order integer,
    instructions text[],
    precautions text[],
    resources jsonb,
    estimated_cost numeric,
    currency varchar,
    rule_ids text[],
    trigger_rule_id text,
    confidence numeric,
    source_refs jsonb,
    language varchar,
    is_pinned boolean,
    water_required_liters numeric
  );

  get diagnostics v_task_count = row_count;
  v_expected_count := nullif(p_schedule->>'tasks_total_count', '')::integer;

  if v_task_count <> jsonb_array_length(p_tasks) then
    raise exception 'task insert count mismatch: inserted %, requested %', v_task_count, jsonb_array_length(p_tasks);
  end if;

  if v_expected_count is not null and v_task_count <> v_expected_count then
    raise exception 'task count mismatch: inserted %, schedule expects %', v_task_count, v_expected_count;
  end if;

  update public.lands
  set current_crop = p_land->>'current_crop',
      current_crop_variety_id = nullif(p_land->>'current_crop_variety_id', '')::uuid,
      planting_date = nullif(p_land->>'planting_date', '')::date,
      transplant_date = nullif(p_land->>'transplant_date', '')::date,
      gdd_anchor_type = p_land->>'gdd_anchor_type',
      gdd_anchor_date = nullif(p_land->>'gdd_anchor_date', '')::date,
      current_gdd = nullif(p_land->>'current_gdd', '')::numeric,
      gdd_last_computed_at = nullif(p_land->>'gdd_last_computed_at', '')::timestamptz,
      expected_harvest_date = nullif(p_land->>'expected_harvest_date', '')::date,
      active_schedule_id = v_schedule_id,
      crop_cycle = p_land->>'crop_cycle',
      updated_at = now()
  where id = v_land_id;

  if not found then raise exception 'land % disappeared during schedule persistence', v_land_id; end if;

  return query select v_schedule_id, v_task_count;
end;
$function$


-- The selected cultivation method is recorded on crop_schedules.
-- Its DECLARED stage-clock method is a separate, versioned generation field.
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(p_land_id uuid)
 RETURNS TABLE(stage_uuid uuid, stage_code text, growth_stage text, crop_code text, crop_cycle text, cultivation_method text, previous_stage_uuid uuid, next_stage_uuid uuid, expected_transition_date date, reference_system text, phenology_model text, current_das integer, current_dat integer, current_gdd numeric, expected_height_cm_min numeric, expected_height_cm_max numeric, expected_leaf_count_min integer, expected_leaf_count_max integer, expected_ndvi_min numeric, expected_ndvi_max numeric, phenology_index numeric, confidence numeric, evidence_sources text[], source text, resolver_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_land               record;
  v_sched              record;
  v_crop_input         text;
  v_crop_code          text;
  v_crop_cycle         text;
  v_cultivation_method text;
  v_variety_id         uuid;
  v_sow_date           date;
  v_transplant_date    date;
  v_current_gdd        numeric;
  v_method_count       integer;
begin
  select l.current_crop, l.crop_cycle, l.current_crop_variety_id,
         l.planting_date, l.last_sowing_date, l.transplant_date, l.current_gdd
    into v_land
    from public.lands l
   where l.id = p_land_id;
  if not found then return; end if;

  select cs.crop_name, cs.variety_id, cs.cultivation_method, cs.crop_cycle,
         cs.sowing_date, cs.transplant_date, cs.generation_params
    into v_sched
    from public.crop_schedules cs
   where cs.land_id = p_land_id
     and cs.is_active = true
     and cs.status = 'active'
   order by cs.created_at desc
   limit 1;

  v_crop_input := coalesce(nullif(trim(v_sched.crop_name), ''), nullif(trim(v_land.current_crop), ''));
  if v_crop_input is null then return; end if;

  select lower(c.value) into v_crop_code
    from public.crops c
   where c.is_active = true
     and (lower(c.value) = lower(v_crop_input) or lower(c.label) = lower(v_crop_input)
          or c.label_local = v_crop_input or c.local_name = v_crop_input)
   limit 1;
  if v_crop_code is null then
    select lower(s.canonical_crop) into v_crop_code
      from public.crop_synonyms s
     where s.is_active = true and lower(s.variant_name) = lower(v_crop_input)
     limit 1;
  end if;
  if v_crop_code is null then v_crop_code := lower(v_crop_input); end if;

  v_crop_cycle      := lower(coalesce(nullif(v_sched.crop_cycle, ''), nullif(v_land.crop_cycle, ''), ''));
  v_variety_id      := coalesce(v_sched.variety_id, v_land.current_crop_variety_id);
  v_sow_date        := coalesce(v_sched.sowing_date, v_land.planting_date, v_land.last_sowing_date);
  v_transplant_date := coalesce(v_sched.transplant_date, case when v_sched.crop_name is null then v_land.transplant_date else null end);
  v_current_gdd     := v_land.current_gdd;

  v_cultivation_method := coalesce(
    nullif(lower(trim(v_sched.generation_params->>'stage_clock_method')), ''),
    lower(nullif(trim(coalesce(v_sched.cultivation_method, '')), ''))
  );
  if v_cultivation_method is null then
    select count(distinct lower(m.cultivation_method)),
           min(lower(m.cultivation_method))
      into v_method_count, v_cultivation_method
      from public.crop_stage_master m
     where lower(m.crop_code) = v_crop_code and m.is_active = true
       and m.cultivation_method is not null;
    if coalesce(v_method_count, 0) <> 1 then
      return;
    end if;
  end if;

  if v_crop_code = '' or v_sow_date is null then return; end if;

  return query
  select * from public.resolve_crop_phenology(
    p_crop_code          := v_crop_code,
    p_crop_cycle         := v_crop_cycle,
    p_cultivation_method := v_cultivation_method,
    p_variety_id         := v_variety_id,
    p_sow_date           := v_sow_date,
    p_transplant_date    := v_transplant_date,
    p_current_gdd        := v_current_gdd,
    p_as_of              := current_date,
    p_land_id            := p_land_id
  );
end;
$function$

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
  v_stage_clock_method text;
  v_sow_date          date;
  v_sow_source        text;
  v_evidence          text[] := ARRAY[]::text[];
BEGIN
  SELECT l.id, l.current_crop, l.crop_cycle, l.current_crop_variety_id,
         l.planting_date, l.last_sowing_date, l.transplant_date, l.current_gdd
    INTO v_land
    FROM public.lands l
   WHERE l.id = p_land_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT cs.sowing_date, lower(nullif(cs.cultivation_method, '')), nullif(lower(cs.generation_params->>'stage_clock_method'),'')
    INTO v_schedule_sow_date, v_schedule_method, v_stage_clock_method
    FROM public.crop_schedules cs
   WHERE cs.land_id = p_land_id
     AND cs.is_active = true
     AND cs.sowing_date IS NOT NULL
   ORDER BY cs.sowing_date DESC
   LIMIT 1;

  v_sow_date := coalesce(
    v_land.planting_date,
    v_land.last_sowing_date,
    v_schedule_sow_date
  );

  IF v_sow_date IS NOT NULL THEN
    v_sow_source := CASE
      WHEN v_land.planting_date    IS NOT NULL THEN 'lands.planting_date'
      WHEN v_land.last_sowing_date IS NOT NULL THEN 'lands.last_sowing_date'
      ELSE                                          'crop_schedules.sowing_date'
    END;
    v_evidence := v_evidence || ARRAY['sowing_source:' || v_sow_source];
  END IF;

  IF v_schedule_method IS NOT NULL THEN
    v_evidence := v_evidence
      || ARRAY['cultivation_method:' || v_schedule_method || ':crop_schedules'];
  END IF;

  RETURN QUERY
  SELECT
    lower(coalesce(v_land.current_crop, '')),
    lower(coalesce(v_land.crop_cycle, '')),
    coalesce(v_stage_clock_method, v_schedule_method),
    NULL::text,   -- establishment_method (future extension)
    NULL::text,   -- production_system    (future extension)
    NULL::text,   -- planting_method      (future extension)
    v_land.current_crop_variety_id,
    v_sow_date,
    v_sow_source,
    v_land.transplant_date,
    v_land.current_gdd,
    v_evidence;
END;
$function$


-- Carry existing water confidence into the decision input. The 0.30 gate
-- is the existing DEPLETION_UNVERIFIED_CONFIDENCE_CAP QC value, not a newly
-- invented agronomy threshold.
CREATE OR REPLACE FUNCTION public.build_land_farm_state(p_land_id uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land record; v_phen record; v_w record; v_ndvi record;
  v_s_das_min integer; v_s_das_max integer; v_s_ref text; v_s_gdd_min numeric; v_s_gdd_max numeric;
  v_s_grace integer; v_s_moist boolean;
  v_crop text; v_day integer; v_drift integer; v_gaps text[] := '{}';
  v_water jsonb; v_thermal jsonb; v_canopy jsonb; v_obs jsonb; v_state jsonb; v_ver jsonb;
  v_alerts integer := 0; v_ndvi_val numeric; v_obs_cut timestamptz;
BEGIN
  SELECT id, tenant_id, farmer_id, current_crop, current_gdd, gdd_anchor_date, area_acres, soil_type
    INTO v_land FROM public.lands WHERE id = p_land_id;
  IF NOT FOUND OR coalesce(v_land.current_crop, '') = '' THEN RETURN NULL; END IF;

  SELECT * INTO v_phen FROM public.resolve_crop_phenology_for_land(p_land_id, p_date) LIMIT 1;
  v_crop := lower(coalesce(v_phen.crop_code, v_land.current_crop));

  IF v_phen.stage_uuid IS NULL THEN
    v_gaps := array_append(v_gaps, 'stage_unresolved');
  ELSE
    SELECT csm.das_min, csm.das_max, lower(coalesce(csm.das_reference,'sowing')), csm.gdd_min, csm.gdd_max,
           coalesce(csm.boundary_grace_days, 0), coalesce(csm.is_moisture_critical, false)
      INTO v_s_das_min, v_s_das_max, v_s_ref, v_s_gdd_min, v_s_gdd_max, v_s_grace, v_s_moist
      FROM public.crop_stage_master csm WHERE csm.id = v_phen.stage_uuid;
    v_day := CASE WHEN v_s_ref = 'transplanting' THEN v_phen.current_dat ELSE v_phen.current_das END;
    IF v_day IS NOT NULL AND v_s_das_min IS NOT NULL AND v_s_das_max IS NOT NULL THEN
      v_drift := CASE WHEN v_day BETWEEN v_s_das_min - v_s_grace AND v_s_das_max + v_s_grace THEN 0
                      WHEN v_day < v_s_das_min THEN v_day - v_s_das_min ELSE v_day - v_s_das_max END;
    END IF;
  END IF;

  SELECT * INTO v_w FROM public.land_weather_state WHERE land_id = p_land_id AND metric_date <= p_date ORDER BY metric_date DESC LIMIT 1;
  IF v_w.land_id IS NULL THEN
    v_gaps := array_append(v_gaps, 'water_state_missing');
  ELSE
    IF v_w.metric_date < p_date - 1 THEN v_gaps := array_append(v_gaps, 'water_state_stale:' || v_w.metric_date::text); END IF;
    v_water := jsonb_build_object(
      'metric_date', v_w.metric_date, 'etc_mm', v_w.etc_mm, 'et0_mm', v_w.et0_mm,
      'effective_rainfall_mm', v_w.effective_rainfall_mm, 'total_rainfall_mm', v_w.total_rainfall_mm,
      'water_deficit_mm', v_w.water_deficit_mm, 'swsi', v_w.swsi,
      'irrigation_needed', v_w.irrigation_needed, 'irrigation_urgency', v_w.irrigation_urgency,
      'water_balance_status', v_w.water_balance_status, 'confidence', v_w.confidence, 'spray_window', v_w.spray_window,
      'disease_risk_level', v_w.disease_risk_level, 'crop_stress_level', v_w.crop_stress_level,
      'kc_ndvi_adj', v_w.kc_ndvi_adj, 'source', 'land_weather_state (FAO-56)');
  END IF;

  IF v_land.current_gdd IS NULL THEN v_gaps := array_append(v_gaps, 'gdd_missing'); END IF;
  v_thermal := jsonb_build_object('current_gdd', v_land.current_gdd, 'gdd_anchor_date', v_land.gdd_anchor_date,
    'stage_gdd_min', v_s_gdd_min, 'stage_gdd_max', v_s_gdd_max,
    'progress', CASE WHEN v_land.current_gdd IS NOT NULL AND v_s_gdd_max IS NOT NULL AND v_s_gdd_max > 0
                     THEN round(least(1, v_land.current_gdd / v_s_gdd_max), 3) END);

  SELECT date, ndvi_value, mean_ndvi, confidence_score, measurement_status INTO v_ndvi
    FROM public.ndvi_data WHERE land_id = p_land_id AND date <= p_date ORDER BY date DESC LIMIT 1;
  IF v_ndvi.date IS NULL THEN
    v_gaps := array_append(v_gaps, 'ndvi_missing');
  ELSE
    v_ndvi_val := coalesce(v_ndvi.mean_ndvi, v_ndvi.ndvi_value);
    v_canopy := jsonb_build_object('date', v_ndvi.date, 'ndvi', v_ndvi_val, 'confidence', v_ndvi.confidence_score,
      'status', v_ndvi.measurement_status, 'age_days', p_date - v_ndvi.date,
      'expected_min', v_phen.expected_ndvi_min, 'expected_max', v_phen.expected_ndvi_max,
      'vs_expected', CASE WHEN v_ndvi_val IS NULL THEN NULL
        WHEN v_phen.expected_ndvi_min IS NOT NULL AND v_ndvi_val < v_phen.expected_ndvi_min THEN 'below'
        WHEN v_phen.expected_ndvi_max IS NOT NULL AND v_ndvi_val > v_phen.expected_ndvi_max THEN 'above'
        WHEN v_phen.expected_ndvi_min IS NOT NULL THEN 'within' END);
  END IF;

  IF v_land.soil_type IS NULL AND NOT EXISTS (SELECT 1 FROM public.soil_health WHERE land_id = p_land_id) THEN
    v_gaps := array_append(v_gaps, 'soil_missing');
  END IF;

  v_obs_cut := (p_date - 14)::timestamptz;
  SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) INTO v_obs FROM (
    SELECT DISTINCT ON (measurement_type) measurement_type, observation_category, observation_code,
           value, unit, value_text, observed_at, source, confidence
      FROM public.land_observation
     WHERE land_id = p_land_id AND observed_at >= v_obs_cut
     ORDER BY measurement_type, observed_at DESC) o;

  SELECT count(*) INTO v_alerts FROM public.proactive_alerts
   WHERE land_id = p_land_id AND status = 'PENDING' AND (expires_at IS NULL OR expires_at > now());

  v_ver := jsonb_build_object('engine','farm_monitoring_bridge@1.1.0','phenology_source',v_phen.source,
    'water_metric_date',(v_water->>'metric_date'),'ndvi_date',(v_canopy->>'date'),'observation_cutoff',v_obs_cut,'computed_at',now());

  v_state := jsonb_build_object(
    'land', jsonb_build_object('crop', v_crop, 'area_acres', v_land.area_acres, 'soil_type', v_land.soil_type),
    'phenology', jsonb_build_object('stage_uuid', v_phen.stage_uuid, 'stage_code', v_phen.stage_code,
       'growth_stage', v_phen.growth_stage, 'source', v_phen.source, 'confidence', v_phen.confidence,
       'das', v_phen.current_das, 'dat', v_phen.current_dat, 'drift_days', v_drift,
       'window', jsonb_build_object('das_min', v_s_das_min, 'das_max', v_s_das_max, 'anchor', v_s_ref),
       'moisture_critical', v_s_moist, 'next_stage_uuid', v_phen.next_stage_uuid,
       'expected_transition_date', v_phen.expected_transition_date, 'evidence', to_jsonb(v_phen.evidence_sources)),
    'water', v_water, 'thermal', v_thermal, 'canopy', v_canopy,
    'observations', v_obs, 'alerts_pending', v_alerts, 'gaps', to_jsonb(v_gaps), 'version', v_ver);

  INSERT INTO public.land_farm_state
    (land_id, state_date, tenant_id, farmer_id, crop_code, stage_uuid, stage_code, growth_stage,
     stage_source, stage_confidence, das, dat, stage_drift_days, stage_window,
     water, thermal, canopy, observations, alerts_pending, gaps, state, state_version, computed_at)
  VALUES (p_land_id, p_date, v_land.tenant_id, v_land.farmer_id, v_crop, v_phen.stage_uuid, v_phen.stage_code,
     v_phen.growth_stage, v_phen.source, v_phen.confidence, v_phen.current_das, v_phen.current_dat, v_drift,
     jsonb_build_object('das_min', v_s_das_min, 'das_max', v_s_das_max, 'anchor', v_s_ref, 'moisture_critical', v_s_moist),
     v_water, v_thermal, v_canopy, v_obs, v_alerts, v_gaps, v_state, v_ver, now())
  ON CONFLICT (land_id, state_date) DO UPDATE SET
     tenant_id = EXCLUDED.tenant_id, farmer_id = EXCLUDED.farmer_id, crop_code = EXCLUDED.crop_code,
     stage_uuid = EXCLUDED.stage_uuid, stage_code = EXCLUDED.stage_code, growth_stage = EXCLUDED.growth_stage,
     stage_source = EXCLUDED.stage_source, stage_confidence = EXCLUDED.stage_confidence,
     das = EXCLUDED.das, dat = EXCLUDED.dat, stage_drift_days = EXCLUDED.stage_drift_days,
     stage_window = EXCLUDED.stage_window, water = EXCLUDED.water, thermal = EXCLUDED.thermal,
     canopy = EXCLUDED.canopy, observations = EXCLUDED.observations, alerts_pending = EXCLUDED.alerts_pending,
     gaps = EXCLUDED.gaps, state = EXCLUDED.state, state_version = EXCLUDED.state_version, computed_at = now();
  RETURN v_state;
END $function$

CREATE OR REPLACE FUNCTION public.derive_farm_decisions(p_land_id uuid, p_date date DEFAULT CURRENT_DATE, p_obs_lookback_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_st record; v_ten uuid; v_far uuid; v_water jsonb; v_wdate date;
  v_moist boolean := false; v_prio text; v_al record; v_rule record; v_cat text; v_cls text;
  v_nutri_proto record; v_nutri_measure text; v_nutri_how text;
  v_due int := 0; v_watch int := 0; v_blocked int := 0; v_info int := 0;
BEGIN
  PERFORM public.build_land_farm_state(p_land_id, p_date);
  SELECT * INTO v_st FROM public.land_farm_state WHERE land_id = p_land_id AND state_date = p_date;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_state'); END IF;

  DELETE FROM public.farm_decision
   WHERE land_id = p_land_id AND decision_date = p_date
     AND status NOT IN ('DONE','MISSED','DISMISSED','EXPIRED','SUPERSEDED');

  v_ten := v_st.tenant_id; v_far := v_st.farmer_id;
  v_moist := coalesce((v_st.stage_window->>'moisture_critical')::boolean, false);
  v_water := v_st.water; v_wdate := (v_water->>'metric_date')::date;

  SELECT * INTO v_nutri_proto FROM public.observation_protocol p
   WHERE p.observation_category = 'nutrient' AND p.is_active
     AND (p.crop_code IS NULL OR p.crop_code = lower(v_st.crop_code))
   ORDER BY (p.crop_code IS NOT NULL) DESC LIMIT 1;
  v_nutri_measure := v_nutri_proto.measurement_type;
  v_nutri_how := v_nutri_proto.how_text_en;

  IF v_water IS NULL OR v_wdate IS NULL OR v_wdate < p_date - 1
     OR (v_water->>'irrigation_needed') IS NULL
     OR (v_water->>'water_balance_status') IS NULL
     OR (v_water->>'confidence') IS NULL
     OR (v_water->>'confidence')::numeric <= 0.30 THEN
    PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
      'water:no_data','water','INFO','low','NO_DATA','Water status unknown today',
      'No fresh water-balance data for this land; irrigation guidance is not available.',
      NULL, NULL, jsonb_build_object('gap','water_state_missing_or_stale','metric_date',v_wdate), 'land_weather_state', p_date);
    v_info := v_info + 1;
  ELSIF (v_water->>'irrigation_needed')::boolean THEN
    v_prio := CASE upper(coalesce(v_water->>'irrigation_urgency','MEDIUM'))
                WHEN 'CRITICAL' THEN 'critical' WHEN 'HIGH' THEN 'high' WHEN 'MEDIUM' THEN 'medium' ELSE 'low' END;
    IF v_moist THEN v_prio := CASE v_prio WHEN 'low' THEN 'medium' WHEN 'medium' THEN 'high' ELSE 'critical' END; END IF;
    PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
      'water:irrigate','water','DUE',v_prio,'IRRIGATE','Irrigate now',
      format('Root-zone water deficit %s mm today (crop water use %s mm, effective rain %s mm). Field status: %s.%s',
             coalesce(v_water->>'water_deficit_mm','?'), coalesce(v_water->>'etc_mm','?'),
             coalesce(v_water->>'effective_rainfall_mm','?'), coalesce(v_water->>'water_balance_status','?'),
             CASE WHEN v_moist THEN ' This stage is moisture-critical: do not let the field dry.' ELSE '' END),
      NULL, NULL,
      jsonb_build_object('observed', jsonb_build_object('water_deficit_mm',v_water->'water_deficit_mm','etc_mm',v_water->'etc_mm',
                     'effective_rainfall_mm',v_water->'effective_rainfall_mm','swsi',v_water->'swsi','water_balance_status',v_water->'water_balance_status'),
        'threshold','irrigation_needed = true (FAO-56 root-zone balance, RAW depletion)','urgency',v_water->'irrigation_urgency',
        'moisture_critical_stage',v_moist,'source','land_weather_state@'||v_wdate::text,'why_now','readily available water is depleted',
        'state_version', v_st.state_version),
      'land_weather_state', p_date);
    v_due := v_due + 1;
  ELSE
    PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
      'water:ok','water','INFO','low','NO_IRRIGATION','No irrigation needed today',
      format('Field water is %s. Effective rain %s mm covered crop use of %s mm.',
             lower(coalesce(v_water->>'water_balance_status','balanced')), coalesce(v_water->>'effective_rainfall_mm','0'), coalesce(v_water->>'etc_mm','?')),
      NULL, NULL,
      jsonb_build_object('observed', jsonb_build_object('water_deficit_mm',v_water->'water_deficit_mm','effective_rainfall_mm',v_water->'effective_rainfall_mm','swsi',v_water->'swsi'),
                         'threshold','irrigation_needed = false','source','land_weather_state@'||v_wdate::text,'state_version', v_st.state_version),
      'land_weather_state', p_date);
    v_info := v_info + 1;
  END IF;

  FOR v_al IN
    SELECT id, rule_id, alert_category, priority, title_en, action_text_en, message_en, trigger_data,
           decision_reasoning, risk_score, confidence, expires_at, created_at
      FROM public.proactive_alerts
     WHERE land_id = p_land_id AND status = 'PENDING' AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC
  LOOP
    v_cls := CASE
      WHEN v_al.alert_category ~* 'PEST|DISEASE|WEED|PROTECT' THEN 'protection'
      WHEN v_al.alert_category ~* 'IRRIG|WATER'               THEN 'water'
      WHEN v_al.alert_category ~* 'FERTIL|NUTR'               THEN 'nutrition'
      WHEN v_al.alert_category ~* 'STRESS'                    THEN 'stress'
      ELSE 'general' END;
    v_prio := CASE upper(coalesce(v_al.priority,'')) WHEN 'CRITICAL' THEN 'high' WHEN 'HIGH' THEN 'high'
                WHEN 'MEDIUM' THEN 'medium' ELSE 'low' END;

    IF v_cls = 'water' THEN
      CONTINUE;
    ELSIF v_cls = 'protection' THEN
      PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
        'scout:'||lower(v_al.alert_category)||':'||coalesce(v_al.rule_id,left(v_al.id::text,8)), lower(split_part(v_al.alert_category,'_',1)),
        'WATCH', v_prio, 'SCOUT_CONFIRM', coalesce(v_al.title_en,'Scout the field and confirm'),
        coalesce(v_al.message_en, v_al.action_text_en,'Conditions favour a problem.')||
          ' Walk the field, count the damage, and compare against the approved threshold. No spray is recommended automatically — confirm first.',
        v_al.rule_id, v_al.id,
        jsonb_build_object('risk_flag', v_al.alert_category, 'reasoning', v_al.decision_reasoning, 'risk_score', v_al.risk_score,
                           'confidence', v_al.confidence, 'why_not_due','chemical action requires a compiled+approved ETL and product mapping (not yet present)','source','proactive_alerts'),
        'proactive-evaluator', coalesce(v_al.expires_at::date, p_date + 3));
      v_watch := v_watch + 1;
    ELSIF v_cls = 'nutrition' THEN
      PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
        'observe:nutrient:'||coalesce(v_al.rule_id,left(v_al.id::text,8)), 'nutrient', 'WATCH', 'medium', 'OBSERVE_BEFORE_INPUT',
        'Check the crop before any top-dressing',
        coalesce(v_al.message_en, v_al.action_text_en,'A fertilizer window is near.')||
          CASE WHEN v_nutri_how IS NOT NULL THEN ' '||v_nutri_how||' Apply nitrogen only if the reading is below the approved level.'
               ELSE ' Check the approved crop-nitrogen reading first; apply only if it is below the approved level.' END,
        v_al.rule_id, v_al.id,
        jsonb_build_object('risk_flag', v_al.alert_category, 'measurement_type', v_nutri_measure,
                           'why_not_due','nutrition is applied on observed crop need, not a calendar window','source','proactive_alerts'),
        'proactive-evaluator', coalesce(v_al.expires_at::date, p_date + 3));
      v_watch := v_watch + 1;
    ELSIF v_cls = 'stress' THEN
      PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
        'observe:stress:'||coalesce(v_al.rule_id,left(v_al.id::text,8)), 'observation', 'WATCH', v_prio, 'OBSERVE',
        coalesce(v_al.title_en,'Check the crop for stress'),
        coalesce(v_al.message_en, v_al.action_text_en,'Signs of crop stress detected — inspect the field.'),
        v_al.rule_id, v_al.id, jsonb_build_object('risk_flag', v_al.alert_category, 'source','proactive_alerts'),
        'proactive-evaluator', coalesce(v_al.expires_at::date, p_date + 3));
      v_watch := v_watch + 1;
    ELSE
      PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
        'info:'||coalesce(v_al.rule_id,left(v_al.id::text,8)), 'general', 'INFO', 'low', 'INFO',
        coalesce(v_al.title_en,'Note'), coalesce(v_al.message_en, v_al.action_text_en,''),
        v_al.rule_id, v_al.id, jsonb_build_object('source','proactive_alerts'), 'proactive-evaluator', coalesce(v_al.expires_at::date, p_date + 3));
      v_info := v_info + 1;
    END IF;
  END LOOP;

  IF v_st.stage_code IS NOT NULL THEN
    FOR v_rule IN
      SELECT dr.rule_id, dr.category, dr.action_text, dr.reason_text, dr.scientific_source, dr.icar_package
        FROM public.decision_rules dr
       WHERE lower(dr.crop_code) = lower(v_st.crop_code) AND dr.is_active AND dr.trigger_class = 'CONTEXT_BLOCK'
         AND coalesce(dr.expert_approved, false)
         AND ( lower(coalesce(dr.growth_stage,'')) = lower(coalesce(v_st.growth_stage,''))
            OR EXISTS (SELECT 1 FROM unnest(dr.stage_applicable) s WHERE lower(s) IN (lower(v_st.stage_code), lower(coalesce(v_st.growth_stage,'')))) )
    LOOP
      PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
        'hold:'||v_rule.rule_id, 'safety', 'BLOCKED', 'high', 'HOLD', 'Hold this input at the current stage',
        coalesce(v_rule.action_text, v_rule.reason_text,'An approved agronomic rule blocks this input at this stage.'),
        v_rule.rule_id, NULL,
        jsonb_build_object('rule',v_rule.rule_id,'category',v_rule.category,'stage',v_st.stage_code,
                           'source',coalesce(v_rule.scientific_source, v_rule.icar_package,'decision_rules')),
        'decision_rules', p_date + 3);
      v_blocked := v_blocked + 1;
    END LOOP;
  END IF;

  IF v_st.stage_code IS NOT NULL THEN
    FOR v_rule IN
      SELECT dr.rule_id, dr.category, dr.required_observation_category, dr.measurement_method, dr.action_text, dr.forecast_horizon_days, dr.scientific_source
        FROM public.decision_rules dr
       WHERE lower(dr.crop_code) = lower(v_st.crop_code) AND dr.is_active AND dr.trigger_class = 'CONTEXT_SCHEDULE'
         AND coalesce(dr.is_farmer_servable, true) AND coalesce(dr.expert_approved, false)
         AND dr.required_observation_category IS NOT NULL AND cardinality(dr.required_observation_category) > 0
         AND ( lower(coalesce(dr.growth_stage,'')) = lower(coalesce(v_st.growth_stage,''))
            OR EXISTS (SELECT 1 FROM unnest(dr.stage_applicable) s WHERE lower(s) IN (lower(v_st.stage_code), lower(coalesce(v_st.growth_stage,'')))) )
    LOOP
      FOREACH v_cat IN ARRAY v_rule.required_observation_category LOOP
        IF NOT EXISTS (SELECT 1 FROM public.land_observation o
                        WHERE o.land_id = p_land_id AND lower(o.observation_category) = lower(v_cat)
                          AND o.observed_at >= (p_date - coalesce(v_rule.forecast_horizon_days, p_obs_lookback_days))::timestamptz) THEN
          PERFORM public.upsert_farm_decision(p_land_id, v_ten, v_far, NULL, NULL, p_date,
            'observe:'||lower(v_cat), 'observation', 'WATCH', 'medium', 'OBSERVE', 'Check '||lower(v_cat)||' in the field',
            coalesce(v_rule.measurement_method, v_rule.action_text,'Walk the field and report what you see.'), v_rule.rule_id, NULL,
            jsonb_build_object('observation_category',v_cat,
                               'measurement_type',(select measurement_type from public.observation_protocol p where p.observation_category=lower(v_cat) and (p.crop_code is null or p.crop_code=lower(v_st.crop_code)) order by (p.crop_code is not null) desc limit 1),
                               'lookback_days',coalesce(v_rule.forecast_horizon_days, p_obs_lookback_days),'rule',v_rule.rule_id,'source',coalesce(v_rule.scientific_source,'decision_rules')),
            'decision_rules', p_date + 2);
          v_watch := v_watch + 1;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'land_id', p_land_id, 'date', p_date, 'due', v_due, 'watch', v_watch,
                            'blocked', v_blocked, 'info', v_info, 'stage', v_st.stage_code, 'stage_source', v_st.stage_source, 'gaps', to_jsonb(v_st.gaps));
END $function$


-- One transaction: verified server owner → status change → execution ledger
-- → measured irrigation event (only when actual measurement was supplied).
-- Operations are idempotent; recurring cards retain their stage window.
CREATE OR REPLACE FUNCTION public.complete_schedule_task_atomic(
  p_task_id uuid,
  p_farmer_id uuid,
  p_operation_id uuid,
  p_completed boolean DEFAULT true,
  p_completed_at timestamptz DEFAULT NULL,
  p_actual_resources jsonb DEFAULT NULL,
  p_actual_cost numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_photos text[] DEFAULT NULL,
  p_weather_conditions jsonb DEFAULT NULL,
  p_difficulty_rating integer DEFAULT NULL,
  p_effectiveness_rating integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_task public.schedule_tasks%ROWTYPE;
  v_owner record;
  v_prior record;
  v_action_at timestamptz := coalesce(p_completed_at, now());
  v_recur jsonb;
  v_step integer;
  v_end_das integer;
  v_next date;
  v_closed boolean := true;
  v_applied_depth numeric;
  v_volume numeric;
  v_duration numeric;
  v_discharge numeric;
  v_payload jsonb;
BEGIN
  IF p_task_id IS NULL OR p_farmer_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'task, verified farmer and idempotency ID are required';
  END IF;
  IF v_action_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Cannot confirm a future field operation';
  END IF;
  IF p_actual_resources IS NOT NULL AND jsonb_typeof(p_actual_resources) <> 'object' THEN
    RAISE EXCEPTION 'Actual resources must be a JSON object';
  END IF;
  IF p_actual_cost IS NOT NULL AND p_actual_cost < 0 THEN
    RAISE EXCEPTION 'Actual cost cannot be negative';
  END IF;

  SELECT t.* INTO v_task
  FROM public.schedule_tasks t WHERE t.id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  SELECT s.land_id, s.sowing_date, s.is_active, s.status,
         s.farmer_id, s.tenant_id, l.farmer_id AS land_farmer,
         l.tenant_id AS land_tenant, l.active_schedule_id
    INTO v_owner
    FROM public.crop_schedules s
    JOIN public.lands l ON l.id = s.land_id
   WHERE s.id = v_task.schedule_id;
  IF NOT FOUND OR v_owner.farmer_id IS DISTINCT FROM p_farmer_id
      OR v_owner.land_farmer IS DISTINCT FROM p_farmer_id
      OR v_owner.land_tenant IS DISTINCT FROM v_owner.tenant_id
      OR v_task.farmer_id IS DISTINCT FROM p_farmer_id
      OR v_task.tenant_id IS DISTINCT FROM v_owner.tenant_id THEN
    RAISE EXCEPTION 'Task ownership mismatch';
  END IF;

  SELECT task_id, farmer_id, action INTO v_prior
    FROM public.task_completions WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_prior.task_id <> p_task_id OR v_prior.farmer_id <> p_farmer_id
       OR v_prior.action <> CASE WHEN p_completed THEN 'completed' ELSE 'unmarked' END THEN
      RAISE EXCEPTION 'Idempotency key reused for a different action';
    END IF;
    SELECT * INTO v_task FROM public.schedule_tasks WHERE id = p_task_id;
    RETURN jsonb_build_object('task',to_jsonb(v_task),'idempotent',true);
  END IF;
  IF NOT v_owner.is_active OR v_owner.status <> 'active'
     OR v_owner.active_schedule_id IS DISTINCT FROM v_task.schedule_id THEN
    RAISE EXCEPTION 'Task schedule is no longer active';
  END IF;

  IF p_completed AND v_task.status = 'completed' THEN
    RETURN jsonb_build_object('task',to_jsonb(v_task),'already_completed',true);
  END IF;
  IF NOT p_completed AND v_task.status <> 'completed' THEN
    RETURN jsonb_build_object('task',to_jsonb(v_task),'already_pending',true);
  END IF;

  v_recur := v_task.resources->'recurrence';
  IF p_completed AND v_recur IS NOT NULL AND v_owner.sowing_date IS NOT NULL
     AND (v_recur->>'interval_days') IS NOT NULL
     AND (v_recur->>'window_end') IS NOT NULL THEN
    v_step := (v_recur->>'interval_days')::integer;
    v_end_das := (v_recur->>'window_end')::integer;
    IF v_step > 0 AND v_step <= 365 AND v_end_das >= 0 THEN
      v_next := greatest(v_task.task_date, v_action_at::date) + v_step;
      IF v_next <= v_owner.sowing_date + v_end_das THEN
        v_closed := false;
      END IF;
    END IF;
  END IF;

  -- The evidence ledger is immutable. Unmark creates a reversal record.
  INSERT INTO public.task_completions(
    task_id, farmer_id, action, action_date, actual_resources, actual_cost,
    notes, photos, weather_conditions, difficulty_rating, effectiveness_rating, operation_id
  ) VALUES (
    p_task_id, p_farmer_id, CASE WHEN p_completed THEN 'completed' ELSE 'unmarked' END,
    v_action_at, CASE WHEN p_completed THEN p_actual_resources ELSE NULL END,
    CASE WHEN p_completed THEN p_actual_cost ELSE NULL END, p_notes,
    CASE WHEN p_completed THEN p_photos ELSE NULL END,
    CASE WHEN p_completed THEN p_weather_conditions ELSE NULL END,
    p_difficulty_rating,p_effectiveness_rating,p_operation_id
  );

  UPDATE public.schedule_tasks
     SET status = CASE WHEN p_completed AND v_closed THEN 'completed' ELSE 'pending' END,
         completed_at = CASE WHEN p_completed AND v_closed THEN v_action_at ELSE NULL END,
         task_date = CASE WHEN p_completed AND NOT v_closed THEN v_next ELSE task_date END,
         projected_date = CASE WHEN p_completed AND NOT v_closed THEN v_next ELSE projected_date END,
         resources = CASE WHEN p_completed AND NOT v_closed
            THEN coalesce(resources,'{}'::jsonb) ||
              jsonb_build_object('last_occurrence_completed_at',v_action_at,'next_occurrence_date',v_next)
            ELSE resources END,
         updated_at = now()
   WHERE id = p_task_id RETURNING * INTO v_task;

  -- Only ACTUAL user-entered measurement feeds the weather bucket.
  IF p_completed AND v_task.task_type = 'irrigation' AND p_actual_resources IS NOT NULL THEN
    IF (p_actual_resources ? 'applied_depth_mm')
       AND jsonb_typeof(p_actual_resources->'applied_depth_mm') = 'number' THEN
      v_applied_depth := (p_actual_resources->>'applied_depth_mm')::numeric;
    END IF;
    IF (p_actual_resources ? 'volume_litres')
       AND jsonb_typeof(p_actual_resources->'volume_litres') = 'number' THEN
      v_volume := (p_actual_resources->>'volume_litres')::numeric;
    END IF;
    IF (p_actual_resources ? 'duration_minutes')
       AND jsonb_typeof(p_actual_resources->'duration_minutes') = 'number' THEN
      v_duration := (p_actual_resources->>'duration_minutes')::numeric;
    END IF;
    IF (p_actual_resources ? 'pump_discharge_lph')
       AND jsonb_typeof(p_actual_resources->'pump_discharge_lph') = 'number' THEN
      v_discharge := (p_actual_resources->>'pump_discharge_lph')::numeric;
    END IF;
    IF coalesce(v_applied_depth,0) < 0 OR coalesce(v_volume,0) < 0
       OR coalesce(v_duration,0) < 0 OR coalesce(v_discharge,0) < 0 THEN
      RAISE EXCEPTION 'Irrigation measurements must be non-negative';
    END IF;
    IF coalesce(v_applied_depth,0) > 0 OR coalesce(v_volume,0) > 0
       OR (coalesce(v_duration,0) > 0 AND coalesce(v_discharge,0) > 0) THEN
      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'applied_depth_mm',v_applied_depth, 'volume_litres',v_volume,
        'duration_minutes',v_duration, 'pump_discharge_lph',v_discharge,
        'actual_at',v_action_at, 'task_id',p_task_id,
        'completion_operation_id',p_operation_id,
        'source','verified_farmer_task_completion'
      ));
      INSERT INTO public.crop_lifecycle_events(
        tenant_id,farmer_id,land_id,schedule_id,event_type,payload,actor
      ) VALUES (
        v_owner.tenant_id,p_farmer_id,v_owner.land_id,v_task.schedule_id,
        'IRRIGATION_APPLIED',v_payload,p_farmer_id
      );
    END IF;
  END IF;
  RETURN jsonb_build_object('task',to_jsonb(v_task),'idempotent',false,
    'recurrence_open',NOT v_closed);
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_schedule_task_atomic(
  uuid,uuid,uuid,boolean,timestamptz,jsonb,numeric,text,text[],jsonb,integer,integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_schedule_task_atomic(
  uuid,uuid,uuid,boolean,timestamptz,jsonb,numeric,text,text[],jsonb,integer,integer
) TO service_role;

COMMIT;
