CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(p_land_id uuid, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS TABLE(stage_uuid uuid, stage_code text, growth_stage text, crop_code text, crop_cycle text, previous_stage_uuid uuid, next_stage_uuid uuid, expected_transition_date date, reference_system text, phenology_model text, current_das integer, current_dat integer, current_gdd numeric, expected_height_cm_min numeric, expected_height_cm_max numeric, expected_leaf_count_min integer, expected_leaf_count_max integer, expected_ndvi_min numeric, expected_ndvi_max numeric, phenology_index numeric, confidence numeric, evidence_sources text[], source text, resolver_version integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land               record;
  v_crop_code          text;
  v_crop_cycle         text;
  v_variety_id         uuid;
  v_sow_date           date;
  v_schedule_sow_date  date;
  v_sow_source         text;
  v_transplant_date    date;
  v_das                integer;
  v_dat                integer;
  v_stage              record;
  v_vpp                record;
  v_prev               uuid;
  v_next               uuid;
  v_next_das_min       integer;
  v_evidence           text[] := ARRAY[]::text[];
  v_confidence         numeric := 0.75;
  v_variety_source     text;
  v_current_gdd        numeric;
  v_gdd_target         numeric;
  v_phen_index         numeric;
  v_transition_match   record;
  v_new_stage          record;
BEGIN
  SELECT l.id, l.current_crop, l.crop_cycle, l.current_crop_variety_id,
         l.planting_date, l.last_sowing_date, l.transplant_date, l.current_gdd
    INTO v_land
    FROM public.lands l
   WHERE l.id = p_land_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_crop_code       := lower(coalesce(v_land.current_crop, ''));
  v_crop_cycle      := lower(coalesce(v_land.crop_cycle, ''));
  v_variety_id      := v_land.current_crop_variety_id;
  v_transplant_date := v_land.transplant_date;
  v_current_gdd     := v_land.current_gdd;

  -- SSOT sowing-date resolution: prefer authoritative lands fields, then fall
  -- back to the active crop_schedules row so BiologicalState can be built for
  -- lands whose planting_date/last_sowing_date have not been backfilled.
  SELECT cs.sowing_date
    INTO v_schedule_sow_date
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

  IF v_crop_code = '' OR v_sow_date IS NULL THEN RETURN; END IF;

  v_das := (p_as_of - v_sow_date);
  v_dat := CASE WHEN v_transplant_date IS NOT NULL THEN (p_as_of - v_transplant_date) END;

  SELECT csm.* INTO v_stage
    FROM public.crop_stage_master csm
   WHERE csm.is_active
     AND lower(csm.crop_code) = v_crop_code
     AND (
           v_crop_cycle = ''
        OR coalesce(lower(csm.crop_cycle),'') = ''
        OR lower(csm.crop_cycle) = v_crop_cycle
     )
     AND coalesce(csm.stage_node_type,'') NOT IN ('operational','alias')
     AND v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999)
   ORDER BY (lower(csm.crop_cycle) = v_crop_cycle) DESC NULLS LAST,
            (coalesce(csm.stage_node_type,'') = 'biological') DESC,
            csm.das_min ASC
   LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

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
      v_confidence := greatest(v_confidence, coalesce(v_transition_match.match_confidence, 0.85));
      v_stage := v_new_stage;
    END IF;
  END IF;

  IF v_variety_id IS NOT NULL THEN
    SELECT vpp.* INTO v_vpp
      FROM public.variety_phenology_profile vpp
     WHERE vpp.is_active
       AND lower(vpp.crop_code) = v_crop_code
       AND vpp.variety_id = v_variety_id
       AND vpp.stage_uuid = v_stage.id
     ORDER BY (lower(coalesce(vpp.crop_cycle,'')) = v_crop_cycle) DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      v_variety_source := 'variety_profile:' || v_variety_id::text;
      v_confidence := greatest(v_confidence, 0.90);
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
     AND coalesce(csm.stage_node_type,'') NOT IN ('operational','alias')
     AND csm.das_min IS NOT NULL
     AND csm.das_min > coalesce(v_stage.das_max, 9999)
   ORDER BY csm.das_min ASC
   LIMIT 1;

  IF v_current_gdd IS NOT NULL AND v_stage.gdd_max IS NOT NULL AND v_stage.gdd_max > 0 THEN
    v_gdd_target := v_stage.gdd_max;
    v_phen_index := least(1.0, greatest(0.0, v_current_gdd / v_gdd_target));
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
    v_prev,
    v_next,
    CASE WHEN v_next_das_min IS NOT NULL THEN (v_sow_date + v_next_das_min) END,
    coalesce(v_stage.reference_system, 'BBCH'),
    coalesce(v_stage.phenology_model, 'crop_stage_master'),
    v_das,
    v_dat,
    v_current_gdd,
    coalesce(v_vpp.expected_height_cm_min, v_stage.expected_height_cm_min),
    coalesce(v_vpp.expected_height_cm_max, v_stage.expected_height_cm_max),
    coalesce(v_vpp.expected_leaf_count_min, v_stage.expected_leaf_count_min),
    coalesce(v_vpp.expected_leaf_count_max, v_stage.expected_leaf_count_max),
    coalesce(v_vpp.expected_ndvi_min, v_stage.expected_ndvi_min),
    coalesce(v_vpp.expected_ndvi_max, v_stage.expected_ndvi_max),
    v_phen_index,
    v_confidence,
    v_evidence,
    'crop_stage_ssot'::text,
    5;
END;
$function$;