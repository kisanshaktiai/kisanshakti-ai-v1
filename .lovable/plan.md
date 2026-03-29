

# World-Class Proactive Agriculture AI — Full System Audit Report

## Executive Summary

The system has a solid architectural foundation: 125 proactive-enabled decision rules, batch-parallel data loading, neural enrichment via Gemini Flash, realtime Supabase push, trilingual content, and a clean 5-state alert lifecycle. However, **3 critical data-wiring bugs** prevent 90% of the intelligence from reaching farmers. All 15 existing alerts are identical NDVI-stress type. The 125 weather-dependent decision rules literally cannot fire because forecast and GDD data is unreachable.

---

## A. Codebase Audit

### Critical Issues (P0)

**P0-1: Forecast/GDD queries return ZERO rows — `weather_forecasts.land_id` is always NULL**

`batchLoadForecast()` and `batchLoadGDD()` (lines 577-621) query `weather_forecasts` filtering by `land_id IN (landIds)`. But weather forecasts are stored with `location_key` only — `land_id` is NULL for all 196 rows. Result: `forecast_rain_probability_72h` and `gdd_accumulated` are always `null` for every land. Every disease-risk, pest-emergence, and waterlogging rule that depends on these signals silently fails.

**Fix**: Rewrite `batchLoadForecast()` and `batchLoadGDD()` to query by `location_key` (matching the land's coordinates via `makeLocationKey()`), not `land_id`. Map results back to land IDs using the same coordinate→land mapping used for weather_current.

**P0-2: Decision rules produce English-only alerts (title_mr/hi = null)**

Lines 402-410: When decision rules fire, they set `title_mr: null`, `title_hi: null`, `message_mr: null`, `message_hi: null`. Only English fields are populated. The neural enrichment (line 434) only runs for `risk_score >= 70`, so medium/low risk decision-rule alerts are English-only. For a rural Indian farmer, this means most alerts are unreadable.

**Fix**: For decision rules without neural enrichment, generate template-based Marathi/Hindi messages using the rule's `reason_text`/`action_text` and a basic translation mapping, or always run enrichment for decision-rule alerts since they lack templates.

**P0-3: Neural enrichment blocks alert insertion (synchronous)**

Lines 433-436: `enrichHighRiskAlerts()` is awaited BEFORE `alertsToInsert` are written to the database. If Gemini Flash takes 3-5 seconds per alert (×5 max), that's 15-25 seconds of blocking. Combined with the current avg execution time of 5.5s, this risks edge function timeout (60s limit).

**Fix**: Insert alerts first with template text at status='PENDING', then enrich asynchronously. Or move enrichment to a separate post-processing edge function triggered by a database webhook.

### High Issues (P1)

**P1-1: `growing_degree_days` is NULL for all 196 forecast rows**

Even if the land_id query were fixed, GDD would still be null because the weather edge function never computes/stores `growing_degree_days`. All pest-emergence rules depending on GDD accumulation are dead.

**Fix**: Compute GDD in the weather edge function: `max(0, (temp_max + temp_min)/2 - base_temp)` where `base_temp` varies by crop (10°C for sugarcane, 5°C for wheat). Store in `weather_forecasts.growing_degree_days` or `weather_aggregates`.

**P1-2: `handleAskAI` sends English-only query regardless of farmer's language**

Line 62: `const query = \`Tell me more about ${category} on ${landName}\`` — always English. A Marathi-speaking farmer clicking "Ask AI" will send an English query to the chat, breaking the multilingual experience.

**Fix**: Use i18n translation with template variables or compose in the farmer's detected language.

**P1-3: No tenant filtering in evaluator's land query**

Line 138-141: `supabase.from('lands').select(...).eq('is_active', true)` loads ALL active lands across ALL tenants. In a multi-tenant system with 1M+ users, this will load millions of lands per evaluation run.

**Fix**: Filter by `tenant_id` when provided. For cron runs, iterate tenants or use a tenant queue pattern.

### Medium Issues (P2)

**P2-1: Duplicate RLS INSERT policies on `proactive_alerts`**

Two INSERT policies exist: "Service can insert proactive alerts" and "Service insert proactive_alerts" — both with `qual: null`. Redundant and confusing for audits.

**P2-2: `rain_probability_percent` is 0 for all forecast rows**

All 196 forecast rows have `rain_probability_percent = 0`. Either the API doesn't provide this or the weather function doesn't map it. The forecast rain signal is effectively dead even if the query were fixed.

**P2-3: 500-land limit on evaluator**

Line 145: `.limit(500)` — a hard cap. If a tenant has >500 active lands, the remaining are silently skipped.

### Low Issues (P3)

**P3-1: Evidence section uses raw key names** — `soil_n` shown as "soil n" instead of "Nitrogen (N)".

**P3-2: No pagination on alert inbox** — loading 50 alerts at once; fine for now but not for power users.

---

## B. Database Audit

### Data Integrity Issues

| Issue | Table | Finding |
|-------|-------|---------|
| land_id always NULL | weather_forecasts | 196 rows, 0 with land_id set. Breaks forecast/GDD queries. |
| growing_degree_days always NULL | weather_forecasts | Never computed by weather edge function |
| rain_probability_percent always 0 | weather_forecasts | API mapping issue — no actual probability data |
| 0 soil_health for most lands | soil_health | 36 rows across 25 lands — some lands missing soil data |
| Duplicate INSERT RLS policies | proactive_alerts | Two identical INSERT policies |

### Rule Coverage Analysis

| Category | Proactive-Enabled | Total Active | Gap |
|----------|------------------|-------------|-----|
| pest | 3 | 84 | 81 pest rules not proactive |
| disease | 7 | 60 | 53 disease rules not proactive |
| nutrition | 3 | 62 | 59 nutrition rules not proactive |
| irrigation | 25 | 42 | 17 irrigation rules not proactive |
| safety | 16 | 36 | 20 safety rules not proactive |
| stress | 15 | 31 | 16 stress rules not proactive |
| weather | 18 | 20 | 2 weather rules not proactive |
| soil | 0 | 21 | 21 soil rules completely missing from proactive |
| harvest | 0 | 13 | 13 harvest rules missing |
| stage_problems | 1 | 27 | 26 stage rules missing |

**Key gap**: Soil (21 rules), harvest timing (13 rules), and diagnosis (36 rules) are completely absent from proactive evaluation.

### Agronomic Issues

- All 15 alerts are CROP_STRESS/NDVI. Zero pest, disease, irrigation, or weather alerts have ever been generated despite 125 enabled rules — because weather/forecast signals never reach the evaluator.
- No ETL (Economic Threshold Level) alerts have fired — GDD is always null, and ETL fallback requires temp ≥ 25°C AND humidity ≥ 60%, but current humidity across locations is 15-48% (dry season), so the fallback also fails.

---

## C. Proactive Intelligence System Audit

### Missing Capabilities

1. **Forecast signals completely disconnected** — land_id query mismatch
2. **GDD never computed** — pest emergence timing impossible
3. **No cross-land collective intelligence** — no regional trend analysis
4. **No feedback loop** — ACTED/DISMISSED outcomes not tracked for rule effectiveness
5. **No seasonal calendar integration** — missing sowing-window, harvest-window advisory triggers

### Rule Evaluation Gaps

- 60% threshold for COMPOUND/DISEASE_RISK is correct agronomically
- 50% threshold for decision rules (line 1127) may be too loose — could produce false positives
- ETL evaluation (lines 1100-1108) uses `gdd >= etl_value_min * 10` — the multiplier of 10 is an unexplained magic number without agronomic justification

### Symbolic vs LLM Boundary

- Correctly enforced: LLM only used for enrichment text, never for decision-making
- Neural enrichment correctly bounded to 5 alerts per batch
- Template fallback exists for non-enriched alerts

---

## D. UI/UX Audit

### What Works Well
- Priority sorting (CRITICAL first), animated cards, TTS integration
- "Why this alert?" evidence section with collapsible UI
- Alert bell with unread badge on Home page
- Clean mobile-first layout (390px viewport compatible)

### Issues

1. **All alerts look identical** — only CROP_STRESS category, no variety in icons/colors
2. **Decision-rule alerts are English-only** for non-enriched alerts
3. **"Ask AI" sends English query** regardless of farmer language
4. **No land-specific filtering** — farmer sees all alerts in one list, no way to filter by field
5. **No date grouping** — all alerts in one flat list, no "Today"/"Yesterday" sections
6. **Evidence labels not localized** — "soil n", "humidity" shown as English keys

---

## Execution Plan

### Phase 1: Critical Fixes (P0 — must fix immediately)

| # | Fix | File | Type |
|---|-----|------|------|
| 1 | Rewrite `batchLoadForecast()` and `batchLoadGDD()` to query by `location_key` instead of `land_id`, mapping results back to lands via coordinate lookup | `supabase/functions/proactive-evaluator/index.ts` | Code |
| 2 | Add trilingual template fallback for decision-rule alerts when neural enrichment is skipped | `supabase/functions/proactive-evaluator/index.ts` | Code |
| 3 | Make neural enrichment non-blocking: insert alerts first, then enrich and update | `supabase/functions/proactive-evaluator/index.ts` | Code |
| 4 | Fix "Ask AI" deeplink to use farmer's language | `src/pages/ProactiveAlerts.tsx` | Code |
| 5 | Add tenant_id filter to lands query in evaluator | `supabase/functions/proactive-evaluator/index.ts` | Code |

### Phase 2: Signal Completeness (P1)

| # | Fix | File | Type |
|---|-----|------|------|
| 6 | Compute and store GDD in weather edge function | `supabase/functions/weather/index.ts` | Code |
| 7 | Fix rain_probability_percent mapping from OpenWeather API | `supabase/functions/weather/index.ts` | Code |
| 8 | Enable soil category rules as proactive (21 rules) | Database UPDATE | DB |
| 9 | Enable harvest timing rules as proactive (13 rules) | Database UPDATE | DB |

### Phase 3: World-Class Features (P2/P3)

| # | Feature | Impact |
|---|---------|--------|
| 10 | Localize evidence labels in AlertEvidenceSection | Farmer readability |
| 11 | Add land-filter tabs on ProactiveAlerts page | Usability |
| 12 | Add "Today"/"Earlier" date grouping | Cognitive load reduction |
| 13 | Feedback loop: track ACTED/DISMISSED per rule for confidence tuning | System learning |
| 14 | Remove duplicate INSERT RLS policy | DB hygiene |

### Expected Outcome After Phase 1

- Alert diversity increases from 1 type (NDVI) to 6+ types (disease, pest, irrigation, weather, stress, safety)
- Forecast rain probability and GDD signals become available to all 125 proactive rules
- Decision-rule alerts become readable in Marathi/Hindi
- System scales correctly per-tenant instead of loading all lands globally

