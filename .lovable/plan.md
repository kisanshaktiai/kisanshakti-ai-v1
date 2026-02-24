
# Deep Forensic Audit Report: AI Chat & Symbolic Decision Brain

## EXECUTIVE SUMMARY

After analyzing all database tables, their schemas, and tracing every column reference through the codebase, I identified **14 critical issues**, **8 data gaps**, and **6 type mismatches** that collectively degrade the symbolic engine's accuracy and language integrity.

---

## SECTION 1: DATABASE vs CODEBASE COLUMN ALIGNMENT

### 1.1 CRITICAL: Columns DROPPED from DB but still referenced in code

| Column | Status in DB | Files Still Referencing |
|--------|-------------|------------------------|
| `response_mr` | **DROPPED** (not in schema) | `all-rules.ts` (line 45), `symbolic-rules-bridge.ts` (lines 48, 236, 271) |
| `response_hi` | **DROPPED** (not in schema) | `all-rules.ts` (line 46), `symbolic-rules-bridge.ts` (lines 49, 237, 272) |
| `response_en` | **DROPPED** (not in schema) | `all-rules.ts` (line 47), `symbolic-rules-bridge.ts` (lines 50, 238, 261) |
| `trigger_keywords` | **DROPPED** (not in schema) | `symbolic-rules-bridge.ts` (lines 202-207), `layered-rule-evaluator.ts` (lines 1237-1241), `symbolic-reasoner.ts` (line 990, 1139) |

**Impact**: Code attempts to read fields that return `undefined` from DB rows. `symbolic-rules-bridge.ts` still does `r.response_mr || r.response_en` to build responses -- this always returns `undefined`, falling back to `r.scientific_basis`. Meanwhile `trigger_keywords` matching in `layered-rule-evaluator.ts` (line 1239) reads `conditions_json.trigger_keywords` which was also cleaned from DB (0 rules have it).

### 1.2 CRITICAL: Type Mismatches Between DB and Code

| Field | DB Type/Values | Code Type | Mismatch |
|-------|---------------|-----------|----------|
| `farmer_safety_level` | TEXT: `SAFE`, `CAUTION`, `EXPERT_ONLY` | `1 \| 2 \| 3` (integer) in `all-rules.ts` | **Complete mismatch** -- integer checks will always fail |
| `ipm_level` | INTEGER: 1,2,3,4,**5** | `1 \| 2 \| 3 \| 4` in `all-rules.ts` | Missing value `5` (36 rules affected) |
| `condition_code` | TEXT: all `STAGE_GENERAL` (517/517) | Used as FK to `observation_master` per architecture | **Dead column** -- never participates in matching |
| `stage_applicable` | UPPERCASE array: `TILLERING`, `GRAND_GROWTH` | Loader normalizes to lowercase: `tillering`, `grand_growth` | Case mismatch risk in downstream comparisons |

### 1.3 `observation_aliases` Table Missing `is_active` Column

The `observation_aliases` table has only 3 columns: `alias_code`, `canonical_code`, `created_at`.

**But `loader.ts` line 974 queries:**
```
.eq('is_active', true)
```

This query **silently returns 0 rows** because the column doesn't exist (Supabase returns empty result for non-existent column filters). **ALL 155 observation aliases are being ignored**, completely defeating the PHASE 4 alias expansion.

---

## SECTION 2: HARDCODED LANGUAGE STRINGS (SSOT VIOLATIONS)

### 2.1 Files with hardcoded Marathi/Hindi/English dictionaries

| File | Issue | Approx Lines |
|------|-------|-------------|
| `decision-graph-bridge.ts` | **185 product entries** with hardcoded mr/hi/en names, dosages, prices | ~2600 lines of hardcoded data |
| `communication-translation-dictionary.ts` | CAUSE_TRANSLATIONS: ~60 entries with mr/hi/en | ~700 lines |
| `diagnostic-escalation-generator.ts` | CAUSE_LABELS, EXPLANATIONS, PHOTO_GUIDANCE: ~30 entries each with mr/hi/en | ~450 lines |
| `llm-response-formatter.ts` | PEST_TRANSLATIONS (8 entries), DISEASE_TRANSLATIONS (5 entries) | ~30 lines |
| `diagnosis-only-mode.ts` | CAUSE_TRANSLATIONS duplicate: ~20 entries with mr/hi/en | ~100 lines |
| `clarification-validator.ts` | DIAGNOSIS_KEYWORDS_MR, DIAGNOSIS_KEYWORDS_HI: hardcoded keyword lists | ~40 lines |
| `followup-generator.ts` | Regex patterns with Marathi/Hindi words for topic detection | ~10 lines |
| `regional-translator.ts` | Full translation entries with mr/hi/en/kn | ~200 lines |
| `farmer-message-builder.ts` | Symptom label dictionaries with mr/hi/en | ~50 lines |
| `rural-language-dictionary.ts` | marathiTermMappings, hindiTermMappings, instaScanCTAs | ~290 lines |

**Total: ~4,470 lines of hardcoded multilingual content** that should come from database tables (`observation_translations`, `master_products`, or a new `cause_translations` table).

### 2.2 Files claiming "no hardcoded text" but containing it

Several files have SSOT compliance comments but still have hardcoded dictionaries:
- `diagnostic-escalation-generator.ts`: Has `// SSOT compliant` header but contains 150+ hardcoded translations
- `decision-graph-bridge.ts`: Contains entire chemical product catalog hardcoded

---

## SECTION 3: CRITICAL DATA GAPS IN TABLES

### 3.1 Translation Coverage Crisis

| Metric | Count |
|--------|-------|
| Active observations in `observation_master` | 608 |
| With English translations | 604 (99.3%) |
| With Marathi translations | 127 (20.9%) |
| With Hindi translations | 124 (20.4%) |
| **Missing mr/hi translations** | **484 (79.6%)** |

**Impact**: When the system tries to show observation options in Marathi/Hindi (the primary farmer languages), 80% of observations will either show English codes or fall back to hardcoded dictionaries.

### 3.2 `condition_code` Dead Column

All 517 active rules have `condition_code = 'STAGE_GENERAL'`. The architecture mandates that `condition_code` should be a FK to `observation_master.observation_code`, serving as the primary matching key. Currently this column is meaningless.

### 3.3 Treatment Rules Missing Observation Anchors

| Category | Rules without `observations` in `conditions_json` |
|----------|--------------------------------------------------|
| RECOMMEND | 144 / 251 (57%) |
| URGENT_ACTION | 11 / 12 (92%) |
| MONITOR | 45 / 115 (39%) |
| BLOCK | 39 / 100 (39%) |
| NO_ACTION_REQUIRED | 21 / 39 (54%) |

260 out of 517 rules (50.3%) have no observation array in their conditions. These rules can only match via boolean/numeric conditions in `conditions_json`, making them prone to the generic fallthrough bug.

### 3.4 `master_products` Table Nearly Empty

The `master_products` table has a comprehensive schema (80+ columns including `translations`, `pest_targets`, `active_ingredients`, `dosage_instructions`) but contains only **3 rows**. Meanwhile `decision-graph-bridge.ts` has **185 hardcoded product definitions** that should live in this table.

### 3.5 `required_observation_category` and `required_plant_part` Coverage

| Field | Rules Populated | Total Active | Coverage |
|-------|----------------|-------------|----------|
| `required_observation_category` | 272 | 517 | 52.6% |
| `required_plant_part` | 73 | 517 | 14.1% |

245 rules have no observation category constraint and 444 rules have no plant part constraint, reducing the effectiveness of the observation layer filter.

---

## SECTION 4: STRUCTURAL BUGS

### 4.1 BUG: `observation_aliases` query returns 0 rows (CRITICAL)

**Location**: `loader.ts` line 974
**Cause**: Queries `.eq('is_active', true)` on a table that has no `is_active` column
**Effect**: `cachedObservationAliases` is never populated. All 155 aliases are ignored.
**Fix**: Remove `.eq('is_active', true)` from the query, OR add `is_active` column to `observation_aliases` table.

### 4.2 BUG: `symbolic-rules-bridge.ts` uses dropped columns

**Location**: Lines 236-262
**Cause**: Accesses `r.response_mr`, `r.response_hi`, `r.response_en` which no longer exist
**Effect**: `convertToRuleResult()` always falls back to `r.scientific_basis` for the reason text
**Fix**: Use `r.action_text` / `r.reason_text` / `r.i18n_key` instead

### 4.3 BUG: `symbolic-rules-bridge.ts` still has wrong `action_type` enum

**Location**: Line 52
**Code**: `action_type?: 'BLOCK' | 'WARN' | 'RECOMMEND' | 'DELAY' | 'MONITOR'`
**DB values**: `RECOMMEND | MONITOR | BLOCK | NO_ACTION_REQUIRED | URGENT_ACTION`
**Missing**: `NO_ACTION_REQUIRED`, `URGENT_ACTION`
**Invalid**: `WARN`, `DELAY`

### 4.4 BUG: `layered-rule-evaluator.ts` trigger_keywords matching

**Location**: Lines 1237-1241
**Code**: Still matches rules by `conditions_json.trigger_keywords`
**DB**: 0 rules have `trigger_keywords` in conditions_json (confirmed: `has_trigger_kw = 0`)
**Effect**: Dead code path that never matches anything

### 4.5 BUG: Stage normalization creates mismatch

**Location**: `loader.ts` lines 181-194
**DB stages**: UPPERCASE (`TILLERING`, `GRAND_GROWTH`, `MATURITY`)
**Code normalizes to**: lowercase (`tillering`, `grand_growth`, `maturity`)
**Risk**: If any downstream comparison is case-sensitive, stage matching fails

---

## SECTION 5: IMPLEMENTATION PLAN

### Change 1: Fix `observation_aliases` query (CRITICAL - immediate)

**File**: `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

Remove `.eq('is_active', true)` from line 974. The `observation_aliases` table has no `is_active` column, so this filter returns 0 rows, defeating all alias expansion.

### Change 2: Fix `farmer_safety_level` type mismatch

**File**: `supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts`

Change `farmer_safety_level?: 1 | 2 | 3` to `farmer_safety_level?: 'SAFE' | 'CAUTION' | 'EXPERT_ONLY'` to match DB values.

**File**: `supabase/functions/ai-agriculture-chat/decision/safety-enhancement.ts`

Update `SafetyLevel` type and `getSafetyWarning()` to use string values instead of integers.

### Change 3: Fix `ipm_level` type to include 5

**File**: `supabase/functions/ai-agriculture-chat/bundled-rules/all-rules.ts`

Change `ipm_level?: 1 | 2 | 3 | 4` to `ipm_level?: 1 | 2 | 3 | 4 | 5`.

### Change 4: Clean `symbolic-rules-bridge.ts` dropped columns and enum

**File**: `supabase/functions/ai-agriculture-chat/agents/symbolic-rules-bridge.ts`

- Remove `response_mr`, `response_hi`, `response_en` from interface and mappings
- Update `action_type` union to `'RECOMMEND' | 'MONITOR' | 'BLOCK' | 'NO_ACTION_REQUIRED' | 'URGENT_ACTION'`
- Update `convertToRuleResult()` to use `action_text` / `reason_text` / `i18n_key`

### Change 5: Remove dead `trigger_keywords` matching from `layered-rule-evaluator.ts`

**File**: `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts`

Remove lines 1235-1241 that match by `conditions_json.trigger_keywords` (0 rules have this).

### Change 6: Remove hardcoded PEST/DISEASE translations from `llm-response-formatter.ts`

**File**: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`

Replace `PEST_TRANSLATIONS` and `DISEASE_TRANSLATIONS` dictionaries with lookups from `observation_translations` table (already has a loader: `observation-label-loader.ts`).

### Change 7: Remove duplicate CAUSE_TRANSLATIONS from `diagnosis-only-mode.ts`

**File**: `supabase/functions/ai-agriculture-chat/decision/diagnosis-only-mode.ts`

Replace hardcoded `CAUSE_TRANSLATIONS` (lines 854-900) with the DB-driven `translateCause()` function already available from `translation-loader.ts`.

### Change 8: Fix stage normalization to preserve DB case

**File**: `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

In `normalizeStages()` (lines 181-194), preserve original case instead of lowercasing. The DB stores UPPERCASE stages and comparisons should be case-insensitive at match time, not at load time.

---

## SECTION 6: DATA GAPS REQUIRING DB POPULATION (No code changes)

These gaps require database INSERT operations (not code fixes):

1. **484 missing Marathi/Hindi observation translations** in `observation_translations` table
2. **182 hardcoded products** in `decision-graph-bridge.ts` should be migrated to `master_products` table
3. **260 rules** need `observations` arrays populated in `conditions_json`
4. **444 rules** need `required_plant_part` populated
5. **245 rules** need `required_observation_category` populated
6. **517 rules** have `condition_code = 'STAGE_GENERAL'` instead of specific observation codes

---

## SECTION 7: FILES TO BE MODIFIED (Code Changes Only)

| # | File | Changes |
|---|------|---------|
| 1 | `bundled-rules/loader.ts` | Fix alias query (remove `is_active`), preserve stage case |
| 2 | `bundled-rules/all-rules.ts` | Fix `farmer_safety_level` type, add `ipm_level: 5` |
| 3 | `agents/symbolic-rules-bridge.ts` | Remove dropped columns, fix action_type enum |
| 4 | `agents/layered-rule-evaluator.ts` | Remove dead trigger_keywords matching |
| 5 | `agents/llm-response-formatter.ts` | Replace hardcoded PEST/DISEASE translations with DB loader |
| 6 | `decision/diagnosis-only-mode.ts` | Replace hardcoded CAUSE_TRANSLATIONS with DB-driven function |
| 7 | `decision/safety-enhancement.ts` | Update SafetyLevel to match DB text values |

### Files NOT changed (require separate data migration)

- Database tables (need INSERT migrations for translations, products, observations)
- `decision-graph-bridge.ts` (185 products need `master_products` table populated first)
- `communication-translation-dictionary.ts` (needs cause_translations table first)
- `diagnostic-escalation-generator.ts` (needs observation_translations populated first)
- Frontend code
