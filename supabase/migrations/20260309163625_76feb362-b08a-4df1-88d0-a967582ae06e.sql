
-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #4: Insert 47 phantom observation codes into observation_master
-- These are referenced by decision_rules but were missing from observation_master
-- causing ⚠️ [ObsValidation] warnings on every evaluation cycle
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_master (observation_code, description, is_diagnostic, observation_category, affected_plant_part, canonical_group, is_active, is_farmer_observable)
VALUES
  -- Generic management observations
  ('GENERAL_ADVISORY', 'General crop management advisory trigger', false, 'MANAGEMENT', 'WHOLE', 'management', true, false),
  ('CROP_MANAGEMENT', 'General crop management observation', false, 'MANAGEMENT', 'WHOLE', 'management', true, false),
  ('GROWTH_STAGE', 'Growth stage related query', false, 'MANAGEMENT', 'WHOLE', 'management', true, false),
  ('STAGE_QUERY', 'Stage-specific query observation', false, 'MANAGEMENT', 'WHOLE', 'management', true, false),
  ('SYSTEM_CHECK', 'System health check observation', false, 'MANAGEMENT', 'WHOLE', 'management', true, false),
  -- Pest/disease observations
  ('PEST_DAMAGE', 'Generic pest damage observed on crop', true, 'PEST', 'WHOLE', 'pest', true, true),
  ('LEAF_DAMAGE', 'Damage visible on leaves', true, 'PEST', 'LEAF', 'pest', true, true),
  ('DISEASE_SYMPTOMS', 'General disease symptoms observed', true, 'DISEASE', 'WHOLE', 'disease', true, true),
  ('CROP_STRESS', 'General crop stress indicators', false, 'ABIOTIC', 'WHOLE', 'stress', true, true),
  -- Soil/nutrition observations
  ('SOIL_CONDITION', 'Soil condition assessment observation', false, 'MANAGEMENT', 'SOIL', 'soil_health', true, true),
  ('SOIL_HEALTH', 'Soil health status observation', false, 'MANAGEMENT', 'SOIL', 'soil_health', true, true),
  ('PH_IMBALANCE', 'Soil pH imbalance detected', true, 'NUTRIENT', 'SOIL', 'soil_health', true, false),
  ('NITROGEN_NEED', 'Nitrogen requirement detected', false, 'NUTRIENT', 'WHOLE', 'nutrient', true, false),
  ('NUTRIENT_DEFICIENCY', 'General nutrient deficiency symptoms', true, 'NUTRIENT', 'LEAF', 'nutrient', true, true),
  -- Harvest/economic observations
  ('HARVEST_READINESS', 'Crop harvest readiness assessment', false, 'MANAGEMENT', 'WHOLE', 'harvest', true, true),
  ('ECONOMICS_QUERY', 'Cost-benefit or economics query', false, 'MANAGEMENT', 'WHOLE', 'economics', true, false),
  ('COST_BENEFIT', 'Cost-benefit analysis trigger', false, 'MANAGEMENT', 'WHOLE', 'economics', true, false),
  ('YIELD_ESTIMATION', 'Yield estimation observation', false, 'MANAGEMENT', 'WHOLE', 'harvest', true, false),
  ('BRIX_LEVEL', 'Sugar brix level measurement', true, 'MANAGEMENT', 'STEM', 'harvest', true, true),
  -- Weed observations
  ('WEED_PRESENCE', 'Weeds visible in field', true, 'PEST', 'SOIL', 'weed', true, true),
  ('WEED_COMPETITION', 'Weed competition affecting crop', true, 'PEST', 'WHOLE', 'weed', true, true),
  ('CYPERUS', 'Cyperus (motha/nutsedge) weed present', true, 'PEST', 'SOIL', 'weed', true, true),
  ('NUTGRASS', 'Nutgrass weed identified', true, 'PEST', 'SOIL', 'weed', true, true),
  ('SEDGE_WEED', 'Sedge weed identified', true, 'PEST', 'SOIL', 'weed', true, true),
  -- Environmental/other observations
  ('CANOPY_THINNING', 'Crop canopy thinning observed', true, 'ABIOTIC', 'LEAF', 'stress', true, true),
  ('HEAT_STRESS', 'Heat stress damage on crop', true, 'ABIOTIC', 'LEAF', 'stress', true, true),
  ('WEATHER_DAMAGE', 'Weather-related crop damage', true, 'ABIOTIC', 'WHOLE', 'stress', true, true),
  ('WIND_RISK', 'Wind damage or lodging risk', true, 'ABIOTIC', 'STEM', 'stress', true, true),
  ('FERTIGATION', 'Fertigation system observation', false, 'MANAGEMENT', 'WHOLE', 'irrigation', true, false),
  -- Additional missing codes from rule conditions
  ('INSECT_PRESENT', 'Insects present on crop', true, 'PEST', 'WHOLE', 'pest', true, true),
  ('HOLES_IN_LEAVES', 'Holes visible in leaves', true, 'PEST', 'LEAF', 'pest', true, true),
  ('DAMAGED_LEAVES', 'Leaves showing physical damage', true, 'PEST', 'LEAF', 'pest', true, true),
  ('SPOTS_IRREGULAR', 'Irregular spots on plant', true, 'DISEASE', 'LEAF', 'disease', true, true),
  ('POWDERY_COATING', 'Powdery coating on leaf surface', true, 'DISEASE', 'LEAF', 'disease', true, true),
  ('TUNNELS_IN_STEM', 'Tunnels/galleries visible inside stem', true, 'PEST', 'STEM', 'pest', true, true),
  ('BORER_HOLES', 'Borer entry/exit holes on stem', true, 'PEST', 'STEM', 'pest', true, true),
  ('SYMPTOM_REPORTED', 'Farmer reported a symptom', false, 'MANAGEMENT', 'WHOLE', 'management', true, false),
  ('OBSERVATION_MADE', 'Visual observation recorded', false, 'MANAGEMENT', 'WHOLE', 'management', true, false),
  ('PHOTO_SUBMITTED', 'Photo evidence submitted', false, 'MANAGEMENT', 'WHOLE', 'management', true, false),
  ('VISUAL_EVIDENCE', 'Visual evidence available', false, 'MANAGEMENT', 'WHOLE', 'management', true, false)
ON CONFLICT (observation_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #6: Add critical alias expansions for commonly selected observation keys
-- These ensure INSECTS_VISIBLE and other generic keys expand to rule-matchable codes
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_aliases (alias_code, canonical_code)
VALUES
  -- INSECTS_VISIBLE expansions (CRITICAL for ESB diagnosis)
  ('INSECTS_VISIBLE', 'PEST_DAMAGE'),
  ('INSECTS_VISIBLE', 'PEST_PRESENT'),
  -- CENTRAL_SHOOT_DRIED expansions
  ('CENTRAL_SHOOT_DRIED', 'DEAD_HEART'),
  ('CENTRAL_SHOOT_DRIED', 'DEAD_HEART_PRESENT'),
  ('CENTRAL_SHOOT_DRIED', 'SHOOT_DRYING'),
  -- SETT_HOLLOWING expansions
  ('SETT_HOLLOWING', 'BORER_DAMAGE'),
  ('SETT_HOLLOWING', 'EARLY_SHOOT_BORER'),
  ('SETT_HOLLOWED', 'BORER_DAMAGE'),
  ('SETT_HOLLOWED', 'EARLY_SHOOT_BORER'),
  -- LARVAE expansions
  ('LARVAE_PRESENT', 'BORER_DAMAGE'),
  ('LARVAE_PRESENT', 'PEST_DAMAGE'),
  ('LARVAE_VISIBLE', 'BORER_DAMAGE'),
  ('LARVAE_VISIBLE', 'PEST_DAMAGE'),
  -- PEST_CHECK → rule-matchable codes
  ('PEST_CHECK', 'PEST_DAMAGE'),
  ('PEST_CHECK', 'INSECT_PRESENT'),
  ('PEST_CHECK', 'BORER_DAMAGE'),
  -- NUTRIENT_CHECK → rule-matchable codes
  ('NUTRIENT_CHECK', 'NUTRIENT_DEFICIENCY'),
  ('NUTRIENT_CHECK', 'CHLOROSIS'),
  ('NUTRIENT_CHECK', 'LEAF_YELLOWING'),
  -- WATER_STRESS_CHECK → rule-matchable codes
  ('WATER_STRESS_CHECK', 'WATER_STRESS'),
  ('WATER_STRESS_CHECK', 'WILTING'),
  ('WATER_STRESS_CHECK', 'LEAF_CURLING'),
  -- DISEASE_SYMPTOMS → rule-matchable codes
  ('DISEASE_SYMPTOMS', 'LEAF_SPOTS_PRESENT'),
  ('DISEASE_SYMPTOMS', 'FUNGAL_GROWTH_VISIBLE'),
  -- CROP_STRESS → expansions
  ('CROP_STRESS', 'WILTING'),
  ('CROP_STRESS', 'STUNTED_GROWTH'),
  -- DEAD_HEART ↔ BORER_DAMAGE bidirectional
  ('DEAD_HEART', 'BORER_DAMAGE'),
  ('BORER_DAMAGE', 'DEAD_HEART')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #5: Normalize category taxonomy in decision_rules
-- Consolidate fragmented categories to canonical groups
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE decision_rules SET category = 'advisory' WHERE category = 'recommendation' AND is_active = true;
UPDATE decision_rules SET category = 'stress' WHERE category = 'water_stress' AND is_active = true;
UPDATE decision_rules SET category = 'harvest' WHERE category = 'harvest_opt' AND is_active = true;
UPDATE decision_rules SET category = 'economics' WHERE category = 'roi_economic_impact' AND is_active = true;
UPDATE decision_rules SET category = 'best_practice' WHERE category LIKE 'best_practice_%' AND category != 'best_practice' AND is_active = true;
