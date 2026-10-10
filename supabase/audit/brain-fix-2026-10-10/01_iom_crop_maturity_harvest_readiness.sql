-- ════════════════════════════════════════════════════════════════════════
-- 01_iom_crop_maturity_harvest_readiness.sql  (2026-10-10)
-- Repo: kisanshakti-ai-v1 (farmer app) · Supabase project qfklkkzxemsbeniyugiz
--
-- WHY
--   Live turns trace_muyyy4bq_0vkkvo, trace_muz0kect_dzk2ph, trace_muz7hgce_dlfwgf
--   ("भात कापणीला किती दिवस बाकी? पीक तयार आहे का?" — how many days to harvest,
--   is the crop ready) were classified CROP_MATURITY_QUERY (HARVEST, DIRECT) but
--   answered "I did not understand your question". ai_decision_log shows
--   winner=NEEDS_MORE_EVIDENCE / GRAPH_NEEDS_MORE_EVIDENCE:NO_RULE_MATCH.
--   The servable rule that answers it — RICE_HARVEST_TIMING_MH_DRAFT_001
--   (IN-MH, expert_approved, condition_code optimal_maturity, stages
--   grain_filling/maturity) — is mapped in intent_observation_mapping only to
--   HARVEST_TIMING and POST_HARVEST_HANDLING, so the Lane-B intent-relevance
--   filter (context-rule-selector.ts filterScheduleCandidatesByIntent) drops it
--   for CROP_MATURITY_QUERY. The same question in romanized Marathi was
--   classified HARVEST_TIMING and was answered with that rule (trace_muz9oyfc_7xj4cc).
--
-- WHAT
--   "Is my crop ready / how many days to harvest" is the crop-maturity question;
--   harvest readiness is its agronomic answer for every crop. This copies the two
--   existing crop-agnostic HARVEST_TIMING mappings (crop_code 'all') —
--   optimal_maturity and delayed_maturity — onto CROP_MATURITY_QUERY, identical in
--   every other column. No rule, observation or other intent is touched.
--   Idempotent (ON CONFLICT DO NOTHING on the table's unique key).
--
-- TESTED
--   Executed on the live database inside BEGIN … ROLLBACK on 2026-10-10:
--   2 rows inserted, all constraints and the iom_validate_semantic_class
--   trigger passed; rollback verified (count back to 0). Nothing persisted.
--
-- RUN ORDER: statement 1, then statement 2 (read-only verify).
-- ════════════════════════════════════════════════════════════════════════

-- 1) add the two mappings
INSERT INTO intent_observation_mapping
  (intent_code, crop_code, growth_stage, das_min, das_max, observation_code,
   confidence_rank, is_active, assertion_strength, cultivation_method)
SELECT 'CROP_MATURITY_QUERY', m.crop_code, m.growth_stage, m.das_min, m.das_max, m.observation_code,
       m.confidence_rank, true, m.assertion_strength, m.cultivation_method
FROM intent_observation_mapping m
WHERE m.intent_code = 'HARVEST_TIMING'
  AND m.crop_code = 'all'
  AND m.is_active
  AND m.observation_code IN ('optimal_maturity', 'delayed_maturity')
ON CONFLICT (intent_code, crop_code, growth_stage, observation_code) DO NOTHING;

-- 2) verify — expect exactly 2 rows: delayed_maturity, optimal_maturity
SELECT intent_code, crop_code, growth_stage, observation_code, assertion_strength, is_active
FROM intent_observation_mapping
WHERE intent_code = 'CROP_MATURITY_QUERY'
  AND observation_code IN ('optimal_maturity', 'delayed_maturity')
ORDER BY observation_code;
