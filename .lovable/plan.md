

# Critical Bug Fix: Same Response for Different Queries

## Root Cause Analysis

The logs reveal a clear diagnostic chain that produces the WRONG result:

```text
Farmer selects "पाने पिवळी" (yellow leaves)
    |
    v
Maps to LEAF_YELLOWING (single generic observation)
    |
    v
494 rules evaluated, 104 MATCH, 91 eligible
    |
    v
PRIMARY = SC_MICRO_ZN_DEFICIENCY_URGENT_001 (zinc deficiency!)
    |
    v
SAME zinc response every time any leaf symptom is reported
```

## 3 Critical Bugs Found

### BUG 1 (P0): Nutrition Conflict Arbitrator BYPASSED in Option Selection Path

The recently added `nutrition-conflict-arbitrator.ts` (zinc gate, water stress dominance, macro dominance) is integrated ONLY into `symbolic-reasoner.ts` (lines 269-303).

However, the OPTION_SELECTED code path in `orchestrator.ts` (lines 1620-1770) calls `evaluateRulesLayered()` DIRECTLY, completely bypassing the SymbolicReasoner and ALL nutrition gates.

**Result:** When a farmer selects a clarification option, the zinc specificity gate, water stress dominance, and macro dominance checks NEVER run. The ZN urgent rule fires unchecked.

### BUG 2 (P0): `evaluateConditionsJson` in loader.ts Matches Rules with Unevaluable Conditions

The ZN rule has `conditions_json = {"soil_zn_ppm": "<0.6"}`. This is a soil test threshold. The system has NO soil zinc data (`soil_zn_ppm` is not in the `DecisionInput` interface).

In `evaluateConditionsJson` (loader.ts lines 508-528), when `inputValue` is `undefined` for a string condition:
- The numeric comparator path is skipped (NaN check fails)
- The string match path runs, comparing `"<0.6"` against `inputSymptom` ("LEAF_YELLOWING") -- fails, sets `allMatch = false`

**However**, many other rules with complex object conditions (nested weather objects, threshold objects, etc.) at line 494 are silently SKIPPED with `continue`, meaning they do NOT set `allMatch = false`. If a rule has ONLY skippable conditions plus a matching crop/stage, it matches with `allMatch` still `true`. This explains the 104 matches -- rules with only object-type conditions (ETL thresholds, weather maps, regional ROI objects) pass through without any actual condition validation.

### BUG 3 (P1): ACTION_TYPE_PRIORITY Ignores Diagnostic Relevance

In `layered-rule-evaluator.ts` (lines 552-570), the primary decision is selected purely by ACTION_TYPE_PRIORITY:
- `URGENT_ACTION/URGENT_TREATMENT` = priority 2 (second highest)
- `TREATMENT/RECOMMEND` = priority 4
- `MONITOR` = priority 6

So among 91 eligible rules, ANY urgent rule automatically wins regardless of whether its conditions actually matched the farmer's complaint. The ZN rule with `urgent_treatment` action type dominates over more relevant but lower-priority rules.

---

## Fix Plan

### Fix 1: Integrate Nutrition Arbitrator into LayeredRuleEvaluator

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

Add nutrition conflict arbitration BEFORE building PRIMARY_DECISION (around line 542):

```typescript
// After filtering eligible responses, BEFORE selecting primary:
import { passesZincSpecificityGate, checkWaterStressDominance, checkMacronutrientDominance } from '../decision/nutrition-conflict-arbitrator.ts';

// Filter out nutrition rules that fail arbitration gates
const arbitratedResponses = eligibleResponses.filter(r => {
  const ruleCategory = r.cause?.toLowerCase() || '';
  const isNutrition = ruleCategory.includes('nutri') || ruleCategory.includes('deficiency') || r.rule_id.includes('MICRO') || r.rule_id.includes('NUTRI');
  
  if (!isNutrition) return true; // Non-nutrition rules pass through
  
  // Zinc gate
  const zincGate = passesZincSpecificityGate(r.rule_id, [], { all_observations: state.visual_symptoms || [] });
  if (!zincGate.passes) {
    console.log(`[ArbitrationGate] ${r.rule_id} blocked: ${zincGate.reason}`);
    return false;
  }
  
  // Water stress dominance
  const waterBlock = checkWaterStressDominance(state.visual_symptoms || [], r.action_type, ruleCategory);
  if (waterBlock.blocked) return false;
  
  // Macro dominance
  const macroBlock = checkMacronutrientDominance(state.visual_symptoms || [], r.rule_id, r.cause || '', {});
  if (macroBlock.blocked) return false;
  
  return true;
});
```

Use `arbitratedResponses` instead of `eligibleResponses` for primary selection.

### Fix 2: Reject Rules with Unevaluable-Only Conditions

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

In `evaluateConditionsJson`, track skipped conditions separately. If ALL non-recognized conditions were skipped (object/array), the rule should NOT match -- it means we lack the data to evaluate it.

Change lines 487-535 to track a `skippedConditions` counter alongside `hasAnyCondition`:

```typescript
let skippedConditions = 0;
let evaluatedUnknownConditions = 0;

for (const key of conditionKeys) {
  if (RECOGNIZED_KEYS.has(key)) continue;
  const condValue = conditions[key];
  
  if (condValue !== null && typeof condValue === 'object') {
    skippedConditions++;  // Track instead of silently skip
    continue;
  }
  
  // ... rest of evaluation (boolean, string, etc.)
  evaluatedUnknownConditions++;
  // existing logic...
}

// NEW: If we only had skipped (unevaluable) conditions and no evaluated ones matched, FAIL
if (skippedConditions > 0 && evaluatedUnknownConditions === 0 && !hasAnyCondition) {
  return false; // Cannot evaluate = do not match
}
```

### Fix 3: Add Diagnostic Relevance to Primary Selection

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

After sorting by ACTION_TYPE_PRIORITY, add a secondary sort that penalizes rules whose conditions_json did NOT include an observation that matches the farmer's reported symptom:

```typescript
// After scoring by action type priority, add relevance penalty
const finalScored = scored.map(s => {
  const ruleConditions = s.response.conditions_json || {};
  const ruleObs = ruleConditions.observations || [];
  const currentSymptoms = state.visual_symptoms || [];
  
  // If rule has NO observation overlap with current symptoms, penalize heavily
  const hasObservationOverlap = ruleObs.length === 0 || 
    ruleObs.some(o => currentSymptoms.some(s => 
      s.toUpperCase().includes(o.toUpperCase()) || o.toUpperCase().includes(s.toUpperCase())
    ));
  
  return {
    ...s,
    priority: s.priority + (hasObservationOverlap ? 0 : 100) // Push irrelevant rules down
  };
});

finalScored.sort((a, b) => a.priority - b.priority);
```

### Fix 4: Add `conditions_json` to MatchedResponse for Downstream Validation

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

Extend the `MatchedResponse` interface to include `conditions_json` so downstream arbitration can inspect what the rule actually requires:

```typescript
export interface MatchedResponse {
  // ... existing fields ...
  conditions_json?: Record<string, unknown>; // NEW: for arbitration inspection
}
```

Populate it when collecting matched responses in the evaluation phases.

---

## Deployment

All changes are in the `ai-agriculture-chat` edge function and will auto-deploy. The nutrition arbitrator already exists -- the primary fix is wiring it into the correct code path (LayeredRuleEvaluator) that the option selection flow actually uses.

## Expected Outcome

- ZN deficiency rule will NO LONGER fire on generic LEAF_YELLOWING (zinc gate blocks it)
- Rules with only soil/weather thresholds that cannot be evaluated will NOT match
- Primary selection will prefer rules whose observations match the farmer's reported symptom
- Different farmer queries will produce different, diagnostically relevant responses

