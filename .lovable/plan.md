
# Forensic Audit: Critical Bug - Same Clarification for All Queries

## Root Cause Analysis (3 Critical Bugs Found)

### Bug 1: DIRECT-mode intents forced through symptom clarification (P0)

The `observation_intent_master` table defines `clarification_mode: 'DIRECT'` for intents like:
- `FERTILIZER_SCHEDULE` ("What fertilizer to give sugarcane now?")
- `IRRIGATION_QUERY` ("When to water?")
- `HARVEST_TIMING` ("When to harvest?")
- `GENERAL_CROP_INFO` ("How to manage sugarcane?")
- `SOIL_TESTING_QUERY`
- `SEED_SELECTION`

**The Problem:** The orchestrator reads `intentMetaFromDB.clarification_mode` (line 2317-2336) but **NEVER uses it to bypass the understanding checker**. Every query, regardless of intent type, flows through `checkUnderstandingCompleteness()` (line 2736) which always demands `raw_symptom_text`, `affected_part`, `severity_words`, and `time_reference`.

For "What fertilizer to give sugarcane now?", the farmer provides ZERO symptoms (because it's not a symptom query), so the understanding checker returns `clarification_required: true` with score below 70%. The system then shows the SAME 3 generic symptom options: "Color change", "Holes visible", "Drying/wilting".

**Location:** `orchestrator.ts` lines 2729-2749, 3360

### Bug 2: Non-symptom intents routed into DIAGNOSIS path (P0)

The `agriculturalProblemIntents` list (line 2941-2964) includes `FERTILIZER_SCHEDULE`, `IRRIGATION_QUERY`, `HARVEST_TIMING`, and `GENERAL_CROP_INFO`. This means fertilizer schedule queries get injected with a fake `NUTRIENT_QUERY` symptom (line 2989), triggering crop damage detection and diagnosis-first hypothesis evaluation -- completely wrong for "when to give fertilizer."

**Location:** `orchestrator.ts` lines 2941-2999

### Bug 3: renderClarificationAsync always returns same 3 options (P1)

The template-based renderer in `clarification-renderer.ts` has a fixed set of `REFINE_OBSERVATION` templates. When the dynamic clarification generator (deprecated stub) returns empty and falls back to templates, the templates always show the same 3 symptom-observation options regardless of the farmer's actual question.

**Location:** `clarification-renderer.ts` templates, `clarification-generator.ts` fallback path

---

## Fix Plan

### Fix 1: DIRECT-mode Intent Bypass (in orchestrator.ts)

After loading `intentMetaFromDB` (line 2336) and BEFORE the understanding checker (line 2729), add a check:

```
If intentMetaFromDB.clarification_mode === 'DIRECT'
  AND landContext has crop + stage
THEN:
  - Set understandingResult.clarification_required = false
  - Set bypassClarification = true
  - Log: "[DIRECT_MODE] Intent {code} has clarification_mode=DIRECT, skipping symptom clarification"
  - Let the query flow directly to the symbolic rule engine
```

This means fertilizer/irrigation/harvest queries with known crop context skip the "What symptoms do you see?" flow and go straight to the rule engine which has rules for these intents.

### Fix 2: Separate symptom-based intents from advisory intents (in orchestrator.ts)

Split the `agriculturalProblemIntents` array (line 2941) into two lists:

**Symptom-based intents** (need diagnosis):
- `PEST_PRESENCE_VISIBLE`, `DISEASE_LIKE_PATTERN`, `WILTING_OR_DROOPING`, `COLOR_CHANGE`
- `LEAF_DAMAGE_VISIBLE`, `LEAF_MARKS_OR_SPOTS`, `STEM_DAMAGE`, `ROOT_OR_BASE_PROBLEM`
- `GROWTH_ANOMALY`, `WATER_STRESS_SIGNAL`, `NUTRIENT_STRESS_SIGNAL`
- `EMERGENCE_FAILURE`, `UNEVEN_FIELD_PATTERN`, `YIELD_OR_OUTPUT_ISSUE`, `WEED_PROBLEM`

**Advisory intents** (need rule engine directly, NOT diagnosis):
- `FERTILIZER_SCHEDULE`, `IRRIGATION_QUERY`, `HARVEST_TIMING`, `GENERAL_CROP_INFO`

Only symptom-based intents get the fallback symptom injection. Advisory intents skip diagnosis mode entirely and go to the rule engine directly with the intent code as context.

### Fix 3: Intent-aware rule engine query path (in orchestrator.ts)

After the clarification gate at line 3580, when `bypassClarification = true` due to DIRECT mode intent, ensure the rule engine evaluator receives the intent code (e.g., `FERTILIZER_SCHEDULE`) as context so it can query `decision_rules` for fertilizer-schedule rules for the specific crop and stage.

This means adding the intent code to the `SymbolicFact` or passing it to the layered rule evaluator so it can filter rules by `action_type` matching the intent (e.g., `fertilizer_schedule` action_type rules for Sugarcane at TILLERING stage).

---

## Files Modified

| File | Change |
|------|--------|
| `orchestrator.ts` | Add DIRECT-mode bypass before understanding checker; split intent lists; pass intent to rule engine |

## What Does NOT Change

- Decision rules table schema
- Symbolic reasoner evaluation logic
- Understanding completeness checker logic (it still works correctly for symptom queries)
- Clarification renderer templates
- LLM narration layer
- Authority hierarchy
- Observation ontology

## Expected Result After Fix

| Query | Before (Bug) | After (Fixed) |
|-------|-------------|---------------|
| "उसाला सध्या काय खत द्यावे" (What fertilizer for sugarcane now?) | Shows: "Color change / Holes / Drying" clarification | Goes directly to rule engine, returns fertilizer schedule for Sugarcane at TILLERING stage |
| "ऊसाला पाणी कधी द्यावे" (When to water sugarcane?) | Shows: same 3 symptom options | Goes directly to irrigation rules for Sugarcane |
| "कापूस कधी काढावा" (When to harvest cotton?) | Shows: same 3 symptom options | Goes directly to harvest timing rules |
| "कापसावर किड दिसतेय" (I see pest on cotton) | Shows symptom clarification options | Still shows symptom clarification (correct behavior) |

## Technical Detail

| Item | Detail |
|------|--------|
| Primary file | `orchestrator.ts` |
| Bug location | Lines 2729-2749 (understanding checker forces symptoms for ALL intents) |
| Root cause | `clarification_mode: 'DIRECT'` from DB is loaded but never acted upon |
| Fix type | Conditional bypass based on DB-defined intent metadata |
| Risk | Low - only affects intents explicitly marked as DIRECT in database |
