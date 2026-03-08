

# Fix: Old Contaminated Responses Still Showing — Root Cause & Plan

## Critical Finding: Database-Level Chemical Contamination

**Confirmed via direct DB query:**

| rule_id | active_ingredient | dosage_per_acre |
|---------|-------------------|-----------------|
| `SC_PEST_TOP_BORER_004` | Chlorpyrifos 20% EC | **Fipronil** 5% SC @ 300ml/acre in 200L water |
| `SC_DISEASE_SMUT_004` | Propiconazole 25% EC | **Triadimefon** 25% WP @ 200g/acre in 200L water |

These are **wrong data in the database** — the `dosage_per_acre` column contains a completely different chemical than `active_ingredient`. The integrity validator correctly detects and nullifies the dosage, but this means the farmer gets **no dosage at all** — an incomplete response.

## Code-Level Bugs Found

### Bug 1 (P0): `buildFormattedRecommendationsList` bypasses all validation
**File**: `index.ts` lines 3149-3153

This fallback (used when LLM fails or validation fails) reads **raw** `application_details` without running `extractRichRuleData` or `validateRuleIntegrity`:

```
const rawProductName = primary.application_details?.product_name || '';
const dosage = primary.application_details?.concentration || '';
```

If this path is ever hit, contaminated data reaches the farmer directly.

### Bug 2 (P1): Template fallback skips `sanitizeFarmerResponse`
**File**: `llm-response-formatter.ts` lines 1985-1996

The template fallback returns `deterministicText` directly without calling `sanitizeFarmerResponse`. English structural labels like `═══ 🎯 PROBLEM EXPLANATION ═══` can leak to the farmer.

### Bug 3 (P1): `sanitizeFarmerResponse` not called on index.ts fallback paths
**File**: `index.ts` lines 1326, 1345

When `buildFormattedRecommendationsList` is used as fallback (2 call sites), no sanitization runs before the text is saved to DB and returned.

## Implementation Plan

### Step 1: Fix Database Contamination
Run SQL migration to correct the two contaminated rules:
- `SC_PEST_TOP_BORER_004`: Set `dosage_per_acre` to the correct Chlorpyrifos dosage ("2.5 ml per liter water" or "500 ml per acre in 200L water")
- `SC_DISEASE_SMUT_004`: Set `dosage_per_acre` to the correct Propiconazole dosage ("200 ml per acre in 200L water")

### Step 2: Add validation to `buildFormattedRecommendationsList`
**File**: `index.ts`

Import `extractRichRuleData` and `validateRuleIntegrity`. Before using `application_details` fields, run validation:
```
const appDetails = primary.application_details || {};
const richData = extractRichRuleData(primary, appDetails);
// Use richData.active_ingredient instead of appDetails.product_name
// Use richData.dosage_per_acre instead of appDetails.concentration
```

### Step 3: Apply `sanitizeFarmerResponse` to template fallback
**File**: `llm-response-formatter.ts`

In the template fallback return (line 1986), sanitize before returning:
```
formatted_response: sanitizeFarmerResponse(deterministicText),
```

### Step 4: Apply `sanitizeFarmerResponse` to index.ts fallback paths
**File**: `index.ts`

Import `sanitizeFarmerResponse` from `llm-response-formatter.ts` (export it first). Apply at lines 1326 and 1345 after `buildFormattedRecommendationsList` calls.

## Files to Modify

| Action | File | Change |
|--------|------|--------|
| **Migrate** | Database | Fix 2 contaminated `dosage_per_acre` values |
| **Modify** | `index.ts` | Add validation to `buildFormattedRecommendationsList`, apply sanitization to fallback paths |
| **Modify** | `llm-response-formatter.ts` | Export `sanitizeFarmerResponse`, apply to template fallback return |

## What This Does NOT Change
- Symbolic decision engine (untouched)
- `extractRichRuleData` / `validateRuleIntegrity` (already working correctly)
- Frontend components (no changes)
- Canonical advisory schema (already fixed)

