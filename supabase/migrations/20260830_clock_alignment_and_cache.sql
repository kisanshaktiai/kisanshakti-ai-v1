-- ============================================================================
-- 20260830_clock_alignment_and_cache.sql
-- Repo: kisanshaktiai/kisanshakti-ai-v1  (branch kisanshakti-ai-update)
-- Crop Biological Growth Stage Engine — forensic audit 2026-08-30, P0 fixes (part 2)
--
-- NO SCHEMA CHANGE. Depends on 20260830_stage_authority_p0.sql (apply that first).
-- Safe for the session-less SQL runner (no TEMP tables; the repair is one DO block).
--
-- Root causes fixed:
--   RC5  Two clocks, two anchors. lands.gdd_anchor_date is sticky by design in
--        accumulate_gdd_for_land ("respect an existing anchor; only derive when NULL"),
--        and nothing invalidates it when planting/transplant/sowing dates change.
--        Live drift: 8897e53d GDD anchor 2026-05-25 vs planting_date 2026-06-15
--        (+21 phantom days, 1499 GDD); f81e5e24 GDD anchor 2025-06-15 vs planting_date
--        2026-01-05 (6486 GDD). The accumulator re-derives cumulative_gdd only over
--        obs_date >= anchor, so NULLing the anchor is sufficient for correctness; the two
--        drifted lands are re-anchored explicitly below (history archived first).
--   RC7  sync_land_stage_cache (BEFORE INS/UPD on lands) recomputed stage_uuid from a bare
--        DAS window (no method / cycle / ledger) on EVERY land update, including the
--        6-hourly GDD write, so the farmer-facing cache (useLandStage.ts) never held the
--        resolver's stage (cache != resolver on 6/8 resolvable lands; stage_source was
--        planting_date/unresolved, never phenology_ssot). Now: an explicit resolver write
--        (stage_source='phenology_ssot') is honoured and preserved across unrelated
--        updates; the DAS fallback runs only when the crop or a cycle date changes or no
--        resolver value exists. run_daily_phenology writes that cache nightly.
--   RC9  chat-side stage persistence flag row (disabled) — consumed by orchestrator.ts.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. sync_land_stage_cache — RC5 invalidation + RC7 cache precedence
--    Existing DAS-cache logic is kept verbatim as the fallback branch.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_land_stage_cache()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_crop_code      text;
  v_start_date     date;
  v_das            integer;
  v_source         text;
  v_row            record;
  v_anchor_changed boolean := false;
  v_crop_changed   boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_anchor_changed := (NEW.transplant_date, NEW.planting_date, NEW.last_sowing_date)
                        IS DISTINCT FROM (OLD.transplant_date, OLD.planting_date, OLD.last_sowing_date);
    v_crop_changed   := (NEW.current_crop_id, lower(coalesce(NEW.current_crop::text, '')))
                        IS DISTINCT FROM (OLD.current_crop_id, lower(coalesce(OLD.current_crop::text, '')));

    -- P0-RC5: a cycle date moved -> the thermal clock must be re-anchored. Unless the
    -- same statement set the anchor explicitly (ai-smart-schedule does), NULL it and
    -- let accumulate_gdd_for_land re-derive (transplant -> planting -> last_sowing)
    -- and rebuild cumulative_gdd from the new anchor on its next 6-hourly run.
    IF v_anchor_changed THEN
      IF NEW.gdd_anchor_date IS NOT DISTINCT FROM OLD.gdd_anchor_date THEN
        NEW.gdd_anchor_date := NULL;
        NEW.gdd_anchor_type := NULL;
      END IF;
      NEW.current_gdd          := NULL;
      NEW.gdd_last_computed_at := NULL;
    END IF;

    -- P0-RC7 (a): an explicit resolver write wins and is never recomputed here.
    IF NEW.stage_source = 'phenology_ssot'
       AND (   NEW.stage_uuid        IS DISTINCT FROM OLD.stage_uuid
            OR NEW.stage_resolved_at IS DISTINCT FROM OLD.stage_resolved_at
            OR OLD.stage_source      IS DISTINCT FROM 'phenology_ssot') THEN
      RETURN NEW;
    END IF;

    -- P0-RC7 (b): a stored resolver value survives unrelated updates (GDD, NDVI, tiles…).
    IF OLD.stage_source = 'phenology_ssot' AND NOT v_anchor_changed AND NOT v_crop_changed THEN
      NEW.stage_uuid        := OLD.stage_uuid;
      NEW.crop_stage        := OLD.crop_stage;
      NEW.stage_source      := OLD.stage_source;
      NEW.stage_resolved_at := OLD.stage_resolved_at;
      NEW.das               := OLD.das;
      NEW.phenology_index   := OLD.phenology_index;
      RETURN NEW;
    END IF;
  END IF;

  -- ── Fallback: calendar (DAS-window) cache, unchanged from the previous body ──
  SELECT lower(c.value) INTO v_crop_code FROM public.crops c WHERE c.id = NEW.current_crop_id;
  IF v_crop_code IS NULL THEN
    v_crop_code := lower(NULLIF(trim(NEW.current_crop::text), ''));
  END IF;

  v_start_date := COALESCE(NEW.transplant_date, NEW.planting_date, NEW.last_sowing_date);

  IF v_crop_code IS NULL OR v_start_date IS NULL THEN
    NEW.stage_uuid        := NULL;
    NEW.das               := NULL;
    NEW.phenology_index   := NULL;
    NEW.stage_resolved_at := now();
    NEW.stage_source      := 'unresolved';
    RETURN NEW;
  END IF;

  v_source := CASE
    WHEN NEW.transplant_date IS NOT NULL THEN 'transplant_date'
    WHEN NEW.planting_date  IS NOT NULL THEN 'planting_date'
    ELSE 'last_sowing_date'
  END;
  v_das := GREATEST(0, (current_date - v_start_date));

  SELECT csm.id AS stage_uuid, csm.stage_code, csm.growth_stage, csm.phenology_index
    INTO v_row
  FROM public.crop_stage_master csm
  WHERE csm.is_active = true
    AND lower(csm.crop_code) = v_crop_code
    AND COALESCE(csm.stage_node_type, 'biological') = 'biological'
    AND v_das BETWEEN COALESCE(csm.das_min, 0) AND COALESCE(csm.das_max, 99999)
  ORDER BY csm.phenology_index NULLS LAST, csm.das_min NULLS LAST
  LIMIT 1;

  NEW.stage_uuid        := v_row.stage_uuid;
  NEW.das               := v_das;
  NEW.phenology_index   := v_row.phenology_index;
  NEW.stage_resolved_at := now();
  NEW.stage_source      := v_source;
  IF v_row.growth_stage IS NOT NULL THEN
    NEW.crop_stage := v_row.growth_stage;
  END IF;

  RETURN NEW;
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. run_daily_phenology — after the gate + transitions, publish the resolver's
--    stage to the lands cache the farmer app reads (stage_source='phenology_ssot').
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_daily_phenology()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land    record;
  v_r       record;
  v_n       integer := 0;
  v_written integer := 0;
BEGIN
  FOR v_land IN
    SELECT id FROM public.lands
    WHERE current_crop IS NOT NULL AND current_crop <> ''
  LOOP
    PERFORM public.enforce_germination_gate(v_land.id);   -- 1st: gate state
    PERFORM public.apply_stage_transitions(v_land.id);    -- 2nd: transitions (ledger-anchored)

    -- 3rd: publish the resolver stage to the land cache (P0-RC7)
    SELECT r.stage_uuid, r.growth_stage, r.current_das, r.phenology_index
      INTO v_r
      FROM public.resolve_crop_phenology(v_land.id) r
     LIMIT 1;

    IF v_r.stage_uuid IS NOT NULL THEN
      UPDATE public.lands
         SET stage_uuid        = v_r.stage_uuid,
             crop_stage        = v_r.growth_stage,
             stage_source      = 'phenology_ssot',
             stage_resolved_at = now(),
             das               = v_r.current_das,
             phenology_index   = v_r.phenology_index
       WHERE id = v_land.id;
      v_written := v_written + 1;
    END IF;

    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('lands_processed', v_n, 'stage_cache_written', v_written, 'ran_at', now());
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REPAIR — re-anchor the thermal clock on the two lands whose GDD anchor drifted
--    from the DAS anchor (verified 2026-08-30). Pattern mirrors reanchor_land_gdd():
--    archive to land_gdd_daily_history, delete, set the anchor, rebuild via
--    recompute_land_gdd_daily (weather_aggregates source, same base-temp resolution).
--    Anchor := coalesce(transplant_date, planting_date, last_sowing_date) — exactly the
--    DAS anchor the resolver uses, so both clocks start on the same day.
-- ─────────────────────────────────────────────────────────────────────────────
DO $repair$
DECLARE
  v_land   record;
  v_anchor date;
  v_n      integer;
BEGIN
  FOR v_land IN
    SELECT l.id, l.transplant_date, l.planting_date, l.last_sowing_date,
           l.gdd_anchor_date AS old_anchor
      FROM public.lands l
     WHERE l.id IN ('8897e53d-83ff-4b88-afb4-1ab92c14177f',   -- Kodoli Mala, rice: anchor 05-25 vs planting 06-15
                    'f81e5e24-e3d6-4e83-ab8e-8f2dd8e4752c')   -- sugarcane: anchor 2025-06-15 vs planting 2026-01-05
  LOOP
    v_anchor := coalesce(v_land.transplant_date, v_land.planting_date, v_land.last_sowing_date);
    IF v_anchor IS NULL OR v_anchor IS NOT DISTINCT FROM v_land.old_anchor THEN
      CONTINUE;   -- nothing to repair (already aligned, or no cycle date)
    END IF;

    INSERT INTO public.land_gdd_daily_history
    SELECT g.*, now(), 'reanchor:stage_authority_p0:' || v_anchor::text
      FROM public.land_gdd_daily g
     WHERE g.land_id = v_land.id;

    DELETE FROM public.land_gdd_daily WHERE land_id = v_land.id;

    UPDATE public.lands
       SET gdd_anchor_date      = v_anchor,
           gdd_anchor_type      = CASE WHEN v_land.transplant_date IS NOT NULL THEN 'transplant' ELSE 'planting' END,
           current_gdd          = NULL,
           gdd_last_computed_at = NULL
     WHERE id = v_land.id;

    v_n := public.recompute_land_gdd_daily(v_land.id, NULL);

    INSERT INTO public.system_health_events (event_type, source, severity, message, context)
    VALUES ('gdd_reanchor', 'stage_authority_p0', 'info',
            'GDD clock re-anchored to the DAS anchor',
            jsonb_build_object('land_id', v_land.id, 'old_anchor', v_land.old_anchor,
                               'new_anchor', v_anchor, 'rows_rebuilt', v_n));
  END LOOP;
END
$repair$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RC9 — feature flag consumed by ai-agriculture-chat/agents/orchestrator.ts.
--    Absent or disabled => a chat turn is READ-ONLY on stage authority; the nightly
--    phenology cron is the single writer. (flag_name is the only NOT NULL column
--    without a default; environment_id is nullable.)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.feature_flags
  (flag_name, description, is_enabled, rollout_percentage, flag_type, flag_status, default_value)
SELECT 'chat_stage_persist',
       'Allow ai-agriculture-chat to call apply_stage_transitions during a farmer turn (default OFF: phenology-daily is the single stage writer).',
       false, 0, 'release', 'active', false
 WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name = 'chat_stage_persist');

-- ============================================================================
-- VALIDATION (run after apply; expected results in comments)
-- ----------------------------------------------------------------------------
-- select substr(id::text,1,8), planting_date, gdd_anchor_type, gdd_anchor_date, round(current_gdd)
--   from lands where id in ('8897e53d-83ff-4b88-afb4-1ab92c14177f','f81e5e24-e3d6-4e83-ab8e-8f2dd8e4752c');
--   -> 8897e53d: planting 2026-06-15 = gdd_anchor 2026-06-15, current_gdd well below 1250
--      (INFERENCE ~1150-1200: 1499 minus ~21 days x ~15 GDD/day); f81e5e24: anchor 2026-01-05.
-- select land_id, min(obs_date), max(obs_date), max(cumulative_gdd) from land_gdd_daily
--   where land_id in (...) group by 1;
--   -> min(obs_date) = the new anchor date for both lands
-- select count(*) from land_gdd_daily_history where superseded_by like 'reanchor:stage_authority_p0:%';
--   -> 97 + (f81e5e24 row count)  (old rows archived, not lost)
-- select public.run_daily_phenology();
--   -> stage_cache_written = number of resolvable lands (8 today)
-- select substr(id::text,1,8), crop_stage, stage_source, stage_resolved_at from lands
--   where stage_source='phenology_ssot';
--   -> resolver stages; then UPDATE lands SET current_gdd = current_gdd WHERE id=<any> and
--      re-select: stage_source must still be 'phenology_ssot' (cache survives unrelated writes)
-- select flag_name, is_enabled, rollout_percentage from feature_flags where flag_name='chat_stage_persist';
--   -> false, 0
-- ============================================================================
