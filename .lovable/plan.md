

# Critical Bug: Hardcoded Regional Translator Bypasses DB Translations

## Root Cause

The file `supabase/functions/ai-agriculture-chat/services/regional-translator.ts` contains a **hardcoded dictionary** (~50 pest/disease entries, lines 100-170) with short technical labels like:

```
'dead_heart': { mr: 'मृत गाभा / सुरळी वाळणे' }     // SHORT, technical
'top_borer':  { mr: 'शेंड्याचा पोखरणारा किडा' }      // SHORT, technical  
'stem_borer': { mr: 'खोड किडा' }                      // SHORT, technical
```

Meanwhile, the `observation_translations` DB table (which the user updated) has longer farmer-friendly descriptions:

```
DEAD_HEART_PRESENT: "मधली सुरळी सुकलेली आणि ओढल्यास बाहेर येते - पुष्टी झालेले लक्षण"  // GOOD
EARLY_SHOOT_BORER: "लहान रोपांमध्ये (30-60 दिवस) मधली सुरळी सुकते, ओढल्यास बाहेर येते"  // GOOD
STEM_BORER: "उसाच्या खोडात शिरणारा किडा - सर्व अवस्थांमध्ये"                          // GOOD
```

**The bug:** In `diagnosis-first-generator.ts` (lines 367-404), the system calls `translateToRegionalTerms()` FIRST. Since the hardcoded dictionary returns Devanagari text, the `isUntranslated()` check passes, and the system uses the short hardcoded label — **completely bypassing the DB lookup**.

The priority order is wrong:
```
CURRENT:  Hardcoded regional dict → DB fallback (never reached)
CORRECT:  DB observation_translations → regional dict fallback (if DB empty)
```

## Fix Plan

### Change 1: Reverse priority in `diagnosis-first-generator.ts`

In the hypothesis-to-diagnosis loop (lines 363-420), change the resolution order:

1. **First** try DB labels via `getObservationLabelFromMap()` and `getCauseLabelFromDB()`
2. **Only if DB returns empty/fallback**, try the regional translator as a backup

This is a ~20-line change in the label resolution block.

### Change 2: Deprecate hardcoded pest dictionary in `regional-translator.ts`

The hardcoded `PEST_TRANSLATIONS` dictionary (lines ~100-170) directly violates the "all data must be DB-driven" rule. Two options:

- **Option A (safe, immediate):** Add a log warning when the hardcoded dict is used, so it's visible in logs but doesn't break anything
- **Option B (clean):** Remove the dictionary entries and have `translateToRegionalTerms()` query `observation_translations` instead

I recommend **Option A** for this fix (minimal blast radius), with Option B as a follow-up.

### Files Changed

| File | Change |
|------|--------|
| `diagnosis-first-generator.ts` | Reverse label priority: DB first, regional translator fallback |
| `regional-translator.ts` | Add deprecation warning log when hardcoded dict is used |

### Expected Result

After fix, the user's query "ऊसाची मधली सुरळी वाळली आहे" will show:

**Before (hardcoded, short):**
- 🔍 मृत गाभा / सुरळी वाळणे
- 🔍 शेंड्याचा पोखरणारा किडा
- 🔍 खोड किडा

**After (DB-driven, farmer-friendly):**
- 🔍 मधली सुरळी सुकलेली आणि ओढल्यास बाहेर येते - पुष्टी झालेले लक्षण
- 🔍 लहान रोपांमध्ये (30-60 दिवस) मधली सुरळी सुकते, ओढल्यास बाहेर येते
- 🔍 उसाच्या खोडात शिरणारा किडा - सर्व अवस्थांमध्ये

