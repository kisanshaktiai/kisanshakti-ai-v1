-- ETL Standards UPSERT (update existing + insert new)
-- First update existing rows with new columns
UPDATE public.etl_standards SET sampling_unit = '%', action_threshold = 15, is_active = true WHERE pest_code = 'EARLY_SHOOT_BORER' AND crop_code = 'SUGARCANE';
UPDATE public.etl_standards SET sampling_unit = '%', action_threshold = 15, is_active = true WHERE pest_code = 'INTERNODE_BORER' AND crop_code = 'SUGARCANE';
UPDATE public.etl_standards SET sampling_unit = '%', action_threshold = 10, is_active = true WHERE pest_code = 'TOP_BORER' AND crop_code = 'SUGARCANE';

-- Insert only NEW pest codes that don't exist yet
INSERT INTO public.etl_standards (pest_code, pest_name_en, crop_code, etl_value, etl_unit, sampling_method, sampling_unit, action_threshold, growth_stage, icar_source, is_active) 
SELECT * FROM (VALUES
('PYRILLA', 'Sugarcane Pyrilla', 'SUGARCANE', 5::numeric, 'nymphs_adults_per_leaf', 'Random 20 plants', 'insects/leaf', 10::numeric, ARRAY['GRAND_GROWTH'], 'ICAR-SBI; NCIPM', true),
('ROOT_BORER', 'Root Borer', 'SUGARCANE', 8::numeric, 'percent_affected_clumps', '50 random clumps', '%', 12::numeric, ARRAY['TILLERING'], 'ICAR-SBI', true),
('WHITE_GRUB', 'White Grub', 'SUGARCANE', 3::numeric, 'grubs_per_sq_meter', 'Soil sampling 30x30x30cm', 'grubs/m2', 5::numeric, ARRAY['GERMINATION'], 'ICAR-SBI; NCIPM', true),
('WHITEFLY_SC', 'Sugarcane Whitefly', 'SUGARCANE', 10::numeric, 'adults_per_leaf', '20 random leaves', 'adults/leaf', 20::numeric, ARRAY['GRAND_GROWTH'], 'ICAR-SBI', true),
('SCALE_INSECT', 'Scale Insect', 'SUGARCANE', 20::numeric, 'percent_infested_nodes', '20 random canes', '%', 30::numeric, ARRAY['MATURATION'], 'ICAR-SBI; VSI', true),
('SPOTTED_BOLLWORM', 'Spotted Bollworm', 'COTTON', 10::numeric, 'percent_damaged_squares', '100 random squares', '%', 15::numeric, ARRAY['SQUARING'], 'CICR Nagpur', true),
('WHITEFLY_CT', 'Whitefly (Bemisia)', 'COTTON', 5::numeric, 'adults_per_leaf', '3 leaves x 20 plants', 'adults/leaf', 8::numeric, ARRAY['VEGETATIVE'], 'CICR Nagpur; NCIPM', true),
('APHID_CT', 'Aphids', 'COTTON', 10::numeric, 'aphids_per_leaf', 'Lower 3 leaves', 'aphids/leaf', 20::numeric, ARRAY['VEGETATIVE'], 'CICR Nagpur', true),
('THRIPS_CT', 'Thrips', 'COTTON', 10::numeric, 'thrips_per_leaf', '20 random leaves', 'thrips/leaf', 20::numeric, ARRAY['SEEDLING'], 'CICR Nagpur; NCIPM', true),
('RED_COTTON_BUG', 'Red Cotton Bug', 'COTTON', 5::numeric, 'bugs_per_plant', '20 random plants', 'bugs/plant', 10::numeric, ARRAY['BOLL_DEVELOPMENT'], 'CICR Nagpur', true),
('SPODOPTERA_CT', 'Tobacco Cutworm', 'COTTON', 2::numeric, 'egg_masses_per_20_plants', 'Scout for egg masses', 'egg mass/20 plants', 4::numeric, ARRAY['VEGETATIVE'], 'CICR Nagpur; NCIPM', true),
('STEM_BORER_RICE', 'Yellow Stem Borer', 'RICE', 5::numeric, 'percent_deadhearts', '100 hills random', '%', 10::numeric, ARRAY['TILLERING'], 'ICAR-IIRR; DRR', true),
('BPH', 'Brown Planthopper', 'RICE', 5::numeric, 'hoppers_per_hill', 'Tap 20 hills', 'hoppers/hill', 10::numeric, ARRAY['TILLERING'], 'ICAR-IIRR; NCIPM', true),
('GLH', 'Green Leafhopper', 'RICE', 5::numeric, 'hoppers_per_hill', 'Sweep net 10 sweeps', 'hoppers/hill', 10::numeric, ARRAY['VEGETATIVE'], 'ICAR-IIRR', true),
('WBPH', 'White-backed Planthopper', 'RICE', 5::numeric, 'hoppers_per_hill', 'Tap on white tray', 'hoppers/hill', 10::numeric, ARRAY['TILLERING'], 'ICAR-IIRR', true),
('LEAF_FOLDER', 'Rice Leaf Folder', 'RICE', 10::numeric, 'percent_damaged_leaves', '100 random hills', '%', 15::numeric, ARRAY['VEGETATIVE'], 'ICAR-IIRR; DRR', true),
('GALL_MIDGE', 'Gall Midge', 'RICE', 5::numeric, 'percent_silver_shoots', '100 random hills', '%', 10::numeric, ARRAY['TILLERING'], 'ICAR-IIRR', true),
('RICE_HISPA', 'Rice Hispa', 'RICE', 2::numeric, 'adults_per_hill', '20 hills', 'adults/hill', 5::numeric, ARRAY['VEGETATIVE'], 'ICAR-IIRR', true),
('CASE_WORM', 'Case Worm', 'RICE', 10::numeric, 'cases_per_sq_meter', 'Quadrat 1m x 1m', 'cases/m2', 20::numeric, ARRAY['TILLERING'], 'DRR; ICAR', true),
('RICE_THRIPS', 'Rice Thrips', 'RICE', 30::numeric, 'thrips_per_hill', 'Tap on white paper', 'thrips/hill', 60::numeric, ARRAY['NURSERY'], 'ICAR-IIRR', true),
('APHID_WH', 'Wheat Aphids', 'WHEAT', 5::numeric, 'aphids_per_earhead', '20 random earheads', 'aphids/earhead', 10::numeric, ARRAY['FLOWERING'], 'ICAR-IIWBR', true),
('TERMITE_WH', 'Termites', 'WHEAT', 5::numeric, 'percent_damaged_plants', '1m row at 5 spots', '%', 10::numeric, ARRAY['CRI_STAGE'], 'ICAR-IIWBR', true),
('ARMY_WORM', 'Armyworm', 'WHEAT', 4::numeric, 'larvae_per_sq_meter', 'Quadrat 1m x 1m', 'larvae/m2', 8::numeric, ARRAY['VEGETATIVE'], 'ICAR-IIWBR', true),
('PINK_BORER_WH', 'Pink Stem Borer', 'WHEAT', 5::numeric, 'percent_deadhearts', '100 plants random', '%', 10::numeric, ARRAY['TILLERING'], 'ICAR-IIWBR', true),
('GIRDLE_BEETLE', 'Girdle Beetle', 'SOYBEAN', 3::numeric, 'girdled_plants_per_m_row', '5 spots of 1m row', 'plants/m row', 5::numeric, ARRAY['POD_DEVELOPMENT'], 'ICAR-IISR', true),
('STEM_FLY', 'Stem Fly', 'SOYBEAN', 10::numeric, 'percent_infested_plants', 'Split 20 stems', '%', 20::numeric, ARRAY['VEGETATIVE'], 'ICAR-IISR', true),
('TOBACCO_CATERPILLAR', 'Tobacco Caterpillar', 'SOYBEAN', 4::numeric, 'larvae_per_m_row', '1m row at 5 spots', 'larvae/m row', 8::numeric, ARRAY['FLOWERING'], 'ICAR-IISR; NCIPM', true),
('GREEN_SEMILOOPER', 'Green Semilooper', 'SOYBEAN', 4::numeric, 'larvae_per_m_row', '1m row at 5 spots', 'larvae/m row', 8::numeric, ARRAY['VEGETATIVE'], 'ICAR-IISR', true),
('WHITEFLY_SB', 'Whitefly', 'SOYBEAN', 10::numeric, 'adults_per_plant', '20 random plants', 'adults/plant', 20::numeric, ARRAY['FLOWERING'], 'ICAR-IISR', true),
('BIHAR_HAIRY_CAT', 'Bihar Hairy Caterpillar', 'SOYBEAN', 5::numeric, 'larvae_per_sq_meter', 'Quadrat count', 'larvae/m2', 10::numeric, ARRAY['VEGETATIVE'], 'ICAR-IISR', true),
('SPODOPTERA_SB', 'Spodoptera', 'SOYBEAN', 2::numeric, 'egg_masses_per_m_row', 'Scout for egg masses', 'egg mass/m row', 4::numeric, ARRAY['VEGETATIVE'], 'ICAR-IISR; NCIPM', true),
('POD_BORER_SB', 'Pod Borer', 'SOYBEAN', 1::numeric, 'larva_per_plant', '20 random plants', 'larva/plant', 2::numeric, ARRAY['POD_DEVELOPMENT'], 'ICAR-IISR', true)
) AS v(pest_code, pest_name_en, crop_code, etl_value, etl_unit, sampling_method, sampling_unit, action_threshold, growth_stage, icar_source, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.etl_standards e WHERE e.pest_code = v.pest_code AND e.crop_code = v.crop_code);

-- Decision rules: populate conditions_json.observations for dead rules (using rule_id not rule_code)
UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["NUTRIENT_DEFICIENCY","YELLOWING","CHLOROSIS","STUNTED_GROWTH","LEAF_DISCOLORATION"]'::jsonb)
WHERE condition_code = 'NUTRIENT_MANAGEMENT' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["WATER_STRESS","WILTING","LEAF_ROLLING","DROOPING","SOIL_CRACKING"]'::jsonb)
WHERE condition_code = 'IRRIGATION_TRIGGER' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["RAIN_EXPECTED","HIGH_HUMIDITY","TEMPERATURE_EXTREME","WIND_SPEED","WEATHER_ALERT"]'::jsonb)
WHERE condition_code = 'WEATHER_TRIGGERED' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["LOW_NDVI","NDVI_DROP","CANOPY_THINNING","VEGETATION_STRESS","YELLOWING_PATCH"]'::jsonb)
WHERE condition_code = 'NDVI_TRIGGERED' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["SAFETY_CHECK","PRE_HARVEST_INTERVAL","WEATHER_CONDITION"]'::jsonb)
WHERE condition_code = 'SAFETY_BLOCK' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["PEST_COUNT","PEST_DAMAGE","ETL_EXCEEDED","PEST_POPULATION"]'::jsonb)
WHERE condition_code = 'ETL_THRESHOLD' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["CROP_STAGE","GROWTH_OBSERVATION","GENERAL_HEALTH"]'::jsonb)
WHERE condition_code IN ('STAGE_GENERAL', 'MULTI_STAGE') AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["RATOON_SPROUTING","STUBBLE_CONDITION","GAP_FILLING_NEEDED"]'::jsonb)
WHERE rule_id LIKE '%RATOON%' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["GENERAL_QUERY","BEST_PRACTICE_INQUIRY","MANAGEMENT_QUESTION"]'::jsonb)
WHERE rule_id LIKE 'SC_BP_GENERAL%' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["ALLUVIAL_SOIL","SOIL_TYPE_QUERY","NUTRIENT_INQUIRY"]'::jsonb)
WHERE rule_id LIKE 'SC_SOIL_ALLUVIAL%' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["ECONOMICS_QUERY","COST_BENEFIT","INPUT_COST"]'::jsonb)
WHERE rule_id LIKE 'SC_BP_ECONOMICS%' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["DISEASE_SYMPTOMS","LESIONS","SPOTS","WILTING","ROT"]'::jsonb)
WHERE condition_code = 'DISEASE_DIAGNOSIS' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');

UPDATE decision_rules SET conditions_json = jsonb_set(COALESCE(conditions_json, '{}'::jsonb), '{observations}', '["STAGE_SPECIFIC","GROWTH_OBSERVATION","CROP_STAGE"]'::jsonb)
WHERE condition_code = 'STAGE_SPECIFIC' AND (conditions_json->>'observations' IS NULL OR conditions_json->>'observations' = '[]');