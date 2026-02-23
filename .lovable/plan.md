

# Symbolic Decision Brain: Mixed-Language & Hardcoded Data Elimination

## Problem Summary

The codebase has **5 critical sources of hardcoded multilingual data** that bypass the `observation_translations` database table, causing mixed-language output (English labels appearing in Marathi/Hindi UI).

---

## Bug #1: Giant Hardcoded Dictionary in `canonical-observation-loader.ts`

**File:** `supabase/functions/ai-agriculture-chat/agents/canonical-observation-loader.ts` (lines 55-257)

The `OBSERVATION_KEY_LABELS` dictionary contains ~200 hardcoded trilingual entries (`en`, `hi`, `mr`). Multiple functions read directly from this dictionary instead of the DB:

- `getObservationKeyLabel()` (line 318) -- reads ONLY from hardcoded dict
- `getObservationKeyLabels()` (line 339) -- reads ONLY from hardcoded dict
- `getStageObservationKeys()` (line 358) -- reads ONLY from hardcoded dict
- `getCategoryObservationKeys()` (line 390) -- reads ONLY from hardcoded dict
- `getClarificationOptions()` (line 606) -- calls the above functions
- `getFallbackKeys()` (line 576) -- uses hardcoded dict as fallback
- `loadObservationKeysFromDB()` (line 534) -- STILL falls back to hardcoded dict when DB label is missing

**Additionally**, there's a code mismatch: the hardcoded dict uses codes like `LEAF_SPOTS_PRESENT`, `WILT_SYMPTOM`, `FUNGAL_GROWTH_VISIBLE` but the DB table uses `LEAF_SPOTS`, `WILT_SYMPTOMS`, `FUNGAL_GROWTH`. When the DB lookup fails to find the hardcoded code, it falls back to the English hardcoded label, causing mixed language.

**Fix:** Refactor ALL sync functions (`getObservationKeyLabel`, `getStageObservationKeys`, `getCategoryObservationKeys`, `getClarificationOptions`) to become `async` and query `observation_translations` via the existing `loadObservationLabels()` utility. Remove the `OBSERVATION_KEY_LABELS` dictionary entirely. The `STAGE_KEY_PRIORITIES` mapping (which is just a list of code names, not labels) can remain since it's language-neutral.

---

## Bug #2: Hardcoded Clarification Templates in `clarification-renderer.ts`

**File:** `supabase/functions/ai-agriculture-chat/agents/clarification-renderer.ts` (lines 115-590)

`BASE_TEMPLATES` and `CROP_STAGE_SPECIFIC_TEMPLATES` contain ~500 lines of hardcoded trilingual question/option strings. These templates are typed as `Record<'mr' | 'hi' | 'en', ...>`, making them fail silently for any other language (Tamil, Telugu, etc.) -- the system falls back to English.

**Fix:** This is a larger structural issue. For now:
1. Widen the type from `'mr' | 'hi' | 'en'` to `string` and add a fallback chain: `templates[language] || templates['en']`
2. For the `getContextAwareTemplate()` function (line 596), ensure it always tries the language key first, then falls back to `'en'`, never returns undefined.
3. The DB-driven path (`getContextAwareTemplateFromDB`, line 844) already works correctly for `REFINE_OBSERVATION` scope -- extend this pattern to other scopes over time.

---

## Bug #3: Hardcoded Labels in `context-manager.ts`

**File:** `supabase/functions/ai-agriculture-chat/agents/context-manager.ts` (lines 47-146)

`QUESTION_BANK` contains 6 questions with hardcoded `{ mr, hi, en }` labels for questions and options. Also, context switch detection (lines 231-268) has hardcoded trilingual clarification questions.

**Fix:** Widen the type to `Record<string, string>` and add fallback to `'en'` when the language key is missing. These are structural UI questions (not observation labels) so they're acceptable as code constants, but must not break for unsupported languages.

---

## Bug #4: Hardcoded Labels in `context-authority.ts`

**File:** `supabase/functions/ai-agriculture-chat/decision/context-authority.ts` (lines 148-178)

`formatCropContextFrame()` has hardcoded stage translations and template strings typed as `Record<'mr' | 'hi' | 'en', string>`. For any language not in `{mr, hi, en}`, this will throw or return `undefined`.

**Fix:** Widen type to `string`, add fallback: `templates[language] || templates['en']`.

---

## Bug #5: Hardcoded Labels in `diagnostic-signal-detector.ts`

**File:** `supabase/functions/ai-agriculture-chat/decision/diagnostic-signal-detector.ts` (lines 225-236)

`CROSS_STAGE_DISCLAIMER` and `getCrossStageDisclaimer()` are typed as `{ mr: string; hi: string; en: string }` and accept `language: 'mr' | 'hi' | 'en'`. Will fail for other languages.

**Fix:** Widen type, add `'en'` fallback.

---

## Bug #6: Hardcoded Labels in `diagnostic-options-i18n.ts`

**File:** `supabase/functions/ai-agriculture-chat/agents/diagnostic-options-i18n.ts` (lines 1-160)

`DiagnosticOption.label` is typed as `Record<'mr' | 'hi' | 'en', string>`. `getDiagnosticOptionsForCropStage()` accepts `language: 'mr' | 'hi' | 'en'`.

**Fix:** Widen type, add fallback.

---

## Bug #7: Restricted Language Types Across 47 Files

Many function signatures use `'mr' | 'hi' | 'en'` instead of `string`, causing TypeScript errors or silent `undefined` when other languages are used. Key files:

- `communication-translation-dictionary.ts` -- already uses `string` (good)
- `llm-response-formatter.ts` (line 93) -- uses extended union but still restricted
- `response-mode-renderer.ts` (line 340) -- `'mr' | 'hi' | 'en'`
- `diagnosis-only-mode.ts` (lines 274, 1075, 1127) -- `'mr' | 'hi' | 'en'`
- `photo-analyzer.ts` (line 34) -- `'mr' | 'hi' | 'en'`
- `static-data-gate.ts` (line 54) -- `'mr' | 'hi' | 'en'`
- `communication-types.ts` (line 14) -- `type SupportedLanguage = 'mr' | 'hi' | 'en'`

**Fix:** Update `communication-types.ts` to `type SupportedLanguage = string` and ensure all code using language keys has English fallback.

---

## Implementation Plan

### Step 1: Remove `OBSERVATION_KEY_LABELS` dictionary (Bug #1 -- Critical)

- Delete the ~200-line hardcoded dictionary from `canonical-observation-loader.ts`
- Make `getObservationKeyLabel()` async, querying `observation_translations` via `loadObservationLabels()`
- Make `getStageObservationKeys()` async, using DB labels
- Make `getClarificationOptions()` async
- Update `getFallbackKeys()` to return raw codes instead of English labels for non-English
- Update `loadObservationKeysFromDB()` to remove the hardcoded fallback at line 534-540
- Keep `STAGE_KEY_PRIORITIES` (language-neutral code lists)

### Step 2: Widen Language Types (Bugs #3-7)

- Update `communication-types.ts`: `SupportedLanguage = string`
- Update `context-authority.ts`: widen `formatCropContextFrame` parameter and add `|| templates['en']` fallback
- Update `diagnostic-signal-detector.ts`: widen `getCrossStageDisclaimer` and add fallback
- Update `diagnostic-options-i18n.ts`: widen types, add fallback
- Update `clarification-renderer.ts`: widen `BASE_TEMPLATES` type access with fallback
- Update `context-manager.ts`: widen question bank access with fallback

### Step 3: Fix Template Fallback Chain (Bug #2)

- In `getContextAwareTemplate()` (line 596 of clarification-renderer.ts), add safe fallback:
  ```
  const template = stageTemplates[scope]?.[language] || stageTemplates[scope]?.['en'];
  ```
- Apply same pattern at all template lookup points (lines 636, 646, 655, 666)

### Step 4: Update Callers

- Update `clarification-renderer.ts` imports and calls to use async versions of the canonical loader functions
- Update any other callers that reference `OBSERVATION_KEY_LABELS` directly

### Step 5: Deploy and Verify

- Redeploy `ai-agriculture-chat` edge function
- Test with Marathi query to verify no English leakage in observation labels

