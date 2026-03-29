

# Proactive Intelligence System — Phase 2 Audit + Fix Plan

## Current State (Honest Assessment)

**Working**: 15 alerts generated from 25 lands on first run. Cron fires every 15 min. Batch-loading, dedup, neural enrichment all functional. All 15 alerts are NDVI-stress (PRO_NDVI_STRESS) — the system works but is one-dimensional.

**Key numbers**:
- 584 active decision_rules, only **3** have `is_proactive_rule = true`
- 10 proactive_rules (template-based), but only 1 type fires (NDVI stress)
- 316 rules in pest/disease/nutrition/irrigation/weather/stress/soil categories with `confidence >= 0.7` — none proactive-enabled
- Latest cron runs: 16 rules fire but **0 new alerts** (all deduped — 72h cooldown working correctly)
- `conditions_json` in decision_rules uses **string-format thresholds** like `">80%"`, `"22-28C"`, `"high_humidity": true` — the evaluator expects numeric keys like `temp_min`, `humidity_min`. **The format mismatch means decision_rules can NEVER fire proactively.**

## Root Causes (3 Critical, 2 High)

### N1: Only 3 decision_rules are proactive-enabled (CRITICAL)

The 578 ICAR-validated rules are sitting idle. The user's suggested SQL (`UPDATE decision_rules SET is_proactive_rule = true WHERE...`) won't work because `forecast_horizon_days IS NOT NULL` would match 0 rows — all 584 rules have `forecast_horizon_days = NULL`.

**Fix**: Update proactive-eligible rules with proper criteria (weather-dependent pest/disease/nutrition categories with conditions_json containing weather triggers), AND set `forecast_horizon_days` to sensible values.

### N2: conditions_json format incompatible with evaluator (CRITICAL)

Decision rules store weather conditions as human-readable strings:
```json
{"weather": {"humidity": ">80%", "temperature": "22-28C"}}
```
But `evaluateDecisionRule()` expects numeric fields:
```json
{"temp_min": 22, "temp_max": 28, "humidity_min": 80}
```
The evaluator's `cj.temp_min`, `cj.humidity_min` lookups return `undefined` for ALL existing decision_rules. **Zero decision_rules will ever fire proactively.**

**Fix**: Add a `parseDecisionRuleConditions()` function that translates the existing string-format `conditions_json.weather` into numeric thresholds the evaluator can use. This is a code-only fix — no DB changes needed.

### N3: GDD never computed (HIGH)

`gdd_accumulated` is always `null` (line 278: hardcoded `null`). The `weather_forecasts` table has a `growing_degree_days` column. Pest emergence rules (ESB borer) depend on GDD.

**Fix**: Batch-load GDD from `weather_forecasts` where `land_id` matches and sum `growing_degree_days` over last 30 days.

### N4: weather_forecasts.land_id may not be populated (HIGH)

The forecast loader queries `weather_forecasts` by `land_id`, but forecasts may be stored with `location_key` only (no `land_id`). Need to verify and handle both lookup paths.

## Execution Plan (4 Steps)

### Step 1: Enable proactive rules in decision_rules (DB UPDATE)

SQL to mark weather-dependent pest/disease/nutrition/irrigation rules as proactive:
```sql
UPDATE decision_rules 
SET is_proactive_rule = true,
    forecast_horizon_days = 3
WHERE is_active = true
  AND category IN ('pest', 'disease', 'nutrition', 'irrigation', 'stress', 'weather', 'stage_problems')
  AND conditions_json IS NOT NULL
  AND conditions_json::text LIKE '%weather%'
  AND confidence_score >= 0.7;
```
This targets ~50-80 rules that have weather-dependent conditions — the rules most suitable for proactive evaluation against real-time weather data.

### Step 2: Fix conditions_json parser in evaluator (CODE)

Add `parseDecisionRuleConditions(cj)` to `proactive-evaluator/index.ts`:
- Parse `"humidity": ">80%"` → `humidity_min: 80`
- Parse `"temperature": "22-28C"` → `temp_min: 22, temp_max: 28`
- Parse `"high_humidity": true` → `humidity_min: 80` (agronomic default)
- Parse `"warm_temperature": true` → `temp_min: 25` (agronomic default)
- Parse `"waterlogging": true` → `rain_min: 50`
- Feed parsed numeric conditions into `evaluateDecisionRule()`

### Step 3: Fix GDD computation (CODE)

In `proactive-evaluator/index.ts`:
- Batch-load from `weather_forecasts` using either `land_id` or `location_key` matching
- Sum `growing_degree_days` for each land over last 30 days
- Set `gdd_accumulated` in LandContext

### Step 4: Add category mappings for new rule categories (CODE)

Extend `mapDecisionCategory()` and `mapDecisionPriority()` to handle all categories that are now proactive-enabled: `pest`, `disease`, `nutrition`, `irrigation`, `stress`, `weather`, `stage_problems`.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/proactive-evaluator/index.ts` | Add conditions_json parser, fix GDD computation, extend category mappings |
| Database (INSERT tool) | UPDATE decision_rules to enable ~50-80 weather-dependent rules as proactive |

## What This Does NOT Change

- No frontend changes
- No new tables or schema changes
- No changes to AI Chat pipeline
- No changes to proactive_rules (template rules continue to work as-is)
- No changes to LLM formatter or narration layer

## Expected Outcome

After these fixes:
- ~50-80 decision_rules become proactive-eligible (up from 3)
- Disease risk alerts fire when humidity >80% + warm temps match
- Pest alerts fire when GDD thresholds are crossed
- Nutrition/irrigation alerts fire based on weather+stage combinations
- Alert diversity increases from 1 type (NDVI stress) to 8+ types

