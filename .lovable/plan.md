

# Fix Plan: GROWTH_ANOMALY Pipeline + STAGE_GENERAL Rule Matching

## Root Cause (Verified via DB Queries)

The entire SUGARCANE rule set (459 rules) has `condition_code = 'STAGE_GENERAL'`. The symptom data the farmer reports (e.g., `POOR_TILLERING`, `STUNTED_PLANTS`, `SLOW_GROWTH`) exists in the `observable_characteristics` column. But the actual matching path in `evaluateConditionsJson()` (loader.ts) only evaluates `conditions_json.observations` — which contains **diagnostic-level** codes (e.g., `ORANGE_RED_DOTS_AT_NODES`, `THIN_CANES`) that differ from what the NLU extracts.

Example: Rule `SC_DISEASE_RATOON_STUNTING_001`:
- `observable_characteristics`: `["POOR_TILLERING", "STUNTED_PLANTS", "LEAF_YELLOWING", "SLOW_GROWTH"]` ← matches farmer symptoms
- `conditions_json.observations`: `["STUNTED_GROWTH", "THIN_CANES", "POOR_RATOONING", "ORANGE_RED_DOTS_AT_NODES"]` ← does NOT match farmer symptoms

Additionally, many rules have required boolean conditions (`soil_phosphorus: "low"`, `ndvi_trend: "stable"`) that FAIL because the data is UNKNOWN/missing, which makes the strict fail-closed ledger reject them.

## Fixes (4 Code Changes, 0 DB Migrations)

### Fix 1: Add observable_characteristics matching to `makeExecutable()` in `loader.ts`

In `loader.ts`, the `makeExecutable` function (line 933-944) only calls `evaluateConditionsJson(rule.conditions_json, ...)`. We need to add a second matching path that checks `observable_characteristics` when `conditions_json` matching fails.

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` (~line 933)

Add after `evaluateConditionsJson` call: if it returns false AND `observable_characteristics` is a non-empty array, check if ANY farmer observation appears in that array. If so, return true (soft match) and populate the condition ledger with PASSED entries for matched observations.

### Fix 2: Expand `evaluateConditionsJson()` observation matching in `loader.ts`

In `evaluateConditionsJson` (line 732-765), the `observations` key matching is strict — it requires exact matches between `conditions_json.observations` and input symptoms. But the NLU extracts farmer-facing codes like `POOR_TILLERING` while the DB stores diagnostic codes like `POOR_RATOONING`.

Add fuzzy/partial matching: if a farmer symptom shares a root word (e.g., `STUNTED_PLANTS` ↔ `STUNTED_GROWTH`), count it as a partial match. Also, add `observable_characteristics` as a secondary observations source when the primary match fails.

### Fix 3: Use `data_authority_rank` in primary decision scoring in `layered-rule-evaluator.ts`

In `layered-rule-evaluator.ts` (line 740-744), the scoring sort only uses `evidenceScore` then `confidence_score`. Add `data_authority_rank` as a tiebreaker factor.

**File:** `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` (~line 740)

Replace sort with: authority_rank DESC → evidenceScore DESC → priority DESC → confidence_score DESC.

### Fix 4: Add pipeline health monitoring in orchestrator

After rule evaluation in orchestrator.ts (~line 4774), log a warning when `rules_matched === 0` but `visual_symptoms.length > 3`, including all symptom codes and the crop/stage so we can catch future mismatches.

## Technical Details

### Fix 1 Implementation (loader.ts `makeExecutable`)

```typescript
function makeExecutable(rule: BundledRule): ExecutableRule {
  return {
    ...rule,
    conditions: (input: DecisionInput) => {
      // Primary path: evaluate conditions_json
      if (rule.conditions_json && Object.keys(rule.conditions_json).length > 0) {
        const result = evaluateConditionsJson(rule.conditions_json, input, rule.rule_id);
        if (result) return true;
      }

      // Secondary path: match observable_characteristics when conditions_json fails
      // This handles STAGE_GENERAL rules whose conditions_json has unmatched diagnostic codes
      // but observable_characteristics has farmer-facing symptom codes
      const obsChars = rule.observable_characteristics;
      if (obsChars && Array.isArray(obsChars) && obsChars.length > 0) {
        const inputSymptoms = (input.visual_symptoms || []).map(s =>
          s.toUpperCase().replace(/[\s-]/g, '_')
        );
        if (inputSymptoms.length > 0) {
          const obsSet = new Set(obsChars.map(o => String(o).toUpperCase().replace(/[\s-]/g, '_')));
          const matched: string[] = [];
          for (const sym of inputSymptoms) {
            for (const obs of obsSet) {
              if (sym === obs || sym.includes(obs) || obs.includes(sym)) {
                matched.push(obs);
                break;
              }
            }
          }
          if (matched.length > 0) {
            // Populate ledger for scoring
            const ledger = matched.map(m => ({
              key: m, status: ConditionStatus.PASSED, required: false, ruleValue: m
            }));
            conditionLedgerCache.set(rule.rule_id, ledger);
            console.log(`✅ [ObsChars] Rule ${rule.rule_id} matched ${matched.length}/${obsChars.length} via observable_characteristics`);
            return true;
          }
        }
      }

      // Rules with NO conditions_json AND NO observable_characteristics should NOT auto-match
      return false;
    }
  };
}
```

### Fix 2 Implementation (loader.ts `evaluateConditionsJson` observations section)

At line 748-762, enhance the observation matching to also check partial/root matches:

```typescript
// Enhanced matching: partial root matching for related codes
const obsMatch = obsList.some((obs: string) => {
  const obsUpper = String(obs).toUpperCase().replace(/[\s-]/g, '_');
  for (const inputObs of expandedObs) {
    if (inputObs === obsUpper || inputObs.includes(obsUpper) || obsUpper.includes(inputObs)) return true;
    // Root word matching: STUNTED_PLANTS ↔ STUNTED_GROWTH (share 'STUNTED')
    const obsWords = obsUpper.split('_');
    const inputWords = inputObs.split('_');
    const sharedWords = obsWords.filter(w => inputWords.includes(w) && w.length > 3);
    if (sharedWords.length > 0) return true;
  }
  return false;
});
```

### Fix 3 Implementation (layered-rule-evaluator.ts scoring sort)

Replace lines 740-744:

```typescript
scored.sort((a, b) => {
  // P1: data_authority_rank (higher = better)
  const rankA = (a.response as any).data_authority_rank ?? 50;
  const rankB = (b.response as any).data_authority_rank ?? 50;
  if (rankA !== rankB) return rankB - rankA;
  // P2: evidence score
  if (a.evidenceScore !== b.evidenceScore) return b.evidenceScore - a.evidenceScore;
  // P3: priority
  const priA = a.response.priority ?? 50;
  const priB = b.response.priority ?? 50;
  if (priA !== priB) return priB - priA;
  // P4: confidence_score
  return (b.response.confidence_score ?? 0) - (a.response.confidence_score ?? 0);
});
```

## Deployment

Deploy `ai-agriculture-chat` edge function after all 4 fixes. Test with Marathi query: "फुट कमी पडतायत, वाढ नीट होत नाहीये. काय टाकू?"

Expected: `rules_matched >= 1`, `primary_decision != null`, `session_decision_state = 'recommendations_given'`.

