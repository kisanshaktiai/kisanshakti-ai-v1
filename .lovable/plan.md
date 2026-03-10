

# Deep Forensic Audit: Observation System — Critical Bugs & Fixes

## Root Cause Analysis

### BUG #1 (CRITICAL): 66 Missing Observation Translations

The **primary root cause** of "only 2 observations showing, same one in English and Marathi":

**66 observation codes** used in `decision_rules.conditions_json.observations` have **zero rows** in `observation_translations`. This means:
- When hypothesis evaluator picks rules with these observation keys, `loadObservationLabels()` returns no translation
- `getCauseLabelFromDB()` returns empty string (no native script detected)
- Fallback uses `h.cause` which is English → mixed-language UI
- Multiple nutrient rules all produce the same English fallback "NUTRIENT DEFICIENCY" text

Key missing codes include: `NUTRIENT_DEFICIENCY`, `PEST_DAMAGE`, `LEAF_DISCOLORATION`, `LEAF_DAMAGE`, `HEAT_STRESS`, `DISEASE_SYMPTOMS`, `GROWTH_STAGE`, `CROP_STRESS`, `WEED_COMPETITION`, and 57 more.

The DB has 998 observation codes translated but these 66 critical codes used in active rules were never populated.

### BUG #2 (HIGH): `normalizeCauseForDedup` Over-Catches Yellowing

The pattern `[/yellowing|chlorosis|chlorotic/i, 'yellowing chlorosis']` in `normalizeCauseForDedup()` collapses **ALL** yellowing-related causes (Iron deficiency, Zinc deficiency, Nitrogen deficiency, Magnesium deficiency) into one bucket because their cause strings often contain "chlorosis" or "yellowing". This means the dedup keeps only 1 hypothesis out of 10+ genuinely different nutrient deficiency causes, leaving the farmer with only 1-2 options.

### BUG #3 (HIGH): Observable Characteristics Format Inconsistency

Rules have mixed formats in `observable_characteristics`:
- Array of strings: `["STAGE_GENERAL", "LOWER_LEAF_YELLOWING"]` — works
- Object with symptoms array: `{symptoms: ["INTERVEINAL_CHLOROSIS", "LEAF_YELLOWING"]}` — `extractObservableCharacteristics()` handles the outer object but the nested `symptoms` array gets lost (CASE 3: "unknown object structure")
- Empty object `{}` — skipped correctly

Rules like `SC_MICRO_ZN_DEFICIENCY_URGENT_001` have `observable_characteristics: {symptoms: [...]}` — the nested `symptoms` key is NOT handled, so these rules get synthetic observations from `conditions_json` instead of their actual diagnostic markers.

## Permanent Fixes

### Fix 1: Insert Missing 66 Observation Translations (DB)

Insert translations for all 66 missing codes into `observation_translations` (en, hi, mr). This is the highest-impact fix — it eliminates English leakage and provides proper Marathi/Hindi labels for all active rule observation codes.

Codes to add include: `NUTRIENT_DEFICIENCY`, `PEST_DAMAGE`, `LEAF_DISCOLORATION`, `LEAF_DAMAGE`, `HEAT_STRESS`, `DISEASE_SYMPTOMS`, `GROWTH_STAGE`, `CROP_STRESS`, `WEED_COMPETITION`, `SOIL_CONDITION`, `WEATHER_DAMAGE`, `NITROGEN_NEED`, `LOW_TILLERING`, `HARVEST_READINESS`, and 52 more.

### Fix 2: Fix `normalizeCauseForDedup` Over-Collapsing (Code)

Remove the overly broad `yellowing|chlorosis` pattern. Replace with cause-specific patterns:
- `iron.*deficiency|iron.*chlorosis` → `iron deficiency`
- `zinc.*deficiency` → `zinc deficiency`  
- Keep the existing specific nutrient patterns (nitrogen, phosphorus, etc.)
- Remove the catch-all `yellowing|chlorosis|chlorotic` pattern that swallows everything

### Fix 3: Handle Nested `{symptoms: [...]}` in Observable Characteristics (Code)

In `extractObservableCharacteristics()` (hypothesis-evaluator.ts), add CASE 2.5: detect objects with a `symptoms` key containing an array, and extract those as observation keys. Currently these fall through to "unknown object structure" and get skipped.

### Fix 4: Prevent Duplicate Labels in Diagnosis Display (Code)

The `cause_label` dedup layer in `diagnosis-first-generator.ts` normalizes with `.toUpperCase()` which helps but the underlying issue is that when translations are missing, multiple different causes produce the exact same English fallback text. Fix 1 (translations) eliminates this at source.

## Implementation Order

1. **Fix 1** — Insert 66 missing observation translations (highest impact, eliminates English leakage)
2. **Fix 3** — Handle `{symptoms: [...]}` format in `extractObservableCharacteristics` (ensures correct diagnostic markers flow through)
3. **Fix 2** — Remove over-broad yellowing/chlorosis dedup pattern (ensures diverse nutrient options survive)
4. **Fix 4** — Already partially addressed; Fix 1 makes it fully effective

## Files Changed

- `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` — Fix 2 + Fix 3
- `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts` — Minor guard improvements
- SQL insert: 66 × 3 languages = ~198 rows into `observation_translations`

