-- =============================================================================
-- Proactive alerts — decision-graph links and rule-data corrections
-- 2026-10-02 · companion to proactive-evaluator v128 (graph-advice.ts)
--
-- FOR REVIEW. Nothing here deletes a row. Every statement stands alone (no
-- session state, no temp tables) so each can be run, or skipped, on its own in
-- the SQL runner. Statements 1–3 are wiring; 4–8 are agronomic/policy
-- decisions and are listed separately so each can be approved on its own.
--
-- Finding → statement
--   F-A  Alerts had no link into the hypothesis → rule graph, so the evaluator
--        guessed a decision rule by category/substring and wrote its own
--        advice when the guess failed.                              → 2, 3
--   F-B  Rule messages carried advice (spray, irrigate, apply urea) that does
--        not come from the graph; Marathi/Hindi copies carried the same advice.
--                                                                  → 4
--   F-C  ENV_SPRAY_WINDOW_GOOD nudges spraying on a crop-agnostic leaf-wetness
--        index with no diagnosis (84 alerts / 14 days) — conflicts with the
--        farm-monitoring policy (protection alerts are WATCH/SCOUT_CONFIRM).
--                                                                  → 5
--   F-D  Fertilizer-window rules (PRO_SC_TOPDRESS "Apply Urea", POTATO_PR_N_TOPDRESS)
--        generate a fertilizer action from an alert — same policy.  → 6
--   F-E  ENV_NO_SPRAY_TODAY is CRITICAL (bypasses the daily cap: 125 alerts /
--        14 days); PRO_NDVI_DROP is CRITICAL although the graph's own NDVI
--        gates say VERIFY before acting.                            → 7
--   F-F  Live alerts of rules turned off in 5/6 stay on screen until expiry.
--                                                                  → 8
-- =============================================================================


-- 1) Config keys read by evaluator v128 (code defaults are identical; these
--    rows make them visible and tunable).
INSERT INTO public.proactive_evaluator_config (tenant_id, config_key, config_value)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'decision_rule_legacy_bridge_enabled', 'false'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'derived_max_age_days', '2'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'graph_advice_max_rules', '3'::jsonb)
ON CONFLICT (tenant_id, config_key) DO NOTHING;


-- 2) Graph links: proactive rule → hypotheses (crop-specific ids; the evaluator
--    keeps only the land's crop) and, for the NDVI rules, the NDVI decision-gate
--    rows directly. "required": true = raise the alert only where the graph has
--    applicable advice for the land's crop / stage / DAS / region (a satellite
--    decline at maturity, where no NDVI gate applies, is senescence, not an alert).
UPDATE public.proactive_rules p
SET conditions = jsonb_set(p.conditions, '{metadata,graph}', v.g::jsonb, true),
    updated_at = now()
FROM (VALUES
  ('IRRIGATION_TRIGGER_FAO56',  '{"hypothesis_ids":["HYP_RICE_DROUGHT_001","HYP_MAIZE_DROUGHT_001","HYP_CHILI_DROUGHT_001","HYP_GROUNDNUT_MOISTURE_STRESS_001","HYP_ONION_DROUGHT_001","HYP_POTATO_DROUGHT_001","HYP_SOYBEAN_DROUGHT_001","HYP_TOMATO_DROUGHT_001","SC_DROUGHT_STRESS"],"rule_categories":["irrigation"]}'),
  ('IRRIGATION_DELAY_RAIN',     '{"hypothesis_ids":["HYP_RICE_DROUGHT_001","HYP_MAIZE_DROUGHT_001","HYP_CHILI_DROUGHT_001","HYP_GROUNDNUT_MOISTURE_STRESS_001","HYP_ONION_DROUGHT_001","HYP_POTATO_DROUGHT_001","HYP_SOYBEAN_DROUGHT_001","HYP_TOMATO_DROUGHT_001","SC_DROUGHT_STRESS"],"rule_categories":["irrigation"]}'),
  ('WATERLOGGING_GUARD_HEAVY_RAIN', '{"hypothesis_ids":["HYP_RICE_FLOOD_001","HYP_ONION_WATERLOG_001","HYP_POTATO_WATERLOG_001","HYP_TOMATO_WATERLOG_001","SC_WATERLOGGING","WH_WATERLOGGING_STRESS","HYP_MAIZE_WATERLOG_001","HYP_SOYBEAN_WATERLOG_001","HYP_CHILI_WATERLOG_001","HYP_BRINJAL_WATERLOG_001","HYP_GROUNDNUT_WATERLOGGING_001"]}'),
  ('PRO_WEATHER_HEAVY_RAIN',    '{"hypothesis_ids":["HYP_RICE_FLOOD_001","HYP_ONION_WATERLOG_001","HYP_POTATO_WATERLOG_001","HYP_TOMATO_WATERLOG_001","SC_WATERLOGGING","WH_WATERLOGGING_STRESS","HYP_MAIZE_WATERLOG_001","HYP_SOYBEAN_WATERLOG_001","HYP_CHILI_WATERLOG_001","HYP_BRINJAL_WATERLOG_001","HYP_GROUNDNUT_WATERLOGGING_001"]}'),
  ('FLOWERING_HEAT_RISK',       '{"hypothesis_ids":["HYP_RICE_HEAT_STERILITY_001","HYP_MAIZE_HEAT_001"]}'),
  ('RICE_PROACTIVE_HEAT_FLOWERING_001', '{"hypothesis_ids":["HYP_RICE_HEAT_STERILITY_001"]}'),
  ('WHEAT_TERMINAL_HEAT',       '{"hypothesis_ids":["WH_TERMINAL_HEAT_STRESS"]}'),
  ('PRO_WEATHER_HEATWAVE',      '{"hypothesis_ids":["HYP_RICE_HEAT_STERILITY_001","HYP_MAIZE_HEAT_001","HYP_SOYBEAN_HEAT_001","HYP_CHILI_HEAT_STRESS_001","HYP_BRINJAL_HEAT_STRESS_001","HYP_ONION_HEAT_STRESS_001","HYP_POTATO_HEAT_STRESS_001","HYP_TOMATO_HEAT_001","SC_HEAT_STRESS","WH_TERMINAL_HEAT_STRESS"]}'),
  ('FROST_WARNING',             '{"hypothesis_ids":["HYP_RICE_COLD_STERILITY_001","HYP_MAIZE_FROST_001","HYP_ONION_FROST_001","HYP_POTATO_FROST_001","SC_COLD_STRESS","WH_COLD_FROST_DAMAGE"]}'),
  ('PRO_WEATHER_FROST',         '{"hypothesis_ids":["HYP_RICE_COLD_STERILITY_001","HYP_MAIZE_FROST_001","HYP_ONION_FROST_001","HYP_POTATO_FROST_001","SC_COLD_STRESS","WH_COLD_FROST_DAMAGE"]}'),
  ('PRO_NDVI_DROP',             '{"required":true,"rule_ids":["RICE_NDVI_COLLAPSE_BLOCK_001","RICE_NDVI_DECLINE_VERIFY_001","WHEAT_NDVI_COLLAPSE_BLOCK_001","WHEAT_NDVI_DECLINE_VERIFY_001","WHEAT_DIAG_NDVI_LOW_001","COTTON_NDVI_COLLAPSE_BLOCK_001","COTTON_NDVI_DECLINE_VERIFY_001","MAIZE_DIAG_NDVI_COLLAPSE_001","MAIZE_DIAG_NDVI_LOW_001","MAIZE_GATE_NDVI_AUTHORITY_001","SOYBEAN_DIAG_NDVI_COLLAPSE_001","SOYBEAN_DIAG_NDVI_LOW_001","SOYBEAN_GATE_NDVI_AUTHORITY_001","ONION_DIAG_NDVI_TRIAGE_001","ONION_GATE_DATA_AUTHORITY_001","ONION_GATE_NDVI_AUTHORITY_001","POTATO_DIAG_NDVI_AUTHORITY_001","POTATO_GATE_DATA_AUTHORITY_001","POTATO_GATE_NDVI_AUTHORITY_001","TOMATO_DIAG_NDVI_TRIAGE_001","TOMATO_GATE_DATA_AUTHORITY_001","TOMATO_GATE_NDVI_AUTHORITY_001","CHILI_GATE_NDVI_AUTHORITY_001","CHILI_STRESS_NDVI_COLLAPSE_001","CHILI_STRESS_NDVI_LOW_001","CHILI_DIAG_EXPERT_ESCALATION_001","BRINJAL_DIAG_NDVI_DECISION_001","BRINJAL_GATE_NDVI_AUTHORITY","BRINJAL_GATE_DATA_AUTHORITY","SC_NDVI_DIFFERENTIAL_DIAGNOSIS_001","SC_NDVI_COLLAPSE_PLANT_VERIFY_001","SC_NDVI_COLLAPSE_RATOON_BLOCK_001","SC_DATA_QUALITY_NDVI_001"]}'),
  ('PRO_NDVI_STRESS',           '{"required":true,"rule_ids":["RICE_NDVI_COLLAPSE_BLOCK_001","RICE_NDVI_DECLINE_VERIFY_001","WHEAT_NDVI_COLLAPSE_BLOCK_001","WHEAT_NDVI_DECLINE_VERIFY_001","WHEAT_DIAG_NDVI_LOW_001","COTTON_NDVI_COLLAPSE_BLOCK_001","COTTON_NDVI_DECLINE_VERIFY_001","MAIZE_DIAG_NDVI_COLLAPSE_001","MAIZE_DIAG_NDVI_LOW_001","MAIZE_GATE_NDVI_AUTHORITY_001","SOYBEAN_DIAG_NDVI_COLLAPSE_001","SOYBEAN_DIAG_NDVI_LOW_001","SOYBEAN_GATE_NDVI_AUTHORITY_001","ONION_DIAG_NDVI_TRIAGE_001","ONION_GATE_DATA_AUTHORITY_001","ONION_GATE_NDVI_AUTHORITY_001","POTATO_DIAG_NDVI_AUTHORITY_001","POTATO_GATE_DATA_AUTHORITY_001","POTATO_GATE_NDVI_AUTHORITY_001","TOMATO_DIAG_NDVI_TRIAGE_001","TOMATO_GATE_DATA_AUTHORITY_001","TOMATO_GATE_NDVI_AUTHORITY_001","CHILI_GATE_NDVI_AUTHORITY_001","CHILI_STRESS_NDVI_COLLAPSE_001","CHILI_STRESS_NDVI_LOW_001","CHILI_DIAG_EXPERT_ESCALATION_001","BRINJAL_DIAG_NDVI_DECISION_001","BRINJAL_GATE_NDVI_AUTHORITY","BRINJAL_GATE_DATA_AUTHORITY","SC_NDVI_DIFFERENTIAL_DIAGNOSIS_001","SC_NDVI_COLLAPSE_PLANT_VERIFY_001","SC_NDVI_COLLAPSE_RATOON_BLOCK_001","SC_DATA_QUALITY_NDVI_001"]}'),
  ('DISEASE_EPISODE_ONSET',     '{"required":true,"hypothesis_types":["DISEASE"],"rule_categories":["diagnosis","decision_gate"]}'),
  ('DISEASE_EPISODE_DECLINING', '{"required":true,"hypothesis_types":["DISEASE"],"rule_categories":["diagnosis","decision_gate"]}'),
  ('ONION_PR_DOWNY_MILDEW_RISK','{"hypothesis_ids":["HYP_ONION_DOWNY_MILDEW_001"]}'),
  ('ONION_PR_NECK_ROT_RISK',    '{"hypothesis_ids":["HYP_ONION_NECK_ROT_001"]}'),
  ('ONION_PR_PURPLE_BLOTCH_RISK','{"hypothesis_ids":["HYP_ONION_PURPLE_BLOTCH_001"]}'),
  ('ONION_PR_STEMPHYLIUM_RISK', '{"hypothesis_ids":["HYP_ONION_STEMPHYLIUM_001"]}'),
  ('POTATO_PR_BLACK_SCURF',     '{"hypothesis_ids":["HYP_POTATO_BLACK_SCURF_001"]}'),
  ('POTATO_PR_EB_RISK',         '{"hypothesis_ids":["HYP_POTATO_EARLY_BLIGHT_001"]}'),
  ('TOMATO_PR_EB_RISK',         '{"hypothesis_ids":["HYP_TOMATO_EARLY_BLIGHT_001"]}'),
  ('TOMATO_PR_LB_HUTTON_RISK',  '{"hypothesis_ids":["HYP_TOMATO_LATE_BLIGHT_001"]}'),
  ('TOMATO_PR_SEPTORIA_RISK',   '{"hypothesis_ids":["HYP_TOMATO_SEPTORIA_001"]}'),
  ('PRO_SC_RED_ROT',            '{"hypothesis_ids":["SC_RED_ROT"]}'),
  ('PRO_SC_SMUT',               '{"hypothesis_ids":["SC_SMUT"]}'),
  ('PRO_SC_SHOOT_BORER',        '{"hypothesis_ids":["SC_EARLY_SHOOT_BORER"]}'),
  ('RICE_PROACTIVE_BLAST_001',  '{"hypothesis_ids":["HYP_RICE_LEAF_BLAST_001"]}'),
  ('RICE_PROACTIVE_BLB_RAIN_001','{"hypothesis_ids":["HYP_RICE_BLB_001"]}'),
  ('RICE_PROACTIVE_BPH_BUILDUP_001','{"hypothesis_ids":["HYP_RICE_BPH_001"]}'),
  ('RICE_PROACTIVE_FALSE_SMUT_001','{"hypothesis_ids":["HYP_RICE_FALSE_SMUT_001"]}'),
  ('RICE_PROACTIVE_LODGING_RISK_001','{"hypothesis_ids":["HYP_RICE_LODGING_001"]}'),
  ('RICE_PROACTIVE_NECK_BLAST_001','{"hypothesis_ids":["HYP_RICE_NECK_BLAST_001"]}'),
  ('RICE_PROACTIVE_SHEATH_BLIGHT_001','{"hypothesis_ids":["HYP_RICE_SHEATH_BLIGHT_001"]}'),
  ('WHEAT_PROACTIVE_BROWN_RUST_001','{"hypothesis_ids":["WH_BROWN_RUST"]}'),
  ('WHEAT_PROACTIVE_YELLOW_RUST_001','{"hypothesis_ids":["WH_YELLOW_RUST"]}')
) AS v(code, g)
WHERE p.rule_code = v.code
  AND p.conditions -> 'metadata' ->> 'engine' = 'env-intelligence';


-- 3) Check (read-only): every linked id exists. Expect zero rows.
SELECT p.rule_code, x.id AS missing_id
FROM public.proactive_rules p
CROSS JOIN LATERAL jsonb_array_elements_text(
  coalesce(p.conditions -> 'metadata' -> 'graph' -> 'hypothesis_ids', '[]'::jsonb)) AS x(id)
WHERE NOT EXISTS (SELECT 1 FROM public.hypothesis_master h WHERE h.hypothesis_id = x.id AND h.is_active)
UNION ALL
SELECT p.rule_code, x.id
FROM public.proactive_rules p
CROSS JOIN LATERAL jsonb_array_elements_text(
  coalesce(p.conditions -> 'metadata' -> 'graph' -> 'rule_ids', '[]'::jsonb)) AS x(id)
WHERE NOT EXISTS (SELECT 1 FROM public.decision_rules d WHERE d.rule_id = x.id AND d.is_active);


-- 4) Messages describe what was observed; they no longer give advice (advice
--    is the graph's). Only the English template is rewritten; the Marathi and
--    Hindi copies carried the same advice and are cleared, so the app shows the
--    English text translated into the farmer's language (14 languages).
UPDATE public.proactive_rules p
SET title_en = coalesce(v.title_en, p.title_en),
    message_template_en = v.message_en,
    title_mr = CASE WHEN v.title_en IS NULL THEN p.title_mr END,
    title_hi = CASE WHEN v.title_en IS NULL THEN p.title_hi END,
    message_template_mr = NULL,
    message_template_hi = NULL,
    updated_at = now()
FROM (VALUES
  ('DISEASE_EPISODE_ONSET',     'Disease-favourable weather',         'Leaf wetness and humidity on this field favour crop disease.'),
  ('DISEASE_EPISODE_DECLINING', 'Disease-favourable weather easing',  'The leaf-wetness and humidity conditions that favour disease are easing.'),
  ('ENV_NO_SPRAY_TODAY',        'Unsafe spraying conditions today',   'Wind or rain make spraying unsafe today.'),
  ('FLOWERING_HEAT_RISK',       NULL,                                 'High temperature during flowering can reduce grain or boll set.'),
  ('PRO_WEATHER_HEATWAVE',      'Heat wave',                          'Temperature at this field is above 42 °C.'),
  ('PRO_WEATHER_FROST',         'Frost risk',                         'Temperature at this field is below 4 °C.'),
  ('PRO_WEATHER_HEAVY_RAIN',    'Heavy rain',                         'Very heavy rain is falling on this field.'),
  ('PRO_SC_EARTHING',           'Earthing-up window',                 'The crop is in the earthing-up window.'),
  ('RICE_PROACTIVE_NECK_BLAST_001', 'Neck blast risk window',         'Cool, humid weather at booting/heading favours neck blast. An infected neck loses its whole panicle.')
) AS v(code, title_en, message_en)
WHERE p.rule_code = v.code;


-- 5) Policy: no spray nudge from an unconfirmed, crop-agnostic risk index.
UPDATE public.proactive_rules
SET is_active = false, updated_at = now()
WHERE rule_code = 'ENV_SPRAY_WINDOW_GOOD' AND is_active;


-- 6) Policy: no fertilizer action from an alert (the crop schedule owns
--    fertilizer timing). POTATO_PR_STOP_N_50DAP (a stop/block) stays active.
UPDATE public.proactive_rules
SET is_active = false, updated_at = now()
WHERE rule_code IN ('PRO_SC_TOPDRESS', 'POTATO_PR_N_TOPDRESS') AND is_active;


-- 7) Priorities: a no-spray day is a safety notice, not an emergency; an NDVI
--    decline is a verify-first signal (the graph's NDVI gates say VERIFY / BLOCK).
UPDATE public.proactive_rules SET priority = 'medium', updated_at = now()
WHERE rule_code = 'ENV_NO_SPRAY_TODAY' AND priority = 'critical';
UPDATE public.proactive_rules SET priority = 'high', updated_at = now()
WHERE rule_code = 'PRO_NDVI_DROP' AND priority = 'critical';


-- 8) Live alerts of the rules turned off in 5 and 6 → EXPIRED (not deleted).
UPDATE public.proactive_alerts
SET status = 'EXPIRED', updated_at = now()
WHERE rule_id IN ('ENV_SPRAY_WINDOW_GOOD', 'PRO_SC_TOPDRESS', 'POTATO_PR_N_TOPDRESS')
  AND status IN ('PENDING', 'DELIVERED', 'SEEN');
