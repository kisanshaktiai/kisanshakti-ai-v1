-- ============================================================================
-- MIGRATION: Agricultural Knowledge Base Schema Updates
-- 1. Create crop_baseline_guidelines_v2 (flat row-per-stage)
-- 2. Add columns to etl_standards
-- 3. Add columns to agro_climatic_zones
-- 4. Create crop_synonyms table
-- ============================================================================

-- 1. NEW TABLE: crop_baseline_guidelines_v2
CREATE TABLE IF NOT EXISTS public.crop_baseline_guidelines_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_code TEXT NOT NULL,
    growth_stage TEXT NOT NULL,
    das_start INTEGER,
    das_end INTEGER,
    nitrogen_min NUMERIC(10,2),
    nitrogen_max NUMERIC(10,2),
    nitrogen_optimal NUMERIC(10,2),
    phosphorus_min NUMERIC(10,2),
    phosphorus_max NUMERIC(10,2),
    phosphorus_optimal NUMERIC(10,2),
    potassium_min NUMERIC(10,2),
    potassium_max NUMERIC(10,2),
    potassium_optimal NUMERIC(10,2),
    sulphur_optimal NUMERIC(10,2),
    zinc_optimal NUMERIC(10,2),
    iron_optimal NUMERIC(10,2),
    irrigation_interval_days INTEGER,
    water_requirement_mm NUMERIC(10,2),
    critical_moisture_percent NUMERIC(5,2),
    soil_ph_min NUMERIC(3,1),
    soil_ph_max NUMERIC(3,1),
    soil_ec_max NUMERIC(4,2),
    notes TEXT,
    source_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(crop_code, growth_stage)
);

CREATE INDEX IF NOT EXISTS idx_crop_baseline_v2_crop_stage 
ON public.crop_baseline_guidelines_v2 (crop_code, growth_stage) WHERE is_active = true;

ALTER TABLE public.crop_baseline_guidelines_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for crop baselines"
ON public.crop_baseline_guidelines_v2 FOR SELECT
TO authenticated, anon
USING (true);

-- 2. ALTER etl_standards: add missing columns
ALTER TABLE public.etl_standards 
  ADD COLUMN IF NOT EXISTS sampling_unit TEXT,
  ADD COLUMN IF NOT EXISTS action_threshold NUMERIC,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_etl_standards_crop_pest_active 
ON public.etl_standards (crop_code, pest_code) WHERE is_active = true;

-- 3. ALTER agro_climatic_zones: add weather/spray columns
ALTER TABLE public.agro_climatic_zones 
  ADD COLUMN IF NOT EXISTS zone_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS states_covered TEXT,
  ADD COLUMN IF NOT EXISTS climate_type TEXT,
  ADD COLUMN IF NOT EXISTS avg_rainfall_mm NUMERIC,
  ADD COLUMN IF NOT EXISTS rainfall_pattern TEXT,
  ADD COLUMN IF NOT EXISTS temp_min_summer NUMERIC,
  ADD COLUMN IF NOT EXISTS temp_max_summer NUMERIC,
  ADD COLUMN IF NOT EXISTS temp_min_winter NUMERIC,
  ADD COLUMN IF NOT EXISTS temp_max_winter NUMERIC,
  ADD COLUMN IF NOT EXISTS humidity_avg NUMERIC,
  ADD COLUMN IF NOT EXISTS soil_types TEXT,
  ADD COLUMN IF NOT EXISTS major_crops TEXT,
  ADD COLUMN IF NOT EXISTS spray_wind_threshold_kmph NUMERIC,
  ADD COLUMN IF NOT EXISTS spray_temp_max NUMERIC,
  ADD COLUMN IF NOT EXISTS spray_humidity_min NUMERIC,
  ADD COLUMN IF NOT EXISTS critical_period_start TEXT,
  ADD COLUMN IF NOT EXISTS critical_period_end TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_agro_zones_code_active 
ON public.agro_climatic_zones (zone_code) WHERE is_active = true;

-- 4. NEW TABLE: crop_synonyms
CREATE TABLE IF NOT EXISTS public.crop_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_crop TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    language_code TEXT NOT NULL DEFAULT 'en',
    variant_type TEXT NOT NULL DEFAULT 'standard',
    region TEXT DEFAULT 'ALL',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(canonical_crop, variant_name, language_code)
);

CREATE INDEX IF NOT EXISTS idx_crop_synonyms_variant 
ON public.crop_synonyms (lower(variant_name)) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_crop_synonyms_canonical 
ON public.crop_synonyms (canonical_crop) WHERE is_active = true;

ALTER TABLE public.crop_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for crop synonyms"
ON public.crop_synonyms FOR SELECT
TO authenticated, anon
USING (true);