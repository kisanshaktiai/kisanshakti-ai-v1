

# Forensic Audit & Symbolic Engine Rewrite

## Critical Bug Found

### Root Cause: `no_` prefix auto-pass in condition evaluator

In `loader.ts` line 482-491, any condition key starting with `no_` or `normal_` is treated as a **non-required, auto-passing** negative assertion. This means `SC_DIAG_GENERAL_015` with condition `{"no_matching_diagnosis": true}` is evaluated as:

```
key = "no_matching_diagnosis"
key.startsWith('no_') => TRUE
expected = true
contradicted = false (key is not 'no_pest_visible' or 'no_visible_deficiency')
returns: { status: PASSED, required: false }
```

Result: The rule ALWAYS passes with `total_required: 0, passed_required: 0, base_score: 1.000`. This catch-all generic diagnostic rule wins over specific Red Rot rules like `SC_DISEASE_RED_ROT_005` which require multiple observations.

### Secondary Issue: `condition_code` column is completely ignored

Every single rule in the database has `condition_code = 'STAGE_GENERAL'` (all 517 rules). The loader maps it to `conditionCode` but it is never used in matching logic. The field name `conditionCode` even still contains `'() => true'` as default value (line 197 in loader.ts), a relic from when conditions were JavaScript code strings.

### Additional Issues Found

1. **All 517 rules loaded for every query** -- Despite crop filtering in `getAllRulesWithBundled`, the edge log shows `Rules evaluated: 517` because the crop code `sc` doesn't match lowercase `sc` against rules stored as `SC` (case mismatch in some paths).

2. **`action_type` enum mismatch** -- Database uses `RECOMMEND`, `MONITOR`, `BLOCK`, `NO_ACTION_REQUIRED`, `URGENT_ACTION`. Loader normalizes these to `treatment`, `monitoring`, `safety_gate`, `advisory`, `urgent_treatment`. The `UnifiedGate` then checks against a third set: `TREATMENT`, `RECOMMEND`, `PREVENTION`, etc. Three different enum systems compete.

3. **Observation aliases are hardcoded** in `evaluateConditionsJson` (lines 614-621) -- `NUTRIENT_DEFICIENCY`, `STUNTED_GROWTH`, `WATER_STRESS`, etc. are hardcoded alias expansions rather than coming from `observation_aliases` table.

4. **LLM still has diagnostic authority** -- `mapDistributionToSymptom` in orchestrator.ts (lines 480-610) hardcodes symptom-to-diagnosis mappings in English/Marathi, acting as a parallel decision layer outside the symbolic engine.

5. **Generic boolean gate keys** evaluated at lines 762-773 allow ANY unrecognized boolean condition key to pass as a weak observation match, creating false positives for rules like `wilting_without_rot`, `ndvi_recovery`, `excessive_tillering`, etc.

---

## Phase-by-Phase Implementation

### PHASE 1: Fix the `no_` prefix auto-pass bug (CRITICAL)

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

The `evaluateBooleanGate` function (lines 482-491) treats all `no_*` keys as auto-pass non-required assertions. Fix: Remove the `no_`/`normal_` prefix shortcut. Every boolean key must be evaluated against actual observation data. If the key has no registered evaluator and is not in the observation set, it must return `SKIPPED_NO_DATA` with `required: true`.

Specifically:
- Remove lines 482-491 (the `no_`/`normal_` prefix handler)
- Add `no_matching_diagnosis`, `no_confirmed_pest`, `no_pest_visible`, `no_visible_deficiency`, `normal_growth` to the explicit `booleanEvaluators` map with proper evaluation logic
- `no_matching_diagnosis: true` should evaluate against a runtime flag set by the orchestrator, NOT against the observation set

### PHASE 2: Fix generic boolean gate fallthrough (CRITICAL)

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

Lines 526-534: Unrecognized boolean keys with `expected=true` currently return `SKIPPED_NO_DATA` (not `FAILED`), but with `required: true`. This is correct for observation flags but wrong for meta-conditions like `no_matching_diagnosis`, `block_rule_triggered`, `fallback`, `chemical_attempt`, `diagnosis_method`.

Fix: Classify condition keys into three categories:
- **Observation keys** -- Matched against the observation set (observation_master codes)
- **Meta/runtime keys** -- Require explicit runtime context (e.g., `no_matching_diagnosis`, `disease_confirmed`, `chemical_attempt`)
- **Informational keys** -- Non-required context (already handled by Category G)

Unknown boolean keys that are NOT valid observation codes in `observation_master` must return `FAILED` (not `SKIPPED_NO_DATA`), preventing rules with meta-conditions from firing without the proper runtime context.

### PHASE 3: Strict `action_type` enum alignment

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

The database stores 5 canonical action types: `RECOMMEND`, `MONITOR`, `BLOCK`, `NO_ACTION_REQUIRED`, `URGENT_ACTION`.

Remove the `normalizeActionType` function (lines 100-116) that maps these to a second enum. Instead, use the database values directly. Update all downstream consumers:

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts`

Update `action_type` union to:
```
action_type?: 'RECOMMEND' | 'MONITOR' | 'BLOCK' | 'NO_ACTION_REQUIRED' | 'URGENT_ACTION';
```

**File:** `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts`

Update `TREATMENT_ACTIONS` and `OBSERVATION_ACTIONS` sets to use the 5 canonical types instead of the 30+ variants currently listed.

### PHASE 4: Remove hardcoded observation aliases

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

Remove the hardcoded `observationAliases` dictionary (lines 614-621). Instead, load aliases from `observation_aliases` table at cache time (same TTL as rules). The `evaluateConditionsJson` function should expand observations using the DB-sourced alias map.

Add a new cache:
```
let cachedObservationAliases: Map<string, string[]> | null = null;
```

Load from database:
```
SELECT alias_code, canonical_code FROM observation_aliases WHERE is_active = true
```

### PHASE 5: Remove hardcoded symptom mapping from orchestrator

**File:** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

The `mapDistributionToSymptom` function (lines 480-610) contains 100+ hardcoded mappings including Marathi strings (`पोषण`, `खोड`, `अळी`). This is a parallel decision layer that bypasses the symbolic engine.

Replace with: When a clarification option is selected, the system already extracts the `observation_key` from the option metadata (line 487-526 handles `[obs_keys:KEY]` pattern). The remaining hardcoded fallback mappings (lines 528-610) should be removed. If no embedded key is found, return the raw option text as-is and let the NLU + observation code mapper handle it.

### PHASE 6: LLM hard boundary enforcement

**File:** `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`

Add a pre-LLM gate: If the symbolic decision has `actions_returned.length === 0`, force `response_mode = INFORMATION_ONLY` and suppress the HOW section in the LLM prompt. The LLM must never generate treatment content when the symbolic engine returned no actions.

**File:** `supabase/functions/ai-agriculture-chat/index.ts`

Add post-LLM validation: If the LLM output contains dosage patterns (`\d+\s*(ml|g|kg|l)`) but the symbolic decision has zero products, strip the unauthorized content and log a `NARRATION_BREACH` error.

### PHASE 7: Runtime assertions

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

Add post-evaluation assertion: If `matched_responses.length > 0` but `primary_decision` is null, throw `RULE_DATA_INTEGRITY_ERROR` with the list of matched rule IDs, instead of silently continuing.

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

Add observation validation: Before evaluating conditions, validate that observation codes in `conditions_json.observations[]` exist in a cached set of `observation_master.observation_code`. Log warnings for invalid codes.

---

## Technical Details

### Data flow after fix

```text
Farmer input
  -> Language normalization
  -> Semantic extraction (LLM for NLU only)
  -> Observation code mapping (observation_master)
  -> Alias expansion (observation_aliases table, NOT hardcoded)
  -> Canonical state build
  -> Rule loading (crop-filtered from decision_rules)
  -> Condition evaluation:
       1. Stage gate (stage_applicable)
       2. Crop gate (crop_code)
       3. Observation layer filter (required_observation_category + required_plant_part)
       4. Condition ledger evaluation:
          - Observation keys matched against expanded observation set
          - Meta/runtime keys evaluated against runtime context (NOT observation set)
          - Numeric thresholds evaluated against sensor data
          - Unknown keys FAIL (not skip)
       5. Strict ledger decision: 0 FAILED + 0 SKIPPED(required) + 1+ PASSED
  -> Primary decision selection (evidence-ratio scoring)
  -> Unified gate validation
  -> LLM formatting (render-only, zero decision authority)
  -> Post-LLM validation (product/dosage integrity check)
  -> Response delivery
```

### Files to be modified

1. `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` -- Fix `no_` prefix bug, generic boolean fallthrough, observation alias loading, action_type normalization removal
2. `supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts` -- Update `action_type` union to match DB enum
3. `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` -- Add post-evaluation integrity assertion, update action_type references
4. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` -- Remove hardcoded `mapDistributionToSymptom` mappings
5. `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts` -- Align `TREATMENT_ACTIONS`/`OBSERVATION_ACTIONS` to 5-type DB enum
6. `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` -- Add pre-LLM action count gate
7. `supabase/functions/ai-agriculture-chat/index.ts` -- Add post-LLM narration breach validation

### No changes to

- Database tables (already correct)
- Frontend code
- Translation tables

