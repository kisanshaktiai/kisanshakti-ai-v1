-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Populate observable_characteristics for nutrition rules
-- These rules had empty observable_characteristics, causing garbage display
-- in the farmer clarification UI (e.g., "ZINC_DEFICIENCY_CAUSES_CHLOROS").
-- ═══════════════════════════════════════════════════════════════════════════

-- Zinc deficiency
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["INTERVEINAL_CHLOROSIS", "LEAF_YELLOWING", "STUNTED_GROWTH"]}'::jsonb
WHERE rule_id = 'SC_MICRO_ZN_DEFICIENCY_URGENT_001' AND is_active = true;

UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["ROOT_DAMAGE", "STUNTED_GROWTH"]}'::jsonb
WHERE rule_id = 'SC_MICRO_ZN_TOXICITY_BLOCK_001' AND is_active = true;

-- Iron deficiency/chlorosis
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["INTERVEINAL_CHLOROSIS", "LEAF_YELLOWING"]}'::jsonb
WHERE rule_id IN ('SC_MICRO_FE_DEFICIENCY_URGENT_001', 'SC_MICRO_FE_CHLOROSIS_002') AND is_active = true;

UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["BRONZE_LEAVES", "WATERLOGGING_DAMAGE"]}'::jsonb
WHERE rule_id = 'SC_MICRO_FE_TOXICITY_BLOCK_001' AND is_active = true;

-- Manganese deficiency/toxicity
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["INTERVEINAL_CHLOROSIS", "GREY_SPECKS", "STUNTED_GROWTH"]}'::jsonb
WHERE rule_id = 'SC_MICRO_MN_DEFICIENCY_URGENT_001' AND is_active = true;

UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["LEAF_NECROSIS", "BROWN_SPOTS", "STUNTED_GROWTH"]}'::jsonb
WHERE rule_id = 'SC_MICRO_MN_TOXICITY_BLOCK_001' AND is_active = true;

-- Potassium deficiency
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["BROWN_EDGES", "LODGING", "DRIED_LOWER_LEAVES"]}'::jsonb
WHERE rule_id = 'SC_NUTRITION_K_DEFICIENCY_URGENT_001' AND is_active = true;

-- Magnesium deficiency
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["INTERVEINAL_CHLOROSIS", "OLDER_LEAF_YELLOWING"]}'::jsonb
WHERE rule_id = 'SC_MICRO_MG_DEFICIENCY_002' AND is_active = true;

-- Boron toxicity
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["BURNT_TIPS", "LEAF_NECROSIS"]}'::jsonb
WHERE rule_id = 'SC_NUTRITION_BORON_TOXICITY_BLOCK_001' AND is_active = true;

-- Nitrogen excess
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["DARK_GREEN", "EXCESS_TILLERING", "LODGING"]}'::jsonb
WHERE rule_id IN ('SC_NUTRITION_N_EXCESS_BLOCK_001', 'SC_NUTRITION_LUXURY_N_002') AND is_active = true;

-- Sulphur deficiency
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["LIGHT_GREEN_LEAVES", "GENERAL_YELLOWING", "STUNTED_GROWTH"]}'::jsonb
WHERE rule_id = 'SC_NUTRITION_S_DEFICIENCY_URGENT_001' AND is_active = true;

-- Phosphorus excess / P-K antagonism
UPDATE decision_rules SET observable_characteristics = '{"symptoms": ["INTERVEINAL_CHLOROSIS", "DEFICIENCY_SYMPTOMS"]}'::jsonb
WHERE rule_id IN ('SC_NUTRITION_PK_ZN_ANTAGONISM_002', 'SC_NUTRITION_P_EXCESS_BLOCK_001') AND is_active = true;