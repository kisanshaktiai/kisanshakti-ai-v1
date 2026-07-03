
-- =========================================================
-- Phase E — stage_transition_conditions (DB-only)
-- =========================================================

-- ---------------------------------------------------------
-- 1. stage_transition_conditions table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stage_transition_conditions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code         text NOT NULL,
  crop_cycle        text,
  from_stage_uuid   uuid NOT NULL REFERENCES public.crop_stage_master(id) ON DELETE CASCADE,
  to_stage_uuid     uuid NOT NULL REFERENCES public.crop_stage_master(id) ON DELETE CASCADE,
  trigger_type      text NOT NULL CHECK (trigger_type IN ('das','dat','gdd','observation','event','composite')),
  trigger_config    jsonb NOT NULL DEFAULT '{}'::jsonb,
  combinator        text NOT NULL DEFAULT 'ALL' CHECK (combinator IN ('ANY','ALL')),
  priority          int  NOT NULL DEFAULT 100,
  confidence        numeric NOT NULL DEFAULT 0.85,
  source            text,
  notes             text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (from_stage_uuid <> to_stage_uuid)
);

CREATE INDEX IF NOT EXISTS idx_stc_from_stage
  ON public.stage_transition_conditions(from_stage_uuid) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_stc_crop
  ON public.stage_transition_conditions(crop_code, coalesce(crop_cycle,'')) WHERE is_active;

GRANT SELECT ON public.stage_transition_conditions TO anon, authenticated;
GRANT ALL    ON public.stage_transition_conditions TO service_role;

ALTER TABLE public.stage_transition_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read transition rules" ON public.stage_transition_conditions;
CREATE POLICY "Anyone can read transition rules"
  ON public.stage_transition_conditions FOR SELECT
  USING (is_active);

DROP POLICY IF EXISTS "Service role manages transition rules" ON public.stage_transition_conditions;
CREATE POLICY "Service role manages transition rules"
  ON public.stage_transition_conditions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.stc_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_stc_touch ON public.stage_transition_conditions;
CREATE TRIGGER trg_stc_touch
  BEFORE UPDATE ON public.stage_transition_conditions
  FOR EACH ROW EXECUTE FUNCTION public.stc_touch_updated_at();

-- ---------------------------------------------------------
-- 2. stage_transition_log audit table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stage_transition_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id           uuid NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  from_stage_uuid   uuid REFERENCES public.crop_stage_master(id),
  to_stage_uuid     uuid REFERENCES public.crop_stage_master(id),
  rule_id           uuid REFERENCES public.stage_transition_conditions(id) ON DELETE SET NULL,
  trigger_type      text,
  confidence        numeric,
  evidence          jsonb,
  evaluated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stl_land_time
  ON public.stage_transition_log(land_id, evaluated_at DESC);

GRANT SELECT ON public.stage_transition_log TO authenticated;
GRANT ALL    ON public.stage_transition_log TO service_role;

ALTER TABLE public.stage_transition_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Farmers read own land transitions" ON public.stage_transition_log;
CREATE POLICY "Farmers read own land transitions"
  ON public.stage_transition_log FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lands l WHERE l.id = stage_transition_log.land_id AND l.farmer_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service role writes transition log" ON public.stage_transition_log;
CREATE POLICY "Service role writes transition log"
  ON public.stage_transition_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------
-- 3. Condition evaluator (single condition)
-- trigger_config schema per type:
--   das/dat:  { "min": <int>, "max": <int?> }
--   gdd:      { "min": <numeric>, "max": <numeric?> }
--   observation: { "code": "<OBSERVATION_CODE>", "within_days": <int?> }
--   event:    { "event_type": "<STRING>", "within_days": <int?> }
--   composite: { "conditions": [ { "type": "...", ... }, ... ] }
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stc_eval_single(
  p_type      text,
  p_cfg       jsonb,
  p_land_id   uuid,
  p_das       int,
  p_dat       int,
  p_gdd       numeric
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min      numeric;
  v_max      numeric;
  v_code     text;
  v_within   int;
  v_event    text;
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
         AND upper(cle.event_type) = upper(v_event)
         AND (v_within IS NULL OR cle.created_at >= now() - make_interval(days => v_within))
    );
  END IF;

  RETURN false;
END $$;

-- ---------------------------------------------------------
-- 4. evaluate_stage_transitions() — returns matched rules for land
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_stage_transitions(
  p_land_id       uuid,
  p_from_stage    uuid DEFAULT NULL
) RETURNS TABLE (
  rule_id         uuid,
  from_stage_uuid uuid,
  to_stage_uuid   uuid,
  trigger_type    text,
  priority        int,
  confidence      numeric,
  matched         boolean,
  evidence        jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_land     record;
  v_crop     text;
  v_cycle    text;
  v_das      int;
  v_dat      int;
  v_gdd      numeric;
  v_rule     record;
  v_cond     jsonb;
  v_ok       boolean;
  v_all_ok   boolean;
  v_any_ok   boolean;
  v_child_ok boolean;
  v_from     uuid;
BEGIN
  SELECT id, current_crop, crop_cycle, planting_date, last_sowing_date,
         transplant_date, current_gdd
    INTO v_land
    FROM public.lands WHERE id = p_land_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_crop  := upper(coalesce(v_land.current_crop,''));
  v_cycle := lower(coalesce(v_land.crop_cycle,''));
  v_gdd   := v_land.current_gdd;
  v_das   := CASE WHEN coalesce(v_land.planting_date, v_land.last_sowing_date) IS NOT NULL
                  THEN (current_date - coalesce(v_land.planting_date, v_land.last_sowing_date)) END;
  v_dat   := CASE WHEN v_land.transplant_date IS NOT NULL
                  THEN (current_date - v_land.transplant_date) END;

  IF p_from_stage IS NULL THEN
    v_from := (SELECT (r).stage_uuid FROM public.resolve_crop_phenology(p_land_id) r LIMIT 1);
  ELSE
    v_from := p_from_stage;
  END IF;

  IF v_from IS NULL THEN RETURN; END IF;

  FOR v_rule IN
    SELECT *
      FROM public.stage_transition_conditions
     WHERE is_active
       AND crop_code = v_crop
       AND coalesce(crop_cycle,'') IN (v_cycle, '')
       AND from_stage_uuid = v_from
     ORDER BY priority DESC, created_at ASC
  LOOP
    IF v_rule.trigger_type = 'composite' THEN
      v_all_ok := true;
      v_any_ok := false;
      FOR v_cond IN SELECT jsonb_array_elements(coalesce(v_rule.trigger_config->'conditions','[]'::jsonb))
      LOOP
        v_child_ok := public.stc_eval_single(
          v_cond->>'type', v_cond, p_land_id, v_das, v_dat, v_gdd
        );
        v_all_ok := v_all_ok AND v_child_ok;
        v_any_ok := v_any_ok OR v_child_ok;
      END LOOP;
      v_ok := CASE WHEN v_rule.combinator = 'ANY' THEN v_any_ok ELSE v_all_ok END;
    ELSE
      v_ok := public.stc_eval_single(
        v_rule.trigger_type, v_rule.trigger_config, p_land_id, v_das, v_dat, v_gdd
      );
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
      'trigger_config', v_rule.trigger_config
    );
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.evaluate_stage_transitions(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.evaluate_stage_transitions(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------
-- 5. apply_stage_transitions() — records matched transition to audit log
--    (does NOT mutate lands.stage_uuid; resolver v5 reads log opportunistically)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stage_transitions(p_land_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match  record;
  v_logged uuid;
BEGIN
  SELECT *
    INTO v_match
    FROM public.evaluate_stage_transitions(p_land_id)
   WHERE matched
   ORDER BY priority DESC
   LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.stage_transition_log
    (land_id, from_stage_uuid, to_stage_uuid, rule_id, trigger_type, confidence, evidence)
  VALUES
    (p_land_id, v_match.from_stage_uuid, v_match.to_stage_uuid,
     v_match.rule_id, v_match.trigger_type, v_match.confidence, v_match.evidence)
  RETURNING to_stage_uuid INTO v_logged;

  RETURN v_logged;
END $$;

REVOKE ALL ON FUNCTION public.apply_stage_transitions(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_stage_transitions(uuid) TO service_role;

-- ---------------------------------------------------------
-- 6. resolve_crop_phenology → v5
--    After base-stage resolution, check whether a higher-priority rule
--    fires that advances the current stage. If so, adopt the to_stage.
-- ---------------------------------------------------------
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
  SELECT id, current_crop, crop_cycle, current_crop_variety_id,
         planting_date, last_sowing_date, transplant_date, current_gdd
    INTO v_land
    FROM public.lands WHERE id = p_land_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_crop_code       := upper(coalesce(v_land.current_crop, ''));
  v_crop_cycle      := lower(coalesce(v_land.crop_cycle, ''));
  v_variety_id      := v_land.current_crop_variety_id;
  v_sow_date        := coalesce(v_land.planting_date, v_land.last_sowing_date);
  v_transplant_date := v_land.transplant_date;
  v_current_gdd     := v_land.current_gdd;

  IF v_crop_code = '' OR v_sow_date IS NULL THEN RETURN; END IF;

  v_das := (p_as_of - v_sow_date);
  v_dat := CASE WHEN v_transplant_date IS NOT NULL THEN (p_as_of - v_transplant_date) END;

  SELECT * INTO v_stage
    FROM public.crop_stage_master
   WHERE is_active
     AND crop_code = v_crop_code
     AND coalesce(crop_cycle,'') IN (v_crop_cycle, '')
     AND stage_node_type IS DISTINCT FROM 'operational'
     AND v_das BETWEEN coalesce(das_min, 0) AND coalesce(das_max, 9999)
   ORDER BY (crop_cycle = v_crop_cycle) DESC NULLS LAST, das_min ASC
   LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- ─── Phase E: transition override ─────────────────────────────────────
  -- Check highest-priority matched rule leaving this stage. If found,
  -- adopt the to_stage as the resolved stage.
  SELECT rule_id, to_stage_uuid, confidence, trigger_type
    INTO v_transition_match
    FROM public.evaluate_stage_transitions(p_land_id, v_stage.id)
   WHERE matched
   ORDER BY priority DESC
   LIMIT 1;

  IF v_transition_match.to_stage_uuid IS NOT NULL THEN
    SELECT * INTO v_new_stage
      FROM public.crop_stage_master WHERE id = v_transition_match.to_stage_uuid;
    IF FOUND THEN
      v_evidence := v_evidence || ARRAY[
        'transition_rule:' || v_transition_match.rule_id::text,
        'transition_trigger:' || v_transition_match.trigger_type
      ];
      v_confidence := greatest(v_confidence, coalesce(v_transition_match.confidence, 0.85));
      v_stage := v_new_stage;
    END IF;
  END IF;

  -- Variety override lookup for (possibly new) v_stage
  IF v_variety_id IS NOT NULL THEN
    SELECT * INTO v_vpp
      FROM public.variety_phenology_profile
     WHERE is_active
       AND crop_code = v_crop_code
       AND variety_id = v_variety_id
       AND stage_uuid = v_stage.id
       AND coalesce(crop_cycle,'') IN (v_crop_cycle, '')
     ORDER BY (crop_cycle = v_crop_cycle) DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      v_variety_source := 'variety_profile:' || v_variety_id::text;
      v_confidence := greatest(v_confidence, 0.90);
    END IF;
  END IF;

  IF v_vpp IS NULL THEN
    SELECT * INTO v_vpp
      FROM public.variety_phenology_profile
     WHERE is_active
       AND crop_code = v_crop_code
       AND variety_id IS NULL
       AND stage_uuid = v_stage.id
       AND coalesce(crop_cycle,'') IN (v_crop_cycle, '')
     ORDER BY (crop_cycle = v_crop_cycle) DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      v_variety_source := 'crop_default_profile';
      v_confidence := greatest(v_confidence, 0.80);
    END IF;
  END IF;

  v_prev := v_stage.prev_stage_id;
  v_next := v_stage.next_stage_id;

  SELECT das_min INTO v_next_das_min FROM public.crop_stage_master WHERE id = v_next;

  v_evidence := v_evidence || ARRAY['crop_stage_master:' || v_stage.id::text];
  v_evidence := v_evidence || ARRAY['das:' || v_das::text];
  IF v_dat IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY['dat:' || v_dat::text];
  END IF;
  IF v_variety_source IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY[v_variety_source];
  END IF;
  IF v_current_gdd IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY['gdd:' || round(v_current_gdd,1)::text];
  END IF;

  v_gdd_target := v_vpp.gdd_target;
  IF v_gdd_target IS NOT NULL AND v_gdd_target > 0 AND v_current_gdd IS NOT NULL THEN
    v_phen_index := least(1.0, greatest(0.0, v_current_gdd / v_gdd_target));
    v_evidence := v_evidence || ARRAY['phen_source:gdd_target'];
  ELSE
    v_phen_index := v_stage.phenology_index;
  END IF;

  RETURN QUERY SELECT
    v_stage.id,
    v_stage.stage_code,
    v_stage.growth_stage,
    v_crop_code,
    coalesce(nullif(v_crop_cycle,''), v_stage.crop_cycle),
    v_prev,
    v_next,
    (v_sow_date + coalesce(v_next_das_min, coalesce(v_stage.das_max, v_das) + 1))::date,
    v_stage.reference_system,
    coalesce(v_vpp.phenology_model_override, v_stage.phenology_model),
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
    CASE
      WHEN v_transition_match.to_stage_uuid IS NOT NULL THEN 'transition_rule_ssot'
      WHEN v_variety_source IS NOT NULL THEN 'variety_phenology_ssot'
      ELSE 'crop_stage_ssot'
    END,
    5;
END;
$function$;
