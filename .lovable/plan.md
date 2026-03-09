

# Deep Forensic Audit — AI Chat & Symbolic Decision Brain

## Executive Summary

After reading ~15,000 lines of code and querying 20+ database tables, I identified **8 critical bugs**, **5 unused/orphaned tables**, and **3 architectural violations** that affect response quality.

---

## CRITICAL BUG #1: 99 Active Rules Invisible to Hypothesis Evaluator

**Evidence**: 175 rules have empty `observable_characteristics`. Of those, 76 have `conditions_json.observations` (the fallback path works). But **99 rules have NEITHER** — meaning:
- The hypothesis evaluator `continue`s past them (line 751, our recent fix)
- The layered-rule-evaluator also cannot match them via observation matching
- These 99 rules are **effectively dead** — they exist in DB but can never fire

**Affected rules**: `SC_BP_GENERAL_017`, `SC_DISEASE_RATOON_STUNTING_002`, `SC_NDVI_COLLAPSE_RATOON_BLOCK_001`, `SC_SOIL_ALLUVIAL_NITROGEN_001`, `SC_BP_ECONOMICS_001`, `SC_BP_RATOON_*`, etc.

**Impact**: Best-practice, soil-specific, economics, ratoon management, and some disease rules NEVER reach the farmer.

**Fix**: Populate `conditions_json.observations` for these 99 rules based on their `condition_code` and `category`. For example:
- `condition_code: NUTRIENT_MANAGEMENT` → observations: `["NUTRIENT_DEFICIENCY", "YELLOWING"]`
- `condition_code: SAFETY_BLOCK` → these are correctly advisory-only, mark with `is_advisory_only: true`
- `condition_code: IRRIGATION_TRIGGER` → observations: `["WATER_STRESS", "WILTING"]`

---

## CRITICAL BUG #2: `etl_standards` Table (27 rows) — Created But NEVER Queried

**Evidence**: `etl_standards` has 27 Economic Threshold Level entries. The code has an `etl-gate.ts` file that calls `shouldBlockSpray()`, but the function uses hardcoded ETL values from `decision_rules.conditions_json.etl_range` — it **never queries `etl_standards`**.

**Impact**: The ETL gate uses per-rule inline thresholds instead of the centralized `etl_standards` table. If a rule's `conditions_json` lacks an `etl_range`, the ETL check is skipped entirely.

**Fix**: Wire `etl-gate.ts` to query `etl_standards` as the SSOT for ETL thresholds, falling back to per-rule values.

---

## CRITICAL BUG #3: `crop_baseline_guidelines` Table — 0 Rows, Never Used in Chat

**Evidence**: Table exists with 0 rows. Only referenced in `mcp-handler/index.ts` (a different function), not in `ai-agriculture-chat`.

**Impact**: No baseline nutrient/irrigation guidelines available for the decision brain. The system cannot compare farmer's soil data against recommended baselines.

---

## CRITICAL BUG #4: `agro_climatic_zones` Table (20 rows) — Created But NEVER Queried

**Evidence**: No code in `ai-agriculture-chat` queries this table. The weather-safety-gate and spray-window-calculator use hardcoded thresholds.

**Impact**: Region-specific advice (e.g., different pest pressure in Western Maharashtra vs Vidarbha) is impossible. All farmers get identical thresholds.

---

## CRITICAL BUG #5: `normalizeToEnglish()` Still Active with Hardcoded Dictionary

**Location**: `index.ts` lines 1858-1893

**Evidence**: The function is commented out at call site (line 582: `const preprocessedContent = userMessageContent`) but **still exists** and is called elsewhere (line 1467: `preprocessed_content: preprocessedContent`). The preprocessed content is just the raw message — the column `preprocessed_content` in `ai_chat_messages` is now misleadingly named.

**More critically**, the function contains only 23 hardcoded term mappings. It was correctly bypassed, but:
1. The function body remains as dead code
2. The `preprocessed_content` column stores raw user text, not preprocessed text

**Fix**: Remove the function body, or rename the column to `original_content`.

---

## CRITICAL BUG #6: `forceTranslateResponse()` — 70+ Hardcoded Translations

**Location**: `index.ts` lines 1918-2095

**Evidence**: Contains 70+ hardcoded English-to-Marathi/Hindi section header translations. This violates the "no hardcoded translations" architecture.

**Impact**: Only supports `mr` and `hi`. Any other language (Tamil, Telugu, Kannada, Bengali, Gujarati) gets raw English section headers like "DOSAGE FOR YOUR FIELD" because the LLM fallback only triggers when English density exceeds 70%.

**Fix**: Move section header translations to `observation_translations` table with a `section_header` category, or rely entirely on the LLM narration layer.

---

## CRITICAL BUG #7: `condition_code` Distribution Shows Generic Overuse

**Evidence**:
```
STAGE_SPECIFIC:    110 rules
SAFETY_BLOCK:      100 rules
MULTI_STAGE:        66 rules
NUTRIENT_MANAGEMENT: 57 rules
STAGE_GENERAL:      55 rules
ETL_THRESHOLD:      54 rules
WEATHER_TRIGGERED:  43 rules
IRRIGATION_TRIGGER: 41 rules
NDVI_TRIGGERED:      5 rules
DISEASE_DIAGNOSIS:   3 rules
```

Only **3 rules** have a proper `DISEASE_DIAGNOSIS` condition code. The `condition_code` field is NOT being used as an FK to `observation_master` as the architecture mandates. Instead, generic codes like `STAGE_SPECIFIC` and `SAFETY_BLOCK` are used, forcing all matching to happen through expensive JSONB `conditions_json` parsing.

**Impact**: Rule matching is slow (in-memory JSONB filtering of 534 rules) and imprecise. The observation-to-rule mapping relies on fuzzy text matching rather than precise `condition_code` → `observation_master` FK joins.

---

## CRITICAL BUG #8: Crop Coverage Gap — Only Sugarcane Has Rules

**Evidence**:
```
SUGARCANE:  437 rules (82%)
CASH_CROP:   47 rules
COTTON:      27 rules
UNIVERSAL:   15 rules
ALL:          8 rules
```

**Impact**: Any farmer growing Rice, Wheat, Soybean, Maize, Groundnut, or Onion gets ZERO crop-specific rules. The system falls back to `STAGE_ADVISORY_FALLBACK` or generic LLM responses — violating the "Rules Decide, AI Only Explains" principle.

---

## Tables Created But NOT Used in Decision Brain

| Table | Rows | Used By AI Chat? | Issue |
|-------|------|-----------------|-------|
| `etl_standards` | 27 | NO | ETL gate uses hardcoded rule-level values |
| `crop_baseline_guidelines` | 0 | NO (only MCP) | Empty, no integration |
| `agro_climatic_zones` | 20 | NO | Weather gate uses hardcoded thresholds |
| `advisory_audit_log` | 0 | YES (read-only) | Written nowhere in pipeline |
| `ai_training_context` | ? | NO | Created but unused |
| `commodity_master` | ? | NO | Not referenced in chat |

---

## Tables Correctly Used

| Table | Rows | Status |
|-------|------|--------|
| `decision_rules` | 534 active | ✅ Core SSOT |
| `observation_master` | 998 | ✅ Symptom registry |
| `observation_translations` | 2,994 (998×3 langs) | ✅ i18n |
| `observation_aliases` | 114 | ✅ Symptom synonym mapping |
| `master_products` | 82 | ✅ Product lookup |
| `chemical_regulatory_status` | ~30 | ✅ Safety blocking |
| `crop_stage_master` | 59 | ✅ DAS→stage mapping |
| `canonical_group_mapping` | 42 | ✅ Ontology bridge |
| `intent_observation_mapping` | 136 | ✅ Intent→observation |
| `hypothesis_master` | 67 | ✅ Causal reasoning |
| `hypothesis_conditions` | 171 | ✅ Evidence weighting |
| `hypothesis_contradictions` | 49 | ✅ Elimination logic |
| `hypothesis_rule_mapping` | 71 | ✅ Cause→rule bridge |
| `crop_vocabulary` | 10 | ⚠️ Very thin |

---

## Response Generation Pipeline — Verified Flow

```text
Farmer Query (any language/script)
    │
    ├─ index.ts: detectLanguage() → canonicalLanguage
    ├─ index.ts: Pass raw text (normalizeToEnglish DISABLED)
    │
    ▼
orchestrator.ts: orchestrate()
    ├─ Phase 0: Query routing + crop inference
    ├─ Phase 0.5: semantic-extractor.ts → intent_code
    ├─ Phase 1: observation-code-mapper.ts → observation codes
    ├─ Phase 1.5: canonical-state-builder.ts → CanonicalState
    ├─ Phase 2: layered-rule-evaluator.ts → matched rules
    ├─ Phase 2.5: hypothesis-evaluator.ts → candidate hypotheses
    │      ⚠️ BUG: 99 rules skipped (no observable data)
    ├─ Phase 3: unified-decision-gate.ts → TREATMENT/OBSERVATION/CLARIFICATION
    ├─ Phase 4: safety-guardian.ts → PHI/bee/banned checks
    ├─ Phase 5: Returns OrchestratorResponse
    │
    ▼
index.ts: Post-processing
    ├─ Primary Decision Invariant check
    ├─ extractAndAuditActionsWithFilterTrace()
    ├─ Unified Gate evaluation
    ├─ LLM Formatter (llm-response-formatter.ts)
    │      ├─ deterministic-response-builder.ts → structured sections
    │      ├─ LLM narration → farmer language
    │      └─ Output validation gate
    ├─ Language consistency check
    │      ⚠️ BUG: forceTranslateResponse() has 70+ hardcoded strings
    ├─ Narration breach validation
    ├─ Response validation gate
    └─ Save to ai_chat_messages + session update
```

---

## Implementation Plan

### Phase 1: Data Quality (Highest Impact)
1. **Populate `conditions_json.observations` for 99 dead rules** — categorize into advisory-only vs diagnostic, add proper observation arrays
2. **Wire `etl_standards` into `etl-gate.ts`** — query DB instead of hardcoded values
3. **Populate `crop_baseline_guidelines`** with at least sugarcane + cotton baselines

### Phase 2: Code Cleanup
1. **Remove `normalizeToEnglish()` function body** — it's dead code
2. **Migrate `forceTranslateResponse()` hardcoded strings** to DB or remove in favor of full LLM translation
3. **Remove `advisory_audit_log` reads** until write path is implemented

### Phase 3: Coverage Expansion
1. **Add Cotton-specific rules** (27→100+ target)
2. **Add Rice/Wheat/Soybean starter rules** (0→50 each)
3. **Normalize `condition_code` to use `observation_master` codes** for the top 200 rules

### Phase 4: Wire Orphaned Tables
1. **`agro_climatic_zones`** → feed into weather-safety-gate for regional thresholds
2. **`etl_standards`** → replace hardcoded ETL values in rules
3. **`crop_vocabulary`** → expand from 10 to 50+ entries for better intent classification

