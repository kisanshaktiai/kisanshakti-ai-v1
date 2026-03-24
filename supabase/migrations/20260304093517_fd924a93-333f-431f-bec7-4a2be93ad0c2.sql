-- First add WILTING_OR_DROOPING to observation_master
INSERT INTO observation_master (
  observation_code, description, observation_category, affected_plant_part, 
  is_diagnostic, canonical_group
) VALUES (
  'WILTING_OR_DROOPING',
  'Plant shows wilting, drooping, or loss of turgidity in leaves and stems',
  'PHYSIOLOGY',
  'WHOLE',
  false,
  'WILTING'
) ON CONFLICT (observation_code) DO NOTHING;

-- Add translations with correct column name
INSERT INTO observation_translations (observation_code, language_code, display_text)
VALUES 
  ('WILTING_OR_DROOPING', 'mr', 'Wilting or drooping'),
  ('WILTING_OR_DROOPING', 'hi', 'Plant wilting or drooping'),
  ('WILTING_OR_DROOPING', 'en', 'Plant wilting or drooping')
ON CONFLICT (observation_code, language_code) DO NOTHING;

-- Now insert the wilting rules for sugarcane
INSERT INTO decision_rules (
  rule_id, crop_group, crop_code, category, cause, condition_code,
  conditions_json, action_type, action_text, reason_text, knowledge_text,
  stage_applicable, priority, confidence_score, data_authority_rank,
  is_active
) VALUES 
(
  'SC_PHYSIOLOGY_WILTING_001',
  'SUGARCANE',
  'SUGARCANE',
  'PHYSIOLOGY',
  'Wilting or drooping in sugarcane',
  'WILTING_OR_DROOPING',
  '{"observations": ["WILTING_OR_DROOPING"], "crop_code": "SUGARCANE"}'::jsonb,
  'RECOMMEND',
  'Irrigate immediately if soil moisture is low. Check for root borer damage by uprooting one affected plant. If red tunneling visible in roots, apply Chlorantraniliprole 0.4% GR at 10 kg/acre in root zone.',
  'Wilting in sugarcane can be caused by water stress, root borer damage, or red rot infection. Water stress wilting recovers by evening while pest/disease wilting persists.',
  'Sugarcane wilting differential diagnosis: (1) Water stress - leaves roll inward, recover evening, no discoloration. (2) Root borer - plant pulls easily, red tunneling in roots. (3) Red rot - middle leaves yellow first, pith shows red lesions with white patches.',
  '{TILLERING,GRAND_GROWTH,VEGETATIVE,EARLY_GROWTH}',
  8,
  0.75,
  75,
  true
),
(
  'SC_PHYSIOLOGY_WILTING_002', 
  'SUGARCANE',
  'SUGARCANE',
  'PHYSIOLOGY',
  'Wilting or drooping in sugarcane during maturity',
  'WILTING_OR_DROOPING',
  '{"observations": ["WILTING_OR_DROOPING"], "crop_code": "SUGARCANE"}'::jsonb,
  'MONITOR',
  'At maturity stage, mild wilting is normal as plant redirects energy to sucrose accumulation. Ensure irrigation schedule is maintained. If wilting is severe and localized, check for red rot.',
  'During maturation, sugarcane naturally reduces water uptake. Severe localized wilting may indicate red rot disease.',
  'Sugarcane maturity wilting: Natural physiological process during ripening (300+ DAS). Red rot (Colletotrichum falcatum) can cause similar symptoms.',
  '{MATURATION,RIPENING,HARVEST}',
  7,
  0.70,
  70,
  true
)
ON CONFLICT (rule_id) DO NOTHING;