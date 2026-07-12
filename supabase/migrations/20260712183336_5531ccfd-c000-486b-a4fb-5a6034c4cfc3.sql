
-- =========================================================================
-- 1. Biological Profile Builder — the ONLY node that reads lands/schedules
-- =========================================================================
CREATE OR REPLACE FUNCTION public.resolve_biological_profile(
  p_land_id uuid,
  p_as_of   date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  crop_code            text,
  crop_cycle           text,
  cultivation_method   text,
  establishment_method text,
  production_system    text,
  planting_method      text,
  variety_id           uuid,
  sowing_date          date,
  sowing_source        text,
  transplant_date      date,
  current_gdd          numeric,
  evidence             text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_land              record;
  v_schedule_sow_date date;
  v_schedule_method   text;
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

  SELECT cs.sowing_date, lower(nullif(cs.cultivation_method, ''))
    INTO v_schedule_sow_date, v_schedule_method
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
    v_schedule_method,
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
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_biological_profile(uuid, date)
  TO authenticated, service_role;

-- =========================================================================
-- 2. Pure Phenology Resolver — no knowledge of lands or crop_schedules
-- =========================================================================
DROP FUNCTION IF EXISTS public.resolve_crop_phenology(uuid, date);
DROP FUNCTION IF EXISTS public.resolve_crop_phenology(text, text, text, uuid, date, date, numeric, date, uuid);

CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(
  p_crop_code          text,
  p_crop_cycle         text,
  p_cultivation_method text,
  p_variety_id         uuid,
  p_sow_date           date,
  p_transplant_date    date,
  p_current_gdd        numeric,
  p_as_of              date DEFAULT CURRENT_DATE,
  p_land_id            uuid DEFAULT NULL
)
RETURNS TABLE (
  stage_uuid                uuid,
  stage_code                text,
  growth_stage              text,
  crop_code                 text,
  crop_cycle                text,
  cultivation_method        text,
  previous_stage_uuid       uuid,
  next_stage_uuid           uuid,
  expected_transition_date  date,
  reference_system          text,
  phenology_model           text,
  current_das               integer,
  current_dat               integer,
  current_gdd               numeric,
  expected_height_cm_min    numeric,
  expected_height_cm_max    numeric,
  expected_leaf_count_min   integer,
  expected_leaf_count_max   integer,
  expected_ndvi_min         numeric,
  expected_ndvi_max         numeric,
  phenology_index           numeric,
  confidence                numeric,
  evidence_sources          text[],
  source                    text,
  resolver_version          integer
)
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
  v_confidence         numeric := 0.75;
  v_variety_source     text;
  v_gdd_target         numeric;
  v_phen_index         numeric;
  v_transition_match   record;
  v_new_stage          record;
BEGIN
  IF v_crop_code = '' OR p_sow_date IS NULL THEN RETURN; END IF;

  v_das := (p_as_of - p_sow_date);
  v_dat := CASE WHEN p_transplant_date IS NOT NULL THEN (p_as_of - p_transplant_date) END;

  IF v_cultivation_method IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY['cultivation_method:' || v_cultivation_method];
  END IF;

  -- Biological stage lookup.
  -- NULL cultivation_method rows are excluded at runtime (treated as data quality issue).
  -- Only exact match or explicit 'any' qualifies.
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
        v_confidence := greatest(v_confidence, coalesce(v_transition_match.match_confidence, 0.85));
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

  -- Prev stage — same NULL exclusion
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

  -- Next stage — same NULL exclusion
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
    'crop_stage_ssot'::text,
    7;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_crop_phenology(
  text, text, text, uuid, date, date, numeric, date, uuid
) TO authenticated, service_role;

-- =========================================================================
-- 3. Backwards-compatible orchestrator wrapper
-- =========================================================================
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology_for_land(
  p_land_id uuid,
  p_as_of   date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  stage_uuid                uuid,
  stage_code                text,
  growth_stage              text,
  crop_code                 text,
  crop_cycle                text,
  cultivation_method        text,
  previous_stage_uuid       uuid,
  next_stage_uuid           uuid,
  expected_transition_date  date,
  reference_system          text,
  phenology_model           text,
  current_das               integer,
  current_dat               integer,
  current_gdd               numeric,
  expected_height_cm_min    numeric,
  expected_height_cm_max    numeric,
  expected_leaf_count_min   integer,
  expected_leaf_count_max   integer,
  expected_ndvi_min         numeric,
  expected_ndvi_max         numeric,
  phenology_index           numeric,
  confidence                numeric,
  evidence_sources          text[],
  source                    text,
  resolver_version          integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bp record;
BEGIN
  SELECT * INTO v_bp
    FROM public.resolve_biological_profile(p_land_id, p_as_of);

  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT * FROM public.resolve_crop_phenology(
    v_bp.crop_code,
    v_bp.crop_cycle,
    v_bp.cultivation_method,
    v_bp.variety_id,
    v_bp.sowing_date,
    v_bp.transplant_date,
    v_bp.current_gdd,
    p_as_of,
    p_land_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_crop_phenology_for_land(uuid, date)
  TO authenticated, service_role;

-- =========================================================================
-- 4. Data-quality view — surfaces rows that will no longer match at runtime
-- =========================================================================
CREATE OR REPLACE VIEW public.v_crop_stage_master_null_method AS
SELECT id, crop_code, stage_code, growth_stage, crop_cycle, das_min, das_max
FROM public.crop_stage_master
WHERE is_active AND cultivation_method IS NULL;

GRANT SELECT ON public.v_crop_stage_master_null_method TO authenticated, service_role;
