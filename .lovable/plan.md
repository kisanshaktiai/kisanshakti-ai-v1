

# Deep Audit: Symbolic Decision Brain -- Critical Bugs and Implementation Plan

## Audit Summary

After analyzing the uploaded reference document against the actual codebase, database schema, live data, and edge function logs, I identified **4 critical bugs** and **2 architectural improvements** needed. The uploaded document proposes a good diagnostic hierarchy concept but its implementation approach (new frontend services, direct OpenAI calls, `VITE_OPENAI_API_KEY`) is incompatible with the existing architecture. Instead, I will adapt its core ideas into the existing edge function pipeline.

---

## CRITICAL BUG 1: Rule Engine Matches Nutrition Rules on Pest Symptoms (The Zinc-Dead Heart Bug)

**Severity:** P0 -- Agronomically dangerous misdiagnosis

**Root Cause:** The `symbolic-reasoner.ts` `evaluateConditionsJson()` method (line 540-727) uses a **50% threshold** (`score >= 0.5`) for flat conditions matching. A nutrition rule like `SC_MICRO_ZN_DEFICIENCY_URGENT_001` with conditions `{soil_zn_ppm: <0.6}` has **only 1 condition** (a numeric threshold). Since:

1. The numeric condition `soil_zn_ppm: <0.6` is **skipped** (line 700: `typeof val === 'number' → continue`)
2. After skipping, `totalConditions === 0` and the rule falls through to line 708-714
3. With `totalConditions === 0`, the rule returns `{matches: true, confidence: 0.4}` ("Only contextual constraints")

This means **nutrition rules with only numeric/threshold conditions fire on ANY query**, regardless of symptoms. When a farmer reports "dead heart" (a pest symptom), BOTH the pest rule AND the zinc deficiency rule fire. If the zinc rule happens to have higher priority or the pest rule's observation conditions fail partial match, the farmer gets zinc treatment for a borer problem.

**The uploaded document's solution (pattern recognition + exclusion lists) is the right concept but needs to be implemented in the existing rule engine, not as new frontend services.**

**Fix (in `symbolic-reasoner.ts`):**

1. **Stop treating skipped conditions as "no conditions"**: When all conditions are numeric and get skipped, the rule should NOT match with 0.4 confidence. Change the fallback at line 708-714:
   - If `totalConditions === 0` but the original `conditions_json` has non-empty keys (excluding trigger_keywords), return `{matches: false}` instead of `{matches: true, confidence: 0.4}`

2. **Add category-based exclusion logic**: Before evaluating each rule, check if pest evidence exists in the observations. If `hasPestEvidence === true` and `rule.category === 'nutrition'`, skip the rule entirely. This implements the uploaded document's core fix without new tables.

3. **Add pest evidence detection**: Create a helper that checks if any observation in `SymbolicFact.primary_symptom` or the observations set matches known pest indicators (`DEAD_HEART`, `BORE_HOLES`, `FRASS`, `LARVAE`, `STEM_BORING_MARKS`).

---

## CRITICAL BUG 2: `primary_symptom` in SymbolicFact is Single-Valued but Multiple Observations Exist

**Severity:** P0 -- Only first observation reaches rule matching

**Root Cause:** In `fact-extractor.ts` line 110, `primary_symptom` is set to a single value:
```
const primarySymptom = canonicalState.visual_symptom || observation?.primary_symptom || 'UNKNOWN';
```

But the orchestrator collects MULTIPLE observations in `allObservationsForPreAuth` (a Set of 1-10 canonical codes). The rule engine's `evaluateConditionsJson` only checks `facts.primary_symptom` against `conditions_json.observations[]`. If the farmer reports `[DEAD_HEART_PRESENT, BORE_HOLES_AT_BASE, FRASS_VISIBLE]`, only the FIRST observation becomes `primary_symptom`. The rule `SC_PEST_EARLY_SHOOT_BORER_005` requires `observations: [BORE_HOLES_AT_BASE, FRASS_IN_TUNNEL, DEAD_HEART]` -- it checks if `primary_symptom` contains ANY of these, but misses the others.

**Fix (in `fact-extractor.ts` and `symbolic-reasoner.ts`):**

1. Add an `all_observations: string[]` field to `SymbolicFact` interface
2. In `FactExtractor.extractFacts()`, accept the full observations array and populate `all_observations`
3. In `evaluateConditionsJson()`, match rule observations against ALL observations, not just `primary_symptom`

---

## CRITICAL BUG 3: Numeric/Threshold Conditions Are Completely Ignored

**Severity:** P0 -- Soil-based rules never properly evaluate

**Root Cause:** In `symbolic-reasoner.ts` line 700:
```
if (typeof val === 'number') {
  continue; // Numeric conditions - skip gracefully for now
}
```

Rules like `SC_MICRO_ZN_DEFICIENCY_URGENT_001` have `{soil_zn_ppm: <0.6}`. This is stored as a string `"<0.6"` in some rules and as a number in others. The string version `"<0.6"` falls into the string matching path (line 682-691), where it tries to match `"<0.6"` against the farmer's symptom text -- which obviously never matches. The numeric version is simply skipped.

This means ALL soil-based nutrition rules either: (a) match everything with 0.4 confidence, or (b) never match at all. Neither is correct.

**Fix (in `symbolic-reasoner.ts`):**

1. Add a numeric threshold evaluator for string conditions like `"<0.6"`, `">5.0"`, `">=3"`:
   - Parse the operator and value from the string
   - Look up the corresponding fact value (e.g., `soil_zn_ppm` maps to `facts.soil_ph` or a soil nutrient value)
   - Evaluate the comparison
2. Add a mapping from condition keys to SymbolicFact fields for soil nutrients:
   ```
   soil_zn_ppm -> (not in SymbolicFact yet, needs addition)
   soil_ph -> facts.soil_ph
   applied_n_kg_ha -> (contextual, skip)
   ```

---

## CRITICAL BUG 4: No Diagnostic Category Priority in Rule Selection

**Severity:** P1 -- Pest and nutrition rules compete equally

**Root Cause:** When multiple rules fire, `symbolic-reasoner.ts` line 320 sorts only by `priority` (line 320: `firedRules.sort((a, b) => b.priority - a.priority)`). Both pest and nutrition rules can have `priority: 10`. There is no agronomic hierarchy (Pest > Disease > Water > Nutrition) as the uploaded document correctly identifies.

The `decision_rules` table does NOT have `diagnostic_category_priority`, `symptom_pattern_expected`, or `excludes_if_observations` columns (confirmed by schema query -- these columns don't exist).

**Fix (in `symbolic-reasoner.ts`):**

1. Add a hardcoded category priority map (no DB migration needed):
   ```
   CATEGORY_PRIORITY = { pest: 1, disease: 2, ipm: 2, water_stress: 3, stress: 3, nutrition: 4 }
   ```
2. Update the sorting at line 320 to use category priority as primary sort, then rule priority as secondary:
   ```
   firedRules.sort((a, b) => {
     const catA = CATEGORY_PRIORITY[a.category] || 3;
     const catB = CATEGORY_PRIORITY[b.category] || 3;
     if (catA !== catB) return catA - catB; // Lower = higher priority
     return b.priority - a.priority;
   });
   ```

---

## Improvement 1: Add Pest Evidence Detection to SymbolicFact

Add a computed boolean `has_pest_evidence` to `SymbolicFact` based on whether any observations match known pest indicators. This is the equivalent of the uploaded document's `PatternRecognitionService` but implemented inside the existing pipeline.

**Implementation in `fact-extractor.ts`:**
```
const PEST_INDICATORS = new Set([
  'DEAD_HEART_PRESENT', 'DEAD_HEART', 'STEM_BORING_MARKS', 'BORE_HOLES_AT_BASE',
  'BORE_HOLES_VISIBLE', 'FRASS_VISIBLE', 'FRASS_IN_TUNNEL', 'LARVAE_PRESENT',
  'INSECTS_VISIBLE', 'HONEYDEW_PRESENT', 'SMALL_INSECTS_VISIBLE'
]);
has_pest_evidence = allObservations.some(obs => PEST_INDICATORS.has(obs));
```

---

## Improvement 2: Add Diagnostic Hierarchy System Prompt to LLM Formatter

The uploaded document's `AGRICULTURAL_DIAGNOSTIC_SYSTEM_PROMPT` contains valuable agronomic reasoning constraints. Rather than creating new frontend services, inject the key diagnostic hierarchy rules into the existing `buildFormattingSystemPrompt()` in `llm-response-formatter.ts`.

Add after the existing FORBIDDEN section:
```
DIAGNOSTIC HIERARCHY (CRITICAL):
1. If pest evidence exists (dead heart, bore holes, frass) -> ONLY discuss pest treatment
2. NEVER recommend fertilizer when pest symptoms are present
3. Dead heart = Shoot Borer (95%), NOT zinc deficiency
4. White bands on leaves = Zinc deficiency, NOT pest
5. Patchy damage = Biotic (pest/disease), Uniform damage = Abiotic (nutrition/water)
```

---

## What NOT to Implement from the Uploaded Document

The uploaded document proposes:
- New frontend files (`src/services/patternRecognition.ts`, `src/services/ruleFilter.ts`, `src/services/aiDiagnostic.ts`) -- These duplicate existing edge function logic and violate the architecture (no direct OpenAI calls from frontend)
- New React hooks (`src/hooks/useDiagnosis.ts`) -- The existing chat interface already handles diagnostic flows
- `VITE_OPENAI_API_KEY` -- Keys must stay server-side
- New DB columns (`suggests_pattern`, `suggests_category`, `priority_route`, `diagnostic_category_priority`, `excludes_if_observations`) -- These are good concepts but can be implemented in code without schema changes, keeping the system simpler

---

## Implementation Plan

### File 1: `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts`

**Change A (Bug 1 + Bug 4):** Add category-based exclusion and priority sorting

1. Add a `CATEGORY_PRIORITY` map and `PEST_INDICATOR_CODES` set as constants
2. Before evaluating each rule (line 238), check: if pest indicators exist in the observations AND rule.category === 'nutrition', skip the rule and log exclusion
3. Update sorting (line 320) to use category priority as primary sort key

**Change B (Bug 3):** Add numeric threshold evaluation

1. Replace the `continue` at line 700 with a proper numeric evaluator
2. Add string-encoded threshold parsing (e.g., `"<0.6"` -> operator `<`, value `0.6`)
3. Add a `CONDITION_TO_FACT` mapping for soil nutrient keys

**Change C (Bug 1 fallback fix):** Fix false-positive matching for skipped conditions

1. At line 708-714, when `totalConditions === 0` but `Object.keys(cond)` has entries beyond trigger_keywords, return `matches: false` instead of `matches: true, confidence: 0.4`

### File 2: `supabase/functions/ai-agriculture-chat/decision/fact-extractor.ts`

**Change D (Bug 2):** Add `all_observations` array to SymbolicFact

1. Add `all_observations: string[]` and `has_pest_evidence: boolean` to `SymbolicFact` interface
2. Update `extractFacts()` to accept an `allObservations: string[]` parameter
3. Populate `has_pest_evidence` using the pest indicator set

### File 3: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

**Change E:** Pass all observations to FactExtractor

1. Where `FactExtractor.extractFacts()` is called, pass the `allObservationsForPreAuth` array so the full observation set reaches rule evaluation

### File 4: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`

**Change F (Improvement 2):** Add diagnostic hierarchy to LLM system prompt

1. In `buildFormattingSystemPrompt()`, add the diagnostic hierarchy constraints after the FORBIDDEN section
2. Add: "If pest evidence present, NEVER mention fertilizer. Dead heart = Shoot Borer, NOT zinc."

---

## Risk Assessment

| Fix | Impact | Risk | Notes |
|-----|--------|------|-------|
| Bug 1 (pest exclusion) | Critical | Medium | Must verify no legitimate nutrition rules are blocked |
| Bug 2 (all_observations) | Critical | Low | Additive field, no existing logic changed |
| Bug 3 (numeric eval) | Critical | Medium | Must handle all condition string formats |
| Bug 4 (category priority) | High | Low | Additive sorting, no rules removed |
| Improvement 1 (pest evidence) | High | Low | Computed boolean, no side effects |
| Improvement 2 (LLM prompt) | Medium | Low | Additive prompt text |

## Files Modified

1. `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts` (Bugs 1, 3, 4)
2. `supabase/functions/ai-agriculture-chat/decision/fact-extractor.ts` (Bug 2, Improvement 1)
3. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (Bug 2 plumbing)
4. `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` (Improvement 2)

