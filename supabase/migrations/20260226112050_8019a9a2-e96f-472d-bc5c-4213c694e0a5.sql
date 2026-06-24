
-- ═══════════════════════════════════════════════════════════════════════════
-- FORENSIC AUDIT FIX v4 — All phases in single transaction
-- ═══════════════════════════════════════════════════════════════════════════

-- PHASE 1 — observation_master
INSERT INTO observation_master (observation_code, description, is_diagnostic, observation_category, canonical_group, affected_plant_part, is_active)
VALUES
  ('FERTILIZER_SCHEDULE',    'General fertilizer schedule advisory request',  false, 'MANAGEMENT', 'nutrition', 'WHOLE', true),
  ('NITROGEN_MANAGEMENT',    'Nitrogen fertilizer management advisory',       false, 'MANAGEMENT', 'nutrition', 'WHOLE', true),
  ('PHOSPHORUS_MANAGEMENT',  'Phosphorus fertilizer management advisory',     false, 'MANAGEMENT', 'nutrition', 'WHOLE', true),
  ('POTASSIUM_MANAGEMENT',   'Potassium fertilizer management advisory',      false, 'MANAGEMENT', 'nutrition', 'WHOLE', true)
ON CONFLICT (observation_code) DO NOTHING;

-- PHASE 2 — intent_observation_mapping
INSERT INTO intent_observation_mapping (intent_code, crop_code, growth_stage, das_min, das_max, observation_code, confidence_rank, is_active)
VALUES
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'GERMINATION',   0,   45, 'FERTILIZER_SCHEDULE',   1, true),
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'GERMINATION',   0,   45, 'PHOSPHORUS_MANAGEMENT', 2, true),
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'GERMINATION',   0,   45, 'POTASSIUM_MANAGEMENT',  3, true),
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'TILLERING',    45,  120, 'FERTILIZER_SCHEDULE',   1, true),
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'TILLERING',    45,  120, 'NITROGEN_MANAGEMENT',   2, true),
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'GRAND_GROWTH', 120, 270, 'FERTILIZER_SCHEDULE',   1, true),
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'GRAND_GROWTH', 120, 270, 'NITROGEN_MANAGEMENT',   2, true),
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'MATURITY',     270, 365, 'FERTILIZER_SCHEDULE',   1, true),
  ('FERTILIZER_SCHEDULE', 'SUGARCANE', 'MATURITY',     270, 365, 'POTASSIUM_MANAGEMENT',  2, true),
  ('FERTILIZER_SCHEDULE', 'ALL',       'ALL',            0, 999, 'FERTILIZER_SCHEDULE',   1, true)
ON CONFLICT DO NOTHING;

-- PHASE 3 — observation_aliases (3 columns only: alias_code, canonical_code, created_at)
INSERT INTO observation_aliases (alias_code, canonical_code)
VALUES
  ('FERTILIZER_QUERY',  'FERTILIZER_SCHEDULE'),
  ('KHAT_QUERY',        'FERTILIZER_SCHEDULE'),
  ('NUTRIENT_QUERY',    'FERTILIZER_SCHEDULE')
ON CONFLICT DO NOTHING;

-- PHASE 4 — Pure advisory fertilizer rules (action_type = 'RECOMMEND')
INSERT INTO decision_rules (
  rule_id, crop_group, crop_code, category, canonical_group, condition_code,
  stage_applicable, conditions_json, cause, priority, action_type,
  scientific_source, scientific_basis, icar_package_ref, confidence_score,
  is_active, version, rule_version
)
VALUES
  (
    'SC_FERT_SCHEDULE_GERMINATION_001',
    'SUGARCANE', 'SUGARCANE', 'nutrition', '05_nutrition', 'FERTILIZER_SCHEDULE',
    ARRAY['germination'],
    '{"context": "fertilizer_schedule", "always_applicable": true}'::jsonb,
    'Basal Fertilizer Application at Planting', 8, 'RECOMMEND',
    'ICAR-SBI Coimbatore Sugarcane Production Technology',
    'ICAR Package of Practices: Apply 100:60:60 kg NPK/ha. Basal: full P (60 kg P2O5 as SSP), full K (60 kg K2O as MOP), 1/3 N (33 kg as Urea). Apply FYM/compost at 10-12 t/ha 15 days before planting.',
    'ICAR-SBI/PoP/Sugarcane/Nutrition/Basal', 90, true, '3.0.0', '3.0.0'
  ),
  (
    'SC_FERT_SCHEDULE_TILLERING_001',
    'SUGARCANE', 'SUGARCANE', 'nutrition', '05_nutrition', 'FERTILIZER_SCHEDULE',
    ARRAY['tillering'],
    '{"context": "fertilizer_schedule", "always_applicable": true}'::jsonb,
    'Second Split Nitrogen Application at Tillering', 8, 'RECOMMEND',
    'ICAR-SBI Coimbatore Sugarcane Production Technology',
    'ICAR Package of Practices: Apply 2nd split of N (33 kg N/ha = ~72 kg Urea/ha) at 45-75 DAP during active tillering. Band-place 10 cm from row and irrigate immediately. For K-deficient soils, apply additional 30 kg K2O/ha as MOP.',
    'ICAR-SBI/PoP/Sugarcane/Nutrition/Tillering', 90, true, '3.0.0', '3.0.0'
  ),
  (
    'SC_FERT_SCHEDULE_TILLERING_002',
    'SUGARCANE', 'SUGARCANE', 'nutrition', '05_nutrition', 'FERTILIZER_SCHEDULE',
    ARRAY['tillering'],
    '{"context": "micronutrient_schedule", "always_applicable": true}'::jsonb,
    'Micronutrient Application at Tillering', 6, 'RECOMMEND',
    'ICAR-SBI Coimbatore & State Agricultural Universities',
    'Apply ZnSO4 at 25 kg/ha if not applied at planting. For iron-deficient soils, apply FeSO4 at 10 kg/ha. Foliar spray: 0.5% ZnSO4 + 0.2% Borax at 60 DAP for enhanced tillering.',
    'ICAR-SBI/PoP/Sugarcane/Nutrition/Micro', 85, true, '3.0.0', '3.0.0'
  ),
  (
    'SC_FERT_SCHEDULE_GRAND_GROWTH_001',
    'SUGARCANE', 'SUGARCANE', 'nutrition', '05_nutrition', 'FERTILIZER_SCHEDULE',
    ARRAY['grand_growth'],
    '{"context": "fertilizer_schedule", "always_applicable": true}'::jsonb,
    'Final Nitrogen Split at Grand Growth', 8, 'RECOMMEND',
    'ICAR-SBI Coimbatore Sugarcane Production Technology',
    'ICAR Package of Practices: Apply final 1/3 N (33 kg N/ha = ~72 kg Urea/ha) at 90-120 DAP before earthing up. DO NOT apply nitrogen after 120 DAP — delays maturity and reduces sucrose. For ratoon crops, apply additional 30 kg K2O/ha.',
    'ICAR-SBI/PoP/Sugarcane/Nutrition/GrandGrowth', 90, true, '3.0.0', '3.0.0'
  ),
  (
    'SC_FERT_SCHEDULE_MATURITY_001',
    'SUGARCANE', 'SUGARCANE', 'nutrition', '05_nutrition', 'FERTILIZER_SCHEDULE',
    ARRAY['maturity'],
    '{"context": "fertilizer_schedule", "always_applicable": true}'::jsonb,
    'Maturity Stage Potassium Management', 7, 'RECOMMEND',
    'ICAR-SBI Coimbatore Sugarcane Production Technology',
    'No nitrogen or phosphorus at maturity stage. Apply 40 kg K2O/ha as MOP if not applied earlier. Foliar spray of 2% KCl at 30-day intervals improves CCS by 0.5-1%. Withhold irrigation 15-20 days before harvest for sugar accumulation.',
    'ICAR-SBI/PoP/Sugarcane/Nutrition/Maturity', 88, true, '3.0.0', '3.0.0'
  )
ON CONFLICT (rule_id) DO NOTHING;
