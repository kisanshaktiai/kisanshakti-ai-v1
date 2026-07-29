-- ── apply_stage_transitions: stamp cycle context onto the ledger row ───────
CREATE OR REPLACE FUNCTION public.apply_stage_transitions(p_land_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
BEGIN
  SELECT rule_id, from_stage_uuid, to_stage_uuid, trigger_type,
         priority, confidence, matched, evidence
    INTO v_top
    FROM public.evaluate_stage_transitions(p_land_id, NULL)
   WHERE matched = true
   ORDER BY priority DESC NULLS LAST, confidence DESC NULLS LAST
   LIMIT 1;

  IF v_top IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_match');
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
      'validation', v_validation
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true,
    'from_stage', v_from_code, 'to_stage', v_to_code,
    'validation', v_validation
  );
END;
$function$;

-- ── resolve_crop_phenology: harden the ledger tier ─────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(
  p_crop_code text, p_crop_cycle text, p_cultivation_method text,
  p_variety_id uuid, p_sow_date date, p_transplant_date date,
  p_current_gdd numeric, p_as_of date DEFAULT CURRENT_DATE,
  p_land_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stage_uuid uuid, stage_code text, growth_stage text, crop_code text, crop_cycle text, cultivation_method text, previous_stage_uuid uuid, next_stage_uuid uuid, expected_transition_date date, reference_system text, phenology_model text, current_das integer, current_dat integer, current_gdd numeric, expected_height_cm_min numeric, expected_height_cm_max numeric, expected_leaf_count_min integer, expected_leaf_count_max integer, expected_ndvi_min numeric, expected_ndvi_max numeric, phenology_index numeric, confidence numeric, evidence_sources text[], source text, resolver_version integer)
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
  v_confidence         numeric := 0.5;
  v_source             text := 'das_provisional';
  v_variety_source     text;
  v_gdd_target         numeric;
  v_phen_index         numeric;
  v_transition_match   record;
  v_new_stage          record;
  v_ledger             record;
BEGIN
  IF v_crop_code = '' OR p_sow_date IS NULL THEN RETURN; END IF;

  v_das := (p_as_of - p_sow_date);
  v_dat := CASE WHEN p_transplant_date IS NOT NULL THEN (p_as_of - p_transplant_date) END;

  IF v_cultivation_method IS NOT NULL THEN
    v_evidence := v_evidence || ARRAY['cultivation_method:' || v_cultivation_method];
  END IF;

  -- ── [A] Biological ledger — last APPLIED transition for this crop cycle ───
  IF p_land_id IS NOT NULL THEN
    SELECT stl.to_stage_uuid, stl.confidence, stl.trigger_type, stl.evaluated_at
      INTO v_ledger
      FROM public.stage_transition_log stl
      JOIN public.crop_stage_master csm ON csm.id = stl.to_stage_uuid
     WHERE stl.land_id = p_land_id
       AND coalesce((stl.evidence->>'applied')::boolean, true)
       AND lower(csm.crop_code) = v_crop_code
       AND stl.evaluated_at::date >= p_sow_date
     ORDER BY stl.evaluated_at DESC
     LIMIT 1;

    IF v_ledger.to_stage_uuid IS NOT NULL THEN
      SELECT csm.* INTO v_stage
        FROM public.crop_stage_master csm
       WHERE csm.id = v_ledger.to_stage_uuid;
      IF FOUND THEN
        IF lower(coalesce(v_ledger.trigger_type, '')) IN ('das', 'dat') THEN
          v_source     := 'das_ledger_provisional';
          v_confidence := least(0.5, coalesce(v_ledger.confidence, 0.5));
        ELSE
          v_source     := 'biological_ledger';
          v_confidence := greatest(0.85, coalesce(v_ledger.confidence, 0.85));
        END IF;
        v_evidence := v_evidence || ARRAY[
          'ledger_trigger:' || coalesce(v_ledger.trigger_type, 'unknown'),
          'ledger_at:' || v_ledger.evaluated_at::date::text
        ];
      END IF;
    END IF;
  END IF;

  -- ── [C] DAS window — PROVISIONAL fallback only ────────────────────────────
  IF v_stage IS NULL THEN
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
    v_source     := 'das_provisional';
    v_confidence := 0.5;
    v_evidence   := v_evidence || ARRAY['das_window:' || v_das::text];
  END IF;

  -- ── [B] Evidence-driven transition on top of the anchor stage ─────────────
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
        IF lower(coalesce(v_transition_match.trigger_type,'')) IN ('das','dat') THEN
          v_confidence := least(0.5, greatest(v_confidence, coalesce(v_transition_match.match_confidence, 0.5)));
        ELSE
          v_confidence := greatest(v_confidence, coalesce(v_transition_match.match_confidence, 0.85));
          v_source     := 'evidence_transition';
        END IF;
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
      IF v_source NOT IN ('das_provisional','das_ledger_provisional') THEN
        v_confidence := greatest(v_confidence, 0.90);
      END IF;
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
    v_source,
    8;
END;
$function$;