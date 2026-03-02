

# Critical Bug Analysis — Shoot Borer Prescription Failure

## Root Cause Chain (from logs)

The logs show SC_PEST_EARLY_SHOOT_BORER_004 IS selected (confidence 0.739), but the farmer still gets generic monitoring advice. Here are the 4 remaining bugs causing this:

### BUG A: PrescriptionGate blocks despite valid rule selection (CRITICAL)

**File:** `canonical-state-builder.ts` line 1249-1276

The PrescriptionGate checks `data_confidence === DataConfidence.LOW` and then counts symptoms from `(state as any).symptom_count` and `[state.visual_symptom, ...(state.secondary_symptoms || [])]`. The log shows `symptoms=4, completeness=50%` — it needs 5+ symptoms OR 70%+ completeness to override. But the orchestrator passes `uniqueSymptomCodes` (from NLU visual_symptoms + cross_crop + induction) to `buildCanonicalState` as `farmerObservations`. The problem: `uniqueSymptomCodes` only contains NLU-extracted codes (few), NOT the full `allObservationsForPreAuth` set (20+ codes). The canonical state builder counts only what it receives.

**Fix:** Pass `allObservationsForPreAuth` (the full observation set) as `farmerObservations` to `buildCanonicalState`, not just `uniqueSymptomCodes`. This gives symptom_count=20+ which passes the 5+ threshold.

### BUG B: LLM Output Validation rejects response — "Missing product: Shoot Borer" (CRITICAL)

**File:** `llm-response-formatter.ts` line 662-663, 389-394

The validator reads `primaryProductName` from `product_details.product_name` or `application_details.product_name`. The orchestrator at line 5603 sets `application_details.product_name = 'See structured response'` — NOT a real product. The validator then gets the cause name "Shoot Borer" from somewhere in the action chain and treats it as a required product. The LLM output doesn't contain "Shoot Borer" verbatim → validation fails → template fallback.

Additionally, `product_details` is NEVER populated with actual data (no `product_name`, `active_ingredient`, or `dosage_per_acre` from the DB rule). The layered_rule_evaluator builds primary_decision with `action_text`, `reason_text`, `knowledge_text` but NO product fields from the DB.

**Fix 1:** In `layered-rule-evaluator.ts` line 789-801, add `active_ingredient`, `dosage_per_acre`, and `cause` from the matched rule to `primary_decision`.

**Fix 2:** In `orchestrator.ts` line 5584-5623, build `product_details` from the rule's `active_ingredient` and `dosage_per_acre`, and set `application_details.product_name` to the actual `active_ingredient` instead of `'See structured response'`.

**Fix 3:** In `llm-response-formatter.ts` line 662-663, add fallback to `active_ingredient` when `product_name` is missing or is a placeholder.

### BUG C: `has_symptoms: false` in formatter despite 20+ observations (CRITICAL)

**File:** `llm-response-formatter.ts` line 190-191

```ts
const hasSymptoms = input.decision_output?.metadata?.has_symptoms ?? 
                     !!(input.decision_output?.symptom_keys?.length);
```

The orchestrator wires `symptomKeys` to `metadata` (line 5697), but the formatter reads `decision_output.metadata.has_symptoms` (not set) and `decision_output.symptom_keys` (not set on decision_output, only on the outer metadata). The fix from previous iteration put symptomKeys on the RESPONSE metadata, but the formatter reads it from the DECISION_OUTPUT object.

**Fix:** In the orchestrator, also set `decisionOutput.metadata.has_symptoms = true` and `decisionOutput.symptom_keys = obsArray` directly on the decision_output object before it reaches the formatter.

### BUG D: Decision confidence = 0 in formatter (HIGH)

**File:** `llm-response-formatter.ts` line 188-189

```ts
const decisionConfidence = input.decision_output?.metadata?.decision_confidence ?? 
                            input.decision_output?.confidence ?? 0;
```

Neither `metadata.decision_confidence` nor `decision_output.confidence` is set. The weighted_confidence (0.739) is on `primary_decision.weighted_confidence` but not read here.

**Fix:** Add `input.decision_output?.primary_decision?.weighted_confidence` as a fallback in this chain.

## Implementation Order

1. **BUG A** — Pass full observations to canonical state builder (orchestrator.ts ~line 4503)
2. **BUG B** — Propagate `active_ingredient`/`dosage_per_acre` from rule to primary_decision (layered-rule-evaluator.ts ~line 789, orchestrator.ts ~line 5584)
3. **BUG C** — Wire `has_symptoms` and `symptom_keys` onto decision_output object (orchestrator.ts, all return paths)
4. **BUG D** — Add weighted_confidence fallback in formatter (llm-response-formatter.ts ~line 188)

## Technical Details

### BUG A fix location
`orchestrator.ts` ~line 4503: Change `farmerObservations: uniqueSymptomCodes.length > 0 ? uniqueSymptomCodes : inductionSymptoms` to `farmerObservations: Array.from(allObservationsForPreAuth || uniqueSymptomCodes || inductionSymptoms)`

### BUG B fix in layered-rule-evaluator.ts ~line 789
Add to primary_decision object:
```
active_ingredient: best.active_ingredient || null,
dosage_per_acre: best.dosage_per_acre || null,
cause: best.cause || null,
```

### BUG B fix in orchestrator.ts ~line 5584
Build product_details from layeredRuleResult:
```
product_details: {
  product_name: layeredRuleResult.primary_decision.active_ingredient || null,
  active_ingredient: layeredRuleResult.primary_decision.active_ingredient || null,
  dosage_per_acre: layeredRuleResult.primary_decision.dosage_per_acre || null,
},
application_details: {
  product_name: layeredRuleResult.primary_decision.active_ingredient || 'See structured response',
  ...existing fields
}
```

### BUG C fix in orchestrator.ts (all return paths)
Before returning, set:
```
decisionOutput.symptom_keys = obsArray;
decisionOutput.metadata = decisionOutput.metadata || {};
decisionOutput.metadata.has_symptoms = obsArray.length > 0;
decisionOutput.metadata.decision_confidence = layeredRuleResult?.primary_decision?.weighted_confidence || 0;
```

### BUG D fix in llm-response-formatter.ts ~line 188
```
const decisionConfidence = input.decision_output?.metadata?.decision_confidence ?? 
                            input.decision_output?.primary_decision?.weighted_confidence ??
                            input.decision_output?.confidence ?? 0;
```

## Verification
After fixes, the shoot borer scenario should produce:
- `symptoms=20+` in PrescriptionGate → PASSED
- `Has symptoms: true` in formatter
- `Decision confidence: 0.739` (not 0)
- `product_name: Chlorantraniliprole 18.5% SC` (not "Shoot Borer")
- LLM output validation PASSES (product found in response)
- Response type: PRESCRIPTION with actual dosage

