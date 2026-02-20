
# Critical P0 Fix: Symbolic Decision Brain Data Flow Audit & Repair

## Issues Found (7 Critical, All Confirmed in Code)

### BUG 1: ConfidenceCalculator Crash (P0)
**File**: `orchestrator.ts` line 4990-4996
**Root Cause**: `calculateConfidence()` expects a single `ConfidenceInput` object `{ diagnosis, firedRules, facts, landState }` but is called with 4 positional arguments in wrong order:
```
confidenceCalc.calculateConfidence(
  layeredRuleResult.final_diagnosis || null,   // -> diagnosis (OK)
  symbolicFacts,                                // -> firedRules (WRONG - should be facts)
  symbolicResult.recommendations || [],         // -> facts (WRONG - should be landState)
  authoritativeLandState || {}                  // -> landState (WRONG - becomes facts)
)
```
When `authoritativeLandState` is null, `{}` is passed as `facts`. The calculator accesses `facts.crop` on `{}`, causing the `TypeError: Cannot read properties of undefined (reading 'crop')`.

**Fix**: Pass a proper `ConfidenceInput` object:
```
confidenceCalc.calculateConfidence({
  diagnosis: layeredRuleResult.final_diagnosis || null,
  firedRules: symbolicResult.recommendations || [],
  facts: symbolicFacts,
  landState: authoritativeLandState
})
```

**Also add defensive null check** in `confidence-calculator.ts` line 203:
```
private calculateDataQuality(facts: SymbolicFact, landState: ...): number {
  if (!facts || !facts.crop) {
    console.warn('[ConfidenceCalculator] Missing facts/crop, returning 0');
    return 0;
  }
  // ... existing logic
}
```

And in `calculateDataFreshness` line 280 for `landState.crop.schedule_status`:
```
if (landState?.crop?.schedule_status === 'active') {
```

---

### BUG 2: Rule Deduplication Missing in LayeredRuleEvaluator (P1)
**File**: `layered-rule-evaluator.ts` lines 521-553
**Root Cause**: `matched_responses` array is populated without checking for duplicate `rule_id`. If the same rule matches in multiple evaluation phases, it gets added twice. The `diagnosis-conflict-resolver.ts` has `deduplicateRules()` but it's only used for diagnosis candidates, not for `matched_responses`.

**Fix**: Add deduplication to `matched_responses` before primary selection (around line 601):
```
// Deduplicate matched_responses by rule_id (keep first occurrence)
const seenRuleIds = new Set<string>();
result.matched_responses = result.matched_responses.filter(r => {
  if (!r.rule_id || seenRuleIds.has(r.rule_id)) return false;
  seenRuleIds.add(r.rule_id);
  return true;
});
```

---

### BUG 3: Intent UNKNOWN Allows Diagnosis Mode (P1)
**File**: `orchestrator.ts` lines 2680-2686
**Root Cause**: There IS a gate at line 2682 that blocks symbolic brain when `zero observations + UNKNOWN intent`. However, the gate checks `hasSymptoms` which is true when cross-crop/synthetic observations have been injected (even without real farmer input). Also, the Symbolic Reasoner at Phase 2.7 (line 4853) runs unconditionally with `if (canonicalState)` -- no intent check.

**Fix 1**: In Phase 2.7 (line 4853), add intent guard before symbolic reasoner:
```
const shouldRunSymbolicReasoner = canonicalState && (
  intentCode !== 'UNKNOWN' || 
  (allObservationsForPreAuth && allObservationsForPreAuth.size >= 2)
);
if (shouldRunSymbolicReasoner) {
  // ... existing symbolic reasoner code
}
```

**Fix 2**: Add UNKNOWN-to-REPORT_SYMPTOM promotion when observations exist (after intent extraction, around line 2253):
```
if ((intentCode === 'UNKNOWN' || intentCode === 'UNKNOWN_OBSERVATION') && 
    allObservationsForPreAuth.size >= 2) {
  intentCode = 'REPORT_SYMPTOM';
  console.log(`   🔄 [IntentPromotion] UNKNOWN -> REPORT_SYMPTOM (${allObservationsForPreAuth.size} observations present)`);
}
```

---

### BUG 4: Hypothesis Arbitration Not Blocking Contradictory Rules (P0)
**File**: `orchestrator.ts` lines 4723-4754
**Root Cause**: When hypothesis arbitration returns `CLARIFICATION_REQUIRED` (line 4723), the code says `// Don't return early - let existing clarification strategy handle it`. This means contradictory rules (smut, red rot, wilt, shoot borer all firing simultaneously) are NOT blocked by hypothesis scoping. The hypothesis layer is effectively bypassed when it demands clarification.

**Fix**: When hypothesis returns `CLARIFICATION_REQUIRED` AND has competing hypotheses, enforce scope to ONLY the top hypothesis's rules (not all rules). This prevents contradictory domains from all firing:
```
if (hypothesisResult.needs_clarification && hypothesisResult.decision_path === 'CLARIFICATION_REQUIRED') {
  console.log(`   🔄 Hypothesis arbitration needs clarification: ${hypothesisResult.clarification_reason}`);
  
  // CRITICAL: Even during clarification, scope rules to top hypothesis to prevent rule explosion
  if (hypothesisResult.best_hypothesis?.mapped_rule_ids?.length > 0) {
    hypothesisRuleScope = hypothesisResult.best_hypothesis.mapped_rule_ids;
    console.log(`   🎯 [ClarificationScope] Restricting to top hypothesis rules to prevent explosion`);
  }
}
```

---

### BUG 5: Synthetic Observation Inflation (P1)
**File**: `orchestrator.ts` lines 3077-3139
**Root Cause**: When observations are empty but land context exists, the system injects fallback symptoms from intent mapping (line 3138). These INFERRED/SYNTHETIC observations then trigger the biotic indicator detector, terminal damage gate, and cross-crop mapper, inflating the observation set. The observation authority system exists (`observation-authority.ts`) but the rule evaluator does NOT filter by authority level.

**Fix**: In the layered rule evaluator, when counting matched observations for scoring, only count CONFIRMED and EXTRACTED authority observations. Add authority-aware filtering:

In `orchestrator.ts`, before passing observations to rule evaluator, tag synthetic ones:
```
// Before rule evaluation, separate confirmed vs synthetic observations
const confirmedObservations = authoredObservations.getByAuthority(
  ObservationAuthority.CONFIRMED, ObservationAuthority.EXTRACTED
);
const syntheticObservations = authoredObservations.getByAuthority(
  ObservationAuthority.INFERRED, ObservationAuthority.SYNTHETIC
);

// Pass authority metadata into canonical state for rule evaluator
canonicalState.confirmed_observations = confirmedObservations;
canonicalState.synthetic_observations = syntheticObservations;
```

In `layered-rule-evaluator.ts`, use confirmed observations for primary scoring and only use full set for fallback:
```
// Use confirmed observations for primary scoring
const primarySymptoms = state.confirmed_observations?.length > 0 
  ? state.confirmed_observations 
  : state.visual_symptoms || [];
```

---

### BUG 6: Confidence Model Inconsistency (P0)
**Root Cause**: Two competing confidence systems produce contradictory scores:
- `ConfidenceCalculator` (Path B, symbolic reasoner) produces 95% aggregate
- Understanding completeness checker produces 53%
These are independent, unsynchronized systems. The SSOT `weighted_confidence` from the `LayeredRuleEvaluator` should be the sole authority.

**Fix**: Skip the `ConfidenceCalculator` entirely in the symbolic reasoner path. The SSOT `weighted_confidence` from `layered-rule-evaluator.ts` is already the authoritative confidence. Remove the redundant confidence calculation at line 4990-4997:
```
// REMOVED: Redundant confidence calculation
// The SSOT weighted_confidence from LayeredRuleEvaluator is authoritative
// ConfidenceCalculator was Path B (legacy) and conflicts with SSOT
// layeredRuleResult.confidence_in_result is already set by the evaluator
if (!layeredRuleResult.confidence_in_result && layeredRuleResult.primary_decision?.weighted_confidence) {
  layeredRuleResult.confidence_in_result = layeredRuleResult.primary_decision.weighted_confidence;
}
```

---

### BUG 7: HOW Section Shows When Actions = 0
**File**: LLM formatter / response construction
**Root Cause**: The response includes a HOW section even when `actions_returned = 0`. This is a formatting inconsistency.

**Fix**: In the LLM narration layer, add guard:
```
if (!decision.products || decision.products.length === 0) {
  // Remove HOW section entirely - no actions to recommend
  formattedResponse = formattedResponse.replace(/HOW:[\s\S]*?((?=WHY:|$))/i, '');
}
```

---

## Files Modified (Summary)

1. **MODIFY**: `supabase/functions/ai-agriculture-chat/decision/confidence-calculator.ts` -- Add null safety to `calculateDataQuality` and `calculateDataFreshness`
2. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` -- Fix ConfidenceCalculator call signature (Bug 1), add intent UNKNOWN guard for Phase 2.7 (Bug 3), enforce hypothesis scope during clarification (Bug 4), separate confirmed vs synthetic observations (Bug 5), remove redundant confidence calculation (Bug 6)
3. **MODIFY**: `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` -- Add rule deduplication for matched_responses (Bug 2), authority-aware symptom filtering (Bug 5)
4. **DEPLOY**: Redeploy `ai-agriculture-chat` edge function
