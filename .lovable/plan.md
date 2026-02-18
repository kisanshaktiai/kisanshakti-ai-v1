

# Forensic Audit Report: Neuro-Symbolic Decision Brain Graph
## 6-Part Production Hardening Plan

---

## EXECUTIVE SUMMARY

After analyzing 15,000+ lines of edge function code, 512 active rules, 67 observation codes, and the full pipeline from farmer query to response delivery, I identified **12 structural risks** causing wrong agronomic results. The root causes fall into three categories:

1. **Authority hierarchy is defined in DB but completely unenforced in code** (data_authority_rank, mutually_exclusive_with)
2. **Treatment metadata is critically incomplete** (92% missing dosage_per_acre, 86% missing phi_days)
3. **WHAT-WHY-HOW response structure has no programmatic enforcement** -- the LLM can omit sections without detection

---

## PART 1: INTENT and OBSERVATION LAYER

### Findings

**1.1 Intent Mapping Chain** -- The system correctly routes through `intent_observation_mapping_v2` (not legacy v1). The orchestrator loads the intent registry with 15-minute TTL caching and a concurrency lock to prevent duplicate DB calls.

**1.2 Observation Master** -- After the previous migration, `observation_master` now contains 67 canonical codes with 100% EN/HI/MR translation coverage. The 5 previously orphaned codes (LEAF_CHEWING, LEAF_DRYING, ROOTS_ROTTED, SEEDLING_DIED, STUNTED_PLANTS) are now present.

**1.3 REMAINING GAP -- 474 Orphaned Observation Codes in decision_rules**
- `conditions_json.observations` references ~500 unique codes
- Only ~67 exist in `observation_master`
- The validator (`db-observation-validator.ts`) now does case-insensitive UPPER() lookups (fixed), but rules referencing orphaned codes still bypass canonical validation entirely
- The `symbolic-reasoner.ts` does substring matching (`factSymptom.includes(upperObs) || upperObs.includes(factSymptom)`) which is imprecise and causes false positives

**1.4 Observation Confidence Weighting** -- NOT IMPLEMENTED. The `observation_master` table lacks `observation_confidence_weight`, `diagnostic_confidence_threshold`, and `uncertainty_handling_mode` columns. These were recommended in the previous audit but never added.

### Fixes Required

| ID | Fix | Priority |
|----|-----|----------|
| P1-1 | Add top 80 most-referenced orphaned codes to `observation_master` (pest symptoms, disease markers used in 2+ rules) | P0 |
| P1-2 | Add `confidence_weight` (DECIMAL), `diagnostic_threshold` (DECIMAL), `uncertainty_mode` (TEXT) columns to `observation_master` | P1 |
| P1-3 | Tighten substring matching in `symbolic-reasoner.ts` line 661-665 to require exact token match instead of substring containment | P0 |

---

## PART 2: RULE ENGINE STRUCTURAL AUDIT

### Findings

**2.1 data_authority_rank -- Present in DB, ZERO references in code**
- All 512 rules have `data_authority_rank` values (range: 40-100)
- Zero occurrences of `data_authority_rank` anywhere in the edge function codebase
- `layered-rule-evaluator.ts` sorts by `ACTION_TYPE_PRIORITY` only (line 616-624)
- `symbolic-reasoner.ts` sorts by `CATEGORY_PRIORITY` then `priority` (lines 396-404)
- A safety rule (rank=95) and a general advisory (rank=40) compete purely on `priority` number, allowing low-authority rules to override safety

**2.2 mutually_exclusive_with -- Present in DB, ZERO references in code**
- 340/512 rules have `mutually_exclusive_with` populated
- Zero occurrences in codebase
- `graph-control-validator.ts` only enforces `blocks_rule_ids` and `prerequisite_rule_ids`
- This means conflicting treatments (e.g., organic vs chemical for same pest) can BOTH fire simultaneously

**2.3 Deprecated Rule Filtering**
- The DB has `canonical_status` and `deprecated_at` columns
- `symbolic-reasoner.ts` line 528 only filters by `is_active = true`
- Rules with `canonical_status != 'VALID'` or `deprecated_at IS NOT NULL` are NOT excluded

**2.4 blocks_rule_ids and prerequisite_rule_ids**
- 21 rules have `blocks_rule_ids`, 117 rules have `prerequisite_rule_ids`
- `graph-control-validator.ts` properly enforces these in `layered-rule-evaluator.ts` (lines 397-414)
- However, these are ONLY checked in the Prescription phase (RuleCategory.PRESCRIPTION), not across all phases

### Fixes Required

| ID | Fix | Priority |
|----|-----|----------|
| P2-1 | Implement composite sort in `symbolic-reasoner.ts`: `data_authority_rank DESC, priority DESC` instead of `priority DESC` alone | P0 |
| P2-2 | Add `data_authority_rank` to the selection logic in `layered-rule-evaluator.ts` (line 660-661) | P0 |
| P2-3 | Add `mutually_exclusive_with` enforcement to `graph-control-validator.ts` -- if rule A fired and rule B is in A's `mutually_exclusive_with`, block B | P0 |
| P2-4 | Add `canonical_status = 'VALID'` and `deprecated_at IS NULL` filters to rule loading queries in `symbolic-reasoner.ts` line 524-530 | P1 |

---

## PART 3: CONTEXTUAL PARAMETER AUDIT

### Findings

**3.1 Environmental Parameters ARE Collected**
- `authoritative-state-loader.ts` loads NDVI, soil NPK, weather from DB
- `fact-extractor.ts` maps them to SymbolicFact fields (ndvi, temperature, humidity, soil_n/p/k, etc.)

**3.2 Environmental Parameters are RARELY ENFORCED**
- `symbolic-reasoner.ts` evaluates numeric thresholds (lines 771-788) with `evaluateThreshold()`
- BUT: Only 6/512 rules actually use numeric thresholds in `conditions_json`
- 506 rules have NO environmental constraints at all
- A spray recommendation can fire during heavy rain because `conditions_json` simply doesn't include weather checks

**3.3 Weather Safety Gate EXISTS but is PARALLEL, Not Inline**
- `weather-safety-gate.ts` checks rain/wind/temperature thresholds
- Called in orchestrator but result is logged and advisory -- does NOT block rule firing
- The Unified Decision Gate (`unified-decision-gate.ts`) does not check weather safety as a blocking criterion

**3.4 Null Context Matching**
- `symbolic-reasoner.ts` line 606-608: When a fact value is null, the condition returns `matches: false`
- This is correct (fail-closed), preventing null context from matching

### Fixes Required

| ID | Fix | Priority |
|----|-----|----------|
| P3-1 | Wire `weather-safety-gate.ts` result into `unified-decision-gate.ts` as a BLOCKING criterion for spray/treatment actions | P0 |
| P3-2 | Add GLOBAL safety rules to `decision_rules` for: rain > 80% probability blocks spray, wind > 15 kmph blocks spray, temperature > 42C blocks field work | P1 |
| P3-3 | Populate `conditions_json` numeric thresholds for top 50 treatment rules (NDVI, soil, weather constraints) | P2 |

---

## PART 4: WHAT-WHY-HOW RESPONSE ENFORCEMENT

### Findings

**4.1 Data Completeness for Treatment Rules (359 rules)**
- `action_text`: 359/359 (100%) -- COMPLETE
- `scientific_basis`: 315/359 (88%) -- 44 missing
- `reason_text`: 287/359 (80%) -- 72 missing
- `knowledge_text`: 270/359 (75%) -- 89 missing
- `dosage_per_acre`: 29/359 (8%) -- 330 MISSING (92%)
- `phi_days`: 74/359 (21%) -- 285 MISSING (79%)

**4.2 LLM Prompt Structure**
- The system prompt (line 863) instructs: `OUTPUT: 1.Greeting 2.What to do 3.When 4.How much 5.What to avoid + closing`
- This is NOT the WHAT-WHY-HOW paradigm
- The user prompt (line 1089-1098) passes ACTION/REASON/KNOWLEDGE as reference texts but labels them differently

**4.3 Post-LLM Validation**
- `validateLLMOutput()` checks for: unauthorized products, dosage consistency, rule ID leakage, PHI preservation, and unit magnitude errors
- It does NOT validate WHAT-WHY-HOW section presence
- A response missing the WHY section entirely would pass validation

### Fixes Required

| ID | Fix | Priority |
|----|-----|----------|
| P4-1 | Add WHAT-WHY-HOW structural validator in `llm-response-formatter.ts` after line 466 -- check that output contains markers for all 3 sections | P0 |
| P4-2 | Update system prompt (line 848-871) to explicitly require WHAT/WHY/HOW sections with section headers | P1 |
| P4-3 | Populate `dosage_per_acre` for top 100 treatment rules from ICAR/SAU sources | P0 |
| P4-4 | Populate `phi_days` for all chemical treatment rules (mandatory for food safety) | P0 |
| P4-5 | Populate `reason_text` and `knowledge_text` for the 72/89 rules currently missing them | P1 |

---

## PART 5: LLM CONTAINMENT

### Findings

**5.1 Input Validation Gate** -- STRONG
- Line 292-313: If `decision_brain_source` is not true, LLM is blocked from treatment recommendations
- Line 262-288: Primary decision contract validation blocks rendering if `rule_id` or `action_type` is missing

**5.2 Output Validation Gate** -- PARTIALLY STRONG
- Product presence check (entity-based, not substring)
- Dosage number consistency check
- Dosage UNIT magnitude check (catches ml vs L swaps)
- Secondary product/dosage validation
- Rule ID leakage detection
- Unauthorized chemical detection
- PHI days preservation check

**5.3 Missing Containment**
- NO crop name consistency check (the memory says `validateNarrationOutput` exists, but it's not in the validation flow in `llm-response-formatter.ts`)
- NO rule trace presence check in final output
- NO formal WHAT-WHY-HOW format validator (as noted in Part 4)
- The LLM prompt does NOT include the `rule_id` or `data_authority_rank` -- correct per design (prevents leakage)

**5.4 Structured Input to LLM** -- The `buildRecommendationSummary()` function (line 1029) correctly passes:
- ACTION (action_text), REASON (reason_text), KNOWLEDGE (knowledge_text)
- Product details, dosage, PHI from `application_details`
- But NOT `data_authority_rank` or `scientific_basis` directly

### Fixes Required

| ID | Fix | Priority |
|----|-----|----------|
| P5-1 | Add crop name consistency check: verify LLM output mentions ONLY the authoritative crop name from `land_context.current_crop` | P1 |
| P5-2 | Embed `rule_id` in response metadata (JSON, not in farmer-facing text) for auditability | P1 |
| P5-3 | Add `scientific_basis` to the LLM prompt's KNOWLEDGE section when available | P2 |

---

## PART 6: RESPONSE PIPELINE

### Findings

**6.1 Current Pipeline**
1. Orchestrator runs NLU (semantic extraction) + rule engine
2. `index.ts` builds `UnifiedGateInput` and evaluates unified gate
3. If gate passes, `formatRecommendationsWithLLM()` is called
4. LLM output is validated by `validateLLMOutput()`
5. If validation fails, template fallback `buildFormattedRecommendationsList()` is used

**6.2 Deterministic Return Path** -- IMPLEMENTED
- Response invariant guard (`response-invariant-guard.ts`) ensures a response is always returned
- Suppression guard prevents valid recommendations from being silently dropped

**6.3 Missing: match_explanation_template**
- The `decision_rules` table has a `decision_trace_template` column
- It IS passed through to the LLM formatter (line 1054, `appDetails.decision_trace_template`)
- But it's not used to build a deterministic explanation before LLM formatting

### Fixes Required

| ID | Fix | Priority |
|----|-----|----------|
| P6-1 | Build deterministic response object BEFORE LLM call: `{ what: cause + category, why: reason_text + scientific_basis, how: action_text + dosage }` | P1 |
| P6-2 | If LLM fails or times out, render this deterministic object directly (structured template, not plain text) | P1 |
| P6-3 | Validate final output has all 3 sections before returning to farmer | P0 |

---

## IMPLEMENTATION PRIORITY ORDER

### Phase A: Critical Accuracy Fixes (Causes Wrong Results Now)

1. **P2-1 + P2-2**: Enforce `data_authority_rank` in rule selection (both evaluators)
2. **P2-3**: Enforce `mutually_exclusive_with` in graph-control-validator
3. **P1-3**: Tighten observation substring matching to prevent false positives
4. **P3-1**: Wire weather-safety-gate as BLOCKING in unified-decision-gate
5. **P4-1 + P6-3**: Add WHAT-WHY-HOW structural validator

### Phase B: Data Completeness (Causes Incomplete Results)

6. **P4-3**: Populate `dosage_per_acre` for top 100 treatment rules
7. **P4-4**: Populate `phi_days` for all chemical treatment rules
8. **P1-1**: Add top 80 orphaned observation codes to `observation_master`
9. **P4-5**: Populate missing `reason_text` and `knowledge_text`

### Phase C: Hardening (Prevents Future Issues)

10. **P2-4**: Filter deprecated rules from loading
11. **P5-1**: Crop name consistency check in LLM validation
12. **P5-2**: Embed rule_id in response metadata
13. **P1-2**: Add confidence/threshold columns to observation_master
14. **P3-2 + P3-3**: Add global safety rules and environmental thresholds

---

## FILES TO MODIFY

| File | Changes |
|------|---------|
| `agents/layered-rule-evaluator.ts` | Add `data_authority_rank` to sort logic (line 660), add mutex enforcement |
| `decision/symbolic-reasoner.ts` | Add `data_authority_rank` sort (line 396-404), filter deprecated rules (line 524-530), tighten observation matching (line 661-665) |
| `decision/graph-control-validator.ts` | Add `mutually_exclusive_with` enforcement function |
| `decision/unified-decision-gate.ts` | Add weather-safety-gate as blocking criterion |
| `agents/llm-response-formatter.ts` | Add WHAT-WHY-HOW validator, update system prompt, add crop name check |
| `decision_rules` table | Populate dosage_per_acre, phi_days for treatment rules |
| `observation_master` table | Add top 80 orphaned codes, add confidence columns |

---

## DETERMINISTIC ENFORCEMENT CHECKLIST

- [ ] `data_authority_rank` enforced in both evaluators
- [ ] `mutually_exclusive_with` blocks conflicting rules
- [ ] `blocks_rule_ids` / `prerequisite_rule_ids` enforced (already done)
- [ ] Deprecated rules excluded from loading
- [ ] Weather safety blocks spray during unsafe conditions
- [ ] Observation matching uses exact token match, not substring
- [ ] WHAT-WHY-HOW sections validated in every response
- [ ] Crop name consistency validated post-LLM
- [ ] Dosage unit magnitude validated post-LLM (already done)
- [ ] PHI days preserved in output (already done)
- [ ] Rule ID embedded in metadata (not farmer text)
- [ ] LLM cannot add products not in symbolic output (already done)

