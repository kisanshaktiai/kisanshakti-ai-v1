-- P2: Differentiate confidence_scores (crop_code is UPPERCASE)

UPDATE decision_rules SET confidence_score = 0.95
WHERE crop_code = 'SUGARCANE' AND is_active = true
AND (rule_id LIKE 'SC_PEST_%' OR rule_id LIKE 'SC_DISEASE_%')
AND conditions_json->'observations' IS NOT NULL
AND jsonb_array_length(COALESCE(conditions_json->'observations', '[]'::jsonb)) >= 2;

UPDATE decision_rules SET confidence_score = 0.85
WHERE crop_code = 'SUGARCANE' AND is_active = true
AND (rule_id LIKE 'SC_MICRO_%' OR rule_id LIKE 'SC_NUTRITION_K_%' OR rule_id LIKE 'SC_NUTRITION_S_%');

UPDATE decision_rules SET confidence_score = 0.85
WHERE crop_code = 'SUGARCANE' AND is_active = true AND rule_id LIKE 'SC_IPM_%';

UPDATE decision_rules SET confidence_score = 0.75
WHERE crop_code = 'SUGARCANE' AND is_active = true
AND rule_id LIKE 'SC_NUTRITION_NITROGEN_%' AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.70
WHERE crop_code = 'SUGARCANE' AND is_active = true
AND (rule_id LIKE 'SC_IRRIGATION_%' OR rule_id LIKE 'SC_STRESS_%') AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.60
WHERE crop_code = 'SUGARCANE' AND is_active = true AND rule_id LIKE 'SC_FERT_SCHEDULE_%';

UPDATE decision_rules SET confidence_score = 0.90
WHERE crop_code = 'SUGARCANE' AND is_active = true
AND (rule_id LIKE 'SC_SAFETY_%' OR rule_id LIKE 'SC_WEATHER_%') AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.70
WHERE crop_code = 'SUGARCANE' AND is_active = true
AND (rule_id LIKE 'SC_STAGE_%' OR rule_id LIKE 'SC_HARVEST_%') AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.50
WHERE crop_code = 'SUGARCANE' AND is_active = true
AND (rule_id LIKE 'SC_MONITOR_%' OR rule_id LIKE 'SC_CLARIFICATION_%') AND confidence_score = 1;

UPDATE decision_rules SET confidence_score = 0.95
WHERE rule_id = 'SC_MICRO_MG_DEFICIENCY_001';

-- Catch-all remaining
UPDATE decision_rules SET confidence_score = 0.70
WHERE crop_code = 'SUGARCANE' AND is_active = true AND confidence_score = 1;