
-- ═══════════════════════════════════════════════════════════════════════════
-- Phase A — Runtime SSOT with phenology-ready signature
-- Additive schema + resolver v2 with FROZEN full return shape
-- (Fields nullable now; populated progressively in Phases B–E)
-- ═══════════════════════════════════════════════════════════════════════════

-- A.1 lands.crop_cycle  (for ratoon sugarcane, wheat cycle, etc.)
ALTER TABLE public.lands
  ADD COLUMN IF NOT EXISTS crop_cycle text;

-- A.2 crop_stage_master extensions
ALTER TABLE public.crop_stage_master
  ADD COLUMN IF NOT EXISTS base_temperature_c numeric,
  ADD COLUMN IF NOT EXISTS phenology_model text
    CHECK (phenology_model IS NULL OR phenology_model IN ('DAS','DAT','GDD','BBCH','PHOTOPERIOD')),
  ADD COLUMN IF NOT EXISTS expected_height_cm_min numeric,
  ADD COLUMN IF NOT EXISTS expected_height_cm_max numeric,
  ADD COLUMN IF NOT EXISTS expected_leaf_count_min integer,
  ADD COLUMN IF NOT EXISTS expected_leaf_count_max integer,
  ADD COLUMN IF NOT EXISTS expected_ndvi_min numeric,
  ADD COLUMN IF NOT EXISTS expected_ndvi_max numeric;

-- Default phenology_model = 'DAS' for existing rows lacking one
UPDATE public.crop_stage_master
   SET phenology_model = 'DAS'
 WHERE phenology_model IS NULL;

-- A.3 resolve_crop_phenology — frozen v2 signature (append-only from here)
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(
  p_land_id uuid,
  p_as_of   date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  stage_uuid               uuid,
  stage_code               text,
  growth_stage             text,
  crop_code                text,
  crop_cycle               text,
  previous_stage_uuid      uuid,
  next_stage_uuid          uuid,
  expected_transition_date date,
  reference_system         text,
  phenology_model          text,
  current_das              integer,
  current_dat              integer,
  current_gdd              numeric,
  expected_height_cm_min   numeric,
  expected_height_cm_max   numeric,
  expected_leaf_count_min  integer,
  expected_leaf_count_max  integer,
  expected_ndvi_min        numeric,
  expected_ndvi_max        numeric,
  phenology_index          numeric,
  confidence               numeric,
  evidence_sources         text[],
  source                   text,
  resolver_version         integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_land       public.lands%ROWTYPE;
  v_crop_code  text;
  v_start_date date;
  v_source     text;
  v_das        integer;
  v_dat        integer;
  v_next_id    uuid;
  v_next_dmax  integer;
  v_trans_date date;
  v_stage      public.crop_stage_master%ROWTYPE;
BEGIN
  SELECT * INTO v_land FROM public.lands WHERE id = p_land_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT lower(c.value) INTO v_crop_code FROM public.crops c WHERE c.id = v_land.current_crop_id;
  IF v_crop_code IS NULL THEN
    v_crop_code := lower(NULLIF(trim(v_land.current_crop::text), ''));
  END IF;
  IF v_crop_code IS NULL THEN RETURN; END IF;

  v_start_date := COALESCE(v_land.transplant_date, v_land.planting_date, v_land.last_sowing_date);
  IF v_start_date IS NULL THEN RETURN; END IF;

  v_source := CASE
    WHEN v_land.transplant_date IS NOT NULL THEN 'transplant_date'
    WHEN v_land.planting_date  IS NOT NULL THEN 'planting_date'
    ELSE 'last_sowing_date'
  END;

  v_das := GREATEST(0, (p_as_of - COALESCE(v_land.planting_date, v_land.last_sowing_date, v_start_date)));
  v_dat := CASE WHEN v_land.transplant_date IS NOT NULL
                THEN GREATEST(0, (p_as_of - v_land.transplant_date))
                ELSE NULL END;

  SELECT csm.* INTO v_stage
  FROM public.crop_stage_master csm
  WHERE csm.is_active = true
    AND lower(csm.crop_code) = v_crop_code
    AND COALESCE(csm.stage_node_type, 'biological') = 'biological'
    AND v_das BETWEEN COALESCE(csm.das_min, 0) AND COALESCE(csm.das_max, 99999)
  ORDER BY csm.phenology_index NULLS LAST, csm.das_min NULLS LAST
  LIMIT 1;

  IF v_stage.id IS NULL THEN RETURN; END IF;

  -- expected transition date = start_date + next stage's das_min
  v_next_id := v_stage.next_stage_id;
  IF v_next_id IS NOT NULL THEN
    SELECT das_min INTO v_next_dmax FROM public.crop_stage_master WHERE id = v_next_id;
    IF v_next_dmax IS NOT NULL THEN
      v_trans_date := v_start_date + v_next_dmax;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_stage.id,
    v_stage.stage_code,
    v_stage.growth_stage,
    v_crop_code,
    v_land.crop_cycle,
    v_stage.prev_stage_id,
    v_stage.next_stage_id,
    v_trans_date,
    v_stage.reference_system,
    COALESCE(v_stage.phenology_model, 'DAS'),
    v_das,
    v_dat,
    NULL::numeric,                       -- current_gdd (Phase D)
    v_stage.expected_height_cm_min,
    v_stage.expected_height_cm_max,
    v_stage.expected_leaf_count_min,
    v_stage.expected_leaf_count_max,
    v_stage.expected_ndvi_min,
    v_stage.expected_ndvi_max,
    v_stage.phenology_index,
    0.75::numeric,                        -- DAS-only confidence
    ARRAY['DAS']::text[],
    v_source,
    2                                     -- resolver_version
  ;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_crop_phenology(uuid, date) TO authenticated, service_role, anon;

-- A.4 Keep legacy alias resolve_crop_stage_full working (already exists — untouched)
COMMENT ON FUNCTION public.resolve_crop_phenology(uuid, date)
  IS 'Phase A Runtime SSOT: frozen return shape. Fields populated progressively in Phases B–E. Prefer this over resolve_crop_stage_full (kept as alias).';
