

# Audit: Remaining Hardcoded Regional Strings After Previous Cleanup

## Critical Finding

The previous cleanup rounds addressed ~55% of hardcoded mr/hi strings. **Three major files still contain runtime mr/hi dictionaries that will produce `undefined` output for Tamil, Telugu, Kannada, Gujarati, Bengali, and Punjabi users.**

### The `undefined` Bug

All fallback functions in `index.ts` use this pattern:
```typescript
const greetings: Record<string, string> = {
  mr: 'नमस्कार शेतकरी मित्र!',
  hi: 'नमस्कार किसान मित्र!',
  en: 'Hello farmer friend!'
};
parts.push(greetings[lang]); // Returns undefined for 'ta', 'te', 'kn', 'gu', 'bn', 'pa'
```

When `lang = 'ta'` (Tamil), `greetings['ta']` returns `undefined`, producing broken responses like `"undefined\n\nundefined\n\n1. **Chlorantraniliprole**\n\nundefined"`.

The `forceTranslateResponse` at line 1368 cannot fix this because `verifyLanguageConsistency` sees `undefined` text and may behave unpredictably.

---

## Files Requiring Fixes

### 1. `index.ts` — 6 fallback functions with ~80 hardcoded mr/hi strings

| Function | Lines | Issue |
|---|---|---|
| `buildValidationFallbackResponse()` | 2261-2359 | greetings, headers, closings dicts with mr/hi/en |
| (same function) | 2363-2401 | Full paragraph fallbacks in mr/hi |
| `generateAllActionsFilteredResponse()` | 2414-2491 | greetings, explanations, categoryLabels, suggestions dicts |
| `generateNoRecommendationsFallback()` | 2895-2957 | greetings, context messages, questions lists, closings |
| `buildFormattedRecommendationsList()` | 3125-3130 | closings dict |

**Fix**: Replace all `{ mr: '...', hi: '...', en: '...' }` with English-only. Use `fallback[lang] || fallback['en']` pattern or just return English. The `forceTranslateResponse()` at line 1368-1371 already handles translation for non-English targets.

### 2. `feedback-learning-types.ts` — 12 follow-up questions with full mr/hi text (lines 312-410)

Every `FollowUpQuestion` object has `text_mr`, `text_hi`, `text_en` and option `label_mr`/`label_hi`/`label_en`. These are runtime-populated and will fail for Tamil users.

**Fix**: Set `text_mr`/`text_hi` to empty strings (matching the `@deprecated` pattern used in other files). Set `label_mr`/`label_hi` to empty strings. The LLM narration layer translates from `text_en`/`label_en`.

### 3. `orchestrator.ts` — Greeting full_text (lines 8976-8979)

The greeting response has hardcoded `full_text.mr` and `full_text.hi`. For Tamil users, the system selects `full_text[language]` which returns `undefined`.

**Fix**: Keep only `en` key. Add fallback logic: `full_text[language] || full_text.en`.

### 4. NLU Pattern Files — **NO FIX NEEDED** (acceptable)

Files like `language-normalizer.ts`, `intent-router.ts`, `query-router.ts` use mr/hi regex patterns for **input detection** (recognizing "नमस्कार" as a greeting). These are perception-layer patterns, not output strings. They correctly remain.

---

## Implementation Summary

| Task | Files | Changes |
|---|---|---|
| Fix `undefined` bug in 6 fallback functions | `index.ts` | Replace ~80 mr/hi strings with English-only, add `|| fallback['en']` guards |
| Clean feedback follow-up questions | `feedback-learning-types.ts` | Set 12 `text_mr`/`text_hi` + 6 `label_mr`/`label_hi` to empty strings |
| Fix greeting full_text | `orchestrator.ts` | English-only `full_text` with fallback |

**Expected outcome**: Zero `undefined` responses for any supported language. Language Agnosticism score: 9/10 → **9.5/10**.

