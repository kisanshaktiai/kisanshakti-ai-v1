
-- ═══════════════════════════════════════════════════════════════════════════
-- FIX CRITICAL BUG #1: Populate conditions_json.observations for 99 dead rules
-- These rules had NEITHER observable_characteristics NOR conditions_json.observations,
-- making them invisible to the hypothesis evaluator and rule matcher.
-- ═══════════════════════════════════════════════════════════════════════════

-- NUTRIENT_MANAGEMENT rules (12) → nutrition-related observations
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["NUTRIENT_DEFICIENCY", "YELLOWING", "STUNTED_GROWTH"]}'::jsonb
WHERE condition_code = 'NUTRIENT_MANAGEMENT'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- IRRIGATION_TRIGGER rules (9) → water/irrigation observations
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["WATER_STRESS", "WILTING", "LEAF_DRYING"]}'::jsonb
WHERE condition_code = 'IRRIGATION_TRIGGER'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- ETL_THRESHOLD pest/ipm rules (8) → pest damage observations
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["PEST_DAMAGE", "BORER_DAMAGE", "DEAD_HEART"]}'::jsonb
WHERE condition_code = 'ETL_THRESHOLD'
  AND category IN ('pest', 'ipm')
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- DISEASE_DIAGNOSIS rule (1) → disease observations
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["DISEASE_SYMPTOMS", "FUNGAL_GROWTH", "LEAF_SPOTS"]}'::jsonb
WHERE condition_code = 'DISEASE_DIAGNOSIS'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- WEATHER_TRIGGERED rules (3) → weather stress observations
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["WEATHER_DAMAGE", "FROST_DAMAGE", "HEAT_STRESS"]}'::jsonb
WHERE condition_code = 'WEATHER_TRIGGERED'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- NDVI_TRIGGERED rules (3) → remote sensing observations
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["NDVI_DECLINE", "CROP_STRESS", "CANOPY_THINNING"]}'::jsonb
WHERE condition_code = 'NDVI_TRIGGERED'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- SAFETY_BLOCK rules (19) → these are blocking rules, add safety-specific observations
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["SAFETY_CONCERN", "PRE_HARVEST_STAGE", "CHEMICAL_EXPOSURE"]}'::jsonb
WHERE condition_code = 'SAFETY_BLOCK'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- STAGE_SPECIFIC best practice/advisory rules (24) → stage-specific observations
-- Split by category for more relevant observations:

-- Ratoon management
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["RATOON_MANAGEMENT", "POST_HARVEST", "STUBBLE_CONDITION"]}'::jsonb
WHERE condition_code = 'STAGE_SPECIFIC'
  AND category IN ('best_practice_ratoon', 'ratoon_management')
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- Harvest optimization
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["HARVEST_READINESS", "MATURITY_SIGNS", "BRIX_LEVEL"]}'::jsonb
WHERE condition_code = 'STAGE_SPECIFIC'
  AND category IN ('harvest_opt')
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- Economics / decision gate
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["ECONOMICS_QUERY", "COST_BENEFIT", "YIELD_ESTIMATION"]}'::jsonb
WHERE condition_code = 'STAGE_SPECIFIC'
  AND category IN ('economics', 'decision_gate')
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- Soil management
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["SOIL_CONDITION", "SOIL_HEALTH", "PH_IMBALANCE"]}'::jsonb
WHERE condition_code IN ('STAGE_SPECIFIC', 'STAGE_GENERAL')
  AND category = 'soil'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- System calibration / data quality
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["SYSTEM_CHECK", "DATA_QUALITY"]}'::jsonb
WHERE condition_code IN ('STAGE_SPECIFIC', 'STAGE_GENERAL')
  AND category IN ('system_calibration', 'data_quality')
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- MULTI_STAGE best practice / intercrop / stress rules (12)
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["GENERAL_ADVISORY", "CROP_MANAGEMENT", "GROWTH_STAGE"]}'::jsonb
WHERE condition_code = 'MULTI_STAGE'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- Remaining STAGE_GENERAL rules not yet covered
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["GENERAL_ADVISORY", "STAGE_QUERY"]}'::jsonb
WHERE condition_code = 'STAGE_GENERAL'
  AND is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);

-- Catch-all: any remaining dead rules 
UPDATE decision_rules 
SET conditions_json = COALESCE(conditions_json, '{}'::jsonb) || 
    '{"observations": ["GENERAL_ADVISORY"]}'::jsonb
WHERE is_active = true
  AND (observable_characteristics IS NULL OR observable_characteristics = '{}'::jsonb)
  AND (conditions_json->'observations' IS NULL OR conditions_json->'observations' = '[]'::jsonb);
