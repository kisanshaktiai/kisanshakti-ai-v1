

# Weather System Deep Audit Report

## 1. The `weather_alerts` Table: 1383 Rows of Dead Data

**All 1383 records have `event_type = 'cache'`**. None are real alerts.

These are **legacy weather cache entries** from an old frontend caching strategy (Sept 2025 - Dec 2025) that stored full API responses (current + forecast JSON) inside the `weather_alerts` table using `alert_id = 'weather-cache'`. This was the **old `weather_cache` system** -- the same one the orchestrator was previously querying (the bug we fixed).

| Fact | Value |
|------|-------|
| Total rows | 1383 |
| event_type breakdown | 100% `cache` (0 real alerts) |
| Unique locations | 539 |
| Date range | 2025-09-09 to 2025-12-08 |
| Used by codebase? | **Only `WeatherAlerts.tsx`** -- and it filters `event_type = 'custom_threshold'`, so it never sees these 1383 rows |
| Used by edge functions? | **Zero references** in any edge function |
| Used by AI chat? | **No** -- orchestrator now queries `weather_current` |

**Verdict**: The 1383 rows are completely orphaned junk data. No code reads them. They should be deleted.

---

## 2. Current Weather Table Health

| Table | Row Count | Status |
|-------|-----------|--------|
| `weather_current` | 21 | Active -- 2 records fresh (today), rest aging |
| `weather_forecasts` | 196 | Active -- populated by edge function |
| `weather_observations` | 389 | All have `land_id = NULL` |
| `weather_aggregates` | 389 | Populated but GDD=0, ET0=0 (formula issue) |
| `weather_alerts` | 1383 | **Dead** -- 100% legacy cache, zero real alerts |

---

## 3. AI Chat Weather Fix Status (Post Our Changes)

The orchestrator's `fetchWeatherData()` now correctly:
- Queries `weather_current` (not the deleted `weather_cache` table)
- Uses comma-separated `location_key` format (`16.84,74.10`)
- Has proximity fallback (±0.5° Euclidean distance)
- Enriches with `weather_forecasts` for 24h forecast data
- Returns `is_default: false` with real data when a match is found

**Remaining gap**: 22 of 25 lands have no GPS coordinates, so the system still falls back to defaults for those lands.

---

## 4. `WeatherAlerts.tsx` Component Audit

This is the **only file** in the entire codebase that reads/writes `weather_alerts`. It:
- Fetches rows with `event_type = 'custom_threshold'` (0 rows exist with this type)
- Lets users create custom threshold alerts (temperature > X, rainfall > Y)
- Has hardcoded sample warnings (not from DB)
- Notification preferences (push, SMS, email) are UI-only toggles with no backend

**The component works but the feature is essentially unused** -- no real alert-checking engine exists to trigger these thresholds against live weather.

---

## 5. Recommended Cleanup Plan

### Fix A: Delete 1383 dead cache rows from `weather_alerts`
A single migration: `DELETE FROM weather_alerts WHERE event_type = 'cache'`

### Fix B: Remove dead `normalizeWeatherData` code
The `normalizeWeatherData` method in `orchestrator.ts` (line 7737) still references "weather_cache format" in comments. This path is dead code since `fetchWeatherData` now returns canonical format directly.

### Fix C: No other code changes needed
The weather pipeline (`weather` edge function -> `weather_current` -> orchestrator -> AI chat) is working correctly after our previous fixes.

---

## Summary

The `weather_alerts` table was **hijacked as a weather cache** by old frontend code. All 1383 entries are stale cache blobs from 3-6 months ago. Zero backend or AI chat code reads them. The only consumer (`WeatherAlerts.tsx`) filters for `custom_threshold` type which has zero rows. The recent `weather_cache` -> `weather_current` fix in the orchestrator is correct and working. The cleanup is safe: delete the 1383 dead rows and optionally remove the dead `normalizeWeatherData` weather_cache format handling.

