
-- =========================================================
-- Phase D — GDD accumulator & weather-driven phenology
-- DB-only (no new edge function; pg_cron calls SQL directly)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------
-- 1. Column additions
-- ---------------------------------------------------------
ALTER TABLE public.lands
  ADD COLUMN IF NOT EXISTS current_gdd            numeric,
  ADD COLUMN IF NOT EXISTS gdd_anchor_type        text,
  ADD COLUMN IF NOT EXISTS gdd_anchor_date        date,
  ADD COLUMN IF NOT EXISTS gdd_last_computed_at   timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lands_gdd_anchor_type_chk'
  ) THEN
    ALTER TABLE public.lands
      ADD CONSTRAINT lands_gdd_anchor_type_chk
      CHECK (gdd_anchor_type IS NULL OR gdd_anchor_type IN ('sowing','transplant'));
  END IF;
END $$;

ALTER TABLE public.crop_stage_master
  ADD COLUMN IF NOT EXISTS gdd_min numeric,
  ADD COLUMN IF NOT EXISTS gdd_max numeric;

-- ---------------------------------------------------------
-- 2. land_gdd_daily table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.land_gdd_daily (
  land_id           uuid       NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  obs_date          date       NOT NULL,
  tmax_c            numeric,
  tmin_c            numeric,
  base_temp_c       numeric    NOT NULL,
  upper_cap_c       numeric    NOT NULL DEFAULT 30,
  daily_gdd         numeric    NOT NULL DEFAULT 0,
  cumulative_gdd    numeric    NOT NULL DEFAULT 0,
  days_from_anchor  integer    NOT NULL,
  anchor_type       text       NOT NULL CHECK (anchor_type IN ('sowing','transplant')),
  anchor_date       date       NOT NULL,
  method            text       NOT NULL DEFAULT 'single_triangle',
  source            text       NOT NULL DEFAULT 'weather_aggregates',
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (land_id, obs_date)
);

CREATE INDEX IF NOT EXISTS idx_land_gdd_daily_land_date
  ON public.land_gdd_daily(land_id, obs_date DESC);

GRANT SELECT ON public.land_gdd_daily TO authenticated;
GRANT ALL    ON public.land_gdd_daily TO service_role;

ALTER TABLE public.land_gdd_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Farmers read GDD for their lands" ON public.land_gdd_daily;
CREATE POLICY "Farmers read GDD for their lands"
  ON public.land_gdd_daily
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lands l
       WHERE l.id = land_gdd_daily.land_id
         AND l.farmer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role manages GDD" ON public.land_gdd_daily;
CREATE POLICY "Service role manages GDD"
  ON public.land_gdd_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------
-- 3. accumulate_gdd_for_land()
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accumulate_gdd_for_land(
  p_land_id uuid,
  p_lookback_days int DEFAULT 365
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_land           record;
  v_crop_code      text;
  v_anchor_date    date;
  v_anchor_type    text;
  v_base_temp      numeric;
  v_upper_cap      numeric := 30;
  v_start_date     date;
  v_end_date       date := current_date;
  v_days_processed bigint := 0;
  v_cum            numeric := 0;
  v_current_gdd    numeric := 0;
BEGIN
  SELECT id, farmer_id, current_crop, planting_date, last_sowing_date, transplant_date
    INTO v_land
    FROM public.lands
   WHERE id = p_land_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_crop_code := upper(coalesce(v_land.current_crop,''));
  IF v_crop_code = '' THEN RETURN 0; END IF;

  -- Anchor precedence: transplant → crop_schedules.sowing_date (latest active) → planting/last_sowing
  IF v_land.transplant_date IS NOT NULL THEN
    v_anchor_date := v_land.transplant_date;
    v_anchor_type := 'transplant';
  ELSE
    SELECT cs.sowing_date INTO v_anchor_date
      FROM public.crop_schedules cs
     WHERE cs.land_id = p_land_id
       AND cs.sowing_date IS NOT NULL
     ORDER BY cs.sowing_date DESC
     LIMIT 1;

    IF v_anchor_date IS NULL THEN
      v_anchor_date := coalesce(v_land.planting_date, v_land.last_sowing_date);
    END IF;
    v_anchor_type := 'sowing';
  END IF;

  IF v_anchor_date IS NULL OR v_anchor_date > v_end_date THEN
    RETURN 0;
  END IF;

  -- Base temp: smallest non-null base_temperature_c across active stages for this crop; fallback 8
  SELECT coalesce(min(base_temperature_c), 8)::numeric
    INTO v_base_temp
    FROM public.crop_stage_master
   WHERE is_active
     AND crop_code = v_crop_code
     AND base_temperature_c IS NOT NULL;

  IF v_base_temp IS NULL THEN v_base_temp := 8; END IF;

  v_start_date := greatest(v_anchor_date, v_end_date - p_lookback_days);

  -- Build day series with weather join + ±3-day imputation
  WITH day_series AS (
    SELECT gs::date AS d
      FROM generate_series(v_start_date, v_end_date, interval '1 day') gs
  ),
  raw_weather AS (
    SELECT wa.aggregate_date AS d,
           wa.temp_max_celsius AS tmax,
           wa.temp_min_celsius AS tmin
      FROM public.weather_aggregates wa
     WHERE wa.land_id = p_land_id
       AND wa.aggregate_date BETWEEN v_start_date - 3 AND v_end_date
  ),
  joined AS (
    SELECT ds.d,
           rw.tmax,
           rw.tmin,
           CASE WHEN rw.tmax IS NULL AND rw.tmin IS NULL THEN 'imputed' ELSE 'weather_aggregates' END AS src
      FROM day_series ds
      LEFT JOIN raw_weather rw ON rw.d = ds.d
  ),
  imputed AS (
    SELECT j.d,
           coalesce(j.tmax,
             (SELECT avg(rw2.tmax) FROM raw_weather rw2
               WHERE rw2.d BETWEEN j.d - 3 AND j.d + 3 AND rw2.tmax IS NOT NULL)
           ) AS tmax,
           coalesce(j.tmin,
             (SELECT avg(rw2.tmin) FROM raw_weather rw2
               WHERE rw2.d BETWEEN j.d - 3 AND j.d + 3 AND rw2.tmin IS NOT NULL)
           ) AS tmin,
           j.src
      FROM joined j
  ),
  computed AS (
    SELECT i.d,
           i.tmax,
           i.tmin,
           CASE
             WHEN i.tmax IS NULL OR i.tmin IS NULL THEN 0
             ELSE greatest(
               0,
               ((least(i.tmax, v_upper_cap) + greatest(i.tmin, v_base_temp)) / 2.0) - v_base_temp
             )
           END::numeric AS daily,
           CASE WHEN i.tmax IS NULL AND i.tmin IS NULL THEN 'imputed' ELSE i.src END AS src
      FROM imputed i
  )
  INSERT INTO public.land_gdd_daily AS lgd (
    land_id, obs_date, tmax_c, tmin_c, base_temp_c, upper_cap_c,
    daily_gdd, cumulative_gdd, days_from_anchor,
    anchor_type, anchor_date, method, source
  )
  SELECT p_land_id,
         c.d,
         c.tmax,
         c.tmin,
         v_base_temp,
         v_upper_cap,
         c.daily,
         sum(c.daily) OVER (ORDER BY c.d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
         (c.d - v_anchor_date)::int,
         v_anchor_type,
         v_anchor_date,
         'single_triangle',
         c.src
    FROM computed c
   ORDER BY c.d
  ON CONFLICT (land_id, obs_date) DO UPDATE
     SET tmax_c           = EXCLUDED.tmax_c,
         tmin_c           = EXCLUDED.tmin_c,
         base_temp_c      = EXCLUDED.base_temp_c,
         upper_cap_c      = EXCLUDED.upper_cap_c,
         daily_gdd        = EXCLUDED.daily_gdd,
         cumulative_gdd   = EXCLUDED.cumulative_gdd,
         days_from_anchor = EXCLUDED.days_from_anchor,
         anchor_type      = EXCLUDED.anchor_type,
         anchor_date      = EXCLUDED.anchor_date,
         source           = EXCLUDED.source;

  GET DIAGNOSTICS v_days_processed = ROW_COUNT;

  -- Re-derive cumulative from anchor across the full history (handles gaps + reruns)
  WITH ordered AS (
    SELECT obs_date, daily_gdd,
           sum(daily_gdd) OVER (ORDER BY obs_date
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum
      FROM public.land_gdd_daily
     WHERE land_id = p_land_id
       AND obs_date >= v_anchor_date
  )
  UPDATE public.land_gdd_daily lgd
     SET cumulative_gdd = o.cum
    FROM ordered o
   WHERE lgd.land_id = p_land_id
     AND lgd.obs_date = o.obs_date
     AND lgd.cumulative_gdd IS DISTINCT FROM o.cum;

  SELECT cumulative_gdd INTO v_current_gdd
    FROM public.land_gdd_daily
   WHERE land_id = p_land_id
   ORDER BY obs_date DESC
   LIMIT 1;

  UPDATE public.lands
     SET current_gdd          = v_current_gdd,
         gdd_anchor_type      = v_anchor_type,
         gdd_anchor_date      = v_anchor_date,
         gdd_last_computed_at = now()
   WHERE id = p_land_id;

  RETURN v_days_processed;
END;
$function$;

REVOKE ALL ON FUNCTION public.accumulate_gdd_for_land(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.accumulate_gdd_for_land(uuid, int) TO service_role;

-- ---------------------------------------------------------
-- 4. accumulate_gdd_batch()
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accumulate_gdd_batch(p_limit int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lid           uuid;
  v_processed     int := 0;
  v_days_total    bigint := 0;
  v_start         timestamptz := clock_timestamp();
  v_elapsed_ms    numeric;
BEGIN
  FOR v_lid IN
    SELECT l.id
      FROM public.lands l
     WHERE l.current_crop IS NOT NULL
       AND (l.last_sowing_date IS NOT NULL OR l.planting_date IS NOT NULL OR l.transplant_date IS NOT NULL)
       AND (l.harvest_date IS NULL OR l.harvest_date >= current_date - 30)
       AND coalesce(l.last_sowing_date, l.planting_date, l.transplant_date) > current_date - 400
     ORDER BY l.gdd_last_computed_at NULLS FIRST
     LIMIT p_limit
  LOOP
    BEGIN
      v_days_total := v_days_total + coalesce(public.accumulate_gdd_for_land(v_lid, 365), 0);
      v_processed  := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      -- swallow per-land errors so the batch keeps going
      NULL;
    END;
  END LOOP;

  v_elapsed_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;

  BEGIN
    INSERT INTO public.system_health_events (event_type, severity, message, metadata)
    VALUES (
      'gdd_batch_run',
      'info',
      'accumulate_gdd_batch completed',
      jsonb_build_object(
        'lands_processed', v_processed,
        'days_total',      v_days_total,
        'elapsed_ms',      v_elapsed_ms
      )
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'lands_processed', v_processed,
    'days_total',      v_days_total,
    'elapsed_ms',      v_elapsed_ms
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accumulate_gdd_batch(int) FROM public;
GRANT EXECUTE ON FUNCTION public.accumulate_gdd_batch(int) TO service_role;

-- ---------------------------------------------------------
-- 5. resolve_crop_phenology → v4 (adds real GDD; GDD-based progress if variety target)
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
BEGIN
  SELECT id, current_crop, crop_cycle, current_crop_variety_id,
         planting_date, last_sowing_date, transplant_date,
         current_gdd
    INTO v_land
    FROM public.lands
   WHERE id = p_land_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_crop_code       := upper(coalesce(v_land.current_crop, ''));
  v_crop_cycle      := lower(coalesce(v_land.crop_cycle, ''));
  v_variety_id      := v_land.current_crop_variety_id;
  v_sow_date        := coalesce(v_land.planting_date, v_land.last_sowing_date);
  v_transplant_date := v_land.transplant_date;
  v_current_gdd     := v_land.current_gdd;

  IF v_crop_code = '' OR v_sow_date IS NULL THEN
    RETURN;
  END IF;

  v_das := (p_as_of - v_sow_date);
  v_dat := CASE WHEN v_transplant_date IS NOT NULL THEN (p_as_of - v_transplant_date) END;

  SELECT * INTO v_stage
    FROM public.crop_stage_master
   WHERE is_active
     AND crop_code = v_crop_code
     AND coalesce(crop_cycle,'') IN (v_crop_cycle, '')
     AND stage_node_type IS DISTINCT FROM 'operational'
     AND v_das BETWEEN coalesce(das_min, 0) AND coalesce(das_max, 9999)
   ORDER BY (crop_cycle = v_crop_cycle) DESC NULLS LAST,
            das_min ASC
   LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

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
      v_confidence := 0.90;
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
      v_confidence := 0.80;
    END IF;
  END IF;

  v_prev := v_stage.prev_stage_id;
  v_next := v_stage.next_stage_id;

  SELECT das_min INTO v_next_das_min
    FROM public.crop_stage_master
   WHERE id = v_next;

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

  -- Prefer GDD-based progress when variety has gdd_target
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
    CASE WHEN v_variety_source IS NOT NULL THEN 'variety_phenology_ssot' ELSE 'crop_stage_ssot' END,
    4;
END;
$function$;

-- ---------------------------------------------------------
-- 6. Cron: run batch every 6 hours, DB-only
-- ---------------------------------------------------------
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'gdd-accumulator-6h';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'gdd-accumulator-6h',
    '0 */6 * * *',
    $CRON$ SELECT public.accumulate_gdd_batch(500); $CRON$
  );
END $$;
