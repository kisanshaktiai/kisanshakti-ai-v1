
-- ============================================================================
-- FIX ORPHANED OBSERVATIONS - CORRECTED VERSION
-- Includes: growth_stage, das_min, das_max + biological category fixes
-- ============================================================================

-- PHASE 1: DISEASE (122 orphaned)
-- 1a: Red Rot/Fungal → DISEASE_LIKE_PATTERN
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'DISEASE_LIKE_PATTERN', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'DISEASE'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%red rot%' OR description ILIKE '%colletotrichum%' OR description ILIKE '%fusarium%' OR description ILIKE '%pineapple disease%' OR description ILIKE '%ceratocystis%'
OR observation_code IN ('REDDISH_INTERNODES','WHITE_PATCHES','SETT_INTERNAL_REDDENING','POOR_GERMINATION_PATCHES'))
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 1b: Leaf Spots → LEAF_MARKS_OR_SPOTS
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'LEAF_MARKS_OR_SPOTS', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'DISEASE'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%leaf spot%' OR description ILIKE '%leaf mark%' OR description ILIKE '%leaf streak%' OR description ILIKE '%leaf stripe%'
OR observation_code IN ('YELLOW_GREEN_STRIPES','LEAF_SCALD','LEAF_BLIGHT'))
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 1c: Wilt/Root → ROOT_OR_BASE_PROBLEM
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'ROOT_OR_BASE_PROBLEM', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'DISEASE'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%wilt%' OR description ILIKE '%root rot%' OR description ILIKE '%basal rot%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 1d: Remaining DISEASE → DISEASE_LIKE_PATTERN
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'DISEASE_LIKE_PATTERN', 'SUGARCANE', observation_code, 2, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'DISEASE'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- PHASE 2: PEST (147 orphaned)
-- 2a: Borer → BORER_IDENTIFICATION
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'BORER_IDENTIFICATION', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PEST'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%borer%' OR description ILIKE '%dead heart%' OR description ILIKE '%tunneling%' OR description ILIKE '%internode%hole%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 2b: Stem Damage → STEM_DAMAGE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'STEM_DAMAGE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PEST'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%stem%' OR description ILIKE '%stalk%' OR description ILIKE '%cane%damage%')
AND description NOT ILIKE '%borer%'
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 2c: Leaf Damage → LEAF_DAMAGE_VISIBLE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'LEAF_DAMAGE_VISIBLE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PEST'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%leaf%chew%' OR description ILIKE '%leaf%damage%' OR description ILIKE '%leaf%eaten%' OR description ILIKE '%defoliation%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 2d: Visible Insects → PEST_PRESENCE_VISIBLE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'PEST_PRESENCE_VISIBLE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PEST'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- PHASE 3: NUTRIENT (24 orphaned)
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'NUTRIENT_STRESS_SIGNAL', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category IN ('NUTRIENT', 'DEFICIENCY', 'deficiency')
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- PHASE 4: PHYSIOLOGY (406 orphaned)
-- 4a: Color Changes → COLOR_CHANGE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'COLOR_CHANGE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PHYSIOLOGY'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%yellow%' OR description ILIKE '%purple%' OR description ILIKE '%red%' OR description ILIKE '%color%' OR description ILIKE '%chlorosis%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 4b: Growth Issues → GROWTH_ANOMALY
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'GROWTH_ANOMALY', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PHYSIOLOGY'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%slow%growth%' OR description ILIKE '%stunted%' OR description ILIKE '%dwarf%' OR description ILIKE '%poor%growth%' OR description ILIKE '%abnormal%growth%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 4c: Wilting → WILTING_OR_DROOPING
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'WILTING_OR_DROOPING', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PHYSIOLOGY'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%wilt%' OR description ILIKE '%droop%' OR description ILIKE '%turgor%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 4d: Germination → EMERGENCE_FAILURE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'EMERGENCE_FAILURE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PHYSIOLOGY'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%germination%' OR description ILIKE '%emergence%' OR description ILIKE '%sprouting%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 4e: Tillering → GROWTH_ANOMALY
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'GROWTH_ANOMALY', 'SUGARCANE', observation_code, 2, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PHYSIOLOGY'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%tiller%' OR description ILIKE '%shoot%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 4f: Remaining PHYSIOLOGY → GENERAL_CROP_INFO
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'GENERAL_CROP_INFO', 'SUGARCANE', observation_code, 3, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'PHYSIOLOGY'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- PHASE 5: ABIOTIC (60 orphaned)
-- 5a: Water Stress → WATER_STRESS_SIGNAL
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'WATER_STRESS_SIGNAL', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'ABIOTIC'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%water%stress%' OR description ILIKE '%drought%' OR description ILIKE '%moisture%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 5b: Flood → FLOOD_DROUGHT_DAMAGE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'FLOOD_DROUGHT_DAMAGE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'ABIOTIC'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%flood%' OR description ILIKE '%waterlog%' OR description ILIKE '%excess%water%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 5c: Field Pattern → UNEVEN_FIELD_PATTERN
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'UNEVEN_FIELD_PATTERN', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category IN ('ABIOTIC', 'FIELD_SYMPTOM')
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
AND (description ILIKE '%patch%' OR description ILIKE '%uneven%' OR description ILIKE '%variab%')
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- 5d: Remaining ABIOTIC → GENERAL_CROP_INFO
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'GENERAL_CROP_INFO', 'SUGARCANE', observation_code, 2, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'ABIOTIC'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- PHASE 6: MANAGEMENT (132 orphaned)
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'GENERAL_CROP_INFO', 'SUGARCANE', observation_code, 2, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'MANAGEMENT'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- PHASE 7: WEED (7 orphaned)
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'WEED_PROBLEM', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'WEED'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- PHASE 8: SYMPTOM-SPECIFIC CATEGORIES
-- Leaf Symptoms → LEAF_MARKS_OR_SPOTS
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'LEAF_MARKS_OR_SPOTS', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'LEAF_SYMPTOM'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- Stem Symptoms → STEM_DAMAGE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'STEM_DAMAGE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'STEM_SYMPTOM'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- Root Symptoms → ROOT_OR_BASE_PROBLEM
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'ROOT_OR_BASE_PROBLEM', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'ROOT_SYMPTOM'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- Insect Signals → PEST_PRESENCE_VISIBLE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'PEST_PRESENCE_VISIBLE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'INSECT_SIGNAL'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- Whole Plant → GROWTH_ANOMALY
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'GROWTH_ANOMALY', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'WHOLE_PLANT'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- ============================================================================
-- PHASE 8.5: BIOLOGICAL CATEGORIES (Critical Fix #2 from audit)
-- These were incorrectly caught by the catch-all in the original SQL
-- ============================================================================

-- FUNGAL, BACTERIAL, VIRAL → DISEASE_LIKE_PATTERN
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'DISEASE_LIKE_PATTERN', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category IN ('FUNGAL', 'BACTERIAL', 'VIRAL')
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- BORER category → BORER_IDENTIFICATION
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'BORER_IDENTIFICATION', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category = 'BORER'
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- SUCKING, THRIPS, CHEWING, MITE, LEAF_MINER, PEST_STAGE → PEST_PRESENCE_VISIBLE
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'PEST_PRESENCE_VISIBLE', 'SUGARCANE', observation_code, 1, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true AND observation_category IN ('SUCKING', 'THRIPS', 'CHEWING', 'MITE', 'LEAF_MINER', 'PEST_STAGE')
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;

-- ============================================================================
-- PHASE 9: REMAINING (catch-all)
-- ============================================================================
INSERT INTO intent_observation_mapping (intent_code, crop_code, observation_code, confidence_rank, is_active, growth_stage, das_min, das_max, created_at)
SELECT 'GENERAL_CROP_INFO', 'SUGARCANE', observation_code, 3, true, 'ALL', 0, 999, now()
FROM observation_master WHERE is_active = true
AND observation_code NOT IN (SELECT DISTINCT observation_code FROM intent_observation_mapping)
ON CONFLICT (intent_code, crop_code, observation_code) DO NOTHING;
