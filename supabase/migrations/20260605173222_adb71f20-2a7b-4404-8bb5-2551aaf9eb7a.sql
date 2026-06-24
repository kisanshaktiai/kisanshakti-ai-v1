
ALTER TABLE public.master_products
  ADD COLUMN IF NOT EXISTS water_demand_mm_per_season    numeric,
  ADD COLUMN IF NOT EXISTS water_demand_category         text CHECK (water_demand_category IN ('low','medium','high') OR water_demand_category IS NULL),
  ADD COLUMN IF NOT EXISTS irrigation_sensitivity        jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS climate_suitability           jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS state_suitability             text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS agro_climatic_zones           text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS soil_suitability              jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS yield_irrigated_qtl_per_acre  numeric,
  ADD COLUMN IF NOT EXISTS yield_rainfed_qtl_per_acre    numeric,
  ADD COLUMN IF NOT EXISTS variety_class                 text CHECK (variety_class IN ('hybrid','OPV','inbred','GMO','landrace','clonal') OR variety_class IS NULL),
  ADD COLUMN IF NOT EXISTS notification_number           text,
  ADD COLUMN IF NOT EXISTS notification_date             date,
  ADD COLUMN IF NOT EXISTS catalog_url                   text,
  ADD COLUMN IF NOT EXISTS breeder_institute_id          uuid REFERENCES public.master_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_completeness_score       numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_master_products_state_suitability
  ON public.master_products USING GIN (state_suitability)
  WHERE product_type = 'seed';
CREATE INDEX IF NOT EXISTS idx_master_products_water_demand
  ON public.master_products (water_demand_category)
  WHERE product_type = 'seed';
CREATE INDEX IF NOT EXISTS idx_master_products_crop_seed
  ON public.master_products (crop_id)
  WHERE product_type = 'seed';

-- variety_resistance
CREATE TABLE IF NOT EXISTS public.variety_resistance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variety_id        uuid NOT NULL REFERENCES public.master_products(id) ON DELETE CASCADE,
  threat_type       text NOT NULL CHECK (threat_type IN ('disease','pest','abiotic','weed')),
  observation_code  text,
  threat_name       text NOT NULL,
  resistance_level  text NOT NULL CHECK (resistance_level IN ('HR','R','MR','MS','S','HS','unknown')),
  trial_score       numeric,
  source            text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variety_id, threat_type, threat_name)
);
CREATE INDEX IF NOT EXISTS idx_variety_resistance_variety ON public.variety_resistance (variety_id);
CREATE INDEX IF NOT EXISTS idx_variety_resistance_obs     ON public.variety_resistance (observation_code);
CREATE INDEX IF NOT EXISTS idx_variety_resistance_level   ON public.variety_resistance (resistance_level);

GRANT SELECT ON public.variety_resistance TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variety_resistance TO authenticated;
GRANT ALL ON public.variety_resistance TO service_role;

ALTER TABLE public.variety_resistance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variety_resistance_public_read" ON public.variety_resistance FOR SELECT USING (true);
CREATE POLICY "variety_resistance_admin_write" ON public.variety_resistance FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- variety_translations
CREATE TABLE IF NOT EXISTS public.variety_translations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variety_id         uuid NOT NULL REFERENCES public.master_products(id) ON DELETE CASCADE,
  language_code      text NOT NULL CHECK (language_code IN ('en','hi','mr','pa','gu','ta','te','kn','ml','bn','or','as','ur','sa')),
  display_name       text NOT NULL,
  short_description  text,
  local_synonyms     text[] DEFAULT ARRAY[]::text[],
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variety_id, language_code)
);
CREATE INDEX IF NOT EXISTS idx_variety_translations_variety ON public.variety_translations (variety_id);
CREATE INDEX IF NOT EXISTS idx_variety_translations_lang    ON public.variety_translations (language_code);

GRANT SELECT ON public.variety_translations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variety_translations TO authenticated;
GRANT ALL ON public.variety_translations TO service_role;

ALTER TABLE public.variety_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variety_translations_public_read" ON public.variety_translations FOR SELECT USING (true);
CREATE POLICY "variety_translations_admin_write" ON public.variety_translations FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

INSERT INTO public.variety_translations (variety_id, language_code, display_name)
SELECT id, 'en', name FROM public.master_products
WHERE product_type = 'seed' AND name IS NOT NULL
ON CONFLICT (variety_id, language_code) DO NOTHING;

INSERT INTO public.variety_translations (variety_id, language_code, display_name)
SELECT id, 'hi', label_hi FROM public.master_products
WHERE product_type = 'seed' AND label_hi IS NOT NULL
ON CONFLICT (variety_id, language_code) DO NOTHING;

INSERT INTO public.variety_translations (variety_id, language_code, display_name)
SELECT id, 'mr', label_mr FROM public.master_products
WHERE product_type = 'seed' AND label_mr IS NOT NULL
ON CONFLICT (variety_id, language_code) DO NOTHING;

-- variety_source_references
CREATE TABLE IF NOT EXISTS public.variety_source_references (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variety_id         uuid NOT NULL REFERENCES public.master_products(id) ON DELETE CASCADE,
  ref_type           text NOT NULL CHECK (ref_type IN ('gazette','icar_catalog','sau_release','paper','breeder','field_trial','other')),
  title              text NOT NULL,
  url                text,
  publication_year   integer,
  authority          text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variety_source_refs_variety ON public.variety_source_references (variety_id);

GRANT SELECT ON public.variety_source_references TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variety_source_references TO authenticated;
GRANT ALL ON public.variety_source_references TO service_role;

ALTER TABLE public.variety_source_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variety_source_refs_public_read" ON public.variety_source_references FOR SELECT USING (true);
CREATE POLICY "variety_source_refs_admin_write" ON public.variety_source_references FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_variety_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_variety_resistance_touch ON public.variety_resistance;
CREATE TRIGGER trg_variety_resistance_touch BEFORE UPDATE ON public.variety_resistance
  FOR EACH ROW EXECUTE FUNCTION public.touch_variety_updated_at();

DROP TRIGGER IF EXISTS trg_variety_translations_touch ON public.variety_translations;
CREATE TRIGGER trg_variety_translations_touch BEFORE UPDATE ON public.variety_translations
  FOR EACH ROW EXECUTE FUNCTION public.touch_variety_updated_at();

DROP TRIGGER IF EXISTS trg_variety_source_refs_touch ON public.variety_source_references;
CREATE TRIGGER trg_variety_source_refs_touch BEFORE UPDATE ON public.variety_source_references
  FOR EACH ROW EXECUTE FUNCTION public.touch_variety_updated_at();
