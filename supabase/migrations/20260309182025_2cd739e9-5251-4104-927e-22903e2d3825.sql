-- Fix DAS gap for LEAF_YELLOWING and add missing yellowing-related observation codes for SUGARCANE
-- The first INSERT (LEAF_YELLOWING TILLERING gap) already succeeded in prior migration attempt
-- Re-running with ON CONFLICT DO NOTHING for idempotency

-- 1. Fill the DAS gap for LEAF_YELLOWING (60-120 = TILLERING stage)
INSERT INTO intent_observation_mapping (crop_code, observation_code, intent_code, growth_stage, das_min, das_max, is_active, confidence_rank)
VALUES 
  ('SUGARCANE', 'LEAF_YELLOWING', 'COLOR_CHANGE', 'TILLERING', 60, 120, true, 1)
ON CONFLICT DO NOTHING;

-- 2. Add YELLOWING for full sugarcane lifecycle
INSERT INTO intent_observation_mapping (crop_code, observation_code, intent_code, growth_stage, das_min, das_max, is_active, confidence_rank)
VALUES 
  ('SUGARCANE', 'YELLOWING', 'COLOR_CHANGE', 'GERMINATION', 0, 45, true, 2),
  ('SUGARCANE', 'YELLOWING', 'COLOR_CHANGE', 'TILLERING', 45, 120, true, 2),
  ('SUGARCANE', 'YELLOWING', 'COLOR_CHANGE', 'GRAND_GROWTH', 120, 270, true, 2),
  ('SUGARCANE', 'YELLOWING', 'COLOR_CHANGE', 'MATURITY', 270, 365, true, 2)
ON CONFLICT DO NOTHING;

-- 3. Add YELLOWING_LEAVES
INSERT INTO intent_observation_mapping (crop_code, observation_code, intent_code, growth_stage, das_min, das_max, is_active, confidence_rank)
VALUES 
  ('SUGARCANE', 'YELLOWING_LEAVES', 'COLOR_CHANGE', 'GERMINATION', 0, 45, true, 3),
  ('SUGARCANE', 'YELLOWING_LEAVES', 'COLOR_CHANGE', 'TILLERING', 45, 120, true, 3),
  ('SUGARCANE', 'YELLOWING_LEAVES', 'COLOR_CHANGE', 'GRAND_GROWTH', 120, 270, true, 3),
  ('SUGARCANE', 'YELLOWING_LEAVES', 'COLOR_CHANGE', 'MATURITY', 270, 365, true, 3)
ON CONFLICT DO NOTHING;

-- 4. Add CHLOROSIS
INSERT INTO intent_observation_mapping (crop_code, observation_code, intent_code, growth_stage, das_min, das_max, is_active, confidence_rank)
VALUES 
  ('SUGARCANE', 'CHLOROSIS', 'COLOR_CHANGE', 'GERMINATION', 0, 45, true, 2),
  ('SUGARCANE', 'CHLOROSIS', 'COLOR_CHANGE', 'TILLERING', 45, 120, true, 2),
  ('SUGARCANE', 'CHLOROSIS', 'COLOR_CHANGE', 'GRAND_GROWTH', 120, 270, true, 2),
  ('SUGARCANE', 'CHLOROSIS', 'COLOR_CHANGE', 'MATURITY', 270, 365, true, 2)
ON CONFLICT DO NOTHING;

-- 5. Add LEAF_PALE_GREEN
INSERT INTO intent_observation_mapping (crop_code, observation_code, intent_code, growth_stage, das_min, das_max, is_active, confidence_rank)
VALUES 
  ('SUGARCANE', 'LEAF_PALE_GREEN', 'COLOR_CHANGE', 'GERMINATION', 0, 45, true, 2),
  ('SUGARCANE', 'LEAF_PALE_GREEN', 'COLOR_CHANGE', 'TILLERING', 45, 120, true, 2),
  ('SUGARCANE', 'LEAF_PALE_GREEN', 'COLOR_CHANGE', 'GRAND_GROWTH', 120, 270, true, 2),
  ('SUGARCANE', 'LEAF_PALE_GREEN', 'COLOR_CHANGE', 'MATURITY', 270, 365, true, 2)
ON CONFLICT DO NOTHING;

-- 6. Add NUTRIENT_DEFICIENCY (using valid FK: NUTRIENT_STRESS_SIGNAL)
INSERT INTO intent_observation_mapping (crop_code, observation_code, intent_code, growth_stage, das_min, das_max, is_active, confidence_rank)
VALUES 
  ('SUGARCANE', 'NUTRIENT_DEFICIENCY', 'NUTRIENT_STRESS_SIGNAL', 'GERMINATION', 0, 45, true, 1),
  ('SUGARCANE', 'NUTRIENT_DEFICIENCY', 'NUTRIENT_STRESS_SIGNAL', 'TILLERING', 45, 120, true, 1),
  ('SUGARCANE', 'NUTRIENT_DEFICIENCY', 'NUTRIENT_STRESS_SIGNAL', 'GRAND_GROWTH', 120, 270, true, 1),
  ('SUGARCANE', 'NUTRIENT_DEFICIENCY', 'NUTRIENT_STRESS_SIGNAL', 'MATURITY', 270, 365, true, 1)
ON CONFLICT DO NOTHING;