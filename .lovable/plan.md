
# Observation Layer Architecture Integration

## Summary

The database has been updated with 5 architectural changes that the codebase does NOT currently use:

1. **`canonical_group_mapping` table** (29 rows) - Bridges biological groups (`observation_master.canonical_group`) to engine groups (`decision_rules.canonical_group`)
2. **`decision_rules.required_observation_category`** column (TEXT[]) - Already populated (~335 rules)
3. **`decision_rules.required_plant_part`** column (TEXT[]) - Already populated (~73 rules)
4. **`observation_master.is_diagnostic`** flag - Updated (66 diagnostic observations, 10.9% coverage)
5. **`v_missing_translations` view** - For monitoring translation gaps

The codebase currently ignores all 5. The symbolic reasoner and hypothesis evaluator load rules by crop_code + stage only, with no category/plant-part pre-filtering and no ontology bridge. This causes candidate explosion and false-positive rule matches.

---

## Changes Required

### Change 1: Add `required_observation_category` and `required_plant_part` to BundledRule type

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts`

Add two new optional fields to the `BundledRule` interface:
- `required_observation_category?: string[]`
- `required_plant_part?: string[]`

### Change 2: Load new columns from database in rule loader

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

In the `loadRulesFromDatabase()` function (line ~91), the rule mapping already does `select('*')` so the columns are loaded. However, the mapper (lines 190-256) does NOT pass them through to the `BundledRule` object. Add:
```
required_observation_category: row.required_observation_category || null,
required_plant_part: row.required_plant_part || null,
```

### Change 3: Add ontology bridge + category/plant-part pre-filter to SymbolicReasoner

**File:** `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts`

This is the core change. In the `loadRulesForContext()` method (line 537), the system currently loads rules only by `crop_code` + `stage`. After loading, add:

1. **Load observation metadata from `observation_master`** for the current `facts.all_observations`:
   - Query `observation_master` for `observation_category`, `affected_plant_part`, `canonical_group`, `is_diagnostic`
   - Cache results (same TTL as rules)

2. **Ontology bridge**: Use `canonical_group_mapping` to resolve `observation_master.canonical_group` (biological, e.g., `PEST_BORER`) to `decision_rules.canonical_group` (engine, e.g., `03_pest`). This narrows candidate rules.

3. **Category filter**: After loading candidate rules, filter using:
   ```
   if (rule.required_observation_category && rule.required_observation_category.length > 0) {
     const obsCategories = observationMetadata.map(o => o.observation_category);
     const hasMatch = obsCategories.some(cat => 
       rule.required_observation_category.includes(cat)
     );
     if (!hasMatch) skip rule;
   }
   ```

4. **Plant part filter with WHOLE wildcard**:
   ```
   if (rule.required_plant_part && rule.required_plant_part.length > 0) {
     const obsParts = observationMetadata.map(o => o.affected_plant_part);
     const hasMatch = obsParts.some(part => 
       part === 'WHOLE' ||
       rule.required_plant_part.includes(part) ||
       rule.required_plant_part.includes('WHOLE')
     );
     if (!hasMatch) skip rule;
   }
   ```

5. **Diagnostic confidence boost (multiplicative)**: In `evaluateConditionsJson`, if any matched observation has `is_diagnostic = true` in `observation_master`, apply a 1.4x confidence multiplier (capped at 1.0).

### Change 4: Add ontology bridge to HypothesisEvaluator

**File:** `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`

In `evaluateCandidateHypotheses()` (line 461):
1. Load `observation_master` metadata for `input.known_observations`
2. Use `canonical_group_mapping` to resolve biological groups to engine groups
3. Add the `required_observation_category` and `required_plant_part` columns to the SELECT query (line 501)
4. Apply category + plant-part pre-filtering before scoring (between steps 1.6 and 2)
5. Replace hardcoded `getDiagnosticPower()` function (lines 319-343) with a lookup against `observation_master.is_diagnostic`
6. Log candidate explosion warning if count exceeds 25

### Change 5: Update ConditionLedger evaluator in loader.ts

**File:** `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

The `evaluateConditionsJson()` function (line 543) does not use `required_observation_category` or `required_plant_part` because those are rule-level filters, not condition-level. No change needed here - the filtering happens at rule selection time (Change 3 and 4).

### Change 6: Add observation metadata cache

**File:** `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts`

Add a new helper method to `SymbolicReasoner`:
```
private observationMetadataCache = new Map<string, any>();

private async loadObservationMetadata(observationCodes: string[]): Promise<Map<string, any>> {
  // Check cache, query observation_master + canonical_group_mapping join, cache result
}
```

This method:
1. Queries `observation_master` for `observation_category`, `affected_plant_part`, `canonical_group`, `is_diagnostic`
2. Joins with `canonical_group_mapping` to get `engine_group` and `confidence`
3. Returns a Map keyed by observation_code
4. Uses in-memory cache with 5-min TTL (same as rule cache)

### Change 7: Remove hardcoded `trigger_keywords` matching from hypothesis evaluator

**File:** `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`

Lines 228-238 still check `conditions_json.trigger_keywords`. Per the architecture audit, `trigger_keywords` column was DROPPED. Remove this block from `evaluatePartialConditionMatch()`.

---

## Technical Details

### New observation metadata flow

```text
Farmer input
  -> NLU extracts observation codes (e.g., BORE_HOLES, LEAF_YELLOWING)
  -> Load observation_master metadata:
       BORE_HOLES: category=PEST, plant_part=STEM, canonical_group=PEST_BORER, is_diagnostic=true
       LEAF_YELLOWING: category=PHYSIOLOGY, plant_part=LEAF, canonical_group=PHYSIOLOGY_LEAF, is_diagnostic=false
  -> Ontology bridge (canonical_group_mapping):
       PEST_BORER -> 03_pest (confidence=1.0)
       PHYSIOLOGY_LEAF -> 07_diagnosis (confidence=0.7)
  -> Load decision_rules WHERE canonical_group IN ('03_pest', '07_diagnosis')
  -> Pre-filter by required_observation_category (PEST matches rules with required_observation_category containing 'PEST')
  -> Pre-filter by required_plant_part (STEM matches rules with required_plant_part containing 'STEM' or 'WHOLE')
  -> Evaluate conditions_json as before (ledger system unchanged)
  -> Apply diagnostic confidence boost: BORE_HOLES is_diagnostic=true -> 1.4x multiplier
```

### Candidate explosion prevention

After ontology bridge + category + plant-part filtering, log a warning if candidate count exceeds 25. This catches rules that need tighter `required_observation_category` or `required_plant_part` constraints.

### Files changed (7 total)

1. `supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts` - Add 2 fields to BundledRule
2. `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` - Pass through new columns
3. `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts` - Ontology bridge + filters + diagnostic boost
4. `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` - Ontology bridge + filters + remove trigger_keywords
5. `supabase/functions/ai-agriculture-chat/decision/confidence-calculator.ts` - Use is_diagnostic for confidence scoring

### No changes to

- Database tables (already migrated)
- Frontend code
- Translation layer
- Narration/LLM layer
