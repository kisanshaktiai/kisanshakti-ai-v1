
-- DATA POPULATION: observation_master codes + observation_aliases mappings

-- 1. Insert missing observation codes (from ontology enum not yet in DB)
INSERT INTO observation_master (observation_code, description, symptom_category, canonical_group, observation_category, affected_plant_part) VALUES
('WHITE_POWDERY_GROWTH', 'White powdery fungal growth', 'DISEASE', 'DISEASE_FUNGAL', 'DISEASE', 'LEAF'),
('FUNGAL_GROWTH_VISIBLE', 'Visible fungal growth', 'DISEASE', 'DISEASE_FUNGAL', 'DISEASE', 'WHOLE'),
('GREY_MOLD_PRESENT', 'Grey mold visible', 'DISEASE', 'DISEASE_FUNGAL', 'DISEASE', 'LEAF'),
('BLACK_SOOTY_MOLD', 'Black sooty mold', 'DISEASE', 'DISEASE_FUNGAL', 'DISEASE', 'LEAF'),
('RUST_PUSTULES', 'Rust pustules', 'DISEASE', 'DISEASE_FUNGAL', 'DISEASE', 'LEAF'),
('BACTERIAL_OOZE', 'Bacterial ooze', 'DISEASE', 'DISEASE_BACTERIAL', 'DISEASE', 'STEM'),
('WATER_SOAKED_LESIONS', 'Water-soaked lesions', 'DISEASE', 'DISEASE_BACTERIAL', 'DISEASE', 'LEAF'),
('FOUL_SMELL_PRESENT', 'Foul smell', 'DISEASE', 'DISEASE_BACTERIAL', 'DISEASE', 'STEM'),
('LEAF_MOSAIC_PATTERN', 'Mosaic pattern', 'DISEASE', 'DISEASE_VIRAL', 'DISEASE', 'LEAF'),
('STEM_ROT_PRESENT', 'Stem rot', 'DISEASE', 'DISEASE_ROT', 'DISEASE', 'STEM'),
('STEM_SOFTENING', 'Stem softening', 'DISEASE', 'DISEASE_ROT', 'DISEASE', 'STEM'),
('ROOTS_ROTTED', 'Roots rotted', 'DISEASE', 'DISEASE_ROT', 'DISEASE', 'ROOT'),
('CENTRAL_SHOOT_DRY', 'Central shoot dry', 'PEST', 'PEST_BORER', 'PEST', 'STEM'),
('STEM_BORING_MARKS', 'Boring marks', 'PEST', 'PEST_BORER', 'PEST', 'STEM'),
('BORE_HOLES', 'Bore holes', 'PEST', 'PEST_BORER', 'PEST', 'STEM'),
('APHID_COLONIES_ON_UNDERSIDE', 'Aphid colonies', 'PEST', 'PEST_SUCKING', 'PEST', 'LEAF'),
('INSECT_PRESENCE_CONFIRMED', 'Insect presence', 'PEST', 'PEST_SUCKING', 'PEST', 'WHOLE'),
('HONEYDEW_STICKY', 'Honeydew', 'PEST', 'PEST_SUCKING', 'PEST', 'LEAF'),
('LEAF_CHEWING', 'Leaf chewing', 'PEST', 'PEST_CHEWING', 'PEST', 'LEAF'),
('LEAF_SKELETONIZATION', 'Leaf skeletonization', 'PEST', 'PEST_CHEWING', 'PEST', 'LEAF'),
('LEAF_MINING', 'Leaf mining', 'PEST', 'PEST_CHEWING', 'PEST', 'LEAF'),
('WEBBING_PRESENT', 'Webbing visible', 'PEST', 'PEST_CHEWING', 'PEST', 'LEAF'),
('STUNTED_PLANTS', 'Stunted plants', 'PHYSIOLOGY', 'PHYSIOLOGY_GROWTH', 'PHYSIOLOGY', 'WHOLE'),
('LEAF_SPOTS_PRESENT', 'Spots on leaves', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_STRIPES_PRESENT', 'Stripes on leaves', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_WHITE_PATCHES', 'White patches', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_BLACK_PATCHES', 'Black patches', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_PALE_GREEN', 'Pale green', 'NUTRIENT', 'NUTRIENT_N', 'NUTRIENT', 'LEAF'),
('LEAF_BROWN_TIPS', 'Brown tips', 'NUTRIENT', 'NUTRIENT_K', 'NUTRIENT', 'LEAF'),
('LEAF_ROLLING', 'Rolling', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_SCORCHING', 'Scorching', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_REDDENING', 'Reddening', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_TWISTING', 'Twisting', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_DISTORTION', 'Distortion', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_BLIGHTED', 'Blighted', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('PLANTS_LODGING', 'Lodging', 'ABIOTIC', 'ABIOTIC_PHYSICAL', 'ABIOTIC', 'STEM'),
('SETT_EASILY_PULLED_OUT', 'Sett easily pulled', 'ABIOTIC', 'ABIOTIC_PHYSICAL', 'ABIOTIC', 'ROOT'),
('ROOT_BLACKENING', 'Root blackening', 'ROOT', 'PEST_SOIL', 'PEST', 'ROOT'),
('ROOT_SOFT', 'Root soft', 'ROOT', 'DISEASE_ROT', 'DISEASE', 'ROOT'),
('FLOWER_DROP', 'Flower drop', 'FLOWER', 'PHYSIOLOGY_MATURITY', 'PHYSIOLOGY', 'FLOWER'),
('FRUIT_ROT', 'Fruit rot', 'DISEASE', 'DISEASE_ROT', 'DISEASE', 'FRUIT'),
('BOLL_DAMAGE', 'Boll damage', 'PEST', 'PEST_BOLL', 'PEST', 'FRUIT'),
('PATCHY_DAMAGE', 'Patchy damage', 'FIELD', 'FIELD_PATTERN', 'ABIOTIC', 'WHOLE'),
('LEAF_BROWNING_VISIBLE', 'Leaf browning visible', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_DRYING_VISIBLE', 'Leaf drying visible', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_WILTING_VISIBLE', 'Leaf wilting visible', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('STEM_BORING', 'Stem boring', 'PEST', 'PEST_BORER', 'PEST', 'STEM'),
('LEAF_BLAST_SYMPTOMS', 'Blast symptoms', 'DISEASE', 'DISEASE_FUNGAL', 'DISEASE', 'LEAF'),
('LEAF_PUSTULES', 'Leaf pustules', 'DISEASE', 'DISEASE_FUNGAL', 'DISEASE', 'LEAF'),
('CROWN_ROT_PRESENT', 'Crown rot', 'DISEASE', 'DISEASE_ROT', 'DISEASE', 'STEM'),
('BASE_DISCOLORATION', 'Base discoloration', 'DISEASE', 'DISEASE_ROT', 'DISEASE', 'STEM'),
('STEM_HOLES_VISIBLE', 'Stem holes', 'PEST', 'PEST_BORER', 'PEST', 'STEM'),
('STEM_SPLITTING', 'Stem splitting', 'ABIOTIC', 'ABIOTIC_PHYSICAL', 'ABIOTIC', 'STEM'),
('LEAF_DROOPING', 'Drooping', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_NARROWING', 'Narrowing', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('LEAF_CRINKLING', 'Crinkling', 'LEAF', 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF'),
('WILT_SYMPTOM', 'Wilt symptom', 'DISEASE', 'DISEASE_WILT', 'DISEASE', 'WHOLE'),
('GUMMOSIS', 'Gummosis', 'DISEASE', 'DISEASE_BACTERIAL', 'DISEASE', 'STEM'),
('SEEDLING_DIED', 'Seedling died', 'PHYSIOLOGY', 'PHYSIOLOGY_GERMINATION', 'PHYSIOLOGY', 'WHOLE')
ON CONFLICT (observation_code) DO UPDATE SET
  canonical_group = EXCLUDED.canonical_group,
  observation_category = EXCLUDED.observation_category,
  affected_plant_part = EXCLUDED.affected_plant_part;

-- 2. Update existing rows with new column data
UPDATE observation_master SET canonical_group = 'PHYSIOLOGY_LEAF', observation_category = 'PHYSIOLOGY', affected_plant_part = 'LEAF' WHERE observation_code IN ('LEAF_YELLOWING','LEAF_BROWNING','LEAF_CURLING','LEAF_SPOTS','LEAF_WILTING','LEAF_HOLES','LEAF_WEBBING','LEAF_DRYING') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'NUTRIENT_N', observation_category = 'NUTRIENT', affected_plant_part = 'LEAF' WHERE observation_code IN ('INTERVEINAL_CHLOROSIS','PALE_GREEN_LEAVES','NITROGEN_DEFICIENCY') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'NUTRIENT_P', observation_category = 'NUTRIENT', affected_plant_part = 'LEAF' WHERE observation_code = 'PHOSPHORUS_DEFICIENCY' AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'NUTRIENT_K', observation_category = 'NUTRIENT', affected_plant_part = 'LEAF' WHERE observation_code = 'POTASSIUM_DEFICIENCY' AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'NUTRIENT_FE', observation_category = 'NUTRIENT', affected_plant_part = 'LEAF' WHERE observation_code = 'IRON_DEFICIENCY' AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'NUTRIENT_B', observation_category = 'NUTRIENT', affected_plant_part = 'LEAF' WHERE observation_code = 'BORON_DEFICIENCY' AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'PEST_BORER', observation_category = 'PEST', affected_plant_part = 'STEM' WHERE observation_code IN ('DEAD_HEART_PRESENT','FRASS_VISIBLE','BORER_DAMAGE','STEM_BORING','INTERNODE_BORER','TOP_BORER','EARLY_SHOOT_BORER') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'PEST_SUCKING', observation_category = 'PEST', affected_plant_part = 'LEAF' WHERE observation_code IN ('APHID_INFESTATION','WOOLLY_APHID','PYRILLA','SCALE_INSECT','MEALYBUG','SOOTY_MOLD','VISIBLE_INSECTS','INSECT_EGGS','LARVAE_PRESENT') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'PEST_SOIL', observation_category = 'PEST', affected_plant_part = 'ROOT' WHERE observation_code IN ('TERMITE_DAMAGE','MUD_TUBES_PRESENT','WHITE_GRUB','RAT_DAMAGE','ROOT_DAMAGE','ROOT_ROT','ROOT_ROTTED') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'PEST_CHEWING', observation_category = 'PEST', affected_plant_part = 'LEAF' WHERE observation_code IN ('CATERPILLAR_DAMAGE','LEAF_WEBBING','LEAF_HOLES') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'PHYSIOLOGY_GROWTH', observation_category = 'PHYSIOLOGY', affected_plant_part = 'WHOLE' WHERE observation_code IN ('STUNTED_GROWTH','SLOW_GROWTH','POOR_TILLERING','PATCHY_GROWTH','POOR_ROOT_DEVELOPMENT','RATOON_POOR','DELAYED_GERMINATION') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'DISEASE_SMUT', observation_category = 'DISEASE', affected_plant_part = 'STEM' WHERE observation_code IN ('SMUT_SYMPTOMS','WHIP_LIKE_GROWTH') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'DISEASE_VIRAL', observation_category = 'DISEASE', affected_plant_part = 'WHOLE' WHERE observation_code IN ('GRASSY_SHOOT','MOSAIC_PATTERN') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'DISEASE_ROT', observation_category = 'DISEASE', affected_plant_part = 'STEM' WHERE observation_code IN ('RED_ROT_SYMPTOMS','PINEAPPLE_SMELL','SETT_ROT') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'DISEASE_POKKAH', observation_category = 'DISEASE', affected_plant_part = 'LEAF' WHERE observation_code IN ('POKKAH_BOENG','SPINDLE_DISTORTION') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'ABIOTIC_WATER', observation_category = 'ABIOTIC', affected_plant_part = 'WHOLE' WHERE observation_code IN ('DROUGHT_STRESS','FIELD_WATERLOGGED','WATERLOGGING_SIGNS','WATERLOGGING_YELLOWING','SOIL_TOO_DRY') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'ABIOTIC_PHYSICAL', observation_category = 'ABIOTIC', affected_plant_part = 'STEM' WHERE observation_code = 'LODGING' AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'WEED', observation_category = 'ABIOTIC', affected_plant_part = 'WHOLE' WHERE observation_code IN ('WEED_PRESENT','WEED_HEAVY','WEED_IN_ROWS','WEED_INFESTATION','WEED_ABOVE_CROP','TRASH_ACCUMULATION') AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'DISEASE_FUNGAL', observation_category = 'DISEASE', affected_plant_part = 'WHOLE' WHERE observation_code = 'FUNGAL_GROWTH' AND canonical_group IS NULL;
UPDATE observation_master SET canonical_group = 'DISEASE_WILT', observation_category = 'DISEASE', affected_plant_part = 'WHOLE' WHERE observation_code IN ('WILT_SYMPTOMS','STEM_WILTING','WILTING_DURING_DAY') AND canonical_group IS NULL;

-- 3. Insert observation_aliases - the VOCABULARY BRIDGE
-- These map generic intent_observation_mapping codes → specific decision_rules codes
INSERT INTO observation_aliases (alias_code, canonical_code) VALUES
-- BORER_DAMAGE (generic) → specific observations in rules
('BORER_DAMAGE', 'STEM_BORING_MARKS'),
-- FUNGAL_GROWTH (generic) → specific
('FUNGAL_GROWTH', 'FUNGAL_GROWTH_VISIBLE'),
-- LEAF_SPOTS → LEAF_SPOTS_PRESENT
('LEAF_SPOTS', 'LEAF_SPOTS_PRESENT'),
-- INSECT_EGGS → INSECT_PRESENCE_CONFIRMED
('INSECT_EGGS', 'INSECT_PRESENCE_CONFIRMED'),
-- CATERPILLAR_DAMAGE → LEAF_CHEWING
('CATERPILLAR_DAMAGE', 'LEAF_CHEWING'),
-- LEAF_WILTING → canonical
('LEAF_WILTING', 'LEAF_WILTING_VISIBLE'),
-- LEAF_BROWNING → canonical  
('LEAF_BROWNING', 'LEAF_BROWNING_VISIBLE'),
-- LEAF_DRYING → canonical
('LEAF_DRYING', 'LEAF_DRYING_VISIBLE'),
-- APHID_INFESTATION → specific
('APHID_INFESTATION', 'APHID_COLONIES_ON_UNDERSIDE'),
-- STEM_BORING → specific marks
('STEM_BORING', 'STEM_BORING_MARKS'),
-- LEAF_HOLES → LEAF_CHEWING (both represent same observation)
('LEAF_HOLES', 'LEAF_CHEWING'),
-- ROOT_DAMAGE → ROOT_BLACKENING
('ROOT_DAMAGE', 'ROOT_BLACKENING'),
-- ROOT_ROT → ROOTS_ROTTED
('ROOT_ROT', 'ROOTS_ROTTED'),
-- ROOT_ROTTED → ROOTS_ROTTED
('ROOT_ROTTED', 'ROOTS_ROTTED'),
-- SLOW_GROWTH → STUNTED_PLANTS (synonym)
('SLOW_GROWTH', 'STUNTED_PLANTS'),
-- STUNTED_GROWTH → STUNTED_PLANTS
('STUNTED_GROWTH', 'STUNTED_PLANTS'),
-- SEEDLING_DIED → same
('SEEDLING_DIED', 'SETT_EASILY_PULLED_OUT'),
-- VISIBLE_INSECTS → INSECT_PRESENCE_CONFIRMED
('VISIBLE_INSECTS', 'INSECT_PRESENCE_CONFIRMED'),
-- SOOTY_MOLD → BLACK_SOOTY_MOLD
('SOOTY_MOLD', 'BLACK_SOOTY_MOLD'),
-- WILT_SYMPTOMS → WILT_SYMPTOM
('WILT_SYMPTOMS', 'WILT_SYMPTOM'),
-- FIELD_WATERLOGGED → same but from rules side
('WATERLOGGING_SIGNS', 'WATER_SOAKED_LESIONS'),
-- MOSAIC_PATTERN → LEAF_MOSAIC_PATTERN
('MOSAIC_PATTERN', 'LEAF_MOSAIC_PATTERN'),
-- SMUT_SYMPTOMS → WHIP_LIKE_GROWTH (primary sign)
('SMUT_SYMPTOMS', 'WILT_SYMPTOM'),
-- PINEAPPLE_SMELL → STEM_ROT_PRESENT (associated)
('PINEAPPLE_SMELL', 'STEM_ROT_PRESENT'),
-- POOR_TILLERING → STUNTED_PLANTS
('POOR_TILLERING', 'STUNTED_PLANTS')
ON CONFLICT (alias_code) DO NOTHING;
