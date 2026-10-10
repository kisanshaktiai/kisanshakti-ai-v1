-- ============================================================================
-- farmer-app repo: kisanshaktiai/kisanshakti-ai-v1  (branch kisanshakti-ai-update)
-- Supabase project: qfklkkzxemsbeniyugiz (kisanshaktiai)
--
-- Package 1 — Decision Brain contract data: intent clarification_mode + BPH stage window
--
-- STATUS: REVIEW / SIGN-OFF ONLY. Do NOT auto-apply. Apply only after the
--         agronomist (you) has approved every line below.
--
-- WHY THIS EXISTS
--   The routing redesign ("one intent-driven arbiter") reads
--   observation_intent_master.clarification_mode as the single source of truth
--   for how much evidence to gather before the symbolic brain runs. For that to
--   work, every intent must carry the mode its agronomy actually needs. Today 10
--   active intents still sit on the table default 'AUTO' (a mode the current code
--   does not resolve), so the arbiter has an incomplete contract. This migration
--   sets each of them to the mode its own description and its category-siblings
--   already imply. UNKNOWN_OBSERVATION is deliberately LEFT on AUTO.
--
--   It also closes a real agronomic gap: three curative BPH knockdown rules do
--   not list the 'heading' stage (two also omit 'flowering') even though the BPH
--   decision-gate and proactive rules both cover the full tillering..grain_filling
--   window. A farmer at heading with hopper burn can match the gate but not the
--   treatment. We align the curative rules to that same window.
--
-- PROPERTIES
--   * UPDATE-only. No INSERT, no DELETE, no DDL. No data is removed.
--   * Idempotent: each UPDATE is guarded so re-running changes nothing further.
--   * No session state between statements (safe for the stateless SQL runner).
--   * No person's name is written anywhere.
--
-- EVIDENCE: every value below was read live from this project on 2026-10-06
--   (observation_intent_master, decision_rules). The rationale for each line is
--   in the comment above it and in README.md (sibling-mode table).
--
-- HARVEST NOTE (no change here, on purpose)
--   The earlier "harvest correction" does NOT survive the live data: rice already
--   has many valid 'stage_general' harvest-timing rules on maturity/harvest stage.
--   The harvest photo-request bug was a routing/mode defect (CROP_MATURITY_QUERY
--   forced into the diagnostic lane), already addressed by that intent being DIRECT
--   plus the arbiter — not by any missing or wrong harvest rule. No harvest row is
--   touched below.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. BEFORE snapshot (read-only). Run first to capture current state.
-- ----------------------------------------------------------------------------
SELECT intent_code, intent_category, clarification_mode, routing_target, is_biological
FROM observation_intent_master
WHERE is_active IS TRUE AND clarification_mode = 'AUTO'
ORDER BY intent_category, intent_code;

SELECT rule_id, stage_applicable
FROM decision_rules
WHERE rule_id IN (
  'RICE_PEST_BPH_001',
  'RICE_PEST_BPH_DINOTEFURAN_001',
  'RICE_PEST_BPH_TRIFLUMEZOPYRIM_001'
)
ORDER BY rule_id;


-- ============================================================================
-- SECTION A — observation_intent_master.clarification_mode
-- 10 intents currently on AUTO -> their agronomically correct mode.
-- (UNKNOWN_OBSERVATION is intentionally omitted; it stays AUTO by design.)
-- ============================================================================

-- A1. DIRECT — advisory, no symptom needed to answer.
--     Siblings already DIRECT: HARVEST/CROP_MATURITY_QUERY, HARVEST/HARVEST_TIMING.
UPDATE observation_intent_master
SET clarification_mode = 'DIRECT', updated_at = now()
WHERE intent_code = 'COTTON_HARVEST_TIMING_QUERY' AND clarification_mode = 'AUTO';

-- A2. DIRECT — fertilizer schedule advice (basal / N-splits / foliar).
--     Siblings already DIRECT: MANAGEMENT/BEST_PRACTICE_GENERAL, NUTRIENT/FERTILIZER_SCHEDULE.
UPDATE observation_intent_master
SET clarification_mode = 'DIRECT', updated_at = now()
WHERE intent_code = 'COTTON_FERTILIZER_PLAN_QUERY' AND clarification_mode = 'AUTO';

-- A3. DIRECT — irrigation timing/amount advice.
--     Sibling already DIRECT: WATER/IRRIGATION_QUERY.
UPDATE observation_intent_master
SET clarification_mode = 'DIRECT', updated_at = now()
WHERE intent_code = 'COTTON_IRRIGATION_QUERY' AND clarification_mode = 'AUTO';

-- A4. DIFFERENTIAL — description: "Fusarium / Verticillium / water stress / root rot.
--     Differential dx required." Several competing causes, confirm before concluding.
--     Siblings using DIFFERENTIAL: ESTABLISHMENT/*, GROWTH/POOR_TILLERING.
UPDATE observation_intent_master
SET clarification_mode = 'DIFFERENTIAL', updated_at = now()
WHERE intent_code = 'COTTON_WILT_QUERY' AND clarification_mode = 'AUTO';

-- A5. DIFFERENTIAL — description: "discriminates between CLCuV / jassid / thrips /
--     water stress / pesticide phytotoxicity" (max_clarification_rounds already 3).
UPDATE observation_intent_master
SET clarification_mode = 'DIFFERENTIAL', updated_at = now()
WHERE intent_code = 'COTTON_LEAF_CURL_QUERY' AND clarification_mode = 'AUTO';

-- A6. DIFFERENTIAL — description: "N / Mg / Fe / Zn / K deficiency identification"
--     (which-nutrient differential).
--     ALT for sign-off: SYMPTOM_DRIVEN, to match NUTRIENT/NUTRIENT_STRESS_SIGNAL.
UPDATE observation_intent_master
SET clarification_mode = 'DIFFERENTIAL', updated_at = now()
WHERE intent_code = 'COTTON_NUTRIENT_DEFICIENCY_QUERY' AND clarification_mode = 'AUTO';

-- A7. SYMPTOM_DRIVEN — back-compat alias of PEST_PRESENCE_VISIBLE (already SYMPTOM_DRIVEN).
UPDATE observation_intent_master
SET clarification_mode = 'SYMPTOM_DRIVEN', updated_at = now()
WHERE intent_code = 'PEST_DAMAGE_REPORT' AND clarification_mode = 'AUTO';

-- A8. SYMPTOM_DRIVEN — boll damage symptom routes to a pest/disease pathway.
--     Category PEST: all 10 sibling PEST intents are SYMPTOM_DRIVEN.
--     ALT for sign-off: DIFFERENTIAL (desc lists bollworm / boll rot / drop).
UPDATE observation_intent_master
SET clarification_mode = 'SYMPTOM_DRIVEN', updated_at = now()
WHERE intent_code = 'COTTON_BOLL_DAMAGE_QUERY' AND clarification_mode = 'AUTO';

-- A9. SYMPTOM_DRIVEN — defoliation symptom routes to a pest/chemical-injury pathway.
--     Category PEST sibling convention. ALT for sign-off: DIFFERENTIAL.
UPDATE observation_intent_master
SET clarification_mode = 'SYMPTOM_DRIVEN', updated_at = now()
WHERE intent_code = 'COTTON_DEFOLIATION_QUERY' AND clarification_mode = 'AUTO';

-- A10. SYMPTOM_DRIVEN — square/boll drop symptom.
--      Siblings PHYSIOLOGY (FRUIT_DROP, COTTON_PHYSIOLOGICAL_DISORDER) are SYMPTOM_DRIVEN.
UPDATE observation_intent_master
SET clarification_mode = 'SYMPTOM_DRIVEN', updated_at = now()
WHERE intent_code = 'COTTON_SQUARE_BOLL_DROP_QUERY' AND clarification_mode = 'AUTO';


-- ============================================================================
-- SECTION B — decision_rules BPH curative stage window
-- Align the three curative knockdown rules to the full susceptible window the
-- BPH decision-gate and proactive rules already use:
--   tillering, panicle_initiation, booting, heading, flowering, grain_filling
-- (Reference rules that already span it: PROACTIVE_PEST_RISK_BPH_001,
--  RICE_GATE_BPH_RESURGENCE_001.)
-- Preventive/nymph-IGR rules (RICE_PEST_BPH_PREVENT_001,
-- RICE_PEST_HOPPER_BUPROFEZIN_DRAFT_002) are LEFT unchanged — their early-stage
-- limitation is intentional.
-- ============================================================================

-- B1. RICE_PEST_BPH_001 — currently missing 'heading'.
UPDATE decision_rules
SET stage_applicable = ARRAY['tillering','panicle_initiation','booting','heading','flowering','grain_filling'],
    updated_at = now()
WHERE rule_id = 'RICE_PEST_BPH_001'
  AND NOT ('heading' = ANY(stage_applicable));

-- B2. RICE_PEST_BPH_DINOTEFURAN_001 — currently missing 'heading' and 'flowering'.
UPDATE decision_rules
SET stage_applicable = ARRAY['tillering','panicle_initiation','booting','heading','flowering','grain_filling'],
    updated_at = now()
WHERE rule_id = 'RICE_PEST_BPH_DINOTEFURAN_001'
  AND NOT ('heading' = ANY(stage_applicable) AND 'flowering' = ANY(stage_applicable));

-- B3. RICE_PEST_BPH_TRIFLUMEZOPYRIM_001 — currently missing 'heading' and 'flowering'.
UPDATE decision_rules
SET stage_applicable = ARRAY['tillering','panicle_initiation','booting','heading','flowering','grain_filling'],
    updated_at = now()
WHERE rule_id = 'RICE_PEST_BPH_TRIFLUMEZOPYRIM_001'
  AND NOT ('heading' = ANY(stage_applicable) AND 'flowering' = ANY(stage_applicable));


-- ----------------------------------------------------------------------------
-- 9. AFTER verification (read-only). Expect: Section A rows gone from AUTO
--    (except none here), and the three BPH rules carrying the full window.
-- ----------------------------------------------------------------------------
SELECT intent_code, intent_category, clarification_mode
FROM observation_intent_master
WHERE intent_code IN (
  'COTTON_HARVEST_TIMING_QUERY','COTTON_FERTILIZER_PLAN_QUERY','COTTON_IRRIGATION_QUERY',
  'COTTON_WILT_QUERY','COTTON_LEAF_CURL_QUERY','COTTON_NUTRIENT_DEFICIENCY_QUERY',
  'PEST_DAMAGE_REPORT','COTTON_BOLL_DAMAGE_QUERY','COTTON_DEFOLIATION_QUERY',
  'COTTON_SQUARE_BOLL_DROP_QUERY','UNKNOWN_OBSERVATION'
)
ORDER BY intent_category, intent_code;

SELECT rule_id, stage_applicable
FROM decision_rules
WHERE rule_id IN (
  'RICE_PEST_BPH_001','RICE_PEST_BPH_DINOTEFURAN_001','RICE_PEST_BPH_TRIFLUMEZOPYRIM_001'
)
ORDER BY rule_id;

-- Should still be AUTO (intentionally unchanged): UNKNOWN_OBSERVATION.
-- ============================================================================
-- END Package 1 contract data
-- ============================================================================
