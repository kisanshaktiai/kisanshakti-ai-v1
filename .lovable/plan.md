

# Strict Constraint-Based Rule Evaluator Refactor

## Problem Statement
`evaluateConditionsJson()` in `loader.ts` is fail-open: 200+ of ~518 active rules have conditions that are soft-passed, silently skipped, or evaluated with wrong semantics. The evaluator defaults to `allMatch = true` and only flips it on explicit failures, meaning unevaluable conditions (weather objects, numeric thresholds, ETL, ROI, soil_type, etc.) are invisible to the match decision.

## Root Cause
The evaluator tracks `hasAnyCondition`, `skippedObjectConditions`, and `evaluatedUnknownConditions` as separate counters, with fail-closed guards (L634/L643) that only catch the narrow case where ALL conditions are unevaluable objects. Numeric keys, weather objects marked `hasAnyCondition=true`, and soft-pass string keys all bypass these guards.

---

## Solution: Replace Counter-Based Logic with Explicit Condition Ledger

### Core Architecture Change

Replace the current `allMatch` / `hasAnyCondition` / `skippedObjectConditions` pattern with an **explicit condition ledger** that tracks every condition's evaluation result:

```text
ConditionLedger {
  entries: Array<{
    key: string
    status: PASSED | FAILED | SKIPPED_NO_DATA | UNEVALUABLE
    required: boolean     // true = must pass; false = informational
    inputValue: any       // what canonical state had
    ruleValue: any        // what the rule required
  }>
}
```

**Decision rule**: A rule matches ONLY if:
1. Zero entries have status `FAILED`
2. Zero REQUIRED entries have status `SKIPPED_NO_DATA` or `UNEVALUABLE`
3. At least one entry has status `PASSED`

This is strict fail-closed: any required condition that cannot be evaluated blocks the rule.

### File 1: MODIFY `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

#### Section A: Replace evaluateConditionsJson() internals (L294-686)

1. **Remove** `allMatch`, `hasAnyCondition`, `skippedObjectConditions`, `evaluatedUnknownConditions` variables.

2. **Add** condition ledger tracking:
   - Each condition key produces a ledger entry with `PASSED`, `FAILED`, `SKIPPED_NO_DATA`, or `UNEVALUABLE` status.

3. **Classify all 140+ database keys** into evaluation categories:

   **Category A -- Array Match Keys** (existing logic works, keep):
   - `crop_stage`, `stage`, `growth_stage`, `observations`, `symptom`, `primary_symptom`

   **Category B -- Identity Keys** (new: strict match against input):
   - `crop_code`, `crop_type` -- match against `input.crop_code`
   - `variety` -- match against input variety if available, else `SKIPPED_NO_DATA`

   **Category C -- Numeric Threshold Keys** (new: compare against input values):
   - `duration_days`, `days_after_planting_min`, `days_after_planting_max`, `days_after_sowing`, `days_after_harvest` -- compare against DAS from input
   - `temp_max_celsius`, `temp_min_celsius` -- compare against `input.weather.temp`
   - `soil_ph` -- compare against `input.soil.ph` (or `input.soil_ph`)
   - `max_ratoon`, `ratoon_number` -- compare against ratoon context if available
   - `soil_fe_ppm`, `soil_zn_ppm`, `soil_mn_ppm`, `soil_s_ppm`, `soil_b_ppm`, `soil_cu_ppm` -- existing soil threshold logic (keep)
   - `ec_dsm` -- compare against input EC
   - `soc_pct` -- compare against soil organic carbon
   - `applied_n_kg_ha` -- compare against input nitrogen application
   - If input value is missing: `SKIPPED_NO_DATA` (required = true)

   **Category D -- Boolean Gate Keys** (new: check against canonical state/observations):
   - `disease_confirmed`, `pest_present`, `etl_exceeded`, `etl_below` -- check if relevant evidence exists in observations
   - `requires_diagnosis_confidence`, `requires_confirmation`, `requires_identification` -- mark as gate conditions, check against pipeline state
   - `lodging_risk`, `soil_moisture_low`, `ndvi_decline`, `ndvi_triggered`, `recovery_absent`, `organic_failed`, `bio_control_failed` -- check observations/state
   - If data not available: `SKIPPED_NO_DATA` (required = true)

   **Category E -- Weather Object Keys** (new: evaluate sub-fields):
   - `weather` -- extract `temp_min`, `temp_max`, `humidity_min`, `rain_mm` from value object, compare against `input.weather`
   - `rain_forecast` -- check against weather data
   - If `input.weather` is empty/null: `SKIPPED_NO_DATA` (required = true)

   **Category F -- ETL Object Keys** (new: evaluate threshold structure):
   - `etl` -- extract `min`, `max`, `unit` from value, compare against observed pest count
   - `etl_range` -- same
   - If pest count not available: `SKIPPED_NO_DATA` (required = true)

   **Category G -- Context/Informational Keys** (mark as NOT required):
   - `context`, `roi_basis`, `roi_modifier`, `roi_by_region`, `timing`, `method`, `operation`, `action`, `assessment_timing` -- these are metadata/advisory
   - Status: `PASSED` if matches query, `SKIPPED_NO_DATA` if not (but `required = false`)
   - These do NOT block rule matching but DO contribute to scoring

   **Category H -- Deprecated/Ignored Keys**:
   - `trigger_keywords` -- ignore entirely (already handled)
   - `always_applicable` -- if true, `PASSED`

4. **Final decision logic**:
   ```text
   const requiredFailed = ledger.filter(e => e.required && 
     (e.status === 'FAILED' || e.status === 'SKIPPED_NO_DATA' || e.status === 'UNEVALUABLE'));
   const anyPassed = ledger.some(e => e.status === 'PASSED');
   return requiredFailed.length === 0 && anyPassed;
   ```

5. **Export ledger** for scoring: The ledger array is returned alongside the boolean result so the scoring system in `layered-rule-evaluator.ts` can compute:
   ```text
   score = passed_required_count / total_required_count
   ```
   This fixes the denominator inflation bug where unevaluable keys were counted.

#### Section B: Expand DecisionInput interface (L17-34)

Add missing fields to `DecisionInput` so that input data can be matched:
- `days_since_sowing?: number`
- `ratoon_number?: number`
- `soil_ph?: number`
- `soil_organic_carbon?: number`
- `soil_ec?: number`
- `soil_moisture_status?: string`
- `ndvi_pattern?: string`
- `pest_count?: number`
- `disease_confirmed?: boolean`
- `irrigation_method?: string`
- `region?: string`
- `crop_cycle?: string`
- `soil_type_name?: string`
- `farming_mode?: string`

#### Section C: Update makeExecutable() (L688-700)

No structural change needed -- the `conditions` function signature stays the same. But the internal call changes to use the new ledger-based evaluator.

### File 2: MODIFY `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

#### Section A: Fix scoring formula (L677-720)

Replace the current scoring that counts ALL `conditions_json` keys with ledger-based scoring:

```text
// Before (buggy):
totalConditions = ruleObs.length + conditionKeys.length  // includes unevaluable keys

// After (correct):
totalConditions = ledger.filter(e => e.required).length
matchedConditions = ledger.filter(e => e.required && e.status === 'PASSED').length
score = matchedConditions / totalConditions
```

This requires `evaluateConditionsJson` to return or cache the ledger alongside the boolean. Two options:
- Option A: Add a ledger cache (Map keyed by rule_id) populated during evaluation, read during scoring
- Option B: Change `evaluateConditionsJson` signature to return `{ matches: boolean; ledger: ConditionEntry[] }`

**Recommended**: Option A (ledger cache) to avoid breaking the `conditions: (input) => boolean` interface.

#### Section B: Pass additional canonical state fields to input (L903-925)

In `convertBundledToRule()`, expand the input object passed to `bundled.conditions(input)`:
- `days_since_sowing`: from `state.days_since_sowing` or computed from state
- `soil_ph`: from state soil data
- `soil_type_name`: from state
- `soil_moisture_status`: from state
- `pest_count`: from state or options
- `region`: from state
- `ndvi_pattern`: from state

### File 3: MODIFY `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts`

Apply the same category classification to `evaluateConditions()` (PATH B) if it handles any of the 140+ keys. Ensure numeric and object keys follow the same fail-closed ledger logic.

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Rules with unevaluable conditions that match | ~200+ | 0 |
| Weather conditions enforced | 0/45 | 45/45 (or SKIPPED_NO_DATA = no match) |
| Numeric thresholds enforced | 0/22 | 22/22 |
| ETL object conditions enforced | 0/17 | 17/17 |
| Scoring denominator accuracy | Inflated by unevaluable keys | Only counts required+evaluated |
| Context/ROI keys | Block rules on miss | Informational only (don't block, don't inflate score) |

## Backward Compatibility

- Rules with ONLY `observations` and `crop_stage` conditions are unaffected (Category A, already working)
- Rules with weather/ETL/numeric conditions that previously soft-passed will now require data to match -- this is the intended strict behavior
- The `conditions: (input) => boolean` interface is preserved; ledger is internal

## Files Modified (Summary)

1. **MODIFY**: `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` -- Ledger-based evaluator, expanded DecisionInput, key categorization
2. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` -- Ledger-based scoring, expanded canonical state passthrough
3. **MODIFY**: `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts` -- Align PATH B with same fail-closed logic
4. **DEPLOY**: Redeploy `ai-agriculture-chat` edge function

