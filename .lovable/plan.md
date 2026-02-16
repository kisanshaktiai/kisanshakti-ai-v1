
# Critical Bug Audit Report: Data Flow Verification

## Summary

After deep analysis of the database schema, edge function code, live data, and runtime logs, I found **3 critical bugs** that break the symbolic decision brain's data pipeline, plus **1 major routing bug** that prevents proper query classification.

---

## CRITICAL BUG 1: `authoritative-state-loader.ts` Queries Non-Existent Columns/Tables

**Severity:** P0 - Complete data loading failure

The `authoritative-state-loader.ts` (the SSOT module) queries columns and tables that DO NOT EXIST in the database. Every query silently fails, returning null/empty data.

### Column/Table Mismatches Found:

| Code Queries | Actual DB Column/Table | Impact |
|---|---|---|
| `lands.area_hectares` | `lands.area_acres` | Area = 0, dosage calculations broken |
| `lands.latitude` | `lands.center_lat` | No weather lookup possible |
| `lands.longitude` | `lands.center_lon` | No weather lookup possible |
| `ndvi_readings` (table) | `ndvi_data` (table) | NDVI always null |
| `ndvi_readings.observation_date` | `ndvi_data.date` | NDVI date wrong |
| `weather_data` (table) | Does not exist | Weather always null |
| `crop_schedules.crop_code` | Does not exist | Crop code always null |
| `crop_schedules.current_stage` | Does not exist | Stage always null |
| `soil_health.soil_texture` | `soil_health.texture` | Soil texture null |

**Result:** The authoritative state loader returns empty/zeroed data for ALL signals (NDVI, weather, soil texture, area, coordinates), making the derived interpretations meaningless.

### Fix:
Update all queries in `authoritative-state-loader.ts` to use the correct column names:

```text
lands: area_hectares -> area_acres (and compute hectares as area_acres/2.471)
lands: latitude -> center_lat
lands: longitude -> center_lon
ndvi_readings -> ndvi_data
ndvi_readings.observation_date -> ndvi_data.date
weather_data -> weather_observations (or remove and use orchestrator's weather fetch)
crop_schedules: remove crop_code, current_stage from select
soil_health: soil_texture -> texture
```

---

## CRITICAL BUG 2: Query Router Misses Romanized Language (Transliteration)

**Severity:** P0 - Wrong routing for ~60% of farmer queries

**Evidence from test:**
- Message: `"sugarcane madhe pani kiti dyayche"` (Marathi in Latin script = "How much water for sugarcane?")
- Expected route: `IRRIGATION_SCHEDULING`
- Actual route: `GENERAL_INFO` (50% confidence)

The `IRRIGATION_PATTERNS` array only matches:
- Devanagari: `पाणी`, `पानी`, `सिंचाई`
- English: `water`, `irrigat`, `moisture`

It does NOT match romanized Marathi/Hindi: `pani`, `paani`, `sinchai`

This affects ALL pattern arrays (pest, irrigation, weather, market, crop health). Rural Indian farmers frequently type in romanized regional languages.

### Fix:
Add romanized patterns to each regex array in `query-router.ts`:

```text
IRRIGATION_PATTERNS: Add /pani|paani|sinchai|drip|thibak|olava/i
PEST_DISEASE_PATTERNS: Add /kidi|kida|mashi|mava|illi|ali|rog|bimari/i  
WEATHER_SPRAY_PATTERNS: Add /havaman|mausam|paus|barish|favarni/i
MARKET_PATTERNS: Add /bhav|kimmat|vikri|bechna|mandi|bajar/i
CROP_HEALTH_PATTERNS: Add /majhe pik|mera fasal|pik kase/i
```

---

## CRITICAL BUG 3: `area_acres` Becomes Zero in Authoritative State

**Severity:** P0 - All dosage calculations produce zero values

In `authoritative-state-loader.ts` line 547-548:
```text
area_hectares: land.area_hectares || 0,    // area_hectares doesn't exist -> 0
area_acres: (land.area_hectares || 0) * 2.471,  // 0 * 2.471 = 0
```

Since `area_hectares` doesn't exist in the `lands` table, `area_acres` is always computed as `0 * 2.471 = 0`. This means:
- Total dosage calculations: `dosage_per_acre * 0 = 0`
- Total water calculations: `water_per_acre * 0 = 0`
- Farmer gets "0ml product in 0L water"

### Fix:
```text
area_acres: land.area_acres || 0,
area_hectares: (land.area_acres || 0) / 2.471,
```

---

## MAJOR BUG 4: Soil Data Missing for 3 of 4 Active Lands

**Severity:** Major - Incomplete agronomic data

### Current Farmer Data Status Report:

| Land | Crop | Area | Sowing | Soil Data | NDVI | Coordinates |
|---|---|---|---|---|---|---|
| Mala (6b0d...) | Sugarcane 86032 | 7.59 ac | 2025-12-28 | MISSING | 0.124 (CRITICAL) | MISSING |
| Mala- (a652...) | Sugarcane 86032 | 0.43 ac | 2025-12-11 | MISSING | MISSING | MISSING |
| Mala (e3cc...) | Sugarcane 86032 | 1.96 ac | 2025-12-30 | MISSING | 0.222 (POOR) | MISSING |
| Khari (ca96...) | Wheat HD-2967 | 0.33 ac | 2025-11-30 | YES (soilgrid) | 0.104 (CRITICAL) | YES |

### Agronomic Concerns:
1. **NDVI 0.104-0.222 for 50-day sugarcane** is suspiciously low. At 50 DAS, healthy sugarcane should show NDVI 0.3-0.5. These values suggest either bare soil or crop failure.
2. **Soil data from SoilGrid only** - all readings show K=500 kg/ha (unusually high), which is typical of SoilGrid regional estimates, not field-specific tests.
3. **3 lands missing coordinates** - weather cannot be fetched for these lands.
4. **No irrigation_type set for the main land** (7.59 ac sugarcane) - the decision brain cannot provide irrigation scheduling advice.

### Data the farmer needs to provide:
- **Soil test reports** (actual lab test, not SoilGrid) for all sugarcane lands
- **GPS coordinates** for the 3 lands without center_lat/center_lon
- **Irrigation type and water source** for the main 7.59-acre land

---

## Implementation Plan

### File 1: `supabase/functions/ai-agriculture-chat/decision/authoritative-state-loader.ts`

Fix all broken queries:

1. **Line 369**: Change `area_hectares, latitude, longitude` to `area_acres, center_lat, center_lon`
2. **Lines 396-400**: Change `ndvi_readings` to `ndvi_data`, change `observation_date` to `date`
3. **Lines 403-409**: Remove `weather_data` query (table doesn't exist). Use weather from orchestrator's weather fetch instead, or query `weather_observations`/`weather_aggregates`.
4. **Line 378**: Remove `crop_code, current_stage` from crop_schedules select
5. **Line 388**: Change `soil_texture` to `texture`
6. **Lines 547-548**: Fix area computation: `area_acres: land.area_acres || 0` and `area_hectares: (land.area_acres || 0) / 2.471`
7. **Lines 549-550**: Fix coordinates: `latitude: land.center_lat` and `longitude: land.center_lon`
8. **Line 557**: Fix growth stage: Remove `current_stage` reference, compute from sowing_date
9. **Line 570**: Fix `soil_texture` reference to `texture`

### File 2: `supabase/functions/ai-agriculture-chat/agents/query-router.ts`

Add romanized language patterns:

1. **IRRIGATION_PATTERNS (line 116-124)**: Add romanized patterns:
   `/pani|paani|sinchai|thibak|olava|nami/i`
   `/kiti pani|kitna pani|pani dyayche|pani dena/i`

2. **PEST_DISEASE_PATTERNS (line 78-113)**: Add romanized patterns:
   `/kidi|kida|mashi|mava|ali|rog|bimari|upay|ilaj|aushadh|davai/i`
   `/favarni|spray|kay karu|kya kare/i`

3. **WEATHER_SPRAY_PATTERNS (line 127-136)**: Add:
   `/havaman|mausam|paus|barish|favarni karu ka/i`

4. **MARKET_PATTERNS (line 139-146)**: Add:
   `/bhav|kimmat|vikri|bechna|mandi|bajar/i`

5. **CROP_HEALTH_PATTERNS (line 169-190)**: Add:
   `/majhe pik|mera fasal|pik kase|fasal kaisi/i`

6. **GREETING_PATTERNS (line 163-166)**: Add:
   `/^(namaste|namaskar|jai hind)$/i`

---

## Technical Details

### Correct Column Mapping (DB Truth)

```text
lands table:
  area_acres (NOT area_hectares)
  center_lat (NOT latitude)
  center_lon (NOT longitude)
  soil_type, irrigation_type, water_source, cultivation_date

soil_health table:
  texture (NOT soil_texture)
  ph_level, organic_carbon, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha
  test_date (NOT tested_at)

ndvi_data table (NOT ndvi_readings):
  ndvi_value, mean_ndvi, date (NOT observation_date)
  min_ndvi, max_ndvi, quality_score

crop_schedules table:
  crop_name, crop_variety, sowing_date, expected_harvest_date
  is_active, status
  (NO crop_code, NO current_stage columns)

weather_observations table:
  observation_date, temperature_celsius, metadata, land_id

weather_aggregates table:
  aggregate_date, temp_min_celsius, temp_max_celsius, gdd_accumulated, land_id
```

### Risk Assessment

- Bug 1 fix (authoritative-state-loader): High impact, medium risk - must test all downstream consumers
- Bug 2 fix (query-router): High impact, low risk - adding patterns is additive
- Bug 3 fix (area_acres): High impact, low risk - single line fix
- Bug 4 (data gaps): Informational - farmer needs to provide missing data

### Files Modified

1. `supabase/functions/ai-agriculture-chat/decision/authoritative-state-loader.ts` (Critical schema fixes)
2. `supabase/functions/ai-agriculture-chat/agents/query-router.ts` (Romanized language patterns)
