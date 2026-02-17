-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1: Intent Ontology Governance Columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE observation_intent_master
ADD COLUMN IF NOT EXISTS allowed_observation_groups text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS requires_crop_context boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS requires_stage_context boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS routing_target text DEFAULT 'SYMBOLIC_BRAIN',
ADD COLUMN IF NOT EXISTS is_biological boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS clarification_mode text DEFAULT 'AUTO',
ADD COLUMN IF NOT EXISTS max_clarification_rounds integer DEFAULT 2;

-- ═══════════════════════════════════════════════════════════════════════════
-- Update existing 15 intents with governance metadata
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE observation_intent_master SET
  allowed_observation_groups = '{PHYSIOLOGY}',
  requires_crop_context = true, requires_stage_context = true,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 3
WHERE intent_code = 'COLOR_CHANGE';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{PEST,DISEASE}',
  requires_crop_context = true, requires_stage_context = true,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 3
WHERE intent_code IN ('LEAF_DAMAGE_VISIBLE', 'LEAF_MARKS_OR_SPOTS',
  'PEST_PRESENCE_VISIBLE', 'DISEASE_LIKE_PATTERN', 'STEM_DAMAGE');

UPDATE observation_intent_master SET
  allowed_observation_groups = '{WATER,WATER_STRESS}',
  requires_crop_context = true, requires_stage_context = true,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code IN ('WATER_STRESS_SIGNAL', 'WILTING_OR_DROOPING');

UPDATE observation_intent_master SET
  allowed_observation_groups = '{NUTRITION}',
  requires_crop_context = true, requires_stage_context = true,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'NUTRIENT_STRESS_SIGNAL';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{ESTABLISHMENT}',
  requires_crop_context = true, requires_stage_context = true,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'EMERGENCE_FAILURE';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{GROWTH}',
  requires_crop_context = true, requires_stage_context = true,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'GROWTH_ANOMALY';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{FIELD}',
  requires_crop_context = true, requires_stage_context = false,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'UNEVEN_FIELD_PATTERN';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{OUTPUT}',
  requires_crop_context = true, requires_stage_context = false,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 1
WHERE intent_code = 'YIELD_OR_OUTPUT_ISSUE';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{ROOT}',
  requires_crop_context = true, requires_stage_context = true,
  routing_target = 'SYMBOLIC_BRAIN', is_biological = true,
  clarification_mode = 'SYMPTOM_DRIVEN', max_clarification_rounds = 2
WHERE intent_code = 'ROOT_OR_BASE_PROBLEM';

UPDATE observation_intent_master SET
  allowed_observation_groups = '{}',
  routing_target = 'SYMBOLIC_BRAIN', is_biological = false,
  clarification_mode = 'AUTO', max_clarification_rounds = 2
WHERE intent_code = 'UNKNOWN_OBSERVATION';

-- ═══════════════════════════════════════════════════════════════════════════
-- Insert missing 5 codes (exist in code, not in DB)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_intent_master
  (intent_code, intent_description, intent_category, is_active,
   allowed_observation_groups, requires_crop_context, requires_stage_context,
   routing_target, is_biological, clarification_mode, max_clarification_rounds)
VALUES
('WEED_PROBLEM', 'Weeds growing, weed competition, unwanted plants', 'WEED',
 true, '{WEED}', true, true, 'SYMBOLIC_BRAIN', true, 'SYMPTOM_DRIVEN', 1),
('FERTILIZER_SCHEDULE', 'When/how much fertilizer, nutrient schedule', 'NUTRITION',
 true, '{NUTRITION}', true, true, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('IRRIGATION_QUERY', 'Water schedule, irrigation timing', 'WATER',
 true, '{WATER}', true, true, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('HARVEST_TIMING', 'When to harvest, crop maturity signs', 'HARVEST',
 true, '{HARVEST,OUTPUT}', true, true, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('GENERAL_CROP_INFO', 'General crop management, planting info', 'GENERAL',
 true, '{}', true, false, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0)
ON CONFLICT (intent_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Insert new core agronomic intents
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_intent_master
  (intent_code, intent_description, intent_category, is_active,
   allowed_observation_groups, requires_crop_context, requires_stage_context,
   routing_target, is_biological, clarification_mode, max_clarification_rounds)
VALUES
('SOIL_TESTING_QUERY', 'Soil test interpretation, pH, EC, organic carbon', 'SOIL',
 true, '{SOIL}', false, false, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('SEED_SELECTION', 'Variety selection, seed rate, seed treatment', 'ESTABLISHMENT',
 true, '{ESTABLISHMENT}', true, false, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('POST_HARVEST_HANDLING', 'Storage, drying, grading after harvest', 'POST_HARVEST',
 true, '{POST_HARVEST}', true, false, 'SYMBOLIC_BRAIN', true, 'DIRECT', 0),
('ANIMAL_DAMAGE', 'Damage from wild boar, monkeys, birds, rats', 'PEST',
 true, '{PEST}', true, true, 'SYMBOLIC_BRAIN', true, 'SYMPTOM_DRIVEN', 2),
('FLOOD_DROUGHT_DAMAGE', 'Flood damage recovery, drought management, waterlogging', 'CLIMATE',
 true, '{WATER,WATER_STRESS}', true, true, 'SYMBOLIC_BRAIN', true, 'SYMPTOM_DRIVEN', 1),
('MARKET_PRICE_QUERY', 'Current market price, MSP, where to sell', 'ECONOMICS',
 true, '{}', true, false, 'INFO_MODULE', false, 'NONE', 0),
('SUBSIDY_SCHEME_INFO', 'Government schemes, subsidies, PM-KISAN', 'ECONOMICS',
 true, '{}', false, false, 'INFO_MODULE', false, 'NONE', 0),
('EQUIPMENT_USAGE', 'Sprayer, tractor operation and maintenance', 'EQUIPMENT',
 true, '{}', false, false, 'INFO_MODULE', false, 'NONE', 0),
('CROP_INSURANCE', 'Crop insurance claim, PMFBY', 'ECONOMICS',
 true, '{}', true, false, 'INFO_MODULE', false, 'NONE', 0),
('WEATHER_ADVISORY', 'Weather forecast impact, seasonal planning', 'CLIMATE',
 true, '{}', false, false, 'HYBRID', false, 'NONE', 0)
ON CONFLICT (intent_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2: Crop-Agnostic Intent-to-Observation Mapping Table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS intent_observation_mapping_v2 (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_code text NOT NULL,
  observation_code text NOT NULL,
  confidence_rank integer NOT NULL DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(intent_code, observation_code)
);

ALTER TABLE intent_observation_mapping_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intent_observation_mapping_v2_read" ON intent_observation_mapping_v2
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_iom_v2_intent_code ON intent_observation_mapping_v2(intent_code);
CREATE INDEX IF NOT EXISTS idx_iom_v2_active ON intent_observation_mapping_v2(is_active) WHERE is_active = true;

-- Migrate existing data from old table (crop-agnostic: deduplicate)
INSERT INTO intent_observation_mapping_v2 (intent_code, observation_code, confidence_rank, is_active)
SELECT DISTINCT ON (intent_code, observation_code)
  intent_code, observation_code, confidence_rank, true
FROM intent_observation_mapping
WHERE is_active = true
ORDER BY intent_code, observation_code, confidence_rank ASC
ON CONFLICT (intent_code, observation_code) DO NOTHING;

-- Seed mappings for NEW intents (EXCLUDING FERTILIZER_SCHEDULE per Patch 1)
INSERT INTO intent_observation_mapping_v2 (intent_code, observation_code, confidence_rank) VALUES
('WEED_PROBLEM', 'WEED_INFESTATION', 1),
('WEED_PROBLEM', 'STUNTED_PLANTS', 2),
('IRRIGATION_QUERY', 'LEAF_WILTING', 1),
('IRRIGATION_QUERY', 'LEAF_DRYING', 2),
('SOIL_TESTING_QUERY', 'LEAF_YELLOWING', 1),
('SEED_SELECTION', 'SEEDLING_DIED', 1),
('FLOOD_DROUGHT_DAMAGE', 'LEAF_WILTING', 1),
('FLOOD_DROUGHT_DAMAGE', 'ROOTS_ROTTED', 2),
('ANIMAL_DAMAGE', 'LEAF_CHEWING', 1),
('ANIMAL_DAMAGE', 'STEM_BORING_MARKS', 2)
ON CONFLICT (intent_code, observation_code) DO NOTHING;