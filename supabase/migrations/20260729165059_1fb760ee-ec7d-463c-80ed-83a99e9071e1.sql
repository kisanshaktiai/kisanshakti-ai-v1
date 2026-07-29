
CREATE OR REPLACE FUNCTION public.stc_eval_single(
  p_type text,
  p_cfg jsonb,
  p_land_id uuid,
  p_das integer,
  p_dat integer,
  p_gdd numeric
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_min      numeric;
  v_max      numeric;
  v_code     text;
  v_within   int;
  v_event    text;
  v_stage    uuid;
  v_conf     numeric;
BEGIN
  IF p_cfg IS NULL THEN RETURN false; END IF;

  IF p_type = 'das' THEN
    v_min := (p_cfg->>'min')::numeric;
    v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_das IS NULL THEN RETURN false; END IF;
    IF v_min IS NOT NULL AND p_das < v_min THEN RETURN false; END IF;
    IF v_max IS NOT NULL AND p_das > v_max THEN RETURN false; END IF;
    RETURN true;

  ELSIF p_type = 'dat' THEN
    v_min := (p_cfg->>'min')::numeric;
    v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_dat IS NULL THEN RETURN false; END IF;
    IF v_min IS NOT NULL AND p_dat < v_min THEN RETURN false; END IF;
    IF v_max IS NOT NULL AND p_dat > v_max THEN RETURN false; END IF;
    RETURN true;

  ELSIF p_type = 'gdd' THEN
    v_min := (p_cfg->>'min')::numeric;
    v_max := NULLIF(p_cfg->>'max','')::numeric;
    IF p_gdd IS NULL THEN RETURN false; END IF;
    IF v_min IS NOT NULL AND p_gdd < v_min THEN RETURN false; END IF;
    IF v_max IS NOT NULL AND p_gdd > v_max THEN RETURN false; END IF;
    RETURN true;

  ELSIF p_type = 'observation' THEN
    v_code   := p_cfg->>'code';
    v_within := NULLIF(p_cfg->>'within_days','')::int;
    IF v_code IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.crop_lifecycle_events cle
       WHERE cle.land_id = p_land_id
         AND upper(cle.event_type) = upper(v_code)
         AND (v_within IS NULL OR cle.created_at >= now() - make_interval(days => v_within))
    );

  ELSIF p_type = 'event' THEN
    v_event  := p_cfg->>'event_type';
    v_within := NULLIF(p_cfg->>'within_days','')::int;
    IF v_event IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.crop_lifecycle_events cle
       WHERE cle.land_id = p_land_id
         AND (upper(cle.event_type) = upper(v_event)
              OR upper(coalesce(cle.to_status,'')) = upper(v_event))
         AND (v_within IS NULL OR cle.created_at >= now() - make_interval(days => v_within))
    );

  ELSIF p_type = 'morphology_stage' THEN
    v_stage  := NULLIF(p_cfg->>'stage_uuid','')::uuid;
    v_code   := p_cfg->>'stage_code';
    v_within := coalesce(NULLIF(p_cfg->>'within_days','')::int, 21);
    v_conf   := coalesce(NULLIF(p_cfg->>'min_confidence','')::numeric, 0.6);
    IF v_stage IS NULL AND v_code IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.crop_growth_analysis cga
       WHERE cga.land_id = p_land_id
         AND cga.detected_growth_stage IS NOT NULL
         AND cga.created_at >= now() - make_interval(days => v_within)
         AND coalesce(cga.confidence_score, 1) >= v_conf
         AND (
              upper(regexp_replace(cga.detected_growth_stage, '[^a-zA-Z0-9]+', '_', 'g'))
                = upper(coalesce(v_code, ''))
           OR EXISTS (
                SELECT 1 FROM public.crop_stage_master csm
                 WHERE csm.id = v_stage
                   AND upper(regexp_replace(cga.detected_growth_stage, '[^a-zA-Z0-9]+', '_', 'g'))
                       = upper(regexp_replace(coalesce(csm.growth_stage,''), '[^a-zA-Z0-9]+', '_', 'g'))
              )
           OR EXISTS (
                SELECT 1 FROM public.crop_stage_aliases csa
                 WHERE csa.canonical_id = v_stage
                   AND upper(regexp_replace(csa.alias_text, '[^a-zA-Z0-9]+', '_', 'g'))
                       = upper(regexp_replace(cga.detected_growth_stage, '[^a-zA-Z0-9]+', '_', 'g'))
              )
         )
    );

  ELSIF p_type = 'ndvi' THEN
    v_min    := NULLIF(p_cfg->>'min','')::numeric;
    v_max    := NULLIF(p_cfg->>'max','')::numeric;
    v_within := coalesce(NULLIF(p_cfg->>'within_days','')::int, 21);
    RETURN EXISTS (
      SELECT 1
        FROM public.ndvi_data nd
       WHERE nd.land_id = p_land_id
         AND nd.date >= current_date - v_within
         AND coalesce(nd.mean_ndvi, nd.ndvi_value) IS NOT NULL
         AND (v_min IS NULL OR coalesce(nd.mean_ndvi, nd.ndvi_value) >= v_min)
         AND (v_max IS NULL OR coalesce(nd.mean_ndvi, nd.ndvi_value) <= v_max)
    );
  END IF;

  RETURN false;
END;
$fn$;

ALTER TABLE public.stage_transition_conditions
  DROP CONSTRAINT IF EXISTS stage_transition_conditions_trigger_type_check;
ALTER TABLE public.stage_transition_conditions
  ADD CONSTRAINT stage_transition_conditions_trigger_type_check
  CHECK (trigger_type = ANY (ARRAY['das','dat','gdd','observation','event','composite','morphology_stage','ndvi']));

CREATE OR REPLACE FUNCTION public.derive_biological_stage_transitions(
  p_crop_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_morph int := 0;
  v_event int := 0;
  v_ndvi  int := 0;
  v_gdd   int := 0;
BEGIN
  CREATE TEMP TABLE _seq ON COMMIT DROP AS
  SELECT csm.id,
         lower(csm.crop_code) AS crop_code,
         NULLIF(NULLIF(NULLIF(lower(coalesce(csm.crop_cycle,'')),''),'universal'),'any') AS crop_cycle,
         lower(csm.cultivation_method) AS cultivation_method,
         lead(csm.id)                    OVER w AS next_id,
         lead(csm.stage_code)            OVER w AS next_stage_code,
         lead(csm.gdd_min)               OVER w AS next_gdd_min,
         lead(csm.expected_ndvi_min)     OVER w AS next_ndvi_min,
         lead(csm.expected_ndvi_max)     OVER w AS next_ndvi_max
    FROM public.crop_stage_master csm
   WHERE csm.is_active
     AND coalesce(csm.stage_node_type,'') NOT IN ('operational','alias')
     AND (p_crop_code IS NULL OR lower(csm.crop_code) = lower(p_crop_code))
  WINDOW w AS (
    PARTITION BY lower(csm.crop_code), lower(coalesce(csm.crop_cycle,'')), lower(csm.cultivation_method)
    ORDER BY coalesce(csm.das_min, 0) ASC, coalesce(csm.phenology_index, 0) ASC
  );

  WITH ins AS (
    INSERT INTO public.stage_transition_conditions(
      crop_code, crop_cycle, from_stage_uuid, to_stage_uuid,
      trigger_type, trigger_config, combinator, priority, confidence, source, notes, is_active)
    SELECT s.crop_code, s.crop_cycle, s.id, s.next_id,
           'morphology_stage',
           jsonb_build_object('stage_uuid', s.next_id, 'stage_code', s.next_stage_code,
                              'within_days', 21, 'min_confidence', 0.6),
           'ALL', 300, 0.95,
           'derived:crop_growth_analysis.detected_growth_stage',
           'S4b biological morphology trigger (' || s.cultivation_method || ')', true
      FROM _seq s
     WHERE s.next_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.stage_transition_conditions x
                        WHERE x.from_stage_uuid = s.id AND x.to_stage_uuid = s.next_id
                          AND x.trigger_type = 'morphology_stage')
    RETURNING 1)
  SELECT count(*) INTO v_morph FROM ins;

  WITH ins AS (
    INSERT INTO public.stage_transition_conditions(
      crop_code, crop_cycle, from_stage_uuid, to_stage_uuid,
      trigger_type, trigger_config, combinator, priority, confidence, source, notes, is_active)
    SELECT s.crop_code, s.crop_cycle, s.id, s.next_id,
           'event',
           jsonb_build_object('event_type', s.next_stage_code, 'within_days', 30),
           'ALL', 280, 0.90,
           'derived:crop_lifecycle_events.event_type',
           'S4b field-event trigger (' || s.cultivation_method || ')', true
      FROM _seq s
     WHERE s.next_id IS NOT NULL
       AND s.next_stage_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.stage_transition_conditions x
                        WHERE x.from_stage_uuid = s.id AND x.to_stage_uuid = s.next_id
                          AND x.trigger_type = 'event')
    RETURNING 1)
  SELECT count(*) INTO v_event FROM ins;

  WITH ins AS (
    INSERT INTO public.stage_transition_conditions(
      crop_code, crop_cycle, from_stage_uuid, to_stage_uuid,
      trigger_type, trigger_config, combinator, priority, confidence, source, notes, is_active)
    SELECT s.crop_code, s.crop_cycle, s.id, s.next_id,
           'gdd', jsonb_build_object('min', s.next_gdd_min),
           'ALL', 200, 0.88,
           'derived:crop_stage_master.gdd_min',
           'S4b thermal trigger (' || s.cultivation_method || ')', true
      FROM _seq s
     WHERE s.next_id IS NOT NULL AND s.next_gdd_min IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.stage_transition_conditions x
                        WHERE x.from_stage_uuid = s.id AND x.to_stage_uuid = s.next_id
                          AND x.trigger_type = 'gdd')
    RETURNING 1)
  SELECT count(*) INTO v_gdd FROM ins;

  WITH ins AS (
    INSERT INTO public.stage_transition_conditions(
      crop_code, crop_cycle, from_stage_uuid, to_stage_uuid,
      trigger_type, trigger_config, combinator, priority, confidence, source, notes, is_active)
    SELECT s.crop_code, s.crop_cycle, s.id, s.next_id,
           'ndvi',
           jsonb_strip_nulls(jsonb_build_object('min', s.next_ndvi_min, 'max', s.next_ndvi_max,
                                                'within_days', 21)),
           'ALL', 220, 0.85,
           'derived:crop_stage_master.expected_ndvi',
           'S4b canopy greenness trigger (' || s.cultivation_method || ')', true
      FROM _seq s
     WHERE s.next_id IS NOT NULL AND s.next_ndvi_min IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.stage_transition_conditions x
                        WHERE x.from_stage_uuid = s.id AND x.to_stage_uuid = s.next_id
                          AND x.trigger_type = 'ndvi')
    RETURNING 1)
  SELECT count(*) INTO v_ndvi FROM ins;

  DROP TABLE IF EXISTS _seq;

  RETURN jsonb_build_object('ok', true, 'morphology', v_morph, 'event', v_event,
                            'gdd', v_gdd, 'ndvi', v_ndvi,
                            'crop_code', coalesce(p_crop_code, 'ALL'));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.derive_biological_stage_transitions(text) TO service_role;

SELECT public.derive_biological_stage_transitions(NULL);
