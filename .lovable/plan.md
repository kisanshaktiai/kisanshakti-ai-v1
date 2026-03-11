

# Deep Audit: Hardcoded Regional Strings in AI Chat Pipeline

## Summary of Findings

I audited all files in `supabase/functions/ai-agriculture-chat/` and found **11 files** with hardcoded Devanagari/Marathi/Hindi strings that violate the "all data must be DB-driven" constraint. Here's the categorized breakdown:

## Category 1: CRITICAL — Hardcoded Translation Dictionaries (OUTPUT to farmer)

These files contain hardcoded mr/hi strings that are displayed to the farmer, directly competing with the `observation_translations` DB table.

### File 1: `services/regional-translator.ts` (~320 lines of hardcoded translations)
- **Lines 75-391**: `PEST_TRANSLATIONS` — 40+ pest/disease/nutrient entries with mr/hi/kn/gu translations
- **Lines 398-402**: `VIDARBHA_DISTRICTS` — hardcoded region classification
- **Impact**: This is the primary violator. It returns short technical labels (e.g., "मृत गाभा / सुरळी वाळणे") that override the farmer-friendly DB entries
- **Fix**: Replace entire `PEST_TRANSLATIONS` dict with a DB query to `observation_translations`. Keep `normalizePestName()` (English-only pattern matching) but route the translated label through DB

### File 2: `agents/clarification-renderer.ts` (~200 lines of hardcoded UI strings)
- **Lines 118-305**: `SCOPE_CLARIFICATION_TEMPLATES` — 12 clarification scopes with full mr/hi/en question+options
- **Lines 331-430**: `CROP_STAGE_SPECIFIC_TEMPLATES` — Sugarcane germination/tillering stage templates with mr/hi/en
- **Impact**: All clarification questions and options shown to farmers are hardcoded, bypassing `observation_translations`
- **Fix**: Create a new table `clarification_templates` or add entries to `observation_translations` with scope-based keys. Load at runtime.

### File 3: `agents/visual-agent.ts` (~80 lines of hardcoded labels)
- **Lines 979-1011**: `getPestLocalNames()`, `getDiseaseLocalNames()`, `getBeneficialLocalName()` — hardcoded mr/hi pest/disease display names
- **Lines 930-962**: `normalizePestCode()`, `normalizeDiseaseCode()` — Devanagari keys mapping to English codes (e.g., `'माशी': 'APHID'`)
- **Fix**: Replace local name functions with `observation_translations` DB lookups. Move Devanagari→code mappings to `crop_vocabulary`

### File 4: `decision/safety-enhancement.ts` (safety warnings)
- **Lines 66-91**: `SAFETY_WARNINGS` — 3 safety levels with hardcoded mr/hi warnings
- **Lines 222-228**: `getRotationAdvice()` — hardcoded mr/hi rotation advice templates
- **Fix**: Move safety warning texts to `observation_translations` with keys like `SAFETY_SAFE`, `SAFETY_CAUTION`, `SAFETY_EXPERT_ONLY`. Or let the LLM narration layer translate English-only safety content.

### File 5: `decision/temporal-constraint-validator.ts`
- **Lines 178-192**: Hardcoded mr/hi templates for `TOO_EARLY` and `TOO_LATE` temporal violations
- **Fix**: Store English-only templates; let LLM narration layer translate at runtime

### File 6: `decision/differential-diagnosis-clarifier.ts` (~150 lines)
- **Lines 115-260**: `DIFFERENTIAL_PATTERNS` — competing cause names and differentiating questions in mr/hi/en
- **Fix**: Move `cause_name_mr`/`cause_name_hi` to `observation_translations`. Move questions to a `diagnostic_questions` table or `observation_translations`

## Category 2: MEDIUM — Perception Layer (INPUT recognition)

These files use Devanagari for INPUT pattern matching (recognizing what the farmer typed). Per memory note `multilingual-symbolic-governance-v3`, Devanagari regex in perception layers is explicitly PERMITTED for input recognition. However, they should ideally be DB-driven too.

### File 7: `agents/nlp-agriculture-validator.ts` (~200 lines)
- **Lines 60-182**: `MARATHI_AG_VOCABULARY` — pest/disease/crop/operation/season terms in Devanagari → canonical codes
- **Lines 188-258**: `HINDI_AG_VOCABULARY` — same for Hindi
- **Lines 265-292**: `DIALECT_NORMALIZATIONS` — Vidarbha/Marathwada/Western dialect mappings
- **Lines 299-330**: `FORBIDDEN_COMBINATIONS` — hardcoded mr/hi explanation strings
- **Verdict**: The Devanagari→canonical mappings serve the same role as `crop_vocabulary`. Should be migrated to `crop_vocabulary` table with Devanagari patterns. The `explanation_mr/hi` strings should use English-only + LLM translation.

### File 8: `agents/observation-cause-mapper.ts` (~50 lines of Devanagari regex)
- **Lines 53-62**: Devanagari patterns in `OBSERVATION_RULES` (e.g., `/मधली\s*सुरळी/i`, `/खोडकिडा/i`)
- **Verdict**: Perception layer — permitted but ideally from `crop_vocabulary`

### File 9: `agents/intent-classifier.ts` (~20 lines of Devanagari regex)
- **Lines 471-534**: `emergencyKeywordFallback()` — Devanagari regex patterns for pest/disease/fertilizer/irrigation intent detection
- **Verdict**: Perception layer — permitted but ideally from `crop_vocabulary`

### File 10: `agents/canonical-state-builder.ts` (~10 Devanagari keys)
- **Lines 619-630**: Devanagari symptom keys mapping to `VisualSymptom` enum (e.g., `'सुरळी_वाळली': DEAD_HEART`)
- **Verdict**: Perception layer — permitted

### File 11: `agents/language-normalizer.ts` (~30 lines)
- **Lines 98-116**: `AGRICULTURAL_KEYWORDS` — Devanagari keyword lists for language detection
- **Lines 136-148**: Marathi/Hindi word lists for language detection
- **Verdict**: Language detection — permitted (cannot be DB-driven; needed before DB connection)

### File 12: `decision/observation-code-mapper.ts` (~20 Devanagari patterns)
- **Lines 160-200**: `VISUAL_CHANGE_MAPPINGS` — Devanagari patterns mixed with English for symptom code mapping
- **Verdict**: Perception layer — permitted but ideally from `crop_vocabulary`

## Category 3: LOW — Hardcoded but Acceptable

### File 13: `decision/clarification-validator.ts`
- **Lines 268-271**: Hardcoded mr time options (`'आजच दिसले'`, `'2-3 दिवस झाले'`)
- **Verdict**: Should be in `observation_translations`

## Implementation Plan

### Phase 1: CRITICAL — Remove OUTPUT dictionaries (Files 1, 3, 4, 5, 6)

**Step 1.1: Gut `regional-translator.ts`**
- Remove the entire `PEST_TRANSLATIONS` dictionary (lines 75-391)
- Replace `translateToRegionalTerms()` with a DB-first function that:
  1. Normalizes pest name to a code using `normalizePestName()` (keep this, it's English-only)
  2. Queries `observation_translations` for the normalized code + language
  3. Falls back to English name if no DB entry found
- This requires passing a Supabase client or using the translation cache from `i18n/translation-loader.ts`

**Step 1.2: Make `visual-agent.ts` DB-driven**
- Remove `getPestLocalNames()`, `getDiseaseLocalNames()`, `getBeneficialLocalName()` hardcoded dicts
- Replace with lookups against `observation_translations` via the i18n cache
- Remove Devanagari keys from `normalizePestCode()` and `normalizeDiseaseCode()` — these should use `crop_vocabulary` DB entries

**Step 1.3: Make `safety-enhancement.ts` English-only**
- Replace `SAFETY_WARNINGS` mr/hi strings with English-only warnings
- The LLM narration layer already handles translation via `forceTranslateResponse()`
- Same for `getRotationAdvice()` templates

**Step 1.4: Make `temporal-constraint-validator.ts` English-only**
- Replace mr/hi templates with English-only; LLM narration translates

**Step 1.5: Make `differential-diagnosis-clarifier.ts` DB-driven**
- Remove `cause_name_mr`/`cause_name_hi` from `DIFFERENTIAL_PATTERNS`
- Look up cause names from `observation_translations` at runtime
- Remove `question_mr`/`question_hi` — use English-only questions; LLM translates

### Phase 2: MEDIUM — Migrate `clarification-renderer.ts` (File 2)

**Step 2.1: Insert clarification templates into `observation_translations`**
- For each scope (IDENTIFY_CROP, IDENTIFY_LOCATION, etc.), insert rows with keys like:
  - `CLARIFY_IDENTIFY_CROP_QUESTION`
  - `CLARIFY_IDENTIFY_CROP_OPT1`, `CLARIFY_IDENTIFY_CROP_OPT2`, etc.
- Load these from DB at runtime in the renderer

**Step 2.2: Migrate crop-stage-specific templates**
- Insert stage-specific clarification entries with compound keys

### Phase 3: MEDIUM — Migrate perception layer dicts (File 7)

**Step 3.1: Migrate `nlp-agriculture-validator.ts` vocabularies to `crop_vocabulary`**
- Insert Marathi pest/disease/crop/operation terms into `crop_vocabulary` with Devanagari `phrase_pattern`
- Insert Hindi equivalents
- Remove `MARATHI_AG_VOCABULARY`, `HINDI_AG_VOCABULARY` hardcoded dicts
- Remove `DIALECT_NORMALIZATIONS` — insert as `crop_vocabulary` entries
- Remove `FORBIDDEN_COMBINATIONS` mr/hi explanations — use English-only

### Phase 4: LOW — Perception regex cleanup (Files 8-12)
- These are permitted per governance rules but should eventually move to `crop_vocabulary` for consistency
- Lower priority — no farmer-facing impact

## DB Updates Required

Insert into `observation_translations` for all pest/disease/nutrient codes that currently exist only in hardcoded dicts. Based on the audit, approximately **50-60 new entries** are needed covering:
- Pest names: SHOOT_BORER, STEM_BORER, TOP_BORER, INTERNODE_BORER, ROOT_BORER, DEAD_HEART, TERMITE, WHITEFLY, APHID, THRIPS, MEALYBUG, SCALE_INSECT, PYRILLA, WOOLLY_APHID, BOLLWORM
- Disease names: RED_ROT, SMUT, WILT, ROOT_ROT, GRASSY_SHOOT, LEAF_SCALD, RUST, POKKAH_BOENG, RATOON_STUNTING, MOSAIC
- Nutrient: NITROGEN_DEFICIENCY, PHOSPHORUS_DEFICIENCY, POTASSIUM_DEFICIENCY, IRON_CHLOROSIS, WATER_STRESS, WATERLOGGING
- Safety: SAFETY_SAFE, SAFETY_CAUTION, SAFETY_EXPERT_ONLY
- Other: FROST_DAMAGE, HEAT_STRESS, LODGING, POOR_GERMINATION

## Files Changed Summary

| File | Action | Lines Affected |
|------|--------|---------------|
| `services/regional-translator.ts` | Remove PEST_TRANSLATIONS dict, use DB lookups | ~320 lines removed |
| `agents/visual-agent.ts` | Remove local name dicts, use DB | ~80 lines removed |
| `decision/safety-enhancement.ts` | English-only warnings | ~20 lines changed |
| `decision/temporal-constraint-validator.ts` | English-only templates | ~10 lines changed |
| `decision/differential-diagnosis-clarifier.ts` | Remove mr/hi cause names and questions | ~100 lines changed |
| `agents/clarification-renderer.ts` | DB-driven templates (Phase 2) | ~200 lines changed |
| `agents/nlp-agriculture-validator.ts` | Migrate to crop_vocabulary (Phase 3) | ~200 lines changed |
| DB: `observation_translations` | Insert ~60 pest/disease/safety label rows | N/A |

## What Does NOT Change
- `language-normalizer.ts` — Language detection needs hardcoded patterns (runs before DB)
- `canonical-state-builder.ts` — Perception layer, permitted
- `intent-classifier.ts` — Perception fallback, permitted
- `observation-cause-mapper.ts` — Perception layer, permitted
- Symbolic decision brain logic — untouched
- Rule engine — untouched

## Execution Priority
1. **Phase 1** (Critical): regional-translator.ts + safety/temporal/differential files — these directly cause the bug the user reported
2. **Phase 2** (Medium): clarification-renderer.ts — large but lower farmer impact
3. **Phase 3** (Medium): nlp-agriculture-validator.ts — perception layer migration
4. **Phase 4** (Low): Remaining perception regex — future cleanup

