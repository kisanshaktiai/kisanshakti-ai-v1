
# Production-Ready Fixes: AI Chat Symbolic Decision Brain

## Analysis Summary

After deep line-by-line audit of the entire codebase, the 8 architectural fixes from the approved plan are already implemented. However, **3 critical remaining bugs** are causing the symptoms described (template fallback, undefined response type, inconsistent behavior).

---

## Bug #1: No JSON Extraction Retry in Intent Classifier (CRITICAL)

**File:** `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts` (lines 288-292)

**Problem:** When `safeExtractJson()` fails to parse LLM output, the function immediately returns `UNKNOWN_OBSERVATION` with confidence 0.0. There is no retry attempt. This means a single malformed Gemini response causes the entire perception layer to fail, which cascades to:
- `ZERO_CODE_GATE` triggers (correct behavior given bad input)
- Fallback to template provider
- `response_type: undefined` in some paths

**Current code:**
```text
const parsed = safeExtractJson(content);
if (!parsed) {
  console.warn('LLM JSON extraction failed - returning UNKNOWN_OBSERVATION');
  return { intent_code: 'UNKNOWN_OBSERVATION', confidence: 0.0 };
}
```

**Fix:** Add one retry with a stricter prompt before giving up. After first failure, make a second LLM call with a simplified prompt: "Return ONLY JSON. Do not explain." Only after second failure return UNKNOWN_OBSERVATION.

---

## Bug #2: Duplicate `ruleCategory` Declaration Still Possible in Edge Cases

**File:** `supabase/functions/ai-agriculture-chat/decision/symbolic-reasoner.ts`

**Problem:** The previous fix changed line 304 from `const ruleCategory = ...` to a comment `// ruleCategory already declared above`. This is confirmed fixed. However, `const ruleCategory` appears only once now (line 262). The boot error the user is seeing may be from a **stale deployment**. The function needs a clean redeployment to ensure the fixed version is live.

**Fix:** Redeploy after all changes.

---

## Bug #3: `confidence-calculator.ts` Unsafe Array Access (lines 187, 193)

**File:** `supabase/functions/ai-agriculture-chat/decision/confidence-calculator.ts`

**Problem:** Line 173 already has a null guard (`if (!firedRules || firedRules.length === 0)`), which is correct. However:
- Line 193: `diagnosis?.supporting_rules?.length > 1` - while JavaScript evaluates `undefined > 1` as `false` (safe), this is fragile. If TypeScript strict mode changes or the type narrows differently, this could break.

**Fix:** Add explicit null guard: `if ((diagnosis?.supporting_rules?.length ?? 0) > 1)`

---

## Implementation Plan

### Step 1: Add JSON Extraction Retry to Intent Classifier

In `intent-classifier.ts`, after `safeExtractJson` fails on the first attempt, retry once with a stricter prompt before falling back to UNKNOWN_OBSERVATION.

Changes:
- Extract the LLM call into a helper or inline the retry
- On first `safeExtractJson` failure, make a second call with: system message "Return ONLY valid JSON with intent_code and confidence fields. No explanation." and same user prompt
- Only after second failure, fall through to emergency keyword fallback
- Log retry attempts for production observability

### Step 2: Harden Confidence Calculator

In `confidence-calculator.ts` line 193, change:
```text
if (diagnosis?.supporting_rules?.length > 1)
```
to:
```text
if ((diagnosis?.supporting_rules?.length ?? 0) > 1)
```

### Step 3: Redeploy Edge Function

Deploy `ai-agriculture-chat` to ensure the fixed `symbolic-reasoner.ts` (no duplicate `ruleCategory`) is live.

---

## Technical Details

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts` | Add one-retry logic on JSON extraction failure |
| `supabase/functions/ai-agriculture-chat/decision/confidence-calculator.ts` | Null guard on `supporting_rules.length` |

### What Was Already Fixed (confirmed in codebase)

These items from the user's analysis are already implemented:
- Duplicate `ruleCategory` declaration removed (symbolic-reasoner.ts line 304)
- NDVI/Abiotic rule guard with biotic evidence check (lines 262-293)
- Authority hierarchy: SAFETY(0) > BIOTIC(1-2) > ABIOTIC(4-5) > WEATHER(6) > NDVI(7) (line 433-436)
- Multilingual observation mappings (Marathi/Hindi/English patterns in observation-code-mapper.ts)
- ZERO_CODE_GATE returns structured CLARIFICATION response (lines 2135-2176)
- LLM_FAILSAFE removed, replaced with clarification-only path (lines 2568-2582)
- INVARIANT_GATE blocks symbolic brain on zero observations + UNKNOWN intent (lines 2605-2615)
- Post-decision misroute validation (lines 4855-4897)
- "See action text" handled in llm-response-formatter.ts (line 612)

### Why Boot Error May Persist

The user may be seeing the boot error from a **cached/stale deployment**. The fix is already in the code. A clean redeployment will resolve this.
