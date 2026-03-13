-- ═══════════════════════════════════════════════════════════════════════════
-- Step 1: Insert missing observation codes into observation_master
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_master (observation_code, description, is_diagnostic, symptom_category, canonical_group, observation_category, affected_plant_part, is_active, is_farmer_observable)
VALUES
('MANGANESE_DEFICIENCY', 'Manganese deficiency - grey/brown spots on leaves, interveinal chlorosis', true, 'nutrient_deficiency', '05_nutrition', 'deficiency', 'LEAF', true, true),
('SULPHUR_DEFICIENCY', 'Sulphur deficiency - uniform yellowing of young leaves, stunted growth', true, 'nutrient_deficiency', '05_nutrition', 'deficiency', 'LEAF', true, true),
('ZINC_DEFICIENCY', 'Zinc deficiency - white bands on leaves, small leaves, short internodes', true, 'nutrient_deficiency', '05_nutrition', 'deficiency', 'LEAF', true, true),
('MAGNESIUM_DEFICIENCY', 'Magnesium deficiency - interveinal chlorosis on older leaves, green veins retained', true, 'nutrient_deficiency', '05_nutrition', 'deficiency', 'LEAF', true, true)
ON CONFLICT (observation_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Step 2: P0 - Fix 8 Misclassified Nitrogen Rules
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE decision_rules SET cause = 'Zinc Deficiency', category = 'nutrition', canonical_group = '05_nutrition'
WHERE rule_id = 'SC_NUTRITION_NITROGEN_004';

UPDATE decision_rules SET cause = 'Phosphorus Deficiency'
WHERE rule_id = 'SC_NUTRITION_NITROGEN_005';

UPDATE decision_rules SET cause = 'Phosphorus Deficiency'
WHERE rule_id = 'SC_NUTRITION_NITROGEN_026';

UPDATE decision_rules SET cause = 'Potassium Deficiency'
WHERE rule_id = 'SC_NUTRITION_NITROGEN_025';

UPDATE decision_rules SET cause = 'Boron Deficiency'
WHERE rule_id = 'SC_NUTRITION_NITROGEN_015';

UPDATE decision_rules SET cause = 'Iron Deficiency'
WHERE rule_id = 'SC_NUTRITION_NITROGEN_010';

UPDATE decision_rules SET category = 'pest', canonical_group = '03_pest'
WHERE rule_id = 'SC_NUTRITION_NITROGEN_018';

UPDATE decision_rules SET action_type = 'MONITOR', category = 'advisory'
WHERE rule_id = 'SC_NUTRITION_NITROGEN_030';

-- ═══════════════════════════════════════════════════════════════════════════
-- Step 3: P0 - Fix Schedule Rules — Remove symptom observations
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["FERTILIZER_SCHEDULE", "BASAL_APPLICATION", "PLANTING_NUTRITION"]'::jsonb)
WHERE rule_id = 'SC_FERT_SCHEDULE_GERMINATION_001';

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["FERTILIZER_SCHEDULE", "SPLIT_APPLICATION", "TILLERING_NUTRITION"]'::jsonb)
WHERE rule_id = 'SC_FERT_SCHEDULE_TILLERING_001';

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["FERTILIZER_SCHEDULE", "MICRONUTRIENT_APPLICATION", "TILLERING_NUTRITION"]'::jsonb)
WHERE rule_id = 'SC_FERT_SCHEDULE_TILLERING_002';

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["FERTILIZER_SCHEDULE", "FINAL_NITROGEN_SPLIT", "GRAND_GROWTH_NUTRITION"]'::jsonb)
WHERE rule_id = 'SC_FERT_SCHEDULE_GRAND_GROWTH_001';

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["FERTILIZER_SCHEDULE", "MATURITY_POTASSIUM", "MATURITY_NUTRITION"]'::jsonb)
WHERE rule_id = 'SC_FERT_SCHEDULE_MATURITY_001';

-- ═══════════════════════════════════════════════════════════════════════════
-- Step 4: P0 - Fix URGENT Rules — Specific observations per deficiency
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["INTERVEINAL_YELLOWING_NEW_LEAVES", "UNIFORM_YELLOWING_YOUNG_LEAVES", "IRON_DEFICIENCY", "PALE_GREEN_YOUNG_LEAVES"]'::jsonb)
WHERE rule_id = 'SC_MICRO_FE_DEFICIENCY_URGENT_001';

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["WHITE_BANDS_ON_LEAVES", "SMALL_LEAVES", "SHORT_INTERNODES", "ZINC_DEFICIENCY", "BRONZING"]'::jsonb)
WHERE rule_id = 'SC_MICRO_ZN_DEFICIENCY_URGENT_001';

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["INTERVEINAL_CHLOROSIS", "NECROTIC_SPOTS", "MANGANESE_DEFICIENCY", "GREY_SPOTS_ON_LEAVES"]'::jsonb)
WHERE rule_id = 'SC_MICRO_MN_DEFICIENCY_URGENT_001';

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["LEAF_TIP_BURN", "MARGINAL_SCORCH", "WEAK_STALKS", "LODGING", "POTASSIUM_DEFICIENCY"]'::jsonb)
WHERE rule_id = 'SC_NUTRITION_K_DEFICIENCY_URGENT_001';

UPDATE decision_rules SET conditions_json = jsonb_set(conditions_json, '{observations}',
  '["UNIFORM_YELLOWING_YOUNG_LEAVES", "PALE_YELLOW_WHOLE_PLANT", "SULPHUR_DEFICIENCY"]'::jsonb)
WHERE rule_id = 'SC_NUTRITION_S_DEFICIENCY_URGENT_001';

-- ═══════════════════════════════════════════════════════════════════════════
-- Step 5: P2 - Differentiate confidence_scores (tiered)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE decision_rules SET confidence_score = 0.95
WHERE crop_code = 'sugarcane' AND is_active = true
AND (rule_id LIKE 'SC_PEST_%' OR rule_id LIKE 'SC_DISEASE_%')
AND conditions_json->'observations' IS NOT NULL
AND jsonb_array_length(COALESCE(conditions_json->'observations', '[]'::jsonb)) >= 2;

UPDATE decision_rules SET confidence_score = 0.85
WHERE crop_code = 'sugarcane' AND is_active = true
AND (rule_id LIKE 'SC_MICRO_%' OR rule_id LIKE 'SC_NUTRITION_K_%' OR rule_id LIKE 'SC_NUTRITION_S_%');

UPDATE decision_rules SET confidence_score = 0.85
WHERE crop_code = 'sugarcane' AND is_active = true AND rule_id LIKE 'SC_IPM_%';

UPDATE decision_rules SET confidence_score = 0.75
WHERE crop_code = 'sugarcane' AND is_active = true
AND rule_id LIKE 'SC_NUTRITION_NITROGEN_%' AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.70
WHERE crop_code = 'sugarcane' AND is_active = true
AND (rule_id LIKE 'SC_IRRIGATION_%' OR rule_id LIKE 'SC_STRESS_%') AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.60
WHERE crop_code = 'sugarcane' AND is_active = true AND rule_id LIKE 'SC_FERT_SCHEDULE_%';

UPDATE decision_rules SET confidence_score = 0.90
WHERE crop_code = 'sugarcane' AND is_active = true
AND (rule_id LIKE 'SC_SAFETY_%' OR rule_id LIKE 'SC_WEATHER_%') AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.70
WHERE crop_code = 'sugarcane' AND is_active = true
AND (rule_id LIKE 'SC_STAGE_%' OR rule_id LIKE 'SC_HARVEST_%') AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.50
WHERE crop_code = 'sugarcane' AND is_active = true
AND (rule_id LIKE 'SC_MONITOR_%' OR rule_id LIKE 'SC_CLARIFICATION_%') AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.95
WHERE rule_id = 'SC_MICRO_MG_DEFICIENCY_001';

UPDATE decision_rules SET confidence_score = 0.70
WHERE crop_code = 'sugarcane' AND is_active = true AND confidence_score = 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- Step 6: P1 - Insert Missing Observation Translations (Marathi + Hindi)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_translations (observation_code, crop_code, language_code, display_text, description_text)
VALUES
('INTERVEINAL_CHLOROSIS', 'SUGARCANE', 'mr', 'शिरांमधील पिवळेपणा', 'पानांच्या शिरांमध्ये पिवळेपणा दिसतो, शिरा हिरव्या राहतात'),
('INTERVEINAL_CHLOROSIS', 'SUGARCANE', 'hi', 'शिराओं के बीच पीलापन', 'पत्तियों की शिराओं के बीच पीलापन दिखता है, शिराएं हरी रहती हैं'),
('IRON_DEFICIENCY', 'SUGARCANE', 'mr', 'लोहाची कमतरता', 'नवीन पानांवर पिवळेपणा, शिरा हिरव्या राहतात'),
('IRON_DEFICIENCY', 'SUGARCANE', 'hi', 'लोहे की कमी', 'नई पत्तियों पर पीलापन, शिराएं हरी रहती हैं'),
('BORON_DEFICIENCY', 'SUGARCANE', 'mr', 'बोरॉनची कमतरता', 'कांड्यांना तडे, कॉर्कसारखे डाग'),
('BORON_DEFICIENCY', 'SUGARCANE', 'hi', 'बोरॉन की कमी', 'गांठों में दरारें, कॉर्क जैसे धब्बे'),
('NITROGEN_DEFICIENCY', 'SUGARCANE', 'mr', 'नत्राची कमतरता', 'जुन्या पानांवर एकसमान पिवळेपणा, वाढ खुंटणे'),
('NITROGEN_DEFICIENCY', 'SUGARCANE', 'hi', 'नाइट्रोजन की कमी', 'पुरानी पत्तियों पर एक समान पीलापन, विकास रुकना'),
('PHOSPHORUS_DEFICIENCY', 'SUGARCANE', 'mr', 'स्फुरदाची कमतरता', 'पाने जांभळट, मुळांची कमकुवत वाढ'),
('PHOSPHORUS_DEFICIENCY', 'SUGARCANE', 'hi', 'फास्फोरस की कमी', 'पत्तियां बैंगनी, जड़ों की कमजोर वृद्धि'),
('POTASSIUM_DEFICIENCY', 'SUGARCANE', 'mr', 'पालाशची कमतरता', 'पानांच्या टोकांवर करपणे, कांडी कमकुवत'),
('POTASSIUM_DEFICIENCY', 'SUGARCANE', 'hi', 'पोटाश की कमी', 'पत्तियों के किनारे जलना, तना कमजोर'),
('LOWER_LEAVES_YELLOWING', 'SUGARCANE', 'mr', 'खालच्या पानांचा पिवळेपणा', 'खालच्या जुन्या पानांवर पिवळेपणा'),
('LOWER_LEAVES_YELLOWING', 'SUGARCANE', 'hi', 'निचली पत्तियों का पीलापन', 'निचली पुरानी पत्तियों पर पीलापन'),
('PALE_YELLOW_WHOLE_PLANT', 'SUGARCANE', 'mr', 'संपूर्ण रोपावर फिकट पिवळेपणा', 'संपूर्ण रोप फिकट पिवळे दिसते'),
('PALE_YELLOW_WHOLE_PLANT', 'SUGARCANE', 'hi', 'पूरे पौधे पर हल्का पीलापन', 'पूरा पौधा हल्का पीला दिखता है'),
('LEAF_UNIFORM_YELLOWING', 'SUGARCANE', 'mr', 'पानांवर एकसमान पिवळेपणा', 'पान संपूर्णपणे एकसमान पिवळे होते'),
('LEAF_UNIFORM_YELLOWING', 'SUGARCANE', 'hi', 'पत्तियों पर एक समान पीलापन', 'पत्ती पूरी तरह एक समान पीली होती है'),
('LEAF_TIP_BURN', 'SUGARCANE', 'mr', 'पानांच्या टोकांचे करपणे', 'पानांची टोके तपकिरी होऊन करपतात'),
('LEAF_TIP_BURN', 'SUGARCANE', 'hi', 'पत्तियों के सिरे का जलना', 'पत्तियों के सिरे भूरे होकर जलते हैं'),
('LEAF_ROLLING', 'SUGARCANE', 'mr', 'पाने गुंडाळणे', 'पाने आतल्या बाजूला गुंडाळतात - पाण्याचा ताण'),
('LEAF_ROLLING', 'SUGARCANE', 'hi', 'पत्तियों का मुड़ना', 'पत्तियां अंदर की ओर मुड़ती हैं - पानी का तनाव'),
('LEAF_MARGIN_SCORCH', 'SUGARCANE', 'mr', 'पानांच्या कडांचे करपणे', 'पानांच्या कडा तपकिरी होऊन करपतात'),
('LEAF_MARGIN_SCORCH', 'SUGARCANE', 'hi', 'पत्तियों के किनारों का जलना', 'पत्तियों के किनारे भूरे होकर जलते हैं'),
('MANGANESE_DEFICIENCY', 'SUGARCANE', 'mr', 'मँगनीजची कमतरता', 'पानांवर राखाडी ठिपके, शिरांमधील पिवळेपणा'),
('MANGANESE_DEFICIENCY', 'SUGARCANE', 'hi', 'मैंगनीज की कमी', 'पत्तियों पर भूरे धब्बे, शिराओं के बीच पीलापन'),
('SULPHUR_DEFICIENCY', 'SUGARCANE', 'mr', 'गंधकाची कमतरता', 'नवीन पानांवर एकसमान फिकट पिवळेपणा'),
('SULPHUR_DEFICIENCY', 'SUGARCANE', 'hi', 'गंधक की कमी', 'नई पत्तियों पर एक समान हल्का पीलापन'),
('ZINC_DEFICIENCY', 'SUGARCANE', 'mr', 'जस्ताची कमतरता', 'पानांवर पांढरे पट्टे, लहान पाने, खुंटलेली वाढ'),
('ZINC_DEFICIENCY', 'SUGARCANE', 'hi', 'जस्ते की कमी', 'पत्तियों पर सफेद धारियां, छोटी पत्तियां, रुकी हुई वृद्धि'),
('MAGNESIUM_DEFICIENCY', 'SUGARCANE', 'mr', 'मॅग्नेशियमची कमतरता', 'जुन्या पानांवर शिरांमधील पिवळेपणा, शिरा हिरव्या'),
('MAGNESIUM_DEFICIENCY', 'SUGARCANE', 'hi', 'मैग्नीशियम की कमी', 'पुरानी पत्तियों पर शिराओं के बीच पीलापन, शिराएं हरी')
ON CONFLICT (observation_code, language_code) DO UPDATE SET
  display_text = EXCLUDED.display_text,
  description_text = EXCLUDED.description_text,
  crop_code = EXCLUDED.crop_code;