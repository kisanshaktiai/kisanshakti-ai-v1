
# i18n_key Implementation Status

## Completed Fixes (v2.0.0)

### Finding 1: RESOLVED ✅ — i18n_key resolver wired in LLM formatter
- `llm-response-formatter.ts` now calls `getTranslation(i18n_key, 'en')` when `action_text` is missing
- Falls back to knowledge_text → reason_text → error placeholder

### Finding 2: CONFIRMED ✅ — LLM IS the actual translator (by design)
- English `action_text` is passed to LLM with "TRANSLATE TO {language}" instructions
- This is architecturally intentional and working correctly

### Finding 3: RESOLVED ✅ — FALLBACK_TRANSLATIONS removed
- All 45+ hardcoded multilingual entries removed from `translation-loader.ts`
- Translations migrated to `observation_translations` DB table (SSOT)
- Cache now loads from `observation_translations` (genuine multilingual) + `decision_rules` (English only)

### Finding 4: RESOLVED ✅ — diagnostic-options-i18n.ts hardcoded labels removed
- Hardcoded `label: { mr: '...', hi: '...', en: '...' }` dictionaries eliminated
- New async `getDiagnosticOptionsForCropStage(supabaseClient, crop, stage, lang)` resolves labels from DB
- Sync fallback `getDiagnosticOptionsForCropStageSync()` uses formatted codes when DB unavailable

### Finding 5: RESOLVED ✅ — Translation cache fixed
- `initializeTranslationCache()` no longer stores English text as placeholder for mr/hi
- Source 1: `observation_translations` → genuine multilingual labels per language
- Source 2: `decision_rules` i18n_key → English only (LLM translates at runtime)
- `getTranslation()` correctly rejects same-as-English values for non-English

## Database Changes
- 39 new entries in `observation_master` (generic pest/disease/symptom/action codes)
- 117 new entries in `observation_translations` (39 codes × 3 languages: en, mr, hi)
