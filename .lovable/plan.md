

# Unified Confidence Authority & Production Hardening Refactor

## Problem

The symbolic ledger evaluator correctly computes `normalized_score` (e.g., 1.0 = 100% match) and stores it in `primary_decision.confidence_score`. However, when `index.ts` builds the `UnifiedGateInput` (line 961-978), it **never passes** `decision_confidence`. The field is simply absent from the object.

The UnifiedGate then defaults: `const baseConfidence = input.decision_confidence ?? 0` (line 374), producing `calculatedConfidence = 0`. This causes the gate to resolve to `INFORMATION` or `CLARIFICATION` mode, even when the symbolic layer selected a perfect-match rule.

### Confidence Flow (Current - Broken)

```text
LayeredRuleEvaluator
  -> primary_decision.confidence_score = 0.85 (from ledger)
  -> Orchestrator receives it correctly
  -> index.ts builds UnifiedGateInput WITHOUT decision_confidence
  -> UnifiedGate defaults to 0
  -> calculatedConfidence = (0 * 0.4) + (50 * 0.3) + (50 * 0.3) = 30
  -> Mode = CLARIFICATION (wrong!)
```

### Confidence Flow (Target - Fixed)

```text
LayeredRuleEvaluator
  -> primary_decision.confidence_score = 0.85 (SSOT)
  -> primary_decision.weighted_confidence = 0.72 (density-adjusted)
  -> index.ts passes weighted_confidence as decision_confidence
  -> UnifiedGate reads it directly (no recomputation)
  -> Mode = TREATMENT (correct!)
```

---

## Changes

### FILE 1: MODIFY `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

**A. Extend PrimaryDecision interface** (around line 173)

Add fields to carry ledger metadata:

```
interface PrimaryDecision {
  rule_id: string;
  action_type: string;
  priority: number;
  confidence_score: number;
  // NEW: Ledger-derived authority fields
  normalized_score: number;      // raw ledger ratio (0-1)
  total_required: number;        // denominator from ledger
  passed_required: number;       // numerator from ledger
  weighted_confidence: number;   // density-adjusted final confidence
  action_text?: string;
  reason_text?: string;
  knowledge_text?: string;
  i18n_key?: string;
}
```

**B. Implement density-weighted confidence** (around line 740-760)

After selecting the best candidate, compute weighted confidence:

```
const baseScore = scored[0].matchedConditions / scored[0].totalConditions;
const densityWeight = Math.min(1.0, Math.log(scored[0].totalConditions + 1) / Math.log(10));
const weightedConfidence = Math.min(1.0, baseScore * (0.5 + 0.5 * densityWeight));
```

Rationale: A 2-condition rule matching 2/2 (score=1.0) should not equal a 7-condition rule matching 7/7. The density weight rewards richer constraint sets while keeping the score bounded 0-1.

Populate `primary_decision` with all new fields:

```
result.primary_decision = {
  rule_id: best.rule_id,
  action_type: best.action_type,
  priority: best.priority ?? 50,
  confidence_score: weightedConfidence,
  normalized_score: scored[0].evidenceScore,
  total_required: scored[0].totalConditions,
  passed_required: scored[0].matchedConditions,
  weighted_confidence: weightedConfidence,
  action_text: best.action_text,
  reason_text: best.reason_text,
  knowledge_text: best.knowledge_text,
  i18n_key: best.i18n_key
};
```

**C. Enhanced logging** (same area)

Replace current logging with authority-style log:

```
console.log(`📊 Decision Authority:`);
console.log(`   rule_id: ${best.rule_id}`);
console.log(`   base_score: ${scored[0].evidenceScore.toFixed(3)}`);
console.log(`   total_required: ${scored[0].totalConditions}`);
console.log(`   passed_required: ${scored[0].matchedConditions}`);
console.log(`   density_weight: ${densityWeight.toFixed(3)}`);
console.log(`   weighted_confidence: ${weightedConfidence.toFixed(3)}`);
```

### FILE 2: MODIFY `supabase/functions/ai-agriculture-chat/index.ts`

**A. Pass symbolic confidence to UnifiedGateInput** (around line 961-978)

The critical missing link. Add `decision_confidence` sourced from the symbolic layer:

```
const symbolicConfidence = orchestratorResponse.decision_output?.layered_rule_result
  ?.primary_decision?.weighted_confidence
  ?? orchestratorResponse.decision_output?.layered_rule_result
    ?.primary_decision?.confidence_score
  ?? 0;

const unifiedGateInput: UnifiedGateInput = {
  // ... existing fields ...
  decision_confidence: Math.round(symbolicConfidence * 100),  // Convert 0-1 to 0-100
  // Remove semantic_confidence and observation_certainty
  // to prevent competing confidence sources
};
```

**B. Log the confidence bridge** (after building input)

Add trace log showing confidence source:

```
console.log(`   📊 [ConfidenceBridge] symbolic_confidence=${symbolicConfidence.toFixed(3)} -> decision_confidence=${Math.round(symbolicConfidence * 100)}`);
```

### FILE 3: MODIFY `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts`

**A. Simplify confidence calculation** (around line 371-383)

Replace the multi-source weighted calculation with direct passthrough:

```
// SSOT: Confidence comes from symbolic layer only
const calculatedConfidence = input.decision_confidence ?? 0;
```

Remove the weighted formula that mixed `baseConfidence`, `semanticConfidence`, and `observationCertainty`. The symbolic ledger score IS the confidence -- no recomputation.

**B. Keep semantic/observation fields for backward compat** but mark as deprecated in comments and do not use them in mode resolution.

### FILE 4: MODIFY `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

**A. Ensure immediate return path uses weighted_confidence** (around line 5451)

Update the metadata confidence to use the new field:

```
metadata: {
  confidence: layeredRuleResult?.primary_decision?.weighted_confidence ||
              layeredRuleResult?.primary_decision?.confidence_score ||
              decisionOutput.confidence_score || 0.7,
  // ...
}
```

**B. Propagate weighted_confidence through PRIMARY_DECISION RECOVERY** (around line 5369-5401)

When recovering `primary_decision` from `layeredRuleResult`, also copy the new fields:

```
decisionOutput.primary_decision = {
  // ... existing fields ...
  weighted_confidence: layeredRuleResult.primary_decision.weighted_confidence,
  normalized_score: layeredRuleResult.primary_decision.normalized_score,
  total_required: layeredRuleResult.primary_decision.total_required,
  passed_required: layeredRuleResult.primary_decision.passed_required,
};
```

### FILE 5: Add Invariant Guard

**MODIFY `supabase/functions/ai-agriculture-chat/index.ts`** (after line 983, before suppression guard)

Add a confidence consistency check:

```
// INVARIANT: If symbolic layer selected a primary decision, confidence must not be zero
const primaryDecisionExists = !!(orchestratorResponse.decision_output?.primary_decision?.rule_id ||
  orchestratorResponse.decision_output?.layered_rule_result?.primary_decision?.rule_id);

if (primaryDecisionExists && symbolicConfidence === 0) {
  console.error(`🚨 [INVARIANT] Confidence pipeline inconsistency: primary_decision exists but symbolic_confidence=0`);
  console.error(`   Forcing minimum confidence of 0.5 to prevent decision suppression`);
  unifiedGateInput.decision_confidence = 50;  // Safe floor
}
```

---

## Expected Behavior After Fix

| Scenario | Before | After |
|---|---|---|
| Ledger score = 1.0, 2 conditions | confidence=0, mode=INFORMATION | weighted=0.65, mode=TREATMENT |
| Ledger score = 1.0, 7 conditions | confidence=0, mode=INFORMATION | weighted=0.92, mode=TREATMENT |
| Ledger score = 0.5, 4 conditions | confidence=0, mode=INFORMATION | weighted=0.38, mode=CLARIFICATION |
| No primary decision | confidence=0, mode=INFORMATION | confidence=0, mode=INFORMATION (correct) |

## Files Modified (Summary)

1. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` -- Extend PrimaryDecision, add density-weighted confidence, enhanced logging
2. **MODIFY**: `supabase/functions/ai-agriculture-chat/index.ts` -- Pass symbolic confidence to UnifiedGate, add invariant guard
3. **MODIFY**: `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts` -- Use symbolic confidence directly, remove multi-source recomputation
4. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` -- Propagate weighted_confidence through recovery path
5. **DEPLOY**: Redeploy `ai-agriculture-chat` edge function

