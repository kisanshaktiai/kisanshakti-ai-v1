

# 2030-Ready Global AI Agriculture Advisory Engine — Implementation Plan

## Critical Issues Found

### Issue 1: Legacy Prompt Path Leaks Technical Data (P0)
**File**: `llm-response-formatter.ts` lines 1572-1603 (legacy `buildRecommendationSummary` fallback)

When the deterministic builder path is bypassed (inadequate rule content), the legacy fallback:
- **Line 1577**: Injects `sec.action || sec.action_type` (raw codes like `CHEMICAL_CONTROL`)
- **Line 1578-1579**: Injects secondary `product_name` and `dosage_per_acre` — **still present despite the cross-rule fix applied to the deterministic path**
- **Line 1591**: Leaks `resp.rule_id` directly into LLM prompt as `"IPM TREATMENT (SC_PEST_TOP_BORER_004)"`
- **Lines 1557-1558**: Exposes `Priority` and `IPM Level` raw values to LLM

This is the ROOT CAUSE of `SC_PEST_TOP_BORER_004` and `RESISTANCE_SUSPECTED_NO_MORTALITY` appearing in farmer output.

### Issue 2: Confidence Score Exposed in UI (P1)
**File**: `CanonicalAdvisoryCard.tsx` lines 186-202, 231, 409, 439-441

The frontend card renders `confidence_score` as `"75% Confidence"`, `rule_id`, and `data_authority_rank` — all visible to farmers. The task spec says traceability must be **hidden from farmers but available for audit**.

### Issue 3: Matched Responses Dump Technical Codes (P1)
**File**: `llm-response-formatter.ts` lines 1582-1603

Matched responses inject `resp.cause` (which can be raw codes like `DEAD_HEART_PRESENT`) and `resp.rule_id` into the LLM prompt. The LLM may pass these through verbatim.

### Issue 4: No Response Sanitization Gate (P1)
There is no final sanitization step that strips technical patterns from the LLM output before it reaches the farmer. The existing `validateLLMOutput` only checks for unauthorized products and forbidden regex patterns — it doesn't strip `DEAD_HEARTS_REDUCED_BELOW_5_PERCENT` or monitoring code patterns.

### Issue 5: Hardcoded `L()` Templates in deterministic-response-builder.ts (P2)
Lines 939-968 use inline `L(en, mr, hi)` for 3 languages. Not scalable for Tamil/Telugu/Kannada/Bengali. Should use English-only structural templates and let the LLM handle all translation.

---

## Implementation Plan

### Step 1: Sanitize Legacy Prompt Builder (P0)

**File**: `llm-response-formatter.ts`

In `buildRecommendationSummary()` legacy fallback path (lines 1436-1614):

1. **Strip `rule_id` from matched response labels** (line 1591): Replace `resp.cause || resp.rule_id || 'General'` with `resp.cause || 'Additional observation'` — never expose rule_id to LLM.

2. **Strip secondary product/dosage** (lines 1578-1579): Remove `sec.product_name` and `sec.dosage_per_acre` lines from the legacy secondary block (matching what was already done on the deterministic path).

3. **Strip raw Priority/IPM Level** (lines 1557-1558): Remove these lines — they're internal metadata, not farmer content.

4. **Format codes before injection**: Replace raw codes in `resp.cause` (e.g., `DEAD_HEART_PRESENT`) with title-cased versions using the existing `formatCodeForDisplay` pattern.

### Step 2: Add Response Sanitization Gate (P1)

**File**: `llm-response-formatter.ts`

Add a `sanitizeFarmerResponse(text: string)` function that runs AFTER the LLM call and BEFORE returning `formatted_response`. It:

1. Strips any remaining ALL_CAPS_UNDERSCORE patterns (e.g., `DEAD_HEARTS_REDUCED_BELOW_5_PERCENT`, `SC_PEST_TOP_BORER_004`, `RESISTANCE_SUSPECTED_NO_MORTALITY`)
2. Strips `X% Confidence` patterns from farmer text
3. Strips `rule_id:`, `decision_id:`, `ipm_level:` labels
4. Strips common monitoring code patterns like `REDUCED_BELOW_X_PERCENT`
5. Preserves product names (which may be ALL_CAPS like `CHLORPYRIFOS`) by checking against the allowed products list

### Step 3: Hide Traceability from Farmer UI (P1)

**File**: `src/components/chat/CanonicalAdvisoryCard.tsx`

1. Remove the `ConfidenceBadge` component from the visible header. Move confidence to the collapsible traceability footer only.
2. Remove `rule_id` from the always-visible footer text — only show in the expanded trace panel.
3. Keep the traceability section collapsed by default and style it as a "debug" panel.

### Step 4: Remove Hardcoded `L()` Tri-language Templates (P2)

**File**: `deterministic-response-builder.ts`

Replace the `L(en, mr, hi)` helper (lines 939-943) and all ~30 uses with English-only structural labels. The LLM narration layer already handles translation. For template fallback, use English-only text since it's meant for the LLM prompt anyway.

### Step 5: Strip Matched Responses of Internal Codes (P1)

**File**: `llm-response-formatter.ts` lines 1582-1603

Replace `filterRelevantResponses` output formatting:
- Remove `resp.rule_id` from prompt text
- Format `resp.cause` codes (replace underscores, title-case)
- Cap `knowledge_text` to prevent prompt bloat with scientific codes

---

## Files to Modify

| File | Changes |
|------|---------|
| `agents/llm-response-formatter.ts` | Add `sanitizeFarmerResponse()` gate, strip legacy secondary products, strip rule_ids from prompts, remove Priority/IPM metadata |
| `src/components/chat/CanonicalAdvisoryCard.tsx` | Hide confidence badge from header, hide rule_id from visible footer, keep trace collapsed |
| `agents/deterministic-response-builder.ts` | Replace `L()` helper with English-only labels |

## What This Does NOT Change
- Symbolic decision engine (untouched)
- Rule evaluation / matching (untouched)
- `canonical-advisory-schema.ts` (already fixed for atomicity)
- Database schema (no changes)
- LLM API calls configuration (untouched)

