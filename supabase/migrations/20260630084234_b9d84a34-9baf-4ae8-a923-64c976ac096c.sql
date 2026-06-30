
ALTER TABLE public.lands
  ADD COLUMN IF NOT EXISTS transplant_date date,
  ADD COLUMN IF NOT EXISTS stage_uuid uuid REFERENCES public.crop_stage_master(id),
  ADD COLUMN IF NOT EXISTS das integer,
  ADD COLUMN IF NOT EXISTS phenology_index numeric,
  ADD COLUMN IF NOT EXISTS stage_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_source text;

ALTER TABLE public.crop_schedules
  ADD COLUMN IF NOT EXISTS transplant_date date;

CREATE INDEX IF NOT EXISTS idx_lands_stage_uuid ON public.lands(stage_uuid);

CREATE OR REPLACE FUNCTION public.resolve_crop_stage_full(
  p_land_id uuid,
  p_as_of   date DEFAULT current_date
)
RETURNS TABLE (
  stage_uuid       uuid,
  stage_code       text,
  growth_stage     text,
  das              integer,
  phenology_index  numeric,
  next_stage_id    uuid,
  prev_stage_id    uuid,
  crop_code        text,
  source           text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_land       public.lands%ROWTYPE;
  v_crop_code  text;
  v_start_date date;
  v_das        integer;
  v_source     text;
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
  v_das := GREATEST(0, (p_as_of - v_start_date));

  RETURN QUERY
  SELECT csm.id, csm.stage_code, csm.growth_stage, v_das, csm.phenology_index,
         csm.next_stage_id, csm.prev_stage_id, v_crop_code, v_source
  FROM public.crop_stage_master csm
  WHERE csm.is_active = true
    AND lower(csm.crop_code) = v_crop_code
    AND COALESCE(csm.stage_node_type, 'biological') = 'biological'
    AND v_das BETWEEN COALESCE(csm.das_min, 0) AND COALESCE(csm.das_max, 99999)
  ORDER BY csm.phenology_index NULLS LAST, csm.das_min NULLS LAST
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_crop_stage_full(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_land_stage_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_crop_code  text;
  v_start_date date;
  v_das        integer;
  v_source     text;
  v_row        record;
BEGIN
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
$$;

DROP TRIGGER IF EXISTS trg_sync_land_stage_cache ON public.lands;
CREATE TRIGGER trg_sync_land_stage_cache
BEFORE INSERT OR UPDATE OF current_crop_id, current_crop, planting_date, transplant_date, last_sowing_date
ON public.lands
FOR EACH ROW EXECUTE FUNCTION public.sync_land_stage_cache();

-- Backfill via subquery joining lands LATERAL resolver output
UPDATE public.lands l
SET
  stage_uuid        = sub.stage_uuid,
  das               = sub.das,
  phenology_index   = sub.phenology_index,
  stage_resolved_at = now(),
  stage_source      = COALESCE(sub.source, 'unresolved'),
  crop_stage        = COALESCE(sub.growth_stage, l.crop_stage)
FROM (
  SELECT ll.id AS land_id, r.*
  FROM public.lands ll
  CROSS JOIN LATERAL public.resolve_crop_stage_full(ll.id, current_date) r
  WHERE ll.is_active = true AND ll.current_crop IS NOT NULL
) sub
WHERE l.id = sub.land_id;
