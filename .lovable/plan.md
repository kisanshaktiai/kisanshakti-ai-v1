

# Fix Plan: Replace Hardcoded Translations with DB-Driven i18n System

## Problem Summary

The `diagnosis-first-generator.ts` file contains **two hardcoded dictionaries** (`CAUSE_TRANSLATIONS` with ~35 entries and `OBSERVATION_LABELS` with ~30 entries) that only support mr/hi/en. This violates the SSOT architecture and cannot scale to all crops and all 9 languages.

Meanwhile, the proper DB-driven translation system already exists:
- `i18n/observation-label-loader.ts` loads from `observation_translations` table
- `i18n/translation-loader.ts` loads from `decision_rules.i18n_key` with a fallback dictionary
- `agents/communication-translation-dictionary.ts` has a larger dictionary but is also hardcoded

The root cause: `diagnosis-first-generator.ts` **never calls** `loadObservationLabels()` or `translateCause()` from the centralized loaders.

## What Changes

### File 1: `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts`

**Change A: Replace hardcoded `getCauseLabel()` with DB-driven `translateCause()`**
- Import `translateCause` and `initializeTranslationCache` from `../i18n/translation-loader.ts`
- Replace calls to local `getCauseLabel(cause, language)` with `translateCause(cause, language)` which already handles normalization, cache lookup, fallback chain, and pattern matching
- Remove the entire `CAUSE_TRANSLATIONS` dictionary (lines 126-189) and `getCauseLabel()` function (lines 195-277) and the regex pattern array (lines 220-257)

**Change B: Replace hardcoded `getObservationLabel()` with DB-driven `loadObservationLabels()`**
- Import `loadObservationLabels` from `../i18n/observation-label-loader.ts`
- In `generateDiagnosisFirstResponse()`, collect all observation keys from hypotheses, call `loadObservationLabels(supabaseClient, codes, language)` once, then use the returned map for each diagnosis option
- This requires passing a `supabaseClient` into the function -- add it to `DiagnosisFirstInput` interface
- Remove the entire `OBSERVATION_LABELS` dictionary (lines 284-331) and `getObservationLabel()` function (lines 333-366)

**Change C: Update `DiagnosisFirstInput` interface**
- Add `supabaseClient?: any` to the interface so the DB loader can be called
- Expand `language` type from `'mr' | 'hi' | 'en'` to include all 9 supported languages

**Change D: Keep `regional-translator` as priority path, DB-loader as fallback**
- Current flow: `regional-translator` -> `getCauseLabel()` (hardcoded) as fallback
- New flow: `regional-translator` -> `translateCause()` (DB-cached) as fallback -> `loadObservationLabels()` (DB query) for observation labels
- The `isUntranslated()` guard stays -- it correctly detects English leakage

### File 2: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`

**Change E: Guard product/dosage block for BLOCK and NO_ACTION rules**
- Wrap the product details output (lines 970-990) in a condition: only output if `action_type` is a treatment type (RECOMMEND, URGENT_ACTION, SPRAY, APPLY)
- For BLOCK rules, output explicit instruction: "This is a BLOCK action. DO NOT recommend any product or dosage. Explain WHY using the REASON text."
- For NO_ACTION_REQUIRED/MONITORING rules, skip product details entirely -- only output the reason/knowledge text

### File 3: `observation_translations` table (Data - SQL to run manually)

**Change F: Add missing observation codes for weed and nutrition domains**
- Insert rows for: WEED_PRESENT, WEED_HEAVY, WEED_ABOVE_CROP, WEED_IN_ROWS, WEED_INFESTATION, BORON_TOXICITY, BORON_DEFICIENCY
- Each code needs entries for all active languages (mr, hi, en at minimum)
- This is the SSOT path -- once added to the DB, all modules pick it up automatically

### File 4: Caller sites that pass `supabaseClient`

**Change G: Update orchestrator call site**
- Where `generateDiagnosisFirstResponse()` is called in the orchestrator, pass the existing `this.supabase` client so the DB loaders can query translations
- Also update `diagnosis-only-mode.ts` if it calls this function

---

## Technical Details

### Translation Resolution Flow (After Fix)

```text
Farmer query (any language)
  |
  v
Hypothesis Evaluator -> candidate rules with `cause` field (English)
  |
  v
diagnosis-first-generator.ts:
  1. Try regional-translator (farmer_location based)
  2. If untranslated -> translateCause(cause, language) [from translation-loader.ts]
     - Checks in-memory cache (loaded from decision_rules.i18n_key)
     - Checks FALLBACK_TRANSLATIONS (97 entries covering pests/diseases/symptoms/actions)
     - Last resort: formats key as "Title Case"
  3. For observation labels -> loadObservationLabels(supabase, codes, language)
     - Queries observation_translations table
     - Falls back to formatted English code
```

### Why This Scales
- Adding a new crop (e.g., cotton, rice) = add rules to `decision_rules` + add translations to `observation_translations`
- Adding a new language (e.g., Telugu) = add rows with `language_code = 'te'` to `observation_translations`
- No code changes needed for new crops or languages

### BLOCK Rule Guard Logic (Change E)
```text
TREATMENT_ACTION_TYPES = ['RECOMMEND', 'URGENT_ACTION', 'treatment', 'spray', 'apply']

if action_type in TREATMENT_ACTION_TYPES:
  -> output product/dosage details as before
elif action_type is 'BLOCK':
  -> output "DO NOT recommend treatment. Explain WHY blocked."
else (NO_ACTION_REQUIRED, MONITORING, OBSERVATION):
  -> skip product section entirely, output only reason/knowledge
```

### Files Modified
1. `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts` (Changes A-D)
2. `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` (Change E)
3. SQL migration for `observation_translations` table (Change F - manual)
4. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (Change G - pass supabaseClient)

### Risk Assessment
- Low risk: Translation fallback chain ensures no blank labels even if DB query fails
- The `FALLBACK_TRANSLATIONS` in `translation-loader.ts` already has 97 entries covering all major pests/diseases
- Regional translator remains the primary path when farmer_location is available
- Backward compatible: existing `observation_translations` data continues to work

