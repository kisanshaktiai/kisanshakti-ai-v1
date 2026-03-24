-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE DECISION_RULES WITH CANONICAL OBSERVABLE CHARACTERISTICS
-- Version: 2.0.0 | Date: 2026-01-14
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- A. SUGARCANE - GERMINATION STAGE RULES
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["SEED_NOT_GERMINATED", "GAPS_IN_FIELD", "PATCHY_EMERGENCE"]'::jsonb
WHERE rule_id = 'SC_GERM_GAPS_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["SEEDLING_WILTED", "SETT_EASILY_PULLED_OUT", "ROOTS_SOFT_OR_BLACK"]'::jsonb
WHERE rule_id = 'SC_GERM_SETT_ROT_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["POOR_GERMINATION_PERCENT", "IRREGULAR_PLANT_STAND", "DRY_SOIL_AT_GERMINATION"]'::jsonb
WHERE rule_id = 'SC_GERM_POOR_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["SEEDLING_YELLOW", "SEEDLING_STUNTED", "LEAF_PALE_GREEN"]'::jsonb
WHERE rule_id = 'SC_GERM_YELLOW_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["WATER_LOGGING_AT_BASE", "ROOTS_ROTTED", "FOUL_SMELL_PRESENT"]'::jsonb
WHERE rule_id = 'SC_GERM_WATERLOG_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["SOIL_CRUSTING_VISIBLE", "POOR_GERMINATION_PERCENT", "SEEDLING_STUNTED"]'::jsonb
WHERE rule_id = 'SC_GERM_CRUST_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["SEEDLING_DIED", "ROOT_BLACKENING", "SEED_DECAYED"]'::jsonb
WHERE rule_id = 'SC_GERM_FUNGAL_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "LARVAE_PRESENT", "DEAD_HEART_PRESENT"]'::jsonb
WHERE rule_id = 'SUGARCANE_ESB_GERM_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["ROOT_POOR_DEVELOPMENT", "SEEDLING_STUNTED", "ROOT_GALLS_PRESENT"]'::jsonb
WHERE rule_id = 'SC_GERM_TERMITE_001' AND crop_code = 'sugarcane';

-- =============================================================================
-- B. SUGARCANE - TILLERING STAGE RULES  
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["POOR_TILLERING", "STUNTED_PLANTS", "SLOW_GROWTH"]'::jsonb
WHERE rule_id = 'SC_TILLER_POOR_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["EXCESSIVE_TILLERS", "WEAK_SHOOTS", "THIN_STEMS"]'::jsonb
WHERE rule_id = 'SC_TILLER_EXCESS_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["DEAD_HEART_PRESENT", "STEM_BORING_MARKS", "LARVAE_PRESENT"]'::jsonb
WHERE rule_id = 'SC_TILLER_PEST_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_YELLOWING", "UNIFORM_YELLOWING_OLDER_LEAVES", "SLOW_GROWTH"]'::jsonb
WHERE rule_id = 'SC_TILLER_YELLOW_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_STRIPES_PRESENT", "LEAF_MOSAIC_PATTERN", "STUNTED_PLANTS"]'::jsonb
WHERE rule_id = 'SC_TILLER_MOSAIC_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_WILTING", "LEAF_ROLLING", "SOIL_TOO_DRY"]'::jsonb
WHERE rule_id = 'SC_TILLER_DROUGHT_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "SMALL_INSECTS", "INSECTS_JUMPING"]'::jsonb
WHERE rule_id = 'SUGARCANE_PYRILLA_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "SMALL_INSECTS", "GREEN_INSECTS", "LEAF_CURLING"]'::jsonb
WHERE rule_id = 'SUGARCANE_APHID_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_FLYING", "SMALL_INSECTS", "BLACK_SOOTY_MOLD"]'::jsonb
WHERE rule_id = 'SUGARCANE_WHITEFLY_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_REDDENING", "STEM_ROT_PRESENT", "FOUL_SMELL_PRESENT"]'::jsonb
WHERE rule_id = 'SUGARCANE_REDROT_001' AND crop_code = 'sugarcane';

-- =============================================================================
-- C. SUGARCANE - GRAND GROWTH STAGE RULES
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["SLOW_GROWTH", "SHORT_INTERNODES", "STUNTED_PLANTS"]'::jsonb
WHERE rule_id = 'SC_GRAND_SLOW_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["PLANTS_LODGING", "WEAK_SHOOTS", "DAMAGE_AFTER_WIND"]'::jsonb
WHERE rule_id = 'SC_GRAND_LODGING_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_YELLOWING", "UNIFORM_YELLOWING_OLDER_LEAVES", "THIN_STEMS"]'::jsonb
WHERE rule_id = 'SC_GRAND_YELLOW_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["PURPLISH_LEAVES", "LEAF_REDDENING", "SHORT_INTERNODES"]'::jsonb
WHERE rule_id = 'SC_GRAND_PURPLE_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_MARGIN_BURN", "LEAF_BROWN_TIPS", "LEAF_SCORCHING"]'::jsonb
WHERE rule_id = 'SC_GRAND_MARGINAL_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["STEM_BORING_MARKS", "STEM_HOLES_VISIBLE", "DEAD_HEART_PRESENT"]'::jsonb
WHERE rule_id = 'SC_GRAND_BORER_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["CENTRAL_SHOOT_DRY", "STEM_BORING_MARKS", "LARVAE_PRESENT"]'::jsonb
WHERE rule_id = 'SC_GRAND_TOPBORER_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "SMALL_INSECTS", "WHITE_POWDERY_GROWTH"]'::jsonb
WHERE rule_id = 'SC_GRAND_MEALYBUG_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "SMALL_INSECTS", "BROWN_INSECTS"]'::jsonb
WHERE rule_id = 'SC_GRAND_SCALE_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["STEM_ROT_PRESENT", "LEAF_REDDENING", "FOUL_SMELL_PRESENT"]'::jsonb
WHERE rule_id = 'SC_GRAND_REDROT_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["FUNGAL_GROWTH_VISIBLE", "STEM_SPLITTING", "BLACK_SOOTY_MOLD"]'::jsonb
WHERE rule_id = 'SC_GRAND_SMUT_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["FIELD_WATERLOGGED", "LEAF_YELLOWING", "ROOT_SOFT"]'::jsonb
WHERE rule_id = 'SC_GRAND_WATERLOG_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_WILTING", "LEAF_ROLLING", "CRACKS_IN_SOIL"]'::jsonb
WHERE rule_id = 'SC_GRAND_DROUGHT_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_DRYING", "LUSH_VEGETATIVE_GROWTH"]'::jsonb
WHERE rule_id = 'SC_GRAND_DETRASH_001' AND crop_code = 'sugarcane';

-- =============================================================================
-- D. SUGARCANE - MATURITY STAGE RULES
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["LEAF_YELLOWING", "LEAF_DRYING", "SHORT_INTERNODES"]'::jsonb
WHERE rule_id = 'SC_MATURE_READY_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["STEM_ROT_PRESENT", "FOUL_SMELL_PRESENT", "BASE_DISCOLORATION"]'::jsonb
WHERE rule_id = 'SC_MATURE_ROT_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["PLANTS_LODGING", "DAMAGE_AFTER_WIND", "STEM_SPLITTING"]'::jsonb
WHERE rule_id = 'SC_MATURE_LODGING_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["DAMAGE_AFTER_FROST", "LEAF_BROWN_TIPS", "LEAF_SCORCHING"]'::jsonb
WHERE rule_id = 'SC_MATURE_FROST_001' AND crop_code = 'sugarcane';

-- =============================================================================
-- E. SUGARCANE - PEST RULES (03_pest)
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["DEAD_HEART_PRESENT", "SETT_EASILY_PULLED_OUT", "LARVAE_PRESENT", "STEM_BORING_MARKS"]'::jsonb
WHERE rule_id IN ('SUGARCANE_ESB_001', 'SUGARCANE_ESB_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["STEM_HOLES_VISIBLE", "STEM_BORING_MARKS", "LARVAE_PRESENT", "STEM_SPLITTING"]'::jsonb
WHERE rule_id IN ('SUGARCANE_ISB_001', 'SUGARCANE_ISB_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["CENTRAL_SHOOT_DRY", "DEAD_HEART_PRESENT", "STEM_BORING_MARKS", "EGGS_PRESENT"]'::jsonb
WHERE rule_id IN ('SUGARCANE_TOP_BORER_001', 'SUGARCANE_TB_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["ROOT_BLACKENING", "SETT_EASILY_PULLED_OUT", "ROOT_DRY", "GAPS_IN_FIELD"]'::jsonb
WHERE rule_id IN ('SUGARCANE_TERMITE_001', 'SUGARCANE_TERMITE_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["ROOT_GALLS_PRESENT", "ROOT_NEMATODE_SIGNS", "STUNTED_PLANTS", "PATCHY_DAMAGE"]'::jsonb
WHERE rule_id IN ('SUGARCANE_NEMATODE_001', 'SUGARCANE_NEMATODE_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "GREEN_INSECTS", "INSECTS_CRAWLING", "LEAF_CURLING", "BLACK_SOOTY_MOLD"]'::jsonb
WHERE rule_id = 'SUGARCANE_APHID_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_FLYING", "SMALL_INSECTS", "LEAF_CURLING", "BLACK_SOOTY_MOLD"]'::jsonb
WHERE rule_id = 'SUGARCANE_WHITEFLY_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_JUMPING", "GREEN_INSECTS", "LEAF_SCORCHING", "LEAF_BROWN_TIPS"]'::jsonb
WHERE rule_id = 'SUGARCANE_PYRILLA_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "SMALL_INSECTS", "WHITE_POWDERY_GROWTH", "STEM_SOFTENING"]'::jsonb
WHERE rule_id = 'SUGARCANE_MEALYBUG_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_CRAWLING", "SMALL_INSECTS", "LEAF_YELLOWING"]'::jsonb
WHERE rule_id = 'SUGARCANE_THRIPS_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_CHEWING", "LARGE_INSECTS", "LEAF_SKELETONIZATION"]'::jsonb
WHERE rule_id = 'SUGARCANE_GRASSHOPPER_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["ROOT_FEEDING", "LARVAE_PRESENT", "STUNTED_PLANTS", "PATCHY_DAMAGE"]'::jsonb
WHERE rule_id = 'SUGARCANE_WHITEGRUB_001' AND crop_code = 'sugarcane';

-- =============================================================================
-- F. SUGARCANE - DISEASE RULES (04_disease)
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["STEM_ROT_PRESENT", "LEAF_REDDENING", "FOUL_SMELL_PRESENT", "STEM_SOFTENING"]'::jsonb
WHERE rule_id IN ('SUGARCANE_REDROT_001', 'SUGARCANE_REDROT_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["FUNGAL_GROWTH_VISIBLE", "STEM_SPLITTING", "BLACK_SOOTY_MOLD"]'::jsonb
WHERE rule_id IN ('SUGARCANE_SMUT_001', 'SUGARCANE_SMUT_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_STRIPES_PRESENT", "LEAF_YELLOWING", "STUNTED_PLANTS"]'::jsonb
WHERE rule_id IN ('SUGARCANE_MOSAIC_001', 'SUGARCANE_MOSAIC_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["EXCESSIVE_TILLERS", "STUNTED_PLANTS", "LEAF_NARROWING", "LEAF_PALE_GREEN"]'::jsonb
WHERE rule_id IN ('SUGARCANE_GRASSY_SHOOT_001', 'SUGARCANE_GSD_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_YELLOWING", "LEAF_WILTING", "CROWN_ROT_PRESENT"]'::jsonb
WHERE rule_id IN ('SUGARCANE_WILT_001', 'SUGARCANE_WILT_DIAG_001') AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_SPOTS_PRESENT", "LEAF_BROWN_TIPS", "LEAF_BLIGHTED"]'::jsonb
WHERE rule_id = 'SUGARCANE_LEAF_SCALD_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_SPOTS_PRESENT", "LEAF_REDDENING", "LEAF_DRYING"]'::jsonb
WHERE rule_id = 'SUGARCANE_EYE_SPOT_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_PUSTULES", "LEAF_REDDENING", "LEAF_DRYING"]'::jsonb
WHERE rule_id = 'SUGARCANE_RUST_001' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_YELLOWING", "INTERVEINAL_CHLOROSIS", "STUNTED_PLANTS"]'::jsonb
WHERE rule_id = 'SUGARCANE_YLD_001' AND crop_code = 'sugarcane';

-- =============================================================================
-- G. SUGARCANE - NUTRITION RULES (05_nutrition)
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["LEAF_YELLOWING", "UNIFORM_YELLOWING_OLDER_LEAVES", "SLOW_GROWTH", "THIN_STEMS"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_N_DEF%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["PURPLISH_LEAVES", "LEAF_REDDENING", "SHORT_INTERNODES", "STUNTED_PLANTS"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_P_DEF%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_MARGIN_BURN", "LEAF_BROWN_TIPS", "LEAF_SCORCHING", "WEAK_SHOOTS"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_K_DEF%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INTERVEINAL_CHLOROSIS", "LEAF_STRIPES_PRESENT", "UNIFORM_YELLOWING_YOUNG_LEAVES"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_FE_DEF%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INTERVEINAL_CHLOROSIS", "LEAF_PALE_GREEN", "UNIFORM_YELLOWING_YOUNG_LEAVES"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_MN_DEF%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["INTERVEINAL_CHLOROSIS", "LEAF_YELLOWING", "SMALL_LEAVES"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_ZN_DEF%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_YELLOWING", "STUNTED_PLANTS", "THICK_LEAVES"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_S_DEF%' AND crop_code = 'sugarcane';

-- =============================================================================
-- H. SUGARCANE - STRESS RULES (08_stress)
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["LEAF_WILTING", "LEAF_ROLLING", "SOIL_TOO_DRY", "CRACKS_IN_SOIL"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_DROUGHT%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["FIELD_WATERLOGGED", "LEAF_YELLOWING", "ROOT_SOFT", "ROOT_ROTTED"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_WATERLOG%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["LEAF_SCORCHING", "LEAF_BROWN_TIPS", "DAMAGE_AFTER_HEAT"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_HEAT%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["DAMAGE_AFTER_FROST", "LEAF_BROWN_TIPS", "LEAF_DRYING", "STEM_SOFTENING"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_FROST%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["WHITE_SOIL_DEPOSITS", "SALT_CRUST_VISIBLE", "LEAF_MARGIN_BURN", "STUNTED_PLANTS"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_SALIN%' AND crop_code = 'sugarcane';

UPDATE decision_rules SET observable_characteristics = '["PLANTS_LODGING", "STEM_SPLITTING", "DAMAGE_AFTER_WIND"]'::jsonb
WHERE rule_id LIKE 'SUGARCANE_WIND%' AND crop_code = 'sugarcane';

-- =============================================================================
-- I. COTTON - PEST RULES (03_pest)
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "GREEN_INSECTS", "SMALL_INSECTS", "INSECTS_CRAWLING", "BLACK_SOOTY_MOLD"]'::jsonb
WHERE rule_id = 'COTTON_APHID_DIAG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_FLYING", "SMALL_INSECTS", "LEAF_CURLING", "BLACK_SOOTY_MOLD"]'::jsonb
WHERE rule_id = 'COTTON_WHITEFLY_DIAG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_JUMPING", "GREEN_INSECTS", "SMALL_INSECTS", "LEAF_CURLING", "LEAF_SCORCHING"]'::jsonb
WHERE rule_id = 'COTTON_JASSID_DIAG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_CRAWLING", "SMALL_INSECTS", "BLACK_INSECTS", "LEAF_CURLING"]'::jsonb
WHERE rule_id = 'COTTON_THRIPS_DIAG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "WHITE_POWDERY_GROWTH", "SMALL_INSECTS", "STEM_SOFTENING"]'::jsonb
WHERE rule_id = 'COTTON_MEALYBUG_DIAG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["STEM_BORING_MARKS", "STEM_HOLES_VISIBLE", "LARVAE_PRESENT"]'::jsonb
WHERE rule_id = 'COTTON_BOLLWORM_DIAG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["FRUIT_ROT", "LARVAE_PRESENT", "STEM_BORING_MARKS"]'::jsonb
WHERE rule_id = 'COTTON_PINK_BOLLWORM_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_CHEWING", "LARVAE_PRESENT", "LEAF_SKELETONIZATION"]'::jsonb
WHERE rule_id = 'COTTON_SPODOPTERA_DIAG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "SMALL_INSECTS", "LEAF_SPOTS_PRESENT", "LEAF_YELLOWING"]'::jsonb
WHERE rule_id = 'COTTON_RED_SPIDER_MITE_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "MEDIUM_INSECTS", "BROWN_INSECTS", "FRUIT_DEFORMED"]'::jsonb
WHERE rule_id = 'COTTON_DUSKY_COTTON_BUG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "MEDIUM_INSECTS", "LEAF_CHEWING"]'::jsonb
WHERE rule_id = 'COTTON_GREY_WEEVIL_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["INSECTS_VISIBLE", "SMALL_INSECTS", "GREEN_INSECTS", "FRUIT_DEFORMED"]'::jsonb
WHERE rule_id = 'COTTON_MIRID_BUG_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["STEM_BORING_MARKS", "STEM_HOLES_VISIBLE", "LARVAE_PRESENT"]'::jsonb
WHERE rule_id = 'COTTON_STEM_WEEVIL_001' AND crop_code = 'cotton';

-- =============================================================================
-- J. COTTON - DISEASE RULES (04_disease)
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["ROOT_BLACKENING", "ROOT_SOFT", "SEEDLING_WILTED", "FOUL_SMELL_PRESENT"]'::jsonb
WHERE rule_id = 'COTTON_ROOT_ROT_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_MOSAIC_PATTERN", "LEAF_CURLING", "STUNTED_PLANTS"]'::jsonb
WHERE rule_id = 'COTTON_TOBACCO_STREAK_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_CURLING", "LEAF_DISTORTION", "STUNTED_PLANTS", "SMALL_LEAVES"]'::jsonb
WHERE rule_id = 'COTTON_CLCV_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["FRUIT_ROT", "FUNGAL_GROWTH_VISIBLE", "FOUL_SMELL_PRESENT"]'::jsonb
WHERE rule_id = 'COTTON_BOLL_ROT_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_SPOTS_PRESENT", "LEAF_BROWN_TIPS", "STEM_ROT_PRESENT"]'::jsonb
WHERE rule_id = 'COTTON_ANTHRACNOSE_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_SPOTS_PRESENT", "LEAF_BROWN_TIPS", "LEAF_DRYING"]'::jsonb
WHERE rule_id = 'COTTON_MYROTHECIUM_LEAF_SPOT_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_WILTING", "LEAF_YELLOWING", "STEM_ROT_PRESENT", "BASE_DISCOLORATION"]'::jsonb
WHERE rule_id = 'COTTON_VERTICILLIUM_WILT_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_WILTING", "LEAF_YELLOWING", "ROOT_BLACKENING", "STUNTED_PLANTS"]'::jsonb
WHERE rule_id = 'COTTON_FUSARIUM_WILT_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_SPOTS_PRESENT", "WATER_SOAKED_LESIONS", "BACTERIAL_OOZE"]'::jsonb
WHERE rule_id = 'COTTON_BACTERIAL_BLIGHT_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["LEAF_SPOTS_PRESENT", "LEAF_BROWN_TIPS", "LEAF_BLIGHTED"]'::jsonb
WHERE rule_id = 'COTTON_ALTERNARIA_LEAF_SPOT_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["SEEDLING_DIED", "ROOT_ROTTED", "WATER_SOAKED_LESIONS"]'::jsonb
WHERE rule_id = 'COTTON_PHYTOPHTHORA_001' AND crop_code = 'cotton';

UPDATE decision_rules SET observable_characteristics = '["WHITE_POWDERY_GROWTH", "LEAF_YELLOWING", "FUNGAL_GROWTH_VISIBLE"]'::jsonb
WHERE rule_id = 'COTTON_GREY_MILDEW_001' AND crop_code = 'cotton';

-- =============================================================================
-- K. UNIVERSAL SAFETY RULES (all crops)
-- =============================================================================

UPDATE decision_rules SET observable_characteristics = '["DAMAGE_AFTER_RAIN", "FIELD_WATERLOGGED"]'::jsonb
WHERE rule_id IN ('SAFETY_RAIN_BLOCK_001', 'SAFETY_RAIN_BLOCK_002') AND crop_code = 'all';

UPDATE decision_rules SET observable_characteristics = '["DAMAGE_AFTER_WIND", "PLANTS_LODGING"]'::jsonb
WHERE rule_id IN ('SAFETY_WIND_BLOCK_001', 'SAFETY_WIND_CAUTION_001') AND crop_code = 'all';

UPDATE decision_rules SET observable_characteristics = '["DAMAGE_AFTER_HEAT", "LEAF_SCORCHING", "LEAF_WILTING"]'::jsonb
WHERE rule_id IN ('SAFETY_TEMP_HIGH_001', 'SAFETY_TEMP_HIGH_002') AND crop_code = 'all';

UPDATE decision_rules SET observable_characteristics = '["DAMAGE_AFTER_FROST", "LEAF_BROWN_TIPS", "SEEDLING_DIED"]'::jsonb
WHERE rule_id IN ('SAFETY_TEMP_LOW_001', 'SAFETY_FROST_001') AND crop_code = 'all';

UPDATE decision_rules SET observable_characteristics = '["FUNGAL_GROWTH_VISIBLE", "GREY_MOLD_PRESENT"]'::jsonb
WHERE rule_id IN ('SAFETY_DEW_001', 'SAFETY_HUMIDITY_HIGH_001') AND crop_code = 'all';

UPDATE decision_rules SET observable_characteristics = '["SOIL_TOO_DRY", "CRACKS_IN_SOIL", "LEAF_WILTING"]'::jsonb
WHERE rule_id = 'SAFETY_DROUGHT_001' AND crop_code = 'all';

UPDATE decision_rules SET observable_characteristics = '["DAMAGE_AFTER_WIND", "PLANTS_LODGING", "STEM_SPLITTING"]'::jsonb
WHERE rule_id IN ('SAFETY_STORM_001', 'SAFETY_HAIL_001') AND crop_code = 'all';

-- =============================================================================
-- L. UPDATE ALL REMAINING RULES WITH GENERIC STAGE-APPROPRIATE KEYS
-- =============================================================================

-- Germination stage rules without observable_characteristics
UPDATE decision_rules 
SET observable_characteristics = '["SEED_NOT_GERMINATED", "POOR_GERMINATION_PERCENT", "GAPS_IN_FIELD", "SEEDLING_STUNTED"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND 'germination' = ANY(stage_applicable)
  AND canonical_group IN ('02_growth_stage', '03_pest', '04_disease');

-- Tillering/Vegetative stage rules
UPDATE decision_rules 
SET observable_characteristics = '["POOR_TILLERING", "STUNTED_PLANTS", "LEAF_YELLOWING", "SLOW_GROWTH"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND ('tillering' = ANY(stage_applicable) OR 'vegetative' = ANY(stage_applicable))
  AND canonical_group IN ('02_growth_stage', '03_pest', '04_disease');

-- Grand Growth stage rules
UPDATE decision_rules 
SET observable_characteristics = '["SLOW_GROWTH", "SHORT_INTERNODES", "LEAF_YELLOWING", "STEM_BORING_MARKS"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND 'grand_growth' = ANY(stage_applicable)
  AND canonical_group IN ('02_growth_stage', '03_pest', '04_disease');

-- Maturity/Harvest stage rules
UPDATE decision_rules 
SET observable_characteristics = '["LEAF_DRYING", "STEM_ROT_PRESENT", "PLANTS_LODGING"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND ('maturity' = ANY(stage_applicable) OR 'harvest' = ANY(stage_applicable))
  AND canonical_group IN ('02_growth_stage', '03_pest', '04_disease');

-- Nutrition rules
UPDATE decision_rules 
SET observable_characteristics = '["LEAF_YELLOWING", "INTERVEINAL_CHLOROSIS", "STUNTED_PLANTS", "SLOW_GROWTH"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND canonical_group = '05_nutrition';

-- Stress rules
UPDATE decision_rules 
SET observable_characteristics = '["LEAF_WILTING", "LEAF_ROLLING", "SOIL_TOO_DRY", "FIELD_WATERLOGGED"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND canonical_group = '08_stress';

-- Weather rules
UPDATE decision_rules 
SET observable_characteristics = '["DAMAGE_AFTER_RAIN", "DAMAGE_AFTER_HEAT", "DAMAGE_AFTER_WIND", "DAMAGE_AFTER_FROST"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND canonical_group = '09_weather';

-- Irrigation rules
UPDATE decision_rules 
SET observable_characteristics = '["SOIL_TOO_DRY", "FIELD_WATERLOGGED", "LEAF_WILTING", "CRACKS_IN_SOIL"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND canonical_group = '10_irrigation';

-- Safety rules
UPDATE decision_rules 
SET observable_characteristics = '["DAMAGE_AFTER_RAIN", "DAMAGE_AFTER_WIND", "DAMAGE_AFTER_HEAT"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND canonical_group = '11_safety';

-- Monitoring rules
UPDATE decision_rules 
SET observable_characteristics = '["PATCHY_DAMAGE", "LOCALIZED_SPOTS", "EDGE_DAMAGE_ONLY", "ENTIRE_FIELD_AFFECTED"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND canonical_group IN ('12_monitoring', '06_monitoring');

-- Treatment/IPM rules
UPDATE decision_rules 
SET observable_characteristics = '["INSECTS_VISIBLE", "LARVAE_PRESENT", "LEAF_CHEWING", "STEM_BORING_MARKS"]'::jsonb
WHERE (observable_characteristics IS NULL OR observable_characteristics::text = '{}' OR observable_characteristics::text = 'null')
  AND canonical_group = '13_treatment';