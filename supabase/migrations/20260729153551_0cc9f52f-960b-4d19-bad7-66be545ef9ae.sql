
-- ============================================================
-- S4: Autonomous stage initialization + derived transition policy
-- ============================================================

-- 1) Normalize 'universal' crop_cycle to NULL so cycle-agnostic rules match any land
UPDATE public.stage_transition_conditions
   SET crop_cycle = NULL, updated_at = now()
 WHERE lower(coalesce(crop_cycle,'')) IN ('universal','any','all');

-- 2) Make cycle matching tolerant of 'universal'/'any' markers
CREATE OR REPLACE FUNCTION public.evaluate_stage_transitions(
  p_land_id uuid,
  p_from_stage uuid DEFAULT NULL
)
RETURNS TABLE(
  rule_id uuid,
  from_stage_uuid uuid,
  to_stage_uuid uuid,
  trigger_type text,
  priority integer,
  confidence numeric,
  matched boolean,
  evidence jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  SELECT l.id, l.current_crop, l.crop_cycle, l.planting_date, l.last_sowing_date,
         l.transplant_date, l.current_gdd
    INTO v_land
    FROM public.lands l WHERE l.id = p_land_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_crop  := upper(coalesce(v_land.current_crop,''));
  v_cycle := lower(coalesce(v_land.crop_cycle,''));
  v_gdd   := v_land.current_gdd;
  v_das   := CASE WHEN coalesce(v_land.planting_date, v_land.last_sowing_date) IS NOT NULL
                  THEN (current_date - coalesce(v_land.planting_date, v_land.last_sowing_date)) END;
  v_dat   := CASE WHEN v_land.transplant_date IS NOT NULL
                  THEN (current_date - v_land.transplant_date) END;

  IF p_from_stage IS NULL THEN
    v_from := (SELECT r.stage_uuid FROM public.resolve_crop_phenology(p_land_id) r LIMIT 1);
  ELSE
    v_from := p_from_stage;
  END IF;

  IF v_from IS NULL THEN RETURN; END IF;

  FOR v_rule IN
    SELECT stc.*
      FROM public.stage_transition_conditions stc
     WHERE stc.is_active
       AND upper(stc.crop_code) = v_crop
       AND (
             stc.crop_cycle IS NULL
          OR lower(stc.crop_cycle) IN ('', 'universal', 'any', 'all')
          OR lower(stc.crop_cycle) = v_cycle
       )
       AND stc.from_stage_uuid = v_from
     ORDER BY stc.priority DESC, stc.created_at ASC
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
END;
$fn$;

-- 3) Derive transition conditions from crop_stage_master sequences (idempotent)
CREATE OR REPLACE FUNCTION public.derive_stage_transition_conditions(
  p_crop_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_das_inserted int := 0;
  v_gdd_inserted int := 0;
BEGIN
  WITH seq AS (
    SELECT csm.id,
           lower(csm.crop_code)          AS crop_code,
           lower(coalesce(csm.crop_cycle,'')) AS crop_cycle,
           lower(csm.cultivation_method) AS cultivation_method,
           csm.das_min,
           csm.gdd_min,
           lead(csm.id)      OVER w AS next_id,
           lead(csm.das_min) OVER w AS next_das_min,
           lead(csm.gdd_min) OVER w AS next_gdd_min
      FROM public.crop_stage_master csm
     WHERE csm.is_active
       AND coalesce(csm.stage_node_type,'') NOT IN ('operational','alias')
       AND csm.das_min IS NOT NULL
       AND (p_crop_code IS NULL OR lower(csm.crop_code) = lower(p_crop_code))
    WINDOW w AS (
      PARTITION BY lower(csm.crop_code), lower(coalesce(csm.crop_cycle,'')), lower(csm.cultivation_method)
      ORDER BY csm.das_min ASC, coalesce(csm.phenology_index, 0) ASC
    )
  ),
  ins_das AS (
    INSERT INTO public.stage_transition_conditions(
      crop_code, crop_cycle, from_stage_uuid, to_stage_uuid,
      trigger_type, trigger_config, combinator, priority, confidence, source, notes, is_active
    )
    SELECT s.crop_code,
           NULLIF(NULLIF(NULLIF(s.crop_cycle,''),'universal'),'any'),
           s.id, s.next_id,
           'das',
           jsonb_build_object('min', s.next_das_min),
           'ALL',
           50,            -- calendar triggers rank BELOW biological triggers
           0.50,          -- provisional per S1 policy
           'derived:crop_stage_master.das_min',
           'auto-derived S4 sequence (' || s.cultivation_method || ')',
           true
      FROM seq s
     WHERE s.next_id IS NOT NULL
       AND s.next_das_min IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.stage_transition_conditions x
          WHERE x.from_stage_uuid = s.id
            AND x.to_stage_uuid   = s.next_id
            AND x.trigger_type    = 'das'
       )
    RETURNING 1
  ),
  ins_gdd AS (
    INSERT INTO public.stage_transition_conditions(
      crop_code, crop_cycle, from_stage_uuid, to_stage_uuid,
      trigger_type, trigger_config, combinator, priority, confidence, source, notes, is_active
    )
    SELECT s.crop_code,
           NULLIF(NULLIF(NULLIF(s.crop_cycle,''),'universal'),'any'),
           s.id, s.next_id,
           'gdd',
           jsonb_build_object('min', s.next_gdd_min),
           'ALL',
           150,           -- biological/thermal triggers outrank calendar
           0.85,
           'derived:crop_stage_master.gdd_min',
           'auto-derived S4 sequence (' || s.cultivation_method || ')',
           true
      FROM seq s
     WHERE s.next_id IS NOT NULL
       AND s.next_gdd_min IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.stage_transition_conditions x
          WHERE x.from_stage_uuid = s.id
            AND x.to_stage_uuid   = s.next_id
            AND x.trigger_type    = 'gdd'
       )
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins_das), (SELECT count(*) FROM ins_gdd)
    INTO v_das_inserted, v_gdd_inserted;

  RETURN jsonb_build_object(
    'ok', true,
    'das_rules_inserted', v_das_inserted,
    'gdd_rules_inserted', v_gdd_inserted,
    'crop_code', coalesce(p_crop_code, 'ALL')
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.derive_stage_transition_conditions(text) TO service_role;

-- 4) Autonomous initialization: anchor the first stage of a new crop cycle
CREATE OR REPLACE FUNCTION public.initialize_crop_cycle_stage(p_land_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_phen   record;
  v_crop   text;
  v_sow    date;
  v_exists boolean;
BEGIN
  SELECT lower(coalesce(l.current_crop,'')),
         coalesce(l.planting_date, l.last_sowing_date)
    INTO v_crop, v_sow
    FROM public.lands l
   WHERE l.id = p_land_id;

  IF v_crop IS NULL OR v_crop = '' THEN
    RETURN jsonb_build_object('ok', true, 'initialized', false, 'reason', 'no_crop');
  END IF;

  IF v_sow IS NULL THEN
    SELECT cs.sowing_date INTO v_sow
      FROM public.crop_schedules cs
     WHERE cs.land_id = p_land_id AND cs.is_active AND cs.sowing_date IS NOT NULL
     ORDER BY cs.sowing_date DESC LIMIT 1;
  END IF;

  IF v_sow IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'initialized', false, 'reason', 'no_sow_date');
  END IF;

  -- Already anchored for this cycle?
  SELECT EXISTS (
    SELECT 1
      FROM public.stage_transition_log stl
      JOIN public.crop_stage_master csm ON csm.id = stl.to_stage_uuid
     WHERE stl.land_id = p_land_id
       AND lower(csm.crop_code) = v_crop
       AND stl.evaluated_at::date >= v_sow
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('ok', true, 'initialized', false, 'reason', 'already_anchored');
  END IF;

  SELECT r.stage_uuid, r.stage_code
    INTO v_phen
    FROM public.resolve_crop_phenology(p_land_id) r
   LIMIT 1;

  IF v_phen.stage_uuid IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'initialized', false, 'reason', 'stage_unresolved');
  END IF;

  INSERT INTO public.stage_transition_log(
    land_id, from_stage_uuid, to_stage_uuid, rule_id,
    trigger_type, confidence, evidence
  ) VALUES (
    p_land_id, NULL, v_phen.stage_uuid, NULL,
    'autonomous_init', 0.50,
    jsonb_build_object(
      'applied',       true,
      'blocked',       false,
      'reason',        'autonomous_cycle_initialization',
      'to_stage_code', v_phen.stage_code,
      'trigger',       'autonomous_init',
      'crop_code',     v_crop,
      'sow_date',      v_sow,
      'cycle_key',     v_crop || ':' || v_sow::text
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'initialized', true,
    'stage', v_phen.stage_code,
    'cycle_key', v_crop || ':' || v_sow::text
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.initialize_crop_cycle_stage(uuid) TO authenticated, service_role;

-- 5) apply_stage_transitions: initialize the cycle before evaluating transitions
CREATE OR REPLACE FUNCTION public.apply_stage_transitions(p_land_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_top          record;
  v_from_uuid    uuid;
  v_to_uuid      uuid;
  v_from_code    text;
  v_to_code      text;
  v_validation   jsonb;
  v_blocked      boolean;
  v_evidence     jsonb;
  v_reason       text;
  v_crop         text;
  v_sow          date;
  v_init         jsonb;
BEGIN
  -- S4: autonomous initialization — anchor first stage for a new crop cycle
  v_init := public.initialize_crop_cycle_stage(p_land_id);

  SELECT rule_id, from_stage_uuid, to_stage_uuid, trigger_type,
         priority, confidence, matched, evidence
    INTO v_top
    FROM public.evaluate_stage_transitions(p_land_id, NULL)
   WHERE matched = true
   ORDER BY priority DESC NULLS LAST, confidence DESC NULLS LAST
   LIMIT 1;

  IF v_top IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_match', 'init', v_init);
  END IF;

  v_from_uuid := v_top.from_stage_uuid;
  v_to_uuid   := v_top.to_stage_uuid;

  SELECT stage_code INTO v_from_code FROM public.crop_stage_master WHERE id = v_from_uuid;
  SELECT stage_code INTO v_to_code   FROM public.crop_stage_master WHERE id = v_to_uuid;

  SELECT lower(coalesce(l.current_crop, '')),
         coalesce(l.planting_date, l.last_sowing_date)
    INTO v_crop, v_sow
    FROM public.lands l
   WHERE l.id = p_land_id;

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
    'validation',     v_validation,
    'crop_code',      v_crop,
    'sow_date',       v_sow,
    'cycle_key',      v_crop || ':' || coalesce(v_sow::text, 'unknown')
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
      'validation', v_validation, 'init', v_init
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true,
    'from_stage', v_from_code, 'to_stage', v_to_code,
    'validation', v_validation, 'init', v_init
  );
END;
$fn$;

-- 6) Seed derived transition conditions for every crop
SELECT public.derive_stage_transition_conditions(NULL);
