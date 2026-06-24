
ALTER TABLE public.master_products
  ADD COLUMN IF NOT EXISTS agro_ecological_suitability jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_confidence_score       numeric CHECK (data_confidence_score IS NULL OR (data_confidence_score >= 0 AND data_confidence_score <= 100)),
  ADD COLUMN IF NOT EXISTS recommendation_priority     integer DEFAULT 60 CHECK (recommendation_priority IS NULL OR (recommendation_priority >= 0 AND recommendation_priority <= 100)),
  ADD COLUMN IF NOT EXISTS availability_status         text DEFAULT 'available' CHECK (availability_status IN ('available','limited','discontinued','experimental','seasonal') OR availability_status IS NULL),
  ADD COLUMN IF NOT EXISTS state_suitability_ids       uuid[] DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS suitable_district_ids       uuid[] DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS suitable_zone_ids           uuid[] DEFAULT ARRAY[]::uuid[];

COMMENT ON COLUMN public.master_products.agro_ecological_suitability IS
  'Sub-state agro-ecological flags. Example: { "rainfed":true, "irrigated":true, "black_soil":true, "red_soil":false, "high_rainfall":false, "low_rainfall":true, "coastal":false, "hilly":false }';
COMMENT ON COLUMN public.master_products.data_confidence_score IS '0-100 trust score for the data source (ICAR=95, SAU=90, breeder=80, internet=50, manual=40).';
COMMENT ON COLUMN public.master_products.recommendation_priority IS '0-100 ranking used by symbolic brain to prefer better varieties (100=Best, 80=Recommended, 60=Acceptable, 30=Legacy).';
COMMENT ON COLUMN public.master_products.availability_status IS 'available|limited|discontinued|experimental|seasonal. AI must NOT recommend discontinued varieties.';
COMMENT ON COLUMN public.master_products.state_suitability_ids IS 'FK array → public.states(id). SSOT for state filtering. The text[] state_suitability column is a display/export mirror.';

CREATE INDEX IF NOT EXISTS idx_master_products_state_ids ON public.master_products USING GIN (state_suitability_ids) WHERE product_type='seed';
CREATE INDEX IF NOT EXISTS idx_master_products_district_ids ON public.master_products USING GIN (suitable_district_ids) WHERE product_type='seed';
CREATE INDEX IF NOT EXISTS idx_master_products_zone_ids ON public.master_products USING GIN (suitable_zone_ids) WHERE product_type='seed';
CREATE INDEX IF NOT EXISTS idx_master_products_availability ON public.master_products (availability_status) WHERE product_type='seed';
CREATE INDEX IF NOT EXISTS idx_master_products_priority ON public.master_products (recommendation_priority DESC) WHERE product_type='seed';
