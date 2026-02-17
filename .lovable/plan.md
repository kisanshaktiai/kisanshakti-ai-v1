

# Forensic Audit: Critical Bugs Causing Wrong Recommendations

## Root Cause Analysis

After tracing every evaluation path, I found **3 critical bugs** that cause nutrition rules (like `SC_MICRO_FE_DEFICIENCY_URGENT_001`) to dominate over pest/disease rules for ALL symptoms.

### Bug 1 (P0): Micronutrient Rules with Soil-Only Conditions Match When Soil Data is Missing

**The Rule:** `SC_MICRO_FE_DEFICIENCY_URGENT_001` has `conditions_json: {"soil_fe_ppm": "<4.5"}`

**What Happens in `loader.ts` `evaluateConditionsJson()` (line 516-537):**
1. Key `soil_fe_ppm` is not in RECOGNIZED_KEYS, so it goes to unknown key processing
2. Value `"<4.5"` is a string -- tries numeric path first
3. `(input as any)['soil_fe_ppm']` returns `undefined` -- no soil Fe data exists
4. `parseFloat(String(undefined))` = `NaN` -- fails numeric check
5. Falls to string matching: checks if `"<4.5"` matches symptom/query -- it doesn't
6. `allMatch = false` -- **BUT** `hasAnyCondition = true`, `evaluatedUnknownConditions = 1`

**So the rule SHOULD return false.** But the problem is elsewhere:

### Bug 2 (P0): `evaluateConditionsJson` in `loader.ts` Returns `true` for Rules with ONLY Complex Object Conditions

Many nutrition rules like `SC_NUTRITION_NITROGEN_028` have conditions like:
```json
{
  "context": "nutrient_application",
  "weather": {"context": "fertilizer_timing"},   // complex object -> SKIPPED
  "roi_basis": "red_soil_micronutrient_lockup",
  "roi_modifier": 0.90,                          // number -> SKIPPED
  "roi_by_region": {...}                          // complex object -> SKIPPED
}
```

In `loader.ts` line 498-501: complex objects are silently skipped (`skippedObjectConditions++`).
In line 541: numbers with `typeof condValue === 'number'` are skipped.

For `SC_NUTRITION_NITROGEN_028`:
- `context` = "nutrient_application" -> string -> evaluatedUnknownConditions++, allMatch = false (no match)
- `weather` = {...} -> object -> skippedObjectConditions++
- `roi_basis` = string -> evaluatedUnknownConditions++, allMatch = false
- `roi_modifier` = 0.90 -> number -> SKIPPED (line 541)
- `roi_by_region` = {...} -> object -> skippedObjectConditions++

Result: `allMatch = false` -> returns false. OK, this one is handled.

**BUT** rules with ONLY `roi_by_region` (object) + `roi_modifier` (number) conditions would have:
- `skippedObjectConditions > 0`, `evaluatedUnknownConditions = 0`
- The fail-closed gate at line 552 checks `!hasAnyCondition` -- but if crop_stage or observations matched earlier, `hasAnyCondition = true`
- This means: **stage match + all remaining conditions skipped = RULE FIRES**

### Bug 3 (P0 - THE ACTUAL ROOT CAUSE): Nutrition Rules Mapped as DIAGNOSIS Category Win Primary Selection

In `layered-rule-evaluator.ts` line 931: `'nutrition': RuleCategory.DIAGNOSIS`

This means ALL nutrition rules are evaluated in PHASE 2 (DIAGNOSIS), not PHASE 5 (PRESCRIPTION). Nutrition diagnosis rules that match go directly into `matched_responses` at line 332-352.

When multiple nutrition rules fire (because their conditions are loose or only need stage match), they populate `matched_responses`. The primary selection at line 560-668 then picks the one with highest ACTION_TYPE_PRIORITY. `URGENT_ACTION` has priority 2 (very high), so `SC_MICRO_FE_DEFICIENCY_URGENT_001` with `action_type: URGENT_ACTION` wins over `RECOMMEND` (priority 4) or `MONITOR` (priority 6) pest/disease rules.

**Combined Effect:**
1. Many nutrition rules match because their unique conditions (soil thresholds, roi_by_region objects) are skipped
2. They go into DIAGNOSIS phase, populating matched_responses
3. FE/Zn/Mn URGENT_ACTION rules have the highest action_type priority
4. They win primary selection regardless of what the farmer actually reported

### Bug 4 (P1): Zinc Gate Does NOT Cover Iron/Manganese/Sulphur Rules

The `passesZincSpecificityGate()` only checks rules with "ZN" or "ZINC" in the rule_id (line 204 of nutrition-conflict-arbitrator.ts). It does NOT gate:
- `SC_MICRO_FE_DEFICIENCY_URGENT_001` (Iron)
- `SC_MICRO_MN_DEFICIENCY_URGENT_001` (Manganese)  
- `SC_NUTRITION_S_DEFICIENCY_URGENT_001` (Sulphur)

These rules have NO observation requirement and only need a soil threshold that can never be evaluated (no soil Fe/Mn/S data in SymbolicFact).

---

## Fix Plan (4 Changes in 3 Files)

### Fix 1: Add Micronutrient Specificity Gate (nutrition-conflict-arbitrator.ts)

Extend the zinc gate concept to ALL micronutrient deficiency rules. Create a new `passesMicronutrientSpecificityGate()` function:

```
If rule_id contains 'MICRO' or 'FE_DEFICIENCY' or 'MN_DEFICIENCY' or 'S_DEFICIENCY':
  AND no specific nutrient-deficiency symptom is present (e.g., INTERVEINAL_CHLOROSIS, YOUNG_LEAF_YELLOWING)
  AND no soil test confirms deficiency
  THEN: BLOCK the rule
```

This ensures micronutrient rules ONLY fire when there is specific evidence, not just a stage match.

### Fix 2: Fail-Closed for Soil-Threshold-Only Rules (loader.ts)

In `evaluateConditionsJson()`, after processing unknown keys (around line 544), add a check:

```
If a rule has ONLY soil/numeric threshold conditions (soil_fe_ppm, soil_zn_ppm, etc.)
  AND none of those thresholds could be evaluated (input value was undefined)
  THEN: return false (fail-closed)
```

Specifically: when `evaluatedUnknownConditions > 0` but ALL evaluated conditions failed because the input values were undefined/missing (not because they didn't match the threshold), the rule should NOT match.

### Fix 3: Apply Micronutrient Gate in Both Evaluation Paths

**In `symbolic-reasoner.ts` (line 258-303):** After the existing zinc gate, add the new micronutrient specificity gate check for Fe/Mn/S rules.

**In `layered-rule-evaluator.ts` (line 565-597):** Extend the arbitration filter to also block Fe/Mn/S rules that lack specific evidence, not just Zn rules.

### Fix 4: Observation-Required Gate for URGENT Nutrition Rules (loader.ts)

In `evaluateConditionsJson()`, add a gate: if a rule's `action_type` is `URGENT_ACTION` or `URGENT_TREATMENT` AND category is `nutrition`, require at least ONE matching observation from `conditions_json.observations` or from the farmer's reported symptoms. If no observation overlap exists, return false.

This prevents urgent nutrition treatments from firing on generic symptoms like GAPS_IN_FIELD, HOLES_VISIBLE, or DRYING_WILTING that have no biological relationship to nutrient deficiency.

---

## Files Modified

| File | Change |
|------|--------|
| `nutrition-conflict-arbitrator.ts` | Add `passesMicronutrientSpecificityGate()` for Fe/Mn/S rules |
| `loader.ts` | Fail-closed for unevaluable soil thresholds; observation gate for urgent nutrition |
| `symbolic-reasoner.ts` | Apply micronutrient gate in executeRules loop |
| `layered-rule-evaluator.ts` | Extend arbitration filter to cover Fe/Mn/S rules |

## What Does NOT Change

- decision_rules table schema or data
- Observation ontology
- Induction logic
- Clarification templates
- LLM narration layer
- Authority hierarchy
- Intent routing (DIRECT mode bypass from previous fix)

## Expected Result After Fix

| Farmer Query | Before (Bug) | After (Fixed) |
|---|---|---|
| "Drying/wilting" at TILLERING | FeSO4 spray (WRONG) | Clarification: "Is center leaf dry? Pull test? Termites visible?" |
| "Holes visible" at TILLERING | FeSO4 spray (WRONG) | Shoot borer / stem borer diagnosis rules fire |
| "Gaps in field" at TILLERING | FeSO4 spray (WRONG) | Gap filling / germination failure / termite rules fire |
| "Red rot selected" | FeSO4 spray (WRONG) | Red rot disease rules fire (already have correct rules in DB) |
| "Interveinal chlorosis on young leaves" + soil Fe low | FeSO4 spray (CORRECT) | FeSO4 spray (still fires correctly with evidence) |

## Architectural Principle Enforced

**Absence of soil test data is NOT evidence of deficiency.**
Micronutrient rules MUST require positive evidence (specific symptoms OR soil test confirmation) before firing as URGENT treatments.

