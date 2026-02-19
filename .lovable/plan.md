
# Fix: Neuro-Symbolic Decision Brain -- 8 Architectural Flaws

## Problem Summary

The current symbolic brain has several architectural violations that allow non-symptom-grounded decisions: NDVI-only rules fire without biotic evidence checks, the ObservationCodeMapper is English-only, the LLM_FAILSAFE bypasses symptom requirements, and there is no post-decision validation to catch misrouted pest queries being answered with irrigation/nutrition rules.

---

## Fix 1: NDVI Stress Rule Guard (symbolic-reasoner.ts)

**Problem**: NDVI rules (ndvi_level, ndvi_trend conditions) can fire even when the farmer reported pest symptoms like "bore holes." NDVI stress is an abiotic signal and must yield to biotic observations.

**Solution**: In `SymbolicReasoner.executeRules()`, before evaluating a rule's conditions_json, check if the rule is NDVI/abiotic-category AND pest/disease observation keys exist in `facts.all_observations`. If biotic evidence is present, skip the abiotic rule.

```text
Rule Guard Logic:
  IF rule.category in ['water_stress', 'irrigation', 'stress', 'ndvi']
    AND facts.has_pest_evidence == true
    OR facts.all_observations contains biotic keys (BORE_HOLES, DEAD_HEART, INSECT_PRESENCE, FRASS, etc.)
  THEN skip rule
  
  IF rule fires ONLY on ndvi_level/ndvi_trend conditions (no observation match)
    AND intent NOT in [WATER_STRESS_SIGNAL, IRRIGATION_QUERY]
  THEN skip rule
```

**File**: `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts` (lines ~255-320)

---

## Fix 2: Multilingual Agricultural Synonyms in ObservationCodeMapper (observation-code-mapper.ts)

**Problem**: `VISUAL_CHANGE_MAPPINGS` only contains English patterns. Romanized Marathi/Hindi like "valne" (wilting), "pivle" (yellowing), "chhidra" (holes) produce zero observation codes, causing the entire symbolic brain to fail.

**Solution**: Extend `VISUAL_CHANGE_MAPPINGS` array with multilingual patterns:

```text
Marathi additions:
  फुट कमी / fut kami -> STUNTED_PLANTS
  वाढ कमी / vadh kami -> STUNTED_PLANTS  
  वाळणे / valne -> LEAF_DRYING
  छिद्र / chhidra -> STEM_BORING_MARKS
  भोक / bhok -> STEM_BORING_MARKS
  करपा / karpa -> LEAF_SCORCHING
  पिवळे / pivle -> LEAF_YELLOWING

Hindi additions:
  फुट कम / phut kam -> STUNTED_PLANTS
  बढ़वार कम / badhwar kam -> STUNTED_PLANTS
  छेद / chhed -> STEM_BORING_MARKS
  पीला पड़ना / peela padna -> LEAF_YELLOWING

English additions:
  poor tillering -> STUNTED_PLANTS
  stunting -> STUNTED_PLANTS
  holes -> LEAF_CHEWING (already exists but reinforce)
  yellowing -> LEAF_YELLOWING (already exists)
```

**File**: `supabase/functions/ai-agriculture-chat/decision/observation-code-mapper.ts` (lines ~159-224)

---

## Fix 3: Zero-Code Clarification Gate (orchestrator.ts + observation-code-mapper.ts)

**Problem**: When ObservationCodeMapper returns zero observation codes, the orchestrator still proceeds to symbolic evaluation, leading to NDVI-only or empty rule matches.

**Solution**: 
1. After `mapToObservationCodes()` call in orchestrator, check `hasMeaningfulCodes()`. If false AND intent is symptom-based, force CLARIFICATION path.
2. The existing `hasMeaningfulCodes()` function already exists but is not used as a hard gate.

```text
Gate Logic in orchestrator.ts:
  mappedCodes = mapToObservationCodes(semanticExtraction)
  IF NOT hasMeaningfulCodes(mappedCodes)
    AND intent is symptom-based (not advisory)
    THEN force CLARIFICATION response
    DO NOT enter symbolic brain
```

**File**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (after mappedCodes assignment, before symbolic brain entry)

---

## Fix 4: Remove LLM_FAILSAFE Override (orchestrator.ts)

**Problem**: Lines 2516-2542 implement an `LLM_FAILSAFE` that artificially boosts `symbol_coverage` to 0.25 and `aggregated_confidence` to 0.4 when LLM fails but land context exists. This violates the symptom-grounding principle -- it forces the symbolic brain to run without any observations, leading to NDVI-only rule matches.

**Solution**: Replace `LLM_FAILSAFE` with a clarification-only path. When LLM fails, instead of boosting coverage to force symbolic evaluation, immediately generate a crop-stage-aware clarification question using existing `fetchRuleDrivenClarificationOptions()`.

```text
Before (REMOVE):
  if (llmFailed && hasLandContext) {
    inductionResult.symbol_coverage = 0.25  // ARTIFICIAL
    inductionResult.aggregated_confidence = 0.4  // ARTIFICIAL
    agentsUsed.push('LLM_FAILSAFE_OVERRIDE')
  }

After (REPLACE):
  if (llmFailed && hasLandContext) {
    // Force clarification with crop context, DO NOT enter symbolic brain
    shouldRunSymbolicBrain = false
    agentsUsed.push('LLM_FAILED_CLARIFICATION')
    // Generate clarification using crop/stage context
  }
```

**File**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (lines ~2516-2580)

---

## Fix 5: Authority Hierarchy Enforcement (symbolic-reasoner.ts)

**Problem**: The `CATEGORY_PRIORITY` in symbolic-reasoner.ts is `{pest:1, disease:2, ipm:2, water_stress:3, stress:3, irrigation:3, nutrition:4, general:5}` but is missing explicit SAFETY, BIOTIC, ABIOTIC, WEATHER, NDVI tiers. NDVI-only rules get the same priority as irrigation.

**Solution**: Extend CATEGORY_PRIORITY to enforce: SAFETY > BIOTIC(pest/disease) > ABIOTIC(nutrition/deficiency) > WEATHER > NDVI

```text
Updated CATEGORY_PRIORITY:
  safety: 0     (highest)
  pest: 1
  disease: 2
  ipm: 2
  nutrition: 4
  deficiency: 4
  water_stress: 5
  stress: 5
  irrigation: 5
  weather: 6
  ndvi: 7       (lowest -- never dominates)
  general: 8
```

**File**: `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts` (line ~396)

---

## Fix 6: ConfidenceCalculator Null Guards (confidence-calculator.ts)

**Problem**: `calculateRuleConfidence()` accesses `firedRules.length` and `diagnosis.supporting_rules.length` without null guards. If arrays are undefined, this crashes.

**Solution**: Add safe access patterns:

```text
// Before:
if (firedRules.length === 0)
const highPriorityRules = firedRules.filter(...)
if (diagnosis.supporting_rules.length > 1)

// After:
if (!firedRules || firedRules.length === 0)
const highPriorityRules = (firedRules || []).filter(...)
if (diagnosis?.supporting_rules?.length > 1)
```

**File**: `supabase/functions/ai-agriculture-chat/decision/confidence-calculator.ts` (lines ~173-198)

---

## Fix 7: Block Rule When hasObservations=false AND intent=UNKNOWN (orchestrator.ts)

**Problem**: The system can still enter symbolic evaluation with zero observations and UNKNOWN intent via various bypass paths.

**Solution**: Add a hard invariant gate before the symbolic brain entry point:

```text
IF allObservationsForPreAuth.size === 0
  AND (intentCode === 'UNKNOWN_OBSERVATION' OR intentCode === 'UNKNOWN')
  THEN shouldRunSymbolicBrain = false
  Force clarification response
```

**File**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (before symbolic brain entry)

---

## Fix 8: Remove "See action text" Placeholder + Post-Decision Validation (orchestrator.ts)

**Problem A**: `product_name: 'See action text'` (lines 1762, 1799) is a developer placeholder that leaks into farmer-facing UI.

**Solution A**: Replace with the actual product from rule metadata:
```text
product_name: rule.active_ingredient || rule.action_text?.split(' ')[1] || 'IPM'
```

**Problem B**: No post-decision validation catches misrouted queries. A farmer saying "bore holes in stem" might get an irrigation rule if NDVI happens to match first.

**Solution B**: Add a `validateDecisionAgainstSymptoms()` function that checks: if farmer's observations contain biotic keywords (BORE, HOLES, DEAD_HEART, INSECT, FRASS, WEBBING) but selected rule category is irrigation/nutrition/ndvi, BLOCK the decision and re-evaluate with biotic-only rules.

```text
Post-Decision Validation:
  BIOTIC_INDICATORS = Set(['BORE', 'HOLES', 'DEAD_HEART', 'INSECT', 'FRASS', 
                           'WEBBING', 'CHEWING', 'LARVAE', 'BORING'])
  
  IF any observation contains BIOTIC_INDICATOR
    AND selected_rule.category in ['irrigation', 'nutrition', 'ndvi', 'water_stress']
    THEN block decision
    Log: "MISROUTE DETECTED: biotic symptoms routed to abiotic rule"
    Re-evaluate with category filter = ['pest', 'disease'] only
```

**Files**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (primary decision construction + new validation function)

---

## Deployment

After all changes, redeploy `ai-agriculture-chat` edge function. The bundle was recently optimized so deployment should succeed within timeout.

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts` | NDVI guard, authority hierarchy |
| `supabase/functions/ai-agriculture-chat/decision/observation-code-mapper.ts` | Multilingual synonyms |
| `supabase/functions/ai-agriculture-chat/decision/confidence-calculator.ts` | Null guards |
| `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` | Zero-code gate, remove LLM_FAILSAFE, block UNKNOWN+no-obs, remove "See action text", post-decision validation |
