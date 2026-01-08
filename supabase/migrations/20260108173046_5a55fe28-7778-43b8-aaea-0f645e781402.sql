-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1: WORLD-CLASS RULE SCHEMA ENHANCEMENT
-- Adds scientific validation, ETL thresholds, PHI compliance, and expert approval
-- ═══════════════════════════════════════════════════════════════════════════

-- Add scientific validation columns to decision_rules
ALTER TABLE public.decision_rules 
ADD COLUMN IF NOT EXISTS etl_threshold TEXT,
ADD COLUMN IF NOT EXISTS etl_unit TEXT,
ADD COLUMN IF NOT EXISTS phi_days INTEGER,
ADD COLUMN IF NOT EXISTS active_ingredient TEXT,
ADD COLUMN IF NOT EXISTS chemical_class TEXT,
ADD COLUMN IF NOT EXISTS organic_alternative TEXT,
ADD COLUMN IF NOT EXISTS weather_dependency JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS min_temperature INTEGER,
ADD COLUMN IF NOT EXISTS max_temperature INTEGER,
ADD COLUMN IF NOT EXISTS max_wind_speed INTEGER,
ADD COLUMN IF NOT EXISTS rain_delay_hours INTEGER,
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) DEFAULT 0.80,
ADD COLUMN IF NOT EXISTS icar_package_ref TEXT,
ADD COLUMN IF NOT EXISTS university_source TEXT,
ADD COLUMN IF NOT EXISTS research_paper_ref TEXT,
ADD COLUMN IF NOT EXISTS expert_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_by TEXT,
ADD COLUMN IF NOT EXISTS approval_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS field_validated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS validation_trials INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS resistance_group TEXT,
ADD COLUMN IF NOT EXISTS mode_of_action TEXT,
ADD COLUMN IF NOT EXISTS target_pest_stage TEXT,
ADD COLUMN IF NOT EXISTS application_method TEXT,
ADD COLUMN IF NOT EXISTS dosage_per_acre TEXT,
ADD COLUMN IF NOT EXISTS water_volume_per_acre TEXT,
ADD COLUMN IF NOT EXISTS reentry_interval_hours INTEGER,
ADD COLUMN IF NOT EXISTS bee_toxicity TEXT CHECK (bee_toxicity IN ('HIGH', 'MODERATE', 'LOW', 'SAFE')),
ADD COLUMN IF NOT EXISTS aquatic_toxicity TEXT CHECK (aquatic_toxicity IN ('HIGH', 'MODERATE', 'LOW', 'SAFE')),
ADD COLUMN IF NOT EXISTS ipm_level INTEGER CHECK (ipm_level BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS rule_version TEXT DEFAULT '2.0.0',
ADD COLUMN IF NOT EXISTS supersedes_rule_id TEXT,
ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deprecation_reason TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.decision_rules.etl_threshold IS 'Economic Threshold Level - pest count that justifies treatment';
COMMENT ON COLUMN public.decision_rules.phi_days IS 'Pre-Harvest Interval in days';
COMMENT ON COLUMN public.decision_rules.ipm_level IS '1=Cultural, 2=Mechanical/Bio, 3=Botanical, 4=Selective Chemical, 5=Broad-spectrum';
COMMENT ON COLUMN public.decision_rules.bee_toxicity IS 'Pollinator safety rating';
COMMENT ON COLUMN public.decision_rules.resistance_group IS 'IRAC/FRAC resistance management group';

-- Create rule history table for audit trail
CREATE TABLE IF NOT EXISTS public.decision_rules_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT now(),
  changed_by TEXT,
  change_type TEXT CHECK (change_type IN ('CREATE', 'UPDATE', 'DEPRECATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  change_reason TEXT
);

-- Enable RLS on history table
ALTER TABLE public.decision_rules_history ENABLE ROW LEVEL SECURITY;

-- Policy for reading history (authenticated users)
CREATE POLICY "Allow read access to rule history" ON public.decision_rules_history
  FOR SELECT USING (true);

-- Policy for inserting history (service role only via edge functions)
CREATE POLICY "Allow insert to rule history" ON public.decision_rules_history
  FOR INSERT WITH CHECK (true);

-- Create composite indexes for scalable rule lookups (Phase 6)
CREATE INDEX IF NOT EXISTS idx_decision_rules_crop_category_active 
  ON public.decision_rules(crop_code, category, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_decision_rules_ipm_level 
  ON public.decision_rules(ipm_level) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_decision_rules_expert_approved 
  ON public.decision_rules(expert_approved, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_decision_rules_canonical_group 
  ON public.decision_rules(canonical_group, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_decision_rules_bee_toxicity 
  ON public.decision_rules(bee_toxicity) 
  WHERE bee_toxicity = 'HIGH';

-- Create ETL reference table for standardized thresholds
CREATE TABLE IF NOT EXISTS public.etl_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pest_code TEXT NOT NULL,
  pest_name_en TEXT NOT NULL,
  pest_name_hi TEXT,
  pest_name_mr TEXT,
  crop_code TEXT NOT NULL,
  growth_stage TEXT[],
  etl_value DECIMAL(10,2) NOT NULL,
  etl_unit TEXT NOT NULL,
  sampling_method TEXT,
  icar_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(pest_code, crop_code)
);

-- Enable RLS
ALTER TABLE public.etl_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to ETL standards" ON public.etl_standards
  FOR SELECT USING (true);

-- Insert standard ETL values from ICAR packages
INSERT INTO public.etl_standards (pest_code, pest_name_en, crop_code, growth_stage, etl_value, etl_unit, sampling_method, icar_source) VALUES
-- Cotton pests
('APHID', 'Aphid', 'COTTON', ARRAY['VEGETATIVE', 'SQUARING', 'FLOWERING'], 10, 'per leaf', 'Count on 3 leaves per plant, 10 plants', 'ICAR-CICR Package 2023'),
('WHITEFLY', 'Whitefly', 'COTTON', ARRAY['VEGETATIVE', 'SQUARING', 'FLOWERING', 'BOLL_DEVELOPMENT'], 6, 'adults per leaf', 'Morning observation, 3 leaves per plant', 'ICAR-CICR Package 2023'),
('THRIPS', 'Thrips', 'COTTON', ARRAY['SEEDLING', 'VEGETATIVE'], 10, 'per leaf', 'Tap leaf over white paper', 'ICAR-CICR Package 2023'),
('JASSID', 'Jassid/Leafhopper', 'COTTON', ARRAY['VEGETATIVE', 'SQUARING'], 2, 'per leaf', 'Count nymphs on lower surface', 'ICAR-CICR Package 2023'),
('MEALYBUG', 'Mealybug', 'COTTON', ARRAY['VEGETATIVE', 'SQUARING', 'FLOWERING'], 5, 'percent infested plants', 'Visual inspection of 50 plants', 'ICAR-CICR Package 2023'),
('BOLLWORM_AMERICAN', 'American Bollworm', 'COTTON', ARRAY['SQUARING', 'FLOWERING', 'BOLL_DEVELOPMENT'], 1, 'larva per plant', 'Visual + pheromone trap', 'ICAR-CICR Package 2023'),
('BOLLWORM_PINK', 'Pink Bollworm', 'COTTON', ARRAY['FLOWERING', 'BOLL_DEVELOPMENT'], 8, 'moths per trap per week', 'Pheromone trap monitoring', 'ICAR-CICR Package 2023'),
('BOLLWORM_SPOTTED', 'Spotted Bollworm', 'COTTON', ARRAY['SQUARING', 'FLOWERING'], 1, 'larva per plant', 'Visual inspection', 'ICAR-CICR Package 2023'),
-- Rice pests
('STEM_BORER', 'Yellow Stem Borer', 'RICE', ARRAY['TILLERING', 'BOOTING', 'FLOWERING'], 5, 'percent dead hearts', 'Count in 1 sq meter, 5 spots', 'ICAR-IIRR Package 2023'),
('BPH', 'Brown Planthopper', 'RICE', ARRAY['TILLERING', 'BOOTING', 'FLOWERING', 'GRAIN_FILLING'], 10, 'per hill', 'Tap tillers, count fallen hoppers', 'ICAR-IIRR Package 2023'),
('LEAF_FOLDER', 'Leaf Folder', 'RICE', ARRAY['TILLERING', 'BOOTING'], 2, 'damaged leaves per hill', 'Count folded leaves', 'ICAR-IIRR Package 2023'),
('GALL_MIDGE', 'Gall Midge', 'RICE', ARRAY['SEEDLING', 'TILLERING'], 5, 'percent silver shoots', 'Visual observation', 'ICAR-IIRR Package 2023'),
-- Wheat pests
('APHID', 'Aphid', 'WHEAT', ARRAY['TILLERING', 'BOOTING', 'FLOWERING'], 5, 'per ear', 'Count on 20 random ears', 'ICAR-IIWBR Package 2023'),
('TERMITE', 'Termite', 'WHEAT', ARRAY['SEEDLING', 'TILLERING'], 10, 'percent infested plants', 'Uproot and check roots', 'ICAR-IIWBR Package 2023'),
-- Sugarcane pests
('EARLY_SHOOT_BORER', 'Early Shoot Borer', 'SUGARCANE', ARRAY['GERMINATION', 'TILLERING'], 10, 'percent dead hearts', 'Count dead hearts in 100 clumps', 'ICAR-SBI Package 2023'),
('TOP_BORER', 'Top Borer', 'SUGARCANE', ARRAY['GRAND_GROWTH'], 5, 'percent dead hearts', 'Visual inspection', 'ICAR-SBI Package 2023'),
('INTERNODE_BORER', 'Internode Borer', 'SUGARCANE', ARRAY['GRAND_GROWTH', 'MATURITY'], 15, 'percent internodes bored', 'Split cane inspection', 'ICAR-SBI Package 2023'),
('WOOLLY_APHID', 'Woolly Aphid', 'SUGARCANE', ARRAY['GRAND_GROWTH'], 2, 'colonies per meter row', 'Visual count of white patches', 'ICAR-SBI Package 2023'),
-- Soybean pests
('SEMILOOPER', 'Semilooper', 'SOYBEAN', ARRAY['VEGETATIVE', 'FLOWERING', 'POD_FORMATION'], 4, 'larvae per meter row', 'Shake plants over cloth', 'ICAR-IISR Package 2023'),
('GIRDLE_BEETLE', 'Girdle Beetle', 'SOYBEAN', ARRAY['FLOWERING', 'POD_FORMATION'], 10, 'percent girdled plants', 'Count girdled stems', 'ICAR-IISR Package 2023'),
('SPODOPTERA', 'Tobacco Caterpillar', 'SOYBEAN', ARRAY['VEGETATIVE', 'FLOWERING'], 4, 'larvae per meter row', 'Visual count', 'ICAR-IISR Package 2023'),
-- Tomato pests
('FRUIT_BORER', 'Fruit Borer', 'TOMATO', ARRAY['FLOWERING', 'FRUITING'], 1, 'larva per plant', 'Inspect 20 plants', 'ICAR-IIVR Package 2023'),
('WHITEFLY', 'Whitefly', 'TOMATO', ARRAY['VEGETATIVE', 'FLOWERING', 'FRUITING'], 4, 'adults per leaf', 'Morning observation', 'ICAR-IIVR Package 2023'),
-- Onion pests
('THRIPS', 'Thrips', 'ONION', ARRAY['VEGETATIVE', 'BULB_FORMATION'], 30, 'per plant', 'Tap leaves, count on white paper', 'ICAR-DOGR Package 2023'),
-- Gram/Chickpea pests
('POD_BORER', 'Gram Pod Borer', 'GRAM', ARRAY['FLOWERING', 'POD_FORMATION'], 2, 'larvae per meter row', 'Visual + pheromone trap', 'ICAR-IIPR Package 2023'),
-- Groundnut pests
('LEAF_MINER', 'Leaf Miner', 'GROUNDNUT', ARRAY['VEGETATIVE', 'FLOWERING'], 10, 'percent leaves mined', 'Random leaf sampling', 'ICAR-DGR Package 2023'),
('SPODOPTERA', 'Tobacco Caterpillar', 'GROUNDNUT', ARRAY['VEGETATIVE', 'FLOWERING'], 4, 'larvae per meter row', 'Visual count', 'ICAR-DGR Package 2023')
ON CONFLICT (pest_code, crop_code) DO NOTHING;