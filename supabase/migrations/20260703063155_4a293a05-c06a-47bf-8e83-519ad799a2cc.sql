
-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE B — Variety-Aware Phenology
-- Introduces variety_phenology_profile as an override layer over
-- crop_stage_master. Extends resolve_crop_phenology() to variety_id (v3).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.variety_phenology_profile (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code                   text NOT NULL,
  variety_id                  uuid,                       -- nullable = crop-level default; matches lands.current_crop_variety_id when present
  variety_name                text,                       -- text fallback when no uuid registry exists
  crop_cycle                  text,                       -- kharif|rabi|summer|plant|ratoon|null (any)
  stage_uuid                  uuid REFERENCES public.crop_stage_master(id) ON DELETE CASCADE,
  stage_code                  text,                       -- redundant with stage_uuid, useful for seeding
  -- Overrides (NULL = inherit from crop_stage_master)
  das_min_override            integer,
  das_max_override            integer,
  base_temperature_c_override numeric,
  phenology_model_override    text,
  expected_height_cm_min      numeric,
  expected_height_cm_max      numeric,
  expected_leaf_count_min     integer,
  expected_leaf_count_max     integer,
  expected_ndvi_min           numeric,
  expected_ndvi_max           numeric,
  gdd_target                  numeric,                    -- cumulative GDD needed to reach this stage (variety-specific)
  maturity_class              text,                       -- early|medium|late
  source                      text DEFAULT 'seed',
  notes                       text,
  is_active                   boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.variety_phenology_profile TO anon, authenticated;
GRANT ALL ON public.variety_phenology_profile TO service_role;

ALTER TABLE public.variety_phenology_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "variety_phenology_profile readable to all"
  ON public.variety_phenology_profile FOR SELECT
  USING (true);

CREATE POLICY "variety_phenology_profile service write"
  ON public.variety_phenology_profile FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_vpp_crop_variety
  ON public.variety_phenology_profile (crop_code, variety_id, crop_cycle, stage_uuid)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_vpp_crop_stage_fallback
  ON public.variety_phenology_profile (crop_code, crop_cycle, stage_uuid)
  WHERE is_active AND variety_id IS NULL;

CREATE TRIGGER trg_vpp_updated_at
  BEFORE UPDATE ON public.variety_phenology_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- resolve_crop_phenology v3 — variety-aware
-- Priority for stage window / morphology bands / phenology model:
--   1) variety_phenology_profile (variety_id match on land)
--   2) variety_phenology_profile (variety_id NULL, crop+cycle default)
--   3) crop_stage_master ontology (base SSOT)
-- Signature (frozen) unchanged; adds `variety_id`, `variety_source` to
-- evidence_sources and bumps resolver_version to 3.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_crop_phenology(
  p_land_id uuid,
  p_as_of   date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  stage_uuid                 uuid,
  stage_code                 text,
  growth_stage               text,
  crop_code                  text,
  crop_cycle                 text,
  previous_stage_uuid        uuid,
  next_stage_uuid            uuid,
  expected_transition_date   date,
  reference_system           text,
  phenology_model            text,
  current_das                integer,
  current_dat                integer,
  current_gdd                numeric,
  expected_height_cm_min     numeric,
  expected_height_cm_max     numeric,
  expected_leaf_count_min    integer,
  expected_leaf_count_max    integer,
  expected_ndvi_min          numeric,
  expected_ndvi_max          numeric,
  phenology_index            numeric,
  confidence                 numeric,
  evidence_sources           text[],
  source                     text,
  resolver_version           integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_vpp                record;                  -- variety override row (may be NULL)
  v_prev               uuid;
  v_next               uuid;
  v_next_das_min       integer;
  v_evidence           text[] := ARRAY[]::text[];
  v_confidence         numeric := 0.75;
  v_variety_source     text;
BEGIN
  SELECT id, current_crop, crop_cycle, current_crop_variety_id,
         planting_date, last_sowing_date, transplant_date
    INTO v_land
    FROM public.lands
   WHERE id = p_land_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_crop_code       := upper(coalesce(v_land.current_crop, ''));
  v_crop_cycle      := lower(coalesce(v_land.crop_cycle, ''));
  v_variety_id      := v_land.current_crop_variety_id;
  v_sow_date        := coalesce(v_land.planting_date, v_land.last_sowing_date);
  v_transplant_date := v_land.transplant_date;

  IF v_crop_code = '' OR v_sow_date IS NULL THEN
    RETURN;
  END IF;

  v_das := (p_as_of - v_sow_date);
  v_dat := CASE WHEN v_transplant_date IS NOT NULL THEN (p_as_of - v_transplant_date) END;

  -- Base stage from ontology (das window match on cycle-scoped rows first)
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

  IF NOT FOUND THEN
    RETURN;                                 -- resolver silent when no match; caller falls back
  END IF;

  -- Variety override lookup: exact variety first, then crop-level default
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

  -- Neighbouring stages from ontology graph
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
    NULL::numeric,                          -- current_gdd (Phase D)
    coalesce(v_vpp.expected_height_cm_min, v_stage.expected_height_cm_min),
    coalesce(v_vpp.expected_height_cm_max, v_stage.expected_height_cm_max),
    coalesce(v_vpp.expected_leaf_count_min, v_stage.expected_leaf_count_min),
    coalesce(v_vpp.expected_leaf_count_max, v_stage.expected_leaf_count_max),
    coalesce(v_vpp.expected_ndvi_min, v_stage.expected_ndvi_min),
    coalesce(v_vpp.expected_ndvi_max, v_stage.expected_ndvi_max),
    v_stage.phenology_index,
    v_confidence,
    v_evidence,
    CASE WHEN v_variety_source IS NOT NULL THEN 'variety_phenology_ssot' ELSE 'crop_stage_ssot' END,
    3;                                       -- resolver_version
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_crop_phenology(uuid, date) TO anon, authenticated, service_role;
