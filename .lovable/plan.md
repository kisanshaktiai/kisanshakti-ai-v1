

# Fix: Wrong Observation Codes in Clarification Options

## Root Cause Analysis

The clarification UI shows garbage like "🔍 ZINC DEFICIENCY CAUSES CHLOROS" and "🔍 EXCESS ZINC CAUSES ROOT INJURY" because of a data quality + code logic bug:

### Problem 1: Bad Synthetic Observation Keys (Code Bug)
In `hypothesis-evaluator.ts` (lines 744-756), when a rule has **empty `observable_characteristics`** AND no `conditions_json.observations`, the evaluator generates synthetic observation keys from the `cause` field:
```
causeKey = rule.cause.toUpperCase().replace(/[\s-]+/g, '_').substring(0, 30)
```
This turns `"Zinc deficiency causes chlorosis, reduced tillering and yield loss"` into `ZINC_DEFICIENCY_CAUSES_CHLOROS` — a nonsense code that doesn't exist in any DB table.

### Problem 2: 96 Rules with Sentence-Style `cause` + Empty `observable_characteristics`
Rules like `SC_MICRO_ZN_DEFICIENCY_URGENT_001` have:
- `cause` = full sentences (e.g., "Zinc deficiency causes chlorosis, reduced tillering and yield loss")
- `observable_characteristics` = `{}` (empty)
- `conditions_json` likely also lacks `observations` array

These rules were designed as advisory/safety rules, NOT diagnostic hypotheses — but they get picked up by the hypothesis evaluator anyway.

### Problem 3: Missing Translation Fallback
When `translateClarificationOptions()` encounters these synthetic codes, it can't find them in `observation_translations` (because they don't exist), so it falls back to the raw uppercase code — displayed to farmers.

## Fix Plan

### Fix 1: Filter out rules with empty observable data from hypothesis candidates
In `hypothesis-evaluator.ts`, instead of generating synthetic observations from `cause` field, **skip rules that have no observable evidence** (empty `observable_characteristics` AND no `conditions_json.observations`). These are advisory rules, not diagnostic hypotheses.

**File**: `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`
- Lines 730-759: Replace the synthetic observation generation from `cause` field with a `continue` statement
- Keep the extraction from `conditions_json.observations` (that path is valid)

### Fix 2: Add safety guard in diagnosis-first-generator
In `diagnosis-first-generator.ts`, add a validation step that rejects hypotheses whose `observation_key` doesn't exist in `observation_master` or `observation_translations`.

**File**: `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts`
- After line 340 (building diagnoses), filter out hypotheses with synthetic/invalid observation keys

### Fix 3: Fix 96 rules with sentence-style `cause` field (DB migration)
Update the `cause` field to be a short cause name (not a sentence) for the 96 affected rules. This is a data quality fix.

**Migration**: Normalize `cause` to short names where `LENGTH(cause) > 40` and `observable_characteristics` is empty.

### Fix 4: Populate `observable_characteristics` for nutrition/soil rules
For rules like `SC_MICRO_ZN_DEFICIENCY_URGENT_001`, add proper observation codes (e.g., `["INTERVEINAL_CHLOROSIS", "LEAF_YELLOWING"]`) so they can participate in diagnosis when genuinely relevant.

## Implementation Order
1. **Fix 1** (code) — Immediate: Stop generating synthetic observation keys from `cause`
2. **Fix 2** (code) — Safety net: Validate observation keys before displaying
3. **Fix 3** (DB) — Normalize 96 sentence-style `cause` fields
4. **Fix 4** (DB) — Populate `observable_characteristics` for key nutrition rules

## Impact
- Eliminates raw English codes in farmer-facing Marathi/Hindi UI
- Ensures only valid, translatable observation keys reach the frontend
- Improves hypothesis quality by excluding non-diagnostic rules

