CREATE OR REPLACE FUNCTION public.evaluate_stage_transitions(p_land_id uuid, p_from_stage uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rule_id uuid, from_stage_uuid uuid, to_stage_uuid uuid, trigger_type text, priority integer, confidence numeric, matched boolean, evidence jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       AND coalesce(lower(stc.crop_cycle),'') IN (v_cycle, '')
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
END $function$;