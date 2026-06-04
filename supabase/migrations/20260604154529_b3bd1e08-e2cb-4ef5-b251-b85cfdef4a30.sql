
INSERT INTO public.crop_vocabulary
  (crop_code, phrase_pattern, semantic_hint, recommended_intent_bias, recommended_observation_bias, language_hint, is_active)
VALUES
  ('ALL', 'सध्या', 'currently / now (temporal)', NULL, NULL, 'mr', true),
  ('ALL', 'आता', 'now (temporal)', NULL, NULL, 'mr', true),
  ('ALL', 'कोणती', 'which (feminine sg)', NULL, NULL, 'mr', true),
  ('ALL', 'कोणत्या', 'which (feminine pl)', NULL, NULL, 'mr', true),
  ('ALL', 'द्यावीत', 'should be given (fem pl imperative)', NULL, NULL, 'mr', true),
  ('ALL', 'द्याव्यात', 'should be given (fem pl imperative variant)', NULL, NULL, 'mr', true),
  ('ALL', 'सध्या कोणती खते द्यावीत', 'which fertilizers to apply now (mr)', 'FERTILIZER_SCHEDULE', NULL, 'mr', true),
  ('ALL', 'कोणती खते', 'which fertilizers (fem pl mr)', 'FERTILIZER_SCHEDULE', NULL, 'mr', true),
  ('ALL', 'खते द्यावीत', 'fertilizers should be given (mr)', 'FERTILIZER_SCHEDULE', NULL, 'mr', true),
  ('ALL', 'खते कधी', 'when fertilizers (mr)', 'FERTILIZER_SCHEDULE', NULL, 'mr', true),
  ('ALL', 'खते किती', 'how much fertilizers (mr)', 'FERTILIZER_SCHEDULE', NULL, 'mr', true),
  ('ALL', 'सध्या पाणी', 'water now (mr)', 'IRRIGATION_SCHEDULE', NULL, 'mr', true),
  ('ALL', 'कोणती औषधे', 'which medicines (fem pl mr)', 'SPRAY_PESTICIDE', NULL, 'mr', true),
  ('ALL', 'कोणती फवारणी द्यावी', 'which spray should be given (mr)', 'SPRAY_PESTICIDE', NULL, 'mr', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.decision_rules
  (rule_id, crop_group, crop_code, category, stage_applicable, conditions_json,
   cause, priority, action_type, condition_code, is_active,
   ndvi_min, ndvi_max, reason_text, knowledge_text, risk_level,
   response_severity, rule_intent, confidence_score, data_authority_rank)
VALUES
  ('SC_DATA_QUALITY_NDVI_001',
   'cereals_grasses',
   'SUGARCANE',
   'data_quality',
   ARRAY['TILLERING','GRAND_GROWTH','MATURITY']::text[],
   '{"ndvi_max": 0.15, "observations": ["NDVI_VERY_LOW","DATA_QUALITY"], "min_canopy_expected": true}'::jsonb,
   'NDVI satellite reading is too low to be biologically plausible for a healthy canopy at this stage; either the field is bare/very sparse or the satellite signal is unreliable (cloud, shadow, edge pixels).',
   6,
   'RECOMMEND',
   'NDVI_DIAGNOSTIC',
   true,
   0.0,
   0.15,
   'Satellite vegetation index is unreliable for this field right now — please confirm whether the canopy is healthy on the ground before relying on satellite-based advice.',
   'NDVI below 0.15 at GRAND_GROWTH is well below the expected 0.55–0.85 band for a healthy sugarcane canopy. Common causes: heavy cloud at acquisition, recent harvest/cutback, sensor edge pixel, or genuinely bare field. Treat as DATA_QUALITY warning, not as a vegetation-stress diagnosis.',
   'low',
   'INFO',
   'WARNING',
   0.9,
   95)
ON CONFLICT (rule_id) DO UPDATE SET
  conditions_json = EXCLUDED.conditions_json,
  ndvi_min = EXCLUDED.ndvi_min,
  ndvi_max = EXCLUDED.ndvi_max,
  reason_text = EXCLUDED.reason_text,
  knowledge_text = EXCLUDED.knowledge_text,
  priority = EXCLUDED.priority,
  response_severity = EXCLUDED.response_severity,
  rule_intent = EXCLUDED.rule_intent,
  updated_at = now();
