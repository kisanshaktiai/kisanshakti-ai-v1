# Weather System Deep Audit & Root Cause Analysis

**Date**: 2025-11-28  
**Status**: 🔴 CRITICAL ISSUES FOUND

---

## 🚨 CRITICAL FINDINGS

### 1. **Home Page vs Weather Page Data Inconsistency**

**Root Cause**: Both pages use the same `useWeather` hook BUT display different values due to:
- **Home page**: Shows cached localStorage data (stale-while-revalidate pattern)
- **Weather page**: Shows fresh API data
- **Race condition**: Home page renders before fresh API data arrives

**Impact**: Users see different temperatures, humidity, wind speed on home vs weather page.

---

### 2. **Database Storage FAILURE** 🔥

#### Weather Current Table:
```sql
-- All data is MONTHS OLD (July-September 2025)
-- But expires_at is set to TODAY 2025-11-28!
-- This is logically impossible - stale data with future expiry
```

**Evidence**:
```
created_at: 2025-09-05 (3 months old)
expires_at: 2025-11-28 (today)
observation_time: 2025-09-05
```

**Problem**: The edge function is NOT storing fresh weather data to the database.

#### Weather Forecasts Table:
```sql
-- COMPLETELY EMPTY (0 records)
-- Edge function is NOT storing forecasts
```

**Evidence**:
```
total_forecasts: 0
unique_locations: 0
latest_forecast: NULL
```

#### Weather Observations Table:
```sql
-- Cannot verify - column name errors suggest table structure issues
-- Error: column "observed_at" does not exist
```

---

### 3. **Data Flow Architecture Issues**

```
Current Flow (BROKEN):
┌─────────────┐      ┌─────────────┐      ┌──────────┐
│   Frontend  │─────▶│Edge Function│─────▶│   API    │
│  (Home/     │◀─────│  (weather)  │◀─────│OpenWeather│
│  Weather)   │      └─────────────┘      └──────────┘
└─────────────┘              │
      │                      │
      │                      ▼
      │              ❌ NOT STORING
      │              to Database
      │
      ▼
  localStorage
  (15min cache)
```

**Expected Flow (FIXED)**:
```
┌─────────────┐      ┌─────────────┐      ┌──────────┐
│   Frontend  │─────▶│Edge Function│─────▶│   API    │
│  (Home/     │◀─────│  (weather)  │◀─────│OpenWeather│
│  Weather)   │      └──────┬──────┘      └──────────┘
└─────────────┘              │
      │                      │
      │                      ▼
      │              ✅ STORE TO DB
      │              ┌──────────────────┐
      │              │ weather_current  │
      │              │ weather_forecasts│
      │              │ weather_observations│
      │              └──────────────────┘
      │
      ▼
  localStorage
  (Fallback only)
```

---

### 4. **Rainfall Data Issues**

**Current Implementation**:
- ✅ Edge function extracts `rain.1h` from OpenWeather
- ✅ Stores in `rain_1h_mm` column
- ❌ Frontend calculates `forecast[0].rain` but forecast table is EMPTY
- ❌ No historical rainfall tracking (observations table not used)

**Weather.tsx Line 333**:
```typescript
{forecast && forecast[0]?.rain ? forecast[0].rain.toFixed(1) : '0.0'} mm
```
**Problem**: `forecast` array comes from edge function, NOT from database. If edge function fails, no rainfall data.

---

### 5. **Cache Inconsistency**

**localStorage Cache**:
- TTL: 15 minutes
- Key: `weather_cache_{lat}_{lon}`
- Stores: current, forecast, hourly

**Database Cache**:
- TTL: 1 hour (`expires_at`)
- Key: `location_key`
- **Problem**: Database cache is NEVER written to, only read from

**Result**: Home page shows localStorage cache, Weather page shows fresh API data.

---

## 🔧 REQUIRED FIXES

### Fix #1: Ensure Edge Function Stores Data
**File**: `supabase/functions/weather/index.ts`

**Issues to Fix**:
1. `cacheWeatherData()` is called but data is NOT persisted
2. Need to verify INSERT statements are executing
3. Add comprehensive logging for storage operations
4. Handle unique constraint violations properly

### Fix #2: Synchronize Data Sources
**Files**: `src/hooks/useWeather.ts`, `src/pages/Home.tsx`, `src/pages/Weather.tsx`

**Solution**:
1. Create centralized weather state management (Zustand store)
2. Single source of truth for weather data
3. Both pages read from same store
4. Store updates from edge function

### Fix #3: Fix Database Schema Issues
**Files**: Migration files

**Issues**:
1. `weather_observations` table missing `observed_at` column (or wrong column name)
2. Need to verify all column names match edge function storage code

### Fix #4: Implement Proper Caching Strategy
**Strategy**:
1. **Primary**: Database (1 hour cache)
2. **Secondary**: localStorage (15 min cache)
3. **Fallback**: Fresh API call
4. **Display**: Show data source + freshness indicator

### Fix #5: Rainfall Data Accuracy
**Solution**:
1. Store hourly rainfall in `weather_observations`
2. Aggregate daily/weekly/monthly in `weather_aggregates`
3. Frontend displays aggregated data from database
4. Add rainfall chart with historical data

---

## 📊 TABLE AUDIT

### weather_current
- ✅ Schema: Correct columns
- ❌ Data: Stale (3 months old)
- ❌ Expiry: Wrong dates
- ❌ Usage: Not being updated

### weather_forecasts
- ❌ Data: EMPTY
- ❌ Usage: Not being stored
- ⚠️ Impact: Frontend has no forecast data

### weather_observations
- ❌ Schema: Column name issues
- ❌ Usage: Cannot verify
- ⚠️ Impact: No historical data

### weather_aggregates
- ⚠️ Data: Unknown (not checked)
- ⚠️ Usage: Unknown
- ⚠️ Impact: No rainfall aggregates

---

## 🎯 IMPLEMENTATION PRIORITY

### Phase 1: Critical (NOW)
1. ✅ Fix edge function database storage
2. ✅ Clear stale database cache
3. ✅ Verify forecasts are being stored
4. ✅ Add comprehensive logging

### Phase 2: High (TODAY)
1. Create weather Zustand store
2. Synchronize Home + Weather pages
3. Add data freshness indicators
4. Fix rainfall display

### Phase 3: Medium (THIS WEEK)
1. Fix weather_observations schema
2. Implement historical data tracking
3. Add weather_aggregates population
4. Create rainfall aggregation system

---

## 🧪 TESTING CHECKLIST

- [ ] Edge function stores to weather_current
- [ ] Edge function stores to weather_forecasts
- [ ] Home page shows same data as Weather page
- [ ] Refresh button updates data everywhere
- [ ] Rainfall data is accurate
- [ ] Database cache expires properly
- [ ] localStorage cache works as fallback
- [ ] Data provider badge shows correct source
- [ ] Freshness indicator shows correct age
- [ ] Historical data accumulates over time

---

## 📝 NOTES

**Why Different Values?**
1. Home page: Shows localStorage cache (could be 15 minutes old)
2. Weather page: Shows fresh API data (just fetched)
3. Solution: Use centralized state management

**Why No Forecasts?**
1. Edge function receives forecast data from API
2. Edge function does NOT store forecasts to database
3. Database forecasts table is empty
4. Frontend gets forecasts from API response, not database

**Why Stale Database Data?**
1. Edge function has caching logic
2. BUT the INSERT operations are failing silently
3. OR the upsert logic is not working
4. Need to add error handling and logging
