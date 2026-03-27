

# SQL Audit Report: Fix Orphaned Observations — Intent Mapping

## Executive Summary

The SQL maps 1,086 orphaned observations from `observation_master` to `intent_observation_mapping`. The numbers check out: 1,219 active observations, 133 currently mapped, 1,086 orphaned. However, there are **3 critical issues** that will cause the SQL to **FAIL or produce broken data** if run as-is.

---

## CRITICAL ISSUE 1: Missing Required Columns (WILL FAIL)

The `intent_observation_mapping` table has **3 NOT NULL columns** with **no defaults** that the SQL does not provide:

| Column | Type | Nullable | Default | Provided in SQL? |
|--------|------|----------|---------|-----------------|
| `growth_stage` | text | **NO** | none | **NO** |
| `das_min` | integer | **NO** | none | **NO** |
| `das_max` | integer | **NO** | none | **NO** |

**Every INSERT in this SQL will fail** with a NOT NULL constraint violation because `growth_stage`, `das_min`, and `das_max` are not included in the INSERT column list.

**Fix required**: Add these columns to every INSERT. Recommended default: `growth_stage = 'ALL'`, `das_min = 0`, `das_max = 999` (matches existing catch-all pattern in the table).

---

## CRITICAL ISSUE 2: 18 Categories Not Explicitly Handled

The SQL explicitly handles these categories: DISEASE, PEST, NUTRIENT, DEFICIENCY, PHYSIOLOGY, ABIOTIC, MANAGEMENT, WEED, LEAF_SYMPTOM, STEM_SYMPTOM, ROOT_SYMPTOM, INSECT_SIGNAL, WHOLE_PLANT, FIELD_SYMPTOM.

**But 18 other categories exist** with 113 orphaned observations that are NOT pattern-matched by any specific phase:

| Category | Count | Handled? |
|----------|-------|----------|
| GENERAL | 30 | Only by Phase 9 catch-all |
| symptom (lowercase) | 13 | Only by Phase 9 catch-all |
| MONITORING | 11 | Only by Phase 9 catch-all |
| FUNGAL | 7 | Only by Phase 9 catch-all |
| ACTION_TYPE | 7 | Only by Phase 9 catch-all |
| SYMPTOM | 6 | Only by Phase 9 catch-all |
| STAGE | 5 | Only by Phase 9 catch-all |
| PEST_STAGE | 5 | Only by Phase 9 catch-all |
| NDVI | 4 | Only by Phase 9 catch-all |
| IPM | 4 | Only by Phase 9 catch-all |
| BACTERIAL | 3 | Only by Phase 9 catch-all |
| BORER | 2 | Only by Phase 9 catch-all |
| SUCKING | 2 | Only by Phase 9 catch-all |
| THRIPS | 2 | Only by Phase 9 catch-all |
| SAFETY | 2 | Only by Phase 9 catch-all |
| + 10 more with 1 each | 10 | Only by Phase 9 catch-all |

Phase 9's catch-all will map ALL of these to `GENERAL_CROP_INFO` with `confidence_rank = 3`. This is **agronomically incorrect** for several:

- **FUNGAL** (7) → should map to `DISEASE_LIKE_PATTERN`
- **BACTERIAL** (3) → should map to `DISEASE_LIKE_PATTERN`
- **VIRAL** (1) → should map to `DISEASE_LIKE_PATTERN`
- **BORER** (2) → should map to `BORER_IDENTIFICATION`
- **SUCKING** (2), **THRIPS** (2), **CHEWING** (1), **MITE** (1), **LEAF_MINER** (1) → should map to `PEST_PRESENCE_VISIBLE`
- **PEST_STAGE** (5) → should map to `PEST_PRESENCE_VISIBLE`
- **NDVI** (4), **MONITORING** (11), **STAGE** (5) → `GENERAL_CROP_INFO` is acceptable
- **SAFETY** (2) → should map to `GENERAL_CROP_INFO` (acceptable)

**Impact**: ~20 pest/disease observations will be mapped to `GENERAL_CROP_INFO` instead of their correct diagnostic intent, weakening rule matching.

---

## CRITICAL ISSUE 3: Intent Codes Not in VALID_INTENT_CODES Whitelist

The SQL uses intent codes that are **already in the DB** (existing 35 intents). However, several intents used in the SQL are **NOT in the code whitelist** (`VALID_INTENT_CODES` in `intent-resolver.ts`):

| Intent in SQL | In VALID_INTENT_CODES? | In DB? |
|---------------|----------------------|--------|
| `BORER_IDENTIFICATION` | **NO** | YES (8 rows) |
| `FLOOD_DROUGHT_DAMAGE` | **NO** | YES (3 rows) |
| `NUTRIENT_TOXICITY_ALERT` | **NO** | YES (3 rows) |
| `WEATHER_ADVISORY` | **NO** | YES (6 rows) |
| `ANIMAL_DAMAGE` | **NO** | YES (2 rows) |
| `RATOON_MANAGEMENT_QUERY` | **NO** | YES (4 rows) |
| `EQUIPMENT_USAGE` | **NO** | YES (4 rows) |

**Impact**: The intent classifier will reject these as invalid and default to `UNKNOWN_OBSERVATION`, making the mapped observations unreachable. The DB data exists but the code ignores it.

Note: `BORER_IDENTIFICATION` was supposed to be added in the recent P0 fix (see plan.md), but it's not in `VALID_INTENT_CODES`.

---

## Will Orphans Remain After Execution?

**If the NOT NULL issue is fixed**: Phase 9's catch-all (`observation_code NOT IN (SELECT ...)`) will sweep every remaining observation into `GENERAL_CROP_INFO`. So **zero orphans will remain** — the SQL is designed to be exhaustive.

However, this is a **false sense of completeness**. ~20 pest/disease observations will be incorrectly categorized under `GENERAL_CROP_INFO` instead of their proper diagnostic intents.

---

## ON CONFLICT DO NOTHING Analysis

The SQL uses `ON CONFLICT DO NOTHING` but the table has **no UNIQUE constraint** on `(intent_code, crop_code, observation_code)`. This means `ON CONFLICT` will only trigger on the `id` primary key (uuid, auto-generated). In practice, **ON CONFLICT will never trigger** — if run twice, it will create **duplicate rows**.

---

## Intent Resolver Query Impact

The `intent-resolver.ts` currently queries with a HOTFIX that only filters by `intent_code` + `is_active` (lines 137-146), ignoring `crop_code`, `growth_stage`, `das_min`, `das_max`. So the mapped data WILL be found by the resolver regardless of the stage/DAS values. But when the HOTFIX is removed and full filtering is restored, the `growth_stage = 'ALL'` / `das_min = 0` / `das_max = 999` defaults will work correctly.

---

## Recommendation

1. **Add missing columns** to every INSERT: `growth_stage = 'ALL'`, `das_min = 0`, `das_max = 999`
2. **Add explicit phases** for FUNGAL, BACTERIAL, VIRAL → `DISEASE_LIKE_PATTERN` and BORER, SUCKING, THRIPS, CHEWING, MITE, LEAF_MINER, PEST_STAGE → `PEST_PRESENCE_VISIBLE`
3. **Add a UNIQUE constraint** or use `UPSERT` logic to prevent duplicates on re-run
4. **Add missing intent codes** to `VALID_INTENT_CODES` in `intent-resolver.ts`: `BORER_IDENTIFICATION`, `FLOOD_DROUGHT_DAMAGE`, `ANIMAL_DAMAGE`, `RATOON_MANAGEMENT_QUERY`
5. **Do NOT run this SQL as-is** — it will fail on the NOT NULL constraint

