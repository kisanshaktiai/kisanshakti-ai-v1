-- Fix observable_characteristics for rules with empty objects or invalid format
-- CRITICAL: This fixes the "[ExtractObs] Skipping unknown object structure" issue

-- Fix sugarcane germination rules with empty observable_characteristics
UPDATE decision_rules 
SET observable_characteristics = '["PLANT_DEATH", "GAPS_IN_FIELD", "POOR_GERMINATION_PERCENT", "SEEDLING_STUNTED"]'::jsonb
WHERE rule_id = 'SUGARCANE_PLANT_DEATH_DIAGNOSIS_001'
  AND (observable_characteristics IS NULL 
       OR observable_characteristics::text = '{}'
       OR observable_characteristics::text = 'null');

-- Fix any other rules in germination stage with empty/invalid observable_characteristics
UPDATE decision_rules 
SET observable_characteristics = COALESCE(
  CASE 
    WHEN canonical_group = '03_pest' THEN '["INSECTS_VISIBLE", "LARVAE_PRESENT", "LEAF_CHEWING"]'::jsonb
    WHEN canonical_group = '04_disease' THEN '["LEAF_SPOTS_PRESENT", "LEAF_YELLOWING", "WILTING"]'::jsonb
    WHEN canonical_group = '01_establishment' THEN '["POOR_GERMINATION_PERCENT", "GAPS_IN_FIELD", "SEEDLING_STUNTED"]'::jsonb
    ELSE '["UNKNOWN_SYMPTOM"]'::jsonb
  END,
  observable_characteristics
)
WHERE crop_code = 'sugarcane'
  AND 'germination' = ANY(stage_applicable)
  AND (observable_characteristics IS NULL 
       OR observable_characteristics::text = '{}'
       OR observable_characteristics::text = 'null'
       OR observable_characteristics::jsonb ? 'icon');