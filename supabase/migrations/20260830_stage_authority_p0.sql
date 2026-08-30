-- ============================================================================
-- 20260830_stage_authority_p0.sql
-- Repo: kisanshaktiai/kisanshakti-ai-v1  (branch kisanshakti-ai-update)
-- Crop Biological Growth Stage Engine — forensic audit 2026-08-30, P0 fixes
--
-- NO SCHEMA CHANGE. Function bodies + data corrections + two targeted repairs.
-- Safe for the session-less SQL runner (no TEMP tables, no session settings).
-- Every constant below is either a stage-code/UUID verified live on 2026-08-30
-- or comes from an existing DB row (boundary_grace_days, das_min_override…).
-- No agronomic threshold is introduced.
--
-- Root causes fixed (all FACT, row/source-verified):
--   RC1  apply_stage_transitions took its from-stage from the resolver, which had
--        ALREADY applied one on-the-fly transition -> two-stage jumps per night and
--        ledger rows whose from_stage was never persisted (30197c15: booting -> [no
--        heading row] -> flowering).
--   RC2  initialize_crop_cycle_stage persisted that stepped stage as 'autonomous_init'
--        and resolve_crop_phenology relabelled it 'biological_ledger' conf 0.85.
--   RC3  the DAS guard was inert: stage_validation_rules rows are rule_type='das_min'
--        with {"days":N} / severity 'warn' while evaluate_stage_validation only knows
--        das_range/{min,max} and passes vacuously on NULL. Nothing could block an
--        implausible stage. A trigger-aware gate is added where the trigger type IS
--        known (evaluate_stage_transitions), and the rule rows are made evaluable.
--   RC4  9 auto-derived NDVI transition rules (source derived:crop_stage_master.
--        expected_ndvi) at priority 220 outrank gdd(150)/das(50-100); rice canopy NDVI
--        plateaus 0.70-0.80 across booting/heading/flowering -> not diagnostic.
--   RC6  reconcile_schedule_for_land (live, fired by trg_notify_schedule_reconcile) used
--        drift = DAS - das_min (position INSIDE the window), applied to task_date
--        non-idempotently, with no source gate -> harvest task of schedule 6a16c0c6 moved
--        06-Oct -> 12-Sep and a germination task to 22-May (before the 08-Jun sowing).
--   RC8  cycle-scoped rules (crop_cycle='plant') were dropped when lands.crop_cycle is
--        NULL -> 3 sugarcane lands frozen at GRAND_GROWTH (DAS 243-262).
--
-- Deploy order: THIS FILE -> 20260830_clock_alignment_and_cache.sql -> edge functions.
-- Rollback: re-run the previous CREATE OR REPLACE bodies from migration history; the
-- data rows are soft-changed (is_active / evidence.applied) and reversible.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. resolve_crop_phenology (9-arg) — v9
--    (a) 'autonomous_init' is a CALENDAR anchor -> provisional (<= 0.5), never biological.
--    (b) the on-the-fly transition preview [B] runs only on an ANCHORED cycle (a ledger row
--        exists). Before the nightly init the resolver reports the calendar stage, so
--        initialize_crop_cycle_stage persists the calendar stage, not a stepped one.
--    Everything else is byte-for-byte the live v8 body.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(
  p_crop_code text, p_crop_cycle text, p_cultivation_method text, p_variety_id uuid,
  p_sow_date date, p_transplant_date date, p_current_gdd numeric,
  p_as_of date DEFAULT CURRENT_DATE, p_land_id uuid DEFAULT NULL::uuid)
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
  v_gate               record;
  v_stage_day          integer;
  v_next_ref           text;
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
       AND coalesce(stl.trigger_type,'') NOT LIKE 'germination_gate%'  -- gate rows are constraints, not stage evidence
     ORDER BY stl.evaluated_at DESC
     LIMIT 1;

    IF v_ledger.to_stage_uuid IS NOT NULL THEN
      SELECT csm.* INTO v_stage
        FROM public.crop_stage_master csm
       WHERE csm.id = v_ledger.to_stage_uuid;
      IF FOUND THEN
        -- P0-RC2 (2026-08-30): 'autonomous_init' is a calendar anchor, not biological evidence.
        IF lower(coalesce(v_ledger.trigger_type, '')) IN ('das', 'dat', 'autonomous_init') THEN
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
       AND (
             CASE lower(coalesce(csm.das_reference, 'sowing'))
               WHEN 'transplanting' THEN
                 -- transplant-anchored windows use DAT; INELIGIBLE until a real transplant_date exists
                 (v_dat IS NOT NULL AND v_dat BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
               WHEN 'nursery_sowing' THEN
                 -- nursery sowing IS the recorded sowing date for a transplanted cycle
                 (v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
               WHEN 'planting' THEN
                 (v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
               WHEN 'ratoon_initiation' THEN
                 -- EXPLICIT MAPPING (P1 residue, documented not hidden): for a ratoon
                 -- cycle the cycle-start date recorded as sowing/planting date IS the
                 -- ratoon initiation date in current data flow. If a dedicated
                 -- ratoon_date field is added later, this is the single line to change.
                 (v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
               ELSE
                 (v_das BETWEEN coalesce(csm.das_min, 0) AND coalesce(csm.das_max, 9999))
             END
           )
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
    v_evidence   := v_evidence || ARRAY[
      'das_window:' || v_das::text,
      'day_anchor:' || lower(coalesce(v_stage.das_reference,'sowing')),
      CASE WHEN v_dat IS NOT NULL THEN 'dat:' || v_dat::text ELSE 'dat:none' END
    ];
  END IF;

  -- ── [B] Evidence-driven transition on top of the anchor stage ─────────────
  -- P0-RC1/RC2 (2026-08-30): preview only on an ANCHORED cycle. Before the nightly
  -- init writes the first ledger row the resolver is a pure calendar estimate, so the
  -- init can never persist a stepped stage. From then on [B] is exactly the transition
  -- apply_stage_transitions would persist next (same from-stage, same evaluator).
  IF p_land_id IS NOT NULL AND v_ledger.to_stage_uuid IS NOT NULL THEN
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

  -- ── [B2] Germination gate: a held gate blocks CALENDAR claims only ────────
  -- Biological evidence (morphology/ndvi/farmer transitions set v_source to
  -- 'evidence_transition'/'biological_ledger') always overrides the gate:
  -- if observation shows the crop, the gate must not argue with it.
  IF p_land_id IS NOT NULL AND v_source IN ('das_provisional','das_ledger_provisional') THEN
    SELECT gs.state, gs.held_stage_uuid INTO v_gate
      FROM public.stage_gate_state gs
     WHERE gs.land_id = p_land_id
       AND gs.gate = 'GERMINATION'
       AND gs.state IN ('waiting','conditions_favorable','failure_suspected');
    IF v_gate.held_stage_uuid IS NOT NULL AND v_gate.held_stage_uuid <> v_stage.id THEN
      SELECT csm.* INTO v_stage
        FROM public.crop_stage_master csm WHERE csm.id = v_gate.held_stage_uuid;
      IF FOUND THEN
        v_source     := 'gate_constrained_calendar';
        v_confidence := least(v_confidence, 0.5);
        v_evidence   := v_evidence || ARRAY['gate:GERMINATION:' || v_gate.state];
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

  -- Prefer the explicit biological graph (populated for 177/231 stages);
  -- numeric fallback is restricted to the SAME day-anchor so cross-anchor
  -- windows (nursery DAS vs establishment DAT) can never be ordered numerically.
  v_prev := v_stage.prev_stage_id;
  IF v_prev IS NULL THEN
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
       AND lower(coalesce(csm.das_reference,'sowing')) = lower(coalesce(v_stage.das_reference,'sowing'))
       AND csm.das_max IS NOT NULL
       AND csm.das_max < coalesce(v_stage.das_min, 0)
     ORDER BY csm.das_max DESC
     LIMIT 1;
  END IF;

  v_next := v_stage.next_stage_id;
  IF v_next IS NOT NULL THEN
    SELECT csm.das_min, lower(coalesce(csm.das_reference,'sowing'))
      INTO v_next_das_min, v_next_ref
      FROM public.crop_stage_master csm WHERE csm.id = v_next;
  ELSE
    SELECT csm.id, csm.das_min, lower(coalesce(csm.das_reference,'sowing'))
      INTO v_next, v_next_das_min, v_next_ref
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
       AND lower(coalesce(csm.das_reference,'sowing')) = lower(coalesce(v_stage.das_reference,'sowing'))
       AND csm.das_min IS NOT NULL
       AND csm.das_min > coalesce(v_stage.das_max, 9999)
     ORDER BY csm.das_min ASC
     LIMIT 1;
  END IF;

  -- Anchor-correct day for THIS stage: DAT for transplant-anchored, DAS otherwise.
  v_stage_day := CASE
    WHEN lower(coalesce(v_stage.das_reference,'sowing')) = 'transplanting' THEN v_dat
    ELSE v_das
  END;

  IF p_current_gdd IS NOT NULL AND v_stage.gdd_max IS NOT NULL AND v_stage.gdd_max > 0 THEN
    v_gdd_target := v_stage.gdd_max;
    v_phen_index := least(1.0, greatest(0.0, p_current_gdd / v_gdd_target));
  ELSIF v_stage_day IS NOT NULL
        AND v_stage.das_max IS NOT NULL AND v_stage.das_max > coalesce(v_stage.das_min, 0) THEN
    v_phen_index := least(1.0, greatest(0.0,
      (v_stage_day - coalesce(v_stage.das_min, 0))::numeric
      / greatest(1, v_stage.das_max - coalesce(v_stage.das_min, 0))::numeric));
  ELSE
    v_phen_index := NULL;
  END IF;

  -- ── Boundary grace zone (system-limitation honesty): a computed stage near
  -- its window edge is an ESTIMATE in transition, not a precise fact. When the
  -- stage row defines boundary_grace_days (agronomist-populated; NULL = off),
  -- annotate the evidence so downstream UI/advisories present "approximately /
  -- transitioning" rather than false day-level precision. No numeric default
  -- is assumed here.
  IF v_stage.boundary_grace_days IS NOT NULL AND v_stage_day IS NOT NULL THEN
    IF v_stage.das_max IS NOT NULL
       AND (v_stage.das_max - v_stage_day) BETWEEN 0 AND v_stage.boundary_grace_days THEN
      v_evidence := v_evidence || ARRAY['boundary_zone:approaching_next_stage'];
    ELSIF (v_stage_day - coalesce(v_stage.das_min, 0)) BETWEEN 0 AND v_stage.boundary_grace_days THEN
      v_evidence := v_evidence || ARRAY['boundary_zone:recently_entered'];
    END IF;
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
    CASE
      WHEN v_next_das_min IS NULL THEN NULL
      WHEN v_next_ref = 'transplanting' THEN
        CASE WHEN p_transplant_date IS NOT NULL THEN (p_transplant_date + v_next_das_min) END
      ELSE (p_sow_date + v_next_das_min)
    END,
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
    9;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. evaluate_stage_transitions
--    (a) P0-RC8: an UNKNOWN land cycle ('') no longer filters out cycle-scoped rules —
--        from_stage_uuid already scopes the cycle (the from-stage row IS a 'plant' or
--        'ratoon' row).
--    (b) P0-RC3: evidence-tier DAS plausibility gate. NON-observational triggers
--        (gdd / ndvi / das / dat, and composites with no observational child) may not
--        advance the crop before the target stage's earliest plausible day:
--            day >= coalesce(variety_phenology_profile.das_min_override, crop_stage_master.das_min)
--                   - coalesce(crop_stage_master.boundary_grace_days, 0)
--        Day = DAT for transplant-anchored targets, DAS otherwise; NULL day = blocked.
--        Observational triggers (morphology_stage / event / observation) are exempt:
--        observed biology outranks the calendar. The gate result is recorded in
--        evidence.das_gate so blocked evidence is visible, never silently dropped.
--        No numeric constant: both the floor and the grace are DB rows (grace is NULL
--        on all 233 active stages today -> 0 until an agronomist sets it).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_stage_transitions(p_land_id uuid, p_from_stage uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rule_id uuid, from_stage_uuid uuid, to_stage_uuid uuid, trigger_type text, priority integer, confidence numeric, matched boolean, evidence jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land          record;
  v_crop          text;
  v_cycle         text;
  v_das           int;
  v_dat           int;
  v_gdd           numeric;
  v_rule          record;
  v_cond          jsonb;
  v_ok            boolean;
  v_all_ok        boolean;
  v_any_ok        boolean;
  v_child_ok      boolean;
  v_from          uuid;
  -- P0-RC3 gate state
  v_observational boolean;
  v_tgt           record;
  v_vpp_min       integer;
  v_gate_min      integer;
  v_grace         integer;
  v_day           integer;
  v_gate          jsonb;
BEGIN
  SELECT l.id, l.current_crop, l.crop_cycle, l.planting_date, l.last_sowing_date,
         l.transplant_date, l.current_gdd, l.current_crop_variety_id
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
             v_cycle = ''                                   -- P0-RC8: unknown land cycle
          OR stc.crop_cycle IS NULL
          OR lower(stc.crop_cycle) IN ('', 'universal', 'any', 'all')
          OR lower(stc.crop_cycle) = v_cycle
       )
       AND stc.from_stage_uuid = v_from
     ORDER BY stc.priority DESC, stc.created_at ASC
  LOOP
    v_observational := lower(coalesce(v_rule.trigger_type,'')) IN ('morphology_stage','event','observation');

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
        IF lower(coalesce(v_cond->>'type','')) IN ('morphology_stage','event','observation') THEN
          v_observational := true;
        END IF;
      END LOOP;
      v_ok := CASE WHEN v_rule.combinator = 'ANY' THEN v_any_ok ELSE v_all_ok END;
    ELSE
      v_ok := public.stc_eval_single(
        v_rule.trigger_type, v_rule.trigger_config, p_land_id, v_das, v_dat, v_gdd
      );
    END IF;

    -- ── P0-RC3: DAS plausibility gate for non-observational evidence ──────────
    v_gate := NULL;
    IF v_ok AND NOT v_observational THEN
      SELECT csm.das_min, csm.boundary_grace_days,
             lower(coalesce(csm.das_reference,'sowing')) AS ref
        INTO v_tgt
        FROM public.crop_stage_master csm
       WHERE csm.id = v_rule.to_stage_uuid;

      v_vpp_min := NULL;
      IF v_land.current_crop_variety_id IS NOT NULL THEN
        SELECT vpp.das_min_override INTO v_vpp_min
          FROM public.variety_phenology_profile vpp
         WHERE vpp.is_active
           AND vpp.variety_id = v_land.current_crop_variety_id
           AND vpp.stage_uuid = v_rule.to_stage_uuid
           AND vpp.das_min_override IS NOT NULL
         ORDER BY (lower(coalesce(vpp.crop_cycle,'')) = v_cycle) DESC NULLS LAST
         LIMIT 1;
      END IF;

      v_gate_min := coalesce(v_vpp_min, v_tgt.das_min);
      v_grace    := coalesce(v_tgt.boundary_grace_days, 0);
      v_day      := CASE WHEN v_tgt.ref = 'transplanting' THEN v_dat ELSE v_das END;

      IF v_gate_min IS NOT NULL THEN
        IF v_day IS NULL THEN
          v_ok   := false;
          v_gate := jsonb_build_object(
            'blocked', true, 'reason', 'no_day_anchor', 'anchor', v_tgt.ref,
            'das_min_effective', v_gate_min, 'grace_days', v_grace);
        ELSIF v_day < (v_gate_min - v_grace) THEN
          v_ok   := false;
          v_gate := jsonb_build_object(
            'blocked', true, 'reason', 'before_plausible_window',
            'day', v_day, 'anchor', v_tgt.ref,
            'das_min_effective', v_gate_min, 'grace_days', v_grace,
            'min_source', CASE WHEN v_vpp_min IS NOT NULL
                               THEN 'variety_phenology_profile.das_min_override'
                               ELSE 'crop_stage_master.das_min' END);
        ELSE
          v_gate := jsonb_build_object(
            'blocked', false, 'day', v_day, 'anchor', v_tgt.ref,
            'das_min_effective', v_gate_min, 'grace_days', v_grace);
        END IF;
      END IF;
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
      'trigger_config', v_rule.trigger_config,
      'observational', v_observational
    ) || CASE WHEN v_gate IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('das_gate', v_gate) END;
    RETURN NEXT;
  END LOOP;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. apply_stage_transitions — P0-RC1
--    from-stage = the last APPLIED ledger stage of this cycle (same filter as the
--    resolver's [A] block), never the resolver's stepped preview. No anchor -> nothing
--    is persisted ('no_anchor'). A plausibility-blocked candidate is surfaced once per
--    land as an open stage_review_queue item instead of vanishing.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_init         jsonb;
  v_anchor       uuid;
  v_gated        record;
BEGIN
  -- S4: autonomous initialization — anchor first stage for a new crop cycle
  v_init := public.initialize_crop_cycle_stage(p_land_id);

  SELECT lower(coalesce(l.current_crop, '')),
         coalesce(l.planting_date, l.last_sowing_date)
    INTO v_crop, v_sow
    FROM public.lands l
   WHERE l.id = p_land_id;

  IF v_sow IS NULL THEN
    -- same fallback the 1-arg resolver wrapper uses, so the ledger window matches
    SELECT cs.sowing_date INTO v_sow
      FROM public.crop_schedules cs
     WHERE cs.land_id = p_land_id AND cs.is_active AND cs.sowing_date IS NOT NULL
     ORDER BY cs.sowing_date DESC LIMIT 1;
  END IF;

  IF coalesce(v_crop,'') = '' OR v_sow IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_crop_or_sow_date', 'init', v_init);
  END IF;

  -- P0-RC1: the persisted anchor, not the preview
  SELECT stl.to_stage_uuid INTO v_anchor
    FROM public.stage_transition_log stl
    JOIN public.crop_stage_master csm ON csm.id = stl.to_stage_uuid
   WHERE stl.land_id = p_land_id
     AND coalesce((stl.evidence->>'applied')::boolean, true)
     AND lower(csm.crop_code) = v_crop
     AND stl.evaluated_at::date >= v_sow
     AND coalesce(stl.trigger_type,'') NOT LIKE 'germination_gate%'
   ORDER BY stl.evaluated_at DESC
   LIMIT 1;

  IF v_anchor IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_anchor', 'init', v_init);
  END IF;

  SELECT rule_id, from_stage_uuid, to_stage_uuid, trigger_type,
         priority, confidence, matched, evidence
    INTO v_top
    FROM public.evaluate_stage_transitions(p_land_id, v_anchor)
   WHERE matched = true
   ORDER BY priority DESC NULLS LAST, confidence DESC NULLS LAST
   LIMIT 1;

  IF v_top.rule_id IS NULL THEN
    -- Phase-6 conflict visibility: the strongest plausibility-blocked candidate, if any
    SELECT e.trigger_type, e.priority, e.to_stage_uuid, e.evidence
      INTO v_gated
      FROM public.evaluate_stage_transitions(p_land_id, v_anchor) e
     WHERE coalesce((e.evidence->'das_gate'->>'blocked')::boolean, false)
     ORDER BY e.priority DESC NULLS LAST
     LIMIT 1;

    IF v_gated.to_stage_uuid IS NOT NULL THEN
      INSERT INTO public.stage_review_queue (crop_code, issue_type, detail, proposed_resolution, severity, status)
      SELECT v_crop,
             'stage_evidence_conflict',
             'land=' || p_land_id::text || ' trigger=' || v_gated.trigger_type
               || ' target=' || coalesce((SELECT stage_code FROM public.crop_stage_master WHERE id = v_gated.to_stage_uuid), '?')
               || ' gate=' || (v_gated.evidence->'das_gate')::text,
             'Confirm the stage in the field (photo/observation), or set crop_stage_master.boundary_grace_days / variety_phenology_profile.das_min_override with a source.',
             'medium', 'open'
       WHERE NOT EXISTS (
         SELECT 1 FROM public.stage_review_queue q
          WHERE q.status = 'open' AND q.issue_type = 'stage_evidence_conflict'
            AND q.detail LIKE 'land=' || p_land_id::text || ' trigger=' || v_gated.trigger_type || ' target=%'
       );
      RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_match_gated',
                                'gated_trigger', v_gated.trigger_type,
                                'gate', v_gated.evidence->'das_gate', 'init', v_init);
    END IF;

    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'no_match', 'init', v_init);
  END IF;

  v_from_uuid := v_top.from_stage_uuid;
  v_to_uuid   := v_top.to_stage_uuid;

  SELECT stage_code INTO v_from_code FROM public.crop_stage_master WHERE id = v_from_uuid;
  SELECT stage_code INTO v_to_code   FROM public.crop_stage_master WHERE id = v_to_uuid;

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
    'cycle_key',      v_crop || ':' || coalesce(v_sow::text, 'unknown'),
    'from_stage_source', 'ledger',
    'engine',         'apply_stage_transitions@p0-2026-08-30'
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
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. initialize_crop_cycle_stage — P0-RC2
--    "already anchored" now counts APPLIED rows only, so a retracted init row lets the
--    next nightly run re-anchor the cycle on the (now calendar-only) resolver output.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.initialize_crop_cycle_stage(p_land_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Already anchored for this cycle? (applied rows only — P0-RC2)
  SELECT EXISTS (
    SELECT 1
      FROM public.stage_transition_log stl
      JOIN public.crop_stage_master csm ON csm.id = stl.to_stage_uuid
     WHERE stl.land_id = p_land_id
       AND lower(csm.crop_code) = v_crop
       AND stl.evaluated_at::date >= v_sow
       AND coalesce((stl.evidence->>'applied')::boolean, true)
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('ok', true, 'initialized', false, 'reason', 'already_anchored');
  END IF;

  -- With resolver v9 this is the CALENDAR stage (no ledger => no preview step).
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
      'cycle_key',     v_crop || ':' || v_sow::text,
      'evidence_tier', 'calendar'
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'initialized', true,
    'stage', v_phen.stage_code,
    'cycle_key', v_crop || ':' || v_sow::text
  );
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. reconcile_schedule_for_land — P0-RC6 (the LIVE task mover, fired synchronously by
--    trg_notify_schedule_reconcile on every applied ledger insert)
--    Now identical in semantics to schedule-reconciler@1.2.x:
--      (a) provisional stage sources never move a schedule
--      (b) drift is window-relative (0 inside [das_min-grace, das_max+grace])
--      (c) stage-forward scoping (tasks of stages already passed are not re-anchored)
--      (d) idempotent from the immutable baseline original_date
--      (e) never moves a task before the schedule's sowing_date
--    DROP+CREATE (plpgsql callers late-bind by name; return type is pinned to jsonb).
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reconcile_schedule_for_land(uuid);
CREATE FUNCTION public.reconcile_schedule_for_land(p_land_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phen          record;
  v_stage         record;
  v_obs           integer;
  v_drift         integer;
  v_grace         integer;
  v_sched         record;
  v_task          record;
  v_base          date;
  v_new           date;
  v_examined      integer := 0;
  v_moved         integer := 0;
  v_skipped_pre   integer := 0;
  v_skipped_floor integer := 0;
BEGIN
  SELECT * INTO v_phen FROM public.resolve_crop_phenology(p_land_id) LIMIT 1;

  IF v_phen.stage_code IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'phenology_unresolved', 'land_id', p_land_id);
  END IF;

  -- (a) unknown / calendar-only biology never moves a schedule
  IF lower(coalesce(v_phen.source,'')) IN ('das_provisional','das_ledger_provisional','gate_constrained_calendar') THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'provisional_stage_source',
                              'stage_code', v_phen.stage_code, 'stage_source', v_phen.source,
                              'land_id', p_land_id);
  END IF;

  SELECT csm.das_min, csm.das_max, csm.boundary_grace_days,
         lower(coalesce(csm.das_reference,'sowing')) AS ref
    INTO v_stage
    FROM public.crop_stage_master csm
   WHERE csm.id = v_phen.stage_uuid;

  v_obs   := CASE WHEN v_stage.ref = 'transplanting' THEN v_phen.current_dat ELSE v_phen.current_das END;
  v_grace := coalesce(v_stage.boundary_grace_days, 0);

  -- (b) window-relative drift
  IF v_obs IS NULL OR v_stage.das_min IS NULL OR v_stage.das_max IS NULL THEN
    v_drift := NULL;
  ELSIF v_obs >= v_stage.das_min - v_grace AND v_obs <= v_stage.das_max + v_grace THEN
    v_drift := 0;
  ELSIF v_obs < v_stage.das_min THEN
    v_drift := v_obs - v_stage.das_min;       -- negative: biology ahead of calendar
  ELSE
    v_drift := v_obs - v_stage.das_max;       -- positive: biology behind calendar
  END IF;

  IF v_drift IS NULL OR v_drift = 0 THEN
    RETURN jsonb_build_object('ok', true, 'drift', v_drift, 'tasks_moved', 0,
                              'stage_code', v_phen.stage_code, 'stage_source', v_phen.source,
                              'land_id', p_land_id);
  END IF;

  FOR v_sched IN
    SELECT cs.id, cs.sowing_date
      FROM public.crop_schedules cs
     WHERE cs.land_id = p_land_id AND cs.is_active AND cs.status = 'active'
  LOOP
    FOR v_task IN
      SELECT id, task_date, original_date, days_from_sowing
        FROM public.schedule_tasks
       WHERE schedule_id = v_sched.id AND status = 'pending' AND is_pinned IS NOT TRUE
         AND anchor_type = 'STAGE' AND anchor_stage IS NOT NULL
    LOOP
      v_examined := v_examined + 1;

      -- (c) stage-forward scoping
      IF v_stage.das_min IS NOT NULL AND v_task.days_from_sowing IS NOT NULL
         AND v_task.days_from_sowing < v_stage.das_min THEN
        v_skipped_pre := v_skipped_pre + 1;
        CONTINUE;
      END IF;

      -- (d) idempotent from the immutable baseline
      v_base := coalesce(v_task.original_date, v_task.task_date);
      v_new  := v_base + v_drift;
      IF v_new = v_task.task_date THEN CONTINUE; END IF;

      -- (e) impossible-date guard
      IF v_sched.sowing_date IS NOT NULL AND v_new < v_sched.sowing_date THEN
        v_skipped_floor := v_skipped_floor + 1;
        CONTINUE;
      END IF;

      UPDATE public.schedule_tasks
         SET task_date = v_new,
             projected_date = v_new,
             original_date = coalesce(original_date, v_task.task_date),
             auto_rescheduled = true,
             adjustment_reason = 'stage_drift:' || v_drift || 'd',
             updated_at = now()
       WHERE id = v_task.id;

      INSERT INTO public.schedule_adjustments
        (schedule_id, task_id, change_type, old_value, new_value, reason, evidence, engine_version)
      VALUES (
        v_sched.id, v_task.id, 'SHIFT',
        jsonb_build_object('task_date', v_task.task_date),
        jsonb_build_object('task_date', v_new),
        'Biological stage ' || v_phen.stage_code || ' observed at day ' || coalesce(v_obs, -1)
          || '; stage window ' || coalesce(v_stage.das_min::text,'?') || '-' || coalesce(v_stage.das_max::text,'?')
          || ' (' || v_stage.ref || ')',
        jsonb_build_object(
          'stage_code', v_phen.stage_code, 'stage_source', v_phen.source,
          'confidence', v_phen.confidence, 'evidence_sources', to_jsonb(v_phen.evidence_sources),
          'drift_days', v_drift, 'baseline_date', v_base,
          'stage_window', jsonb_build_object('das_min', v_stage.das_min, 'das_max', v_stage.das_max,
                                             'grace_days', v_grace, 'anchor', v_stage.ref),
          'trigger', 'event_reconcile'),
        'reconcile_schedule_for_land@1.2.1');
      v_moved := v_moved + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'drift', v_drift,
                            'tasks_examined', v_examined, 'tasks_moved', v_moved,
                            'tasks_skipped_pre_stage', v_skipped_pre,
                            'tasks_skipped_before_sowing', v_skipped_floor,
                            'stage_code', v_phen.stage_code, 'stage_source', v_phen.source,
                            'confidence', v_phen.confidence, 'land_id', p_land_id);
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. DATA — P0-RC4: retire the 9 auto-derived NDVI transition rules.
--    Kept: d8c89c1b (RICE_TP_TILLERING -> RICE_TP_PANICLE_INITIATION, source
--    forensic_audit_2026_08_03) — not auto-derived; it now also passes through the gate.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.stage_transition_conditions
   SET is_active = false,
       notes = coalesce(notes || ' | ', '') || 'retired 2026-08-30 stage_authority_p0: canopy NDVI plateaus across booting/heading/flowering — descriptive range, not a stage discriminator',
       updated_at = now()
 WHERE trigger_type = 'ndvi'
   AND source = 'derived:crop_stage_master.expected_ndvi'
   AND is_active;

INSERT INTO public.stage_review_queue (crop_code, issue_type, detail, proposed_resolution, severity, status)
SELECT 'rice', 'ndvi_transition_rules_retired',
       '9 stage_transition_conditions rows (source=derived:crop_stage_master.expected_ndvi) deactivated 2026-08-30; see 30197c15 ledger 2026-08-29 (NDVI 0.733 -> FLOWERING at DAS 82).',
       'If NDVI should ever drive rice phenology, author diagnostic rules (e.g. NDVI decline slope after peak for ripening) with an ICAR/SAU source; do not regenerate from expected_ndvi ranges.',
       'high', 'open'
 WHERE NOT EXISTS (SELECT 1 FROM public.stage_review_queue WHERE issue_type = 'ndvi_transition_rules_retired');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. DATA — P0-RC3: make stage_validation_rules evaluable by evaluate_stage_validation.
--    rule_type 'das_min' + {"days":N}  ->  'das_range' + {"min":N}. Severity is NOT
--    changed (stays 'warn'): these rows carry the generic DAS floor and would block
--    legitimately early varieties if promoted to BLOCK; the trigger-aware gate in
--    evaluate_stage_transitions is the blocking mechanism. From now on the recorded
--    validation JSON is truthful (passed=false when violated) instead of vacuous.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.stage_validation_rules
   SET rule_type   = 'das_range',
       rule_config = jsonb_build_object('min', (rule_config->>'days')::numeric),
       updated_at  = now()
 WHERE rule_type = 'das_min'
   AND rule_config ? 'days'
   AND (rule_config->>'days') ~ '^[0-9]+(\.[0-9]+)?$';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. REPAIR — land 30197c15 (Shinghan Mal), schedule 6a16c0c6
--    (a) retract the 2026-08-29 NDVI row (rule 40c00fbb): row KEPT, evidence.applied=false
--        -> the resolver's [A] block ignores it and falls back to the 08-26 gdd BOOTING
--        row (DAS 83 inside 75-89 -> drift 0).
--    (b) revert the 3 tasks shifted on 08-26 (+4d) and 08-29 (-28d) to their immutable
--        original_date; each revert is recorded as a schedule_adjustments REVERT row.
--    trg_notify_schedule_reconcile is INSERT-only, so these UPDATEs do not re-fire it.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.stage_transition_log
   SET evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
         'applied', false,
         'blocked', true,
         'retracted', true,
         'retracted_at', now(),
         'retracted_by', 'stage_authority_p0',
         'retraction_reason', 'RC4: NDVI 0.733 is a canopy plateau value, not evidence of flowering; rule auto-derived from expected_ndvi and now retired')
 WHERE land_id = '30197c15-786e-4aff-acab-2d94b2ff8e59'
   AND trigger_type = 'ndvi'
   AND rule_id = '40c00fbb-dab7-4229-ab28-837aa9da3153'
   AND evaluated_at::date = DATE '2026-08-29'
   AND coalesce((evidence->>'applied')::boolean, true);

INSERT INTO public.schedule_adjustments
  (schedule_id, task_id, change_type, old_value, new_value, reason, evidence, engine_version)
SELECT t.schedule_id, t.id, 'REVERT',
       jsonb_build_object('task_date', t.task_date),
       jsonb_build_object('task_date', t.original_date),
       'Reverted to baseline: prior SHIFTs derived from a retracted NDVI transition (RC4) and position-in-window drift (RC6)',
       jsonb_build_object('land_id', '30197c15-786e-4aff-acab-2d94b2ff8e59', 'audit', 'stage_authority_p0_2026-08-30',
                          'previous_adjustment_reason', t.adjustment_reason),
       'stage_authority_p0'
  FROM public.schedule_tasks t
 WHERE t.schedule_id IN (SELECT id FROM public.crop_schedules
                          WHERE land_id = '30197c15-786e-4aff-acab-2d94b2ff8e59' AND is_active)
   AND t.status = 'pending'
   AND t.auto_rescheduled = true
   AND t.original_date IS NOT NULL
   AND t.task_date <> t.original_date;

UPDATE public.schedule_tasks t
   SET task_date = t.original_date,
       projected_date = NULL,
       auto_rescheduled = false,
       adjustment_reason = NULL,
       updated_at = now()
 WHERE t.schedule_id IN (SELECT id FROM public.crop_schedules
                          WHERE land_id = '30197c15-786e-4aff-acab-2d94b2ff8e59' AND is_active)
   AND t.status = 'pending'
   AND t.auto_rescheduled = true
   AND t.original_date IS NOT NULL
   AND t.task_date <> t.original_date;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. REPAIR — land 8897e53d (Kodoli Mala): the 2026-08-30 01:30 'autonomous_init'
--    row persisted RICE_HEADING for a DAS-76 crop (BOOTING window 75-89) because the
--    resolver preview had already stepped on a GDD sum built from a stale 25-May
--    anchor (RC2 + RC5). Retracted (row kept); the next phenology-daily re-anchors on
--    the calendar stage. The GDD re-anchor itself is in migration 2.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.stage_transition_log
   SET evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
         'applied', false,
         'blocked', true,
         'retracted', true,
         'retracted_at', now(),
         'retracted_by', 'stage_authority_p0',
         'retraction_reason', 'RC2/RC5: init persisted a stepped stage (HEADING at DAS 76) driven by a GDD sum anchored 21 days before lands.planting_date')
 WHERE land_id = '8897e53d-83ff-4b88-afb4-1ab92c14177f'
   AND trigger_type = 'autonomous_init'
   AND evaluated_at::date = DATE '2026-08-30'
   AND coalesce((evidence->>'applied')::boolean, true);

-- ============================================================================
-- VALIDATION (run after apply; expected results in comments)
-- ----------------------------------------------------------------------------
-- select count(*) from stage_transition_conditions where trigger_type='ndvi' and is_active;
--   -> 1  (only d8c89c1b)
-- select rule_type, count(*) from stage_validation_rules group by 1;
--   -> das_range = 12
-- select stage_code, source, confidence, current_das from resolve_crop_phenology_for_land('30197c15-786e-4aff-acab-2d94b2ff8e59', current_date);
--   -> RICE_BOOTING, biological_ledger (gdd row of 08-26), 0.85, DAS 83
-- select task_date, original_date, auto_rescheduled from schedule_tasks
--  where schedule_id in (select id from crop_schedules where land_id='30197c15-786e-4aff-acab-2d94b2ff8e59' and is_active) and status='pending' and original_date is not null;
--   -> task_date = original_date (2026-06-15 / 2026-09-06 / 2026-10-06), auto_rescheduled=false
-- select stage_code, source, confidence from resolve_crop_phenology_for_land('8897e53d-83ff-4b88-afb4-1ab92c14177f', current_date);
--   -> RICE_BOOTING, das_provisional, 0.5   (until phenology-daily re-anchors it as autonomous_init -> das_ledger_provisional)
-- select public.reconcile_schedule_for_land('30197c15-786e-4aff-acab-2d94b2ff8e59');
--   -> drift 0, tasks_moved 0
-- select public.apply_stage_transitions('30197c15-786e-4aff-acab-2d94b2ff8e59');
--   -> applied=false reason=no_match  (BOOTING->HEADING gdd rule needs 1250; land is at ~1104)
-- select resolver_version from resolve_crop_phenology_for_land('30197c15-786e-4aff-acab-2d94b2ff8e59', current_date);
--   -> 9
-- ============================================================================
