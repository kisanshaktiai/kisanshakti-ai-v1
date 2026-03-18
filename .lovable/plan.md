

# Weather Intelligence System: Area + Land Hybrid Architecture

## Current State Summary

**Active tables (5):** `weather_current` (21), `weather_forecasts` (196), `weather_observations` (389), `weather_aggregates` (389), `weather_historical` (28)
**Dead tables (4):** `weather_alerts` (0), `weather_stations` (10), `weather_preferences` (0), `weather_activity_recommendations` (0)

**Critical data defects:**
- 389/389 `weather_observations` have NULL `land_id` — invisible to AI chat
- 389/389 `weather_aggregates` have `temp_min = temp_max` — GDD/ET0 always 0
- 28/28 `weather_historical` have GDD=0, ET0=0, longitude=0
- `rain_24h_mm` uses invalid `rain_3h * 8` estimation
- Running average formula `(existing + new) / 2` is mathematically biased
- Orchestrator hardcodes defaults: 28°C, 65% humidity, 12 km/h wind
- Frontend `useWeather` never passes `landId` — observations always untagged
- Symbolic brain ignores `is_default: true` flag — no confidence penalty

---

## Architecture: Area + Land Hybrid Model

The core insight: **weather is area-based, farming decisions are land-specific**.

```text
┌─────────────────────────────────────────────────────┐
│  AREA LAYER (shared per ~1km grid)                  │
│  location_key = "16.84,74.10"                       │
│                                                     │
│  weather_current  ←→  weather_forecasts             │
│  (temp, humidity, wind, rain, pressure, UV)          │
│                                                     │
│  Shared across ALL lands in same 1km grid            │
│  Fetched once per hour per area                     │
└──────────────────────┬──────────────────────────────┘
                       │ derive
┌──────────────────────▼──────────────────────────────┐
│  LAND INTELLIGENCE LAYER (per land_id)              │
│                                                     │
│  Inputs: soil_type, slope, crop, NDVI, drainage     │
│                                                     │
│  Outputs:                                           │
│  ├─ effective_rainfall_mm (adjusted by soil/slope)  │
│  ├─ runoff_loss_mm                                  │
│  ├─ water_deficit_mm (ET0 - effective rain)         │
│  ├─ irrigation_needed (boolean + urgency)           │
│  ├─ disease_risk_score (0-100)                      │
│  ├─ GDD_accumulated (crop-specific)                 │
│  └─ spray_window (safe/unsafe)                      │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Plan (Phased)

### Phase 1: Fix Data Quality (Critical — stops garbage propagation)

**1A. Fix Tmin/Tmax in aggregates**
- File: `supabase/functions/weather/index.ts`
- In `updateWeatherAggregate()`, use API-provided `current.temp_min` and `current.temp_max` instead of `current.temp` for both min and max when creating a new aggregate (lines 853-854)
- This immediately fixes GDD and ET0 calculations

**1B. Remove `rain_3h * 8` estimation**
- File: `supabase/functions/weather/index.ts` line 605
- Replace `rain_24h_mm: (current.rain_3h || 0) * 8` with `rain_24h_mm: current.rain_1h || 0` (store only what we know; accumulate via aggregates)

**1C. Fix running average formula**
- File: `supabase/functions/weather/index.ts` lines 821-823
- Add `observation_count` tracking to aggregates
- Use proper incremental mean: `new_avg = old_avg + (new_value - old_avg) / (count + 1)`
- Migration: add `observation_count INTEGER DEFAULT 1` to `weather_aggregates`

**1D. Fix `weather_historical` longitude=0**
- File: `supabase/functions/weather/index.ts` lines 946, 979
- Pass `longitude` from the rounded coordinates instead of hardcoding `0`

### Phase 2: Land Intelligence Layer (NEW)

**2A. Create `land_weather_metrics` table**
- New table storing per-land derived weather intelligence
- Schema:
```sql
CREATE TABLE land_weather_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id UUID NOT NULL REFERENCES lands(id),
  tenant_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  -- Area weather (copied for quick access)
  location_key TEXT,
  temperature_c NUMERIC,
  humidity_percent NUMERIC,
  wind_speed_kmh NUMERIC,
  -- Land-specific derived metrics
  total_rainfall_mm NUMERIC DEFAULT 0,
  effective_rainfall_mm NUMERIC DEFAULT 0,
  runoff_loss_mm NUMERIC DEFAULT 0,
  water_deficit_mm NUMERIC DEFAULT 0,
  soil_infiltration_rate TEXT, -- from soil_type
  irrigation_needed BOOLEAN DEFAULT false,
  irrigation_urgency TEXT DEFAULT 'NONE',
  gdd_daily NUMERIC DEFAULT 0,
  gdd_accumulated NUMERIC DEFAULT 0,
  et0_mm NUMERIC DEFAULT 0,
  disease_risk_score INTEGER DEFAULT 0,
  disease_risk_level TEXT DEFAULT 'LOW',
  crop_stress_level TEXT DEFAULT 'NONE',
  water_balance_status TEXT DEFAULT 'BALANCED',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(land_id, metric_date)
);
```

**2B. Add effective rainfall calculation to weather edge function**
- New function `computeLandWeatherMetrics(landId, areaWeather, soilType, cropCode)`
- Scientific effective rainfall formula (USDA SCS method):
  - ER = rainfall × soil_factor × slope_factor × vegetation_factor
  - Soil factors: Black=0.6, Red=0.75, Sandy=0.85, Alluvial=0.7
  - Runoff = rainfall - ER
  - Water deficit = ET0 - ER

**2C. Compute and store land metrics after each weather fetch**
- After `cacheWeatherData()` succeeds, if `landId` is provided, query the land's soil_type and crop, compute metrics, upsert into `land_weather_metrics`

### Phase 3: Frontend & AI Integration

**3A. Pass landId from useWeather hook**
- File: `src/hooks/useWeather.ts`
- Accept optional `landId` prop and include in edge function call body
- When user is on a land-specific page, pass the landId

**3B. Weather freshness guard in symbolic engine**
- File: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
- When `is_default: true`, set weather confidence to `LOW` and append warning to response
- When weather data age > 6 hours, flag as `STALE` with reduced confidence

**3C. Remove hardcoded defaults from orchestrator**
- Replace hardcoded 28°C/65%/12km/h with `null` values
- Let downstream consumers handle missing weather explicitly rather than silently using fake data

### Phase 4: Cleanup

**4A. Drop unused weather tables**
- Migration to drop: `weather_stations`, `weather_preferences`, `weather_activity_recommendations`
- Keep `weather_alerts` (empty but has a working UI component for custom thresholds)

**4B. Backfill existing data**
- SQL update to set `weather_observations.land_id` using proximity matching against `lands.center_lat/center_lon` and `metadata->>'location_key'`
- Recalculate `weather_aggregates` min/max from observations where multiple obs exist per day

---

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/weather/index.ts` | Fix Tmin/Tmax, rain_24h, running avg, longitude, add land metrics computation |
| `src/hooks/useWeather.ts` | Accept and pass `landId` |
| `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` | Weather freshness guard, remove hardcoded defaults |
| New migration | `land_weather_metrics` table, `observation_count` column, drop unused tables |
| New migration | Backfill `weather_observations.land_id` |

## What This Does NOT Change
- No changes to the symbolic engine rule evaluation logic
- No changes to the AI crop schedule
- No changes to any frontend UI components (beyond useWeather hook)
- No new edge functions — all logic added to existing `weather/index.ts`

