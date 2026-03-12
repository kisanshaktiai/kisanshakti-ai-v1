-- Re-apply nitrogen rule fixes (rolled back with prior failed INSERT)

-- Fix 1: SC_NUTRITION_NITROGEN_029 - Remove INTERVEINAL_CHLOROSIS
UPDATE decision_rules 
SET conditions_json = jsonb_set(
  conditions_json, 
  '{observations}', 
  '["GREY_SPECKS_ON_LEAVES", "NECROTIC_SPOTS", "LOWER_LEAVES_YELLOWING", "PALE_YELLOW_WHOLE_PLANT"]'::jsonb
)
WHERE rule_id = 'SC_NUTRITION_NITROGEN_029';

-- Fix 2: SC_NUTRITION_NITROGEN_012 - Remove INTERVEINAL_CHLOROSIS, YOUNG_LEAVES_YELLOW, GREEN_VEINS
UPDATE decision_rules 
SET conditions_json = jsonb_set(
  jsonb_set(
    conditions_json, 
    '{observations}', 
    '["LOWER_LEAVES_YELLOWING", "PALE_YELLOW_WHOLE_PLANT", "LEAF_UNIFORM_YELLOWING"]'::jsonb
  ),
  '{leaf_position}', 
  '"older_leaves"'::jsonb
)
WHERE rule_id = 'SC_NUTRITION_NITROGEN_012';

-- Fix 3: SC_NUTRITION_NITROGEN_022 - Remove INTERVEINAL_YELLOWING_OLDER_LEAVES
UPDATE decision_rules 
SET conditions_json = jsonb_set(
  conditions_json, 
  '{observations}', 
  '["LOWER_LEAVES_YELLOWING", "LEAF_UNIFORM_YELLOWING", "REDDISH_PURPLE_TINGE"]'::jsonb
)
WHERE rule_id = 'SC_NUTRITION_NITROGEN_022';

-- Fix 4: Boost Magnesium rule
UPDATE decision_rules 
SET 
  conditions_json = jsonb_set(
    conditions_json, 
    '{observations}', 
    '["INTERVEINAL_CHLOROSIS", "INTERVEINAL_CHLOROSIS_OLD", "INTERVEINAL_YELLOWING", "LEAF_YELLOWING", "CHLOROSIS", "GREEN_VEINS"]'::jsonb
  ),
  confidence_score = 92,
  priority = 5
WHERE rule_id = 'SC_MICRO_MG_DEFICIENCY_001';