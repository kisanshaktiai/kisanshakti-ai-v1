

# Fix Cross-Rule Data Contamination — Implementation Plan

## Root Cause Analysis

Three contamination vectors identified:

### Vector 1: `extractRichRuleData()` fallback chain (P0)
**File**: `deterministic-response-builder.ts` lines 1184-1242

The function uses `primaryDecision.X || appDetails.X` fallback patterns. The `appDetails` object is built from `primaryDecision.application_details`, which is safe when properly populated. However, in recovery paths (Priority 2/3/4 in index.ts lines 714-905), `appDetails` can be populated from `matched_responses` entries that may belong to a different rule than `primaryDecision.rule_id`. There is no rule_id consistency check.

### Vector 2: `buildRecommendationSummary()` secondary injection (P1)
**File**: `llm-response-formatter.ts` lines 1402-1410

Secondary actions' `product_name` and `dosage_per_acre` are appended to the LLM prompt alongside the primary rule's treatment data. The LLM can then merge/confuse these, producing "Product: Chlorpyrifos / Dosage: Fipronil 5% SC @ 300ml/acre".

### Vector 3: `buildCanonicalAdvisory()` secondary observations (P2)
**File**: `canonical-advisory-schema.ts` lines 195-201

Secondary decisions include `action_text` which can contain treatment instructions. While this appears in the `multi_rule` section (not `treatment`), the frontend or LLM could conflate them.

## Implementation Plan

### Step 1: Add Rule Integrity Validator to `deterministic-response-builder.ts`

Add a `validateRuleIntegrity()` function that:
- Checks that `active_ingredient` name appears in (or is consistent with) `dosage_per_acre` string
- Detects known chemical names in dosage that don't match `active_ingredient`
- Logs `RULE_INTEGRITY_ERROR` and nullifies mismatched dosage fields
- Logs `ADVISORY_BUILD` trace with `rule_id`, `active_ingredient`, `dosage_per_acre` every time

Add a list of common active ingredient names for cross-check detection.

### Step 2: Add rule_id consistency guard to `extractRichRuleData()`

**File**: `deterministic-response-builder.ts`

Before the function returns, add a guard:
- If `primaryDecision.rule_id` exists, ensure all treatment-critical fields (`active_ingredient`, `dosage_per_acre`, `chemical_class`, `mode_of_action`, `phi_days`, `reentry_interval_hours`, `bee_toxicity`, `aquatic_toxicity`) come from `primaryDecision` first. Only fall back to `appDetails` if the `appDetails.rule_id` matches `primaryDecision.rule_id`.
- For treatment fields specifically, NEVER fall through to `appDetails` if `appDetails.rule_id !== primaryDecision.rule_id`.

### Step 3: Strip treatment data from secondary actions in LLM prompt

**File**: `llm-response-formatter.ts` lines 1402-1410

Change the secondary actions block to only include:
- `action_type` and `reason` (contextual)
- `success_indicators` / monitoring advice
- Remove `product_name` and `dosage_per_acre` from secondary action prompt text

### Step 4: Strip treatment fields from secondary observations in canonical schema

**File**: `canonical-advisory-schema.ts`

In `buildMultiRuleAdvisory()` and `buildCanonicalAdvisory()`:
- Keep secondary observations' `cause`, `action_type`, `confidence`
- Replace `action_text` with a monitoring-only summary (strip any dosage/chemical mentions)
- Add a comment block enforcing the Rule Atomicity Principle

### Step 5: Add debug logging to `index.ts` canonical builder

**File**: `index.ts` lines 3641-3668

After `extractRichRuleData()`, log:
```
ADVISORY_BUILD | rule_id | active_ingredient | dosage_per_acre
```
If `active_ingredient` and `dosage_per_acre` contain different chemical names, log `CROSS_RULE_CONTAMINATION_DETECTED`.

### Step 6: Add chemical mismatch detection utility

Add a small utility function `detectChemicalMismatch(activeIngredient, dosageString)` that:
- Extracts known chemical names from the dosage string
- Compares against `activeIngredient`
- Returns `true` if mismatch detected
- Used in both the validator and debug logging

## Files to Modify

| File | Change |
|------|--------|
| `agents/deterministic-response-builder.ts` | Add `validateRuleIntegrity()`, add rule_id guard to `extractRichRuleData()`, add debug logging |
| `agents/llm-response-formatter.ts` | Strip `product_name`/`dosage_per_acre` from secondary actions in prompt |
| `agents/canonical-advisory-schema.ts` | Strip treatment data from secondary observations, add atomicity comments |
| `index.ts` | Add contamination detection logging at canonical advisory build point |

## What This Does NOT Change

- Symbolic decision engine (untouched)
- Rule evaluation logic (untouched)
- `buildDeterministicResponse()` core logic (already sources from single `RichRuleData`)
- Frontend components (no changes needed)
- Database schema (no changes)

