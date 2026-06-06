
-- =====================================================
-- Items 6–11: Variety-aware brain/proactive/schedules
-- additive columns, indexes, completeness view
-- =====================================================

-- Item 6: ai_decision_log.variety_resistance_applied
ALTER TABLE public.ai_decision_log
  ADD COLUMN IF NOT EXISTS variety_resistance_applied jsonb;

-- Item 7: proactive tables variety tracking
ALTER TABLE public.proactive_alerts
  ADD COLUMN IF NOT EXISTS variety_id uuid;

ALTER TABLE public.proactive_evaluation_log
  ADD COLUMN IF NOT EXISTS variety_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proactive_alerts_variety_fk') THEN
    ALTER TABLE public.proactive_alerts
      ADD CONSTRAINT proactive_alerts_variety_fk
      FOREIGN KEY (variety_id) REFERENCES public.master_products(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='proactive_eval_log_variety_fk') THEN
    ALTER TABLE public.proactive_evaluation_log
      ADD CONSTRAINT proactive_eval_log_variety_fk
      FOREIGN KEY (variety_id) REFERENCES public.master_products(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Item 5/7: persist variety_id on schedule_tasks + refinements
ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS variety_id uuid;
ALTER TABLE public.ai_schedule_refinements
  ADD COLUMN IF NOT EXISTS variety_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='schedule_tasks_variety_fk') THEN
    ALTER TABLE public.schedule_tasks
      ADD CONSTRAINT schedule_tasks_variety_fk
      FOREIGN KEY (variety_id) REFERENCES public.master_products(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_schedule_refinements_variety_fk') THEN
    ALTER TABLE public.ai_schedule_refinements
      ADD CONSTRAINT ai_schedule_refinements_variety_fk
      FOREIGN KEY (variety_id) REFERENCES public.master_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proactive_alerts_variety
  ON public.proactive_alerts (variety_id) WHERE variety_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_variety
  ON public.schedule_tasks (variety_id) WHERE variety_id IS NOT NULL;

-- Item 11: Variety completeness scoring
ALTER TABLE public.master_products
  ADD COLUMN IF NOT EXISTS variety_completeness_score numeric;

CREATE OR REPLACE FUNCTION public.calc_variety_completeness(p_variety_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.master_products%ROWTYPE;
  v_score numeric := 0;
  v_resistance_count int := 0;
  v_translation_count int := 0;
BEGIN
  SELECT * INTO v_row FROM public.master_products
   WHERE id = p_variety_id AND product_type = 'seed';
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Each field worth up to 12.5; total 100.
  IF (v_row.maturity_days_min IS NOT NULL AND v_row.maturity_days_max IS NOT NULL) THEN
    v_score := v_score + 12.5;
  END IF;
  IF v_row.water_demand_mm_per_season IS NOT NULL THEN
    v_score := v_score + 12.5;
  END IF;
  IF v_row.irrigation_sensitivity IS NOT NULL
     AND jsonb_typeof(v_row.irrigation_sensitivity) = 'object' THEN
    v_score := v_score + 12.5;
  END IF;
  IF v_row.climate_suitability IS NOT NULL
     AND jsonb_typeof(v_row.climate_suitability) = 'object' THEN
    v_score := v_score + 12.5;
  END IF;
  IF v_row.soil_suitability IS NOT NULL
     AND jsonb_typeof(v_row.soil_suitability) = 'object' THEN
    v_score := v_score + 12.5;
  END IF;
  IF v_row.agro_ecological_suitability IS NOT NULL
     AND jsonb_typeof(v_row.agro_ecological_suitability) IN ('object','array') THEN
    v_score := v_score + 12.5;
  END IF;

  SELECT count(*) INTO v_resistance_count
    FROM public.variety_resistance WHERE variety_id = p_variety_id;
  IF v_resistance_count >= 1 THEN v_score := v_score + 12.5; END IF;

  SELECT count(*) INTO v_translation_count
    FROM public.master_product_translations WHERE product_id = p_variety_id;
  IF v_translation_count >= 3 THEN v_score := v_score + 12.5; END IF;

  RETURN round(v_score, 2);
EXCEPTION WHEN undefined_table THEN
  -- translations table may not exist; cap at 87.5
  RETURN round(v_score, 2);
END $$;

CREATE OR REPLACE FUNCTION public.refresh_variety_completeness_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_type = 'seed' THEN
    NEW.variety_completeness_score := public.calc_variety_completeness(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refresh_variety_completeness ON public.master_products;
CREATE TRIGGER trg_refresh_variety_completeness
  BEFORE INSERT OR UPDATE ON public.master_products
  FOR EACH ROW EXECUTE FUNCTION public.refresh_variety_completeness_trg();

-- View: per-variety data quality
CREATE OR REPLACE VIEW public.v_variety_data_quality AS
SELECT
  mp.id AS variety_id,
  mp.name AS variety_name,
  mp.crop_id,
  mp.variety_completeness_score,
  (mp.maturity_days_min IS NULL OR mp.maturity_days_max IS NULL) AS missing_maturity,
  (mp.maturity_days_min IS NOT NULL AND mp.maturity_days_max IS NOT NULL
     AND mp.maturity_days_min > mp.maturity_days_max) AS maturity_inverted,
  (mp.water_demand_mm_per_season IS NULL) AS missing_water_demand,
  (mp.climate_suitability IS NULL) AS missing_climate,
  (mp.soil_suitability IS NULL) AS missing_soil,
  COALESCE((SELECT count(*) FROM public.variety_resistance vr WHERE vr.variety_id = mp.id), 0) AS resistance_rows,
  COALESCE((SELECT count(*) FROM public.variety_resistance vr
            WHERE vr.variety_id = mp.id AND vr.canonical_observation_code IS NULL), 0) AS resistance_unmapped
FROM public.master_products mp
WHERE mp.product_type = 'seed';

GRANT SELECT ON public.v_variety_data_quality TO authenticated;
GRANT SELECT ON public.v_variety_data_quality TO service_role;

-- Backfill completeness for existing seed rows
UPDATE public.master_products mp
   SET variety_completeness_score = public.calc_variety_completeness(mp.id)
 WHERE product_type = 'seed';
