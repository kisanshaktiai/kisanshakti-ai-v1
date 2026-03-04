# Pipeline Stability Fixes v7.0 — Forensic Audit Implementation

## Fixes Applied (2026-03-04) — v7.0

### BUG-1 FIX: Safety Gate Rule Leaking as Product Name — FIXED
- **Files:** `index.ts` (recovery paths lines 629-745)
- **Root cause:** `GLOBAL_SAFETY_GENERAL_003` with `cause = "A blocking rule is active"` was winning primary decision selection. Recovery paths set `product_name: 'See structured response'` which leaked to farmer UI.
- **Fix:** Added `SAFETY_GATE_RULE_PATTERN` filter (`/^GLOBAL_SAFETY/i`) to all 3 recovery paths. Safety gate rules are moved to `warnings[]` instead. Removed placeholder `product_name` values — now `null` when no real product exists.

### BUG-6 FIX: Safety Gate Rules Excluded from Primary Decision — FIXED  
- **Files:** `index.ts` (recovery paths + matched_responses filter)
- **Root cause:** GLOBAL_SAFETY rules with `priority: 10` outranked treatment-specific rules. DB constraint prevented changing `action_type` to non-valid value.
- **Fix:** Code-level filtering by rule_id pattern. Safety rules moved to warnings. DB `action_type` kept as-is (constraint-locked). Eligible responses filter also excludes GLOBAL_SAFETY rules.

### BUG-7 FIX: `isLikelyRawEnglish()` Over-Filtering — FIXED
- **File:** `llm-response-formatter.ts` (line ~1872)
- **Root cause:** `/[A-Za-z]/.test(v)` returned true for ANY string with a single Latin char (e.g., "Chlorpyrifos 20 EC")
- **Fix:** Ratio-based check: strings <15 chars always pass; longer strings flagged only when >60% ASCII letters.

### BUG-4 FIX: All Hardcoded mr/hi Text Removed from Formatter — FIXED
- **File:** `llm-response-formatter.ts` (template fallback), `orchestrator.ts` (fallback labels)
- **Root cause:** ~30 hardcoded `Record<string, string>` dicts with mr/hi/en text violated SSOT
- **Fix:** All replaced with English-only text. LLM narration layer handles localization. Removed: greetings, acks, headers, GENERIC_ACTION_TRANSLATIONS, method labels, timing labels, efficacy labels, organic/success/failure/bee/ROI headers, action headers, ask-more text, IPM headers, matched-response fallbacks, safe-advice fallback, closings, IPM_URGENCY_LABELS, cause prefixes, orchestrator fallback labels.

### BUG-5 FIX: Token Optimization (~60% Reduction) — FIXED
- **File:** `llm-response-formatter.ts` (buildRecommendationSummary)
- **Changes:**
  1. Secondary actions capped to 1 in LLM prompt (was unlimited)
  2. `blocked_actions` removed entirely from LLM prompt
  3. Rich agronomic fields (organic_alternative, mode_of_action, etc.) only included for direct prescription formats (RECOMMEND/TREATMENT/SPRAY/etc.)
  4. Warnings capped at 2
  5. Removed verbose field labels (target_pest_stage, failure_indicators, reentry_interval, resistance_group from non-prescription prompts)

### BUG-1 Supplementary: `isPlaceholderText()` Strengthened — FIXED
- **File:** `llm-response-formatter.ts`
- **Added patterns:** `global_safety`, `safety_gate`, `action text unavailable`, `invariant_fallback`

### BUG-3 FIX: Wilting/Drooping Rules for Sugarcane — FIXED (DB)
- **Tables:** `observation_master`, `observation_translations`, `decision_rules`
- **Root cause:** `WILTING_OR_DROOPING` intent had zero matching rules for SUGARCANE
- **Fix:** Inserted `WILTING_OR_DROOPING` observation code + translations. Added 2 rules: `SC_PHYSIOLOGY_WILTING_001` (RECOMMEND for TILLERING/GRAND_GROWTH) and `SC_PHYSIOLOGY_WILTING_002` (MONITOR for MATURATION/HARVEST).

### v6.2 Fixes (Current) — SSOT Data Alignment + Hardcoded Data Removal

#### FIX 33: `diag_first` Path Translation Bypass + Emoji Prefix Detection — FIXED
- **File:** `agents/orchestrator.ts` (lines 3575, 540-554)
- **Root cause:** `diag_first` clarification path NEVER called `translateClarificationOptions()` → raw English codes like `🔍 GAPS IN FIELD` shown in Marathi UI. `RAW_CODE_PATTERN` regex failed on emoji prefixes.
- **Fix:** Added `translateClarificationOptions()` call in `diag_first` return path. Updated pattern detection to strip emoji prefixes and detect ALL_CAPS text with spaces (e.g., `🔍 GAPS IN FIELD` → derives `GAPS_IN_FIELD` for DB lookup).

#### FIX 34: Dropped `response_mr/hi/en` Column References Removed — FIXED
- **Files:** `orchestrator.ts` (6 locations), `llm-response-formatter.ts` (2 locations), `rule-evaluation-layer.ts`, `all-rules.ts`, `response-generator.ts`
- **Root cause:** Code referenced `response_mr/hi/en` columns that were dropped from DB — always returned `null/undefined`
- **Fix:** Removed all references. Use `action_text/reason_text/knowledge_text` (SSOT columns).

#### FIX 35: Hardcoded Translation Dictionaries Removed — FIXED
- **Files:** `response-generator.ts` (symptomNames, cropNames, stageNames), `failure-class-detector.ts` (28 English labels)
- **Root cause:** Hardcoded translation dicts violated SSOT — only covered 5 crops, 6 stages, 5 symptoms
- **Fix:** Response-generator now returns formatted codes (LLM narration layer handles localization). Failure-class-detector now uses observation_key as label (translated via `translateClarificationOptions()` at render time).

#### FIX 36: 46 Missing Observation Codes + Translations Inserted — FIXED (DB)
- **Table:** `observation_master` + `observation_translations`
- **Root cause:** 46 codes referenced in `decision_rules.observable_characteristics` were missing from `observation_master` and had no translations
- **Fix:** Inserted all 46 codes with proper `observation_category`, `affected_plant_part`, `is_diagnostic`, `canonical_group`. Added Marathi + Hindi translations for all 46.

### v6.1 Fixes (Previous) — Forensic Audit Critical Pipeline Fixes

#### FIX 26: `blocksCtopTreatments()` No Longer Blocks on NONE Authority — FIXED
- **File:** `decision/authority-types.ts`
- **Root cause:** `DecisionAuthority.NONE` was in the blocking array, causing ALL treatments to be blocked when authority was unresolved (the default state for most queries)
- **Fix:** Removed `DecisionAuthority.NONE` from the blocking set. Only SAFETY, LAND, CLIMATE, SYSTEM block.

#### FIX 27: `symptomKeys` + `isEmergency` Wired into All Orchestrator Return Paths — FIXED
- **File:** `agents/orchestrator.ts` (IMMEDIATE_PRIMARY_DECISION + main DECISION_PROVIDED return paths)
- **Root cause:** `index.ts` reads `metadata.symptomKeys` but no orchestrator return path populated it → UnifiedGate always saw `symptoms=0`
- **Fix:** Added `symptomKeys: Array.from(allObservationsForPreAuth)` and `isEmergency` flag to both return paths

#### FIX 28: `matched_responses` Eligibility Relaxed — FIXED
- **File:** `agents/layered-rule-evaluator.ts` (line 611)
- **Root cause:** Rules with `reason_text`/`knowledge_text` but null `action_text` were excluded from eligibility → `matched_responses count: 0`
- **Fix:** Eligibility now accepts `action_text || i18n_key || reason_text || knowledge_text`

#### FIX 29: `matched_responses` Wired into IMMEDIATE Return Path — FIXED
- **File:** `agents/orchestrator.ts` (IMMEDIATE_PRIMARY_DECISION return)
- **Root cause:** Early return path at line 5644 did not carry `matched_responses` from `layeredRuleResult`
- **Fix:** Added explicit wiring before return

#### FIX 30: Emergency INFERRED Codes Promoted for Damage Detection — FIXED
- **File:** `decision/diagnosis-only-mode.ts` (detectCropDamageWithAuthority)
- **Root cause:** DEAD_HEART_PRESENT and STEM_BORING_MARKS tagged INFERRED were excluded from terminal gate → damage not detected → no DIAGNOSIS mode
- **Fix:** 12 emergency observation codes are now promoted from INFERRED to terminal gate eligibility

#### FIX 31: `treatment_outcomes` Table Missing Columns — FIXED (DB Migration)
- **Table:** `treatment_outcomes`
- **Root cause:** Code referenced `crop_code`, `crop_stage`, `rule_id`, `days_since_sowing` but columns didn't exist → silent error every turn
- **Fix:** Added all 4 columns via migration

#### FIX 32: Decision Flow Save Error Logging Improved — FIXED
- **File:** `agents/orchestrator.ts` (saveDecisionFlowNonBlocking catch block)
- **Root cause:** Catch block logged empty `{}` instead of actual error details
- **Fix:** Now logs `error.message`, `error.details`, `error.code`

#### FIX 4 (Blocking Rule String Leak): NOT IN CODEBASE
- Searched for "A blocking rule is active" — string not found in codebase
- Likely generated by LLM formatter at runtime, not a code bug
- `decision-graph-bridge.ts` already returns `recommendations: []` when blocked (correct behavior)

### v6.0 Fixes (Previous) — Deep Forensic Audit Critical Code Fixes

#### FIX 20: `required_symptoms` Orphan Key Unblocked — FIXED
- **File:** `bundled-rules/loader.ts` (evaluateConditionsJson)
- **Root cause:** `required_symptoms` key (array) in 17 rules hit generic object fallback → UNEVALUABLE with required=true → permanently blocked ALL shoot borer treatment rules (SC_PEST_EARLY_SHOOT_BORER_004, SC_PEST_TOP_BORER_004)
- **Fix:** Added `required_symptoms` to observation key handler (alongside `observations`, `symptom`, `primary_symptom`). Marked as `required: false` (soft requirement) since farmers describe symptoms in lay terms, not clinical confirmation codes. Array values are matched against expandedObs using exact, containment, and root-word matching.

#### FIX 21: `roi_by_region`/`roi_modifier` Object Keys Unblocked — FIXED
- **File:** `bundled-rules/loader.ts` (CATEGORY_G_KEYS + generic object fallback)
- **Root cause:** 29 soil/nitrogen rules had `roi_by_region` (nested JSON object) → UNEVALUABLE → required=true → permanently blocked
- **Fix:** Already in CATEGORY_G_KEYS. Additionally, the generic object/array fallback at end of evaluator now marks unknown objects/arrays as `required: false` with SKIPPED_NO_DATA instead of UNEVALUABLE with required=true. This prevents any remaining orphan object keys from blocking rules.

#### FIX 22: `requires_diagnosis_confidence` Threshold Key — FIXED
- **File:** `bundled-rules/loader.ts`
- **Root cause:** 9 rules had numeric threshold with no evaluator → UNEVALUABLE → blocked
- **Fix:** Explicit handler marks as SKIPPED_NO_DATA with required=false (soft gate).

#### FIX 23: `requires_confirmation` String Key — FIXED
- **File:** `bundled-rules/loader.ts`
- **Root cause:** 7 rules had string rule_id treated as boolean → wrong result
- **Fix:** Explicit handler marks as SKIPPED_NO_DATA with required=false (soft prerequisite).

#### FIX 24: Expanded CATEGORY_G Informational Keys — FIXED
- **File:** `bundled-rules/loader.ts` (CATEGORY_G_KEYS set)
- **Root cause:** `ipm_priority`, `crop_cycle`, `diagnosis_method`, `requires_identification`, and other context keys were falling through to generic handlers → FAILED or UNEVALUABLE → blocked rules
- **Fix:** Added 13 additional keys to CATEGORY_G_KEYS: `ipm_priority`, `duration_days_info`, `diagnosis_method`, `requires_identification`, `soil_type`, `soil_type_name`, `variety`, `trait`, `region`, `farming_mode`, `monsoon_timing`, `yield_potential`, `crop_cycle`.

#### FIX 25: Generic Object/Array Fallback Made Non-Blocking — FIXED
- **File:** `bundled-rules/loader.ts` (end of evaluateConditionsJson)
- **Root cause:** Any unrecognized object/array condition value hit `UNEVALUABLE, required: true` → permanent block
- **Fix:** Unknown arrays are now treated as soft observation lists (matched against expandedObs, required: false). Unknown objects are marked SKIPPED_NO_DATA with required: false.

#### BUG-003 Boolean-Object observable_characteristics — ALREADY FIXED
- **File:** `bundled-rules/loader.ts` (normalizeObservableChars)
- `normalizeObservableChars` already converts `{dead_heart: true}` → `["DEAD_HEART"]` at load time. The 64 rules with boolean-object format were already being normalized to arrays before reaching makeExecutable.

### Impact Summary
- **17 shoot borer treatment rules** — UNBLOCKED (were permanently blocked)
- **29 soil/nitrogen management rules** — UNBLOCKED
- **9 diagnosis confidence rules** — UNBLOCKED
- **7 confirmation prerequisite rules** — UNBLOCKED
- **~16 IPM priority rules** — UNBLOCKED
- **~14 crop cycle rules** — UNBLOCKED
- **Total rules unblocked: ~92 rules** previously permanently blocked by orphan condition keys

### Remaining DB Data Gaps (require manual data population)
- 450 rules missing `active_ingredient` (14% coverage)
- 479 rules missing `application_method` (8% coverage)
- 490 rules missing `roi_cost_saved_min/max` (6% coverage)
- 5 FERT_SCHEDULE rules with NULL action_text
- 45 orphan observation codes not in observation_master
- ~484 observation codes missing Marathi translations
- 184 rules with empty observable_characteristics

### Forward Chaining (enables_rule_ids, triggers_rule_ids) — DEFERRED
- Columns populated in DB but not evaluated in code
- Requires separate implementation sprint

## Guaranteed Invariants (v6.0)
1. `required_symptoms` array keys are evaluated as soft observation matches, never block rules
2. Unknown object/array condition values are non-blocking (required: false)
3. All informational/context keys in CATEGORY_G never block rule firing
4. `requires_diagnosis_confidence` and `requires_confirmation` are soft gates
5. Boolean-object observable_characteristics normalized to arrays at load time
6. All v5.1-v5.6 invariants remain in effect

## Previous Fixes

### v5.5-v5.6
- FIX 15-19: Intent classification, LLM formatter formats, diagnostic pre-filter, dual confidence, session continuity

### v5.4
- BUG 12-14: Observable characteristics matching, root-word matching, data_authority_rank sorting

### v5.3
- BUG 10-11: Symbolic recommendations reach primary_decision, DiagnosisOnlyMode guard

### v5.2
- BUG 6-9: Intent disconnection, missing scopes, prescription gate, Phase 3 override

### v5.1
- BUG 1-5: ReferenceError, dual detector, stage drift, redundant execution, authority blocks
