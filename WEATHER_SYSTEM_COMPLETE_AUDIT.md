# Weather System Complete Audit & Implementation

## 📊 Audit Summary

### Tables Audited
| Table | Status | Data Count | land_id | tenant_id |
|-------|--------|------------|---------|-----------|
| `weather_current` | ✅ Fixed | 12 records | ✅ Added | ✅ Added |
| `weather_forecasts` | ✅ Fixed | 14 records | ✅ Added | ✅ Added |
| `weather_observations` | ✅ Working | 1 record | ✅ Exists | ✅ Exists |
| `weather_aggregates` | ✅ Working | 1 record | ✅ Exists | ✅ Exists |

### Key Fixes Implemented

#### 1. Per-Land Weather Storage
- Added `land_id` column to `weather_current` and `weather_forecasts`
- Weather data now stored per land, not per user
- Lands in same ~1km grid share weather data (efficient API usage)
- Location key format: `lat,lon` rounded to 2 decimals (~1km precision)

#### 2. Rain Data Special Focus
- `rain_1h_mm`: 1-hour rainfall in mm (primary)
- `rain_3h_mm`: 3-hour rainfall in mm (NEW column added)
- `rain_24h_mm`: Estimated 24-hour rainfall
- `rain_amount_mm`: Forecasted daily rainfall
- `rain_probability_percent`: Chance of rain (0-100%)

#### 3. API Strategy (Free Tier Optimized)
```
PRIMARY: OpenWeather API
- 1,000 calls/day (free tier)
- 60 calls/minute limit
- Used first for all requests

FALLBACK: Tomorrow.io API  
- 500 calls/day (free tier)
- 25 calls/hour limit
- Used when OpenWeather fails (rate limit/error)

CACHE: 1-hour expiration
- Per ~1km grid (rounded coordinates)
- Shared across all lands in same grid
- Stale cache returned if API fails
```

#### 4. Data Flow Architecture
```
┌─────────────────┐     ┌──────────────────┐
│  Frontend       │────▶│ Weather Edge Fn  │
│  (useWeather)   │     │                  │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │ Check     │ │ OpenWeather│ │ Tomorrow  │
            │ Cache     │ │ API (1st)  │ │ API (2nd) │
            └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                  │             │             │
                  └─────────────┴─────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
            ┌────────────┐ ┌────────────┐ ┌────────────┐
            │ weather_   │ │ weather_   │ │ weather_   │
            │ current    │ │ forecasts  │ │ observations│
            └────────────┘ └────────────┘ └────────────┘
                                │
                                ▼
                        ┌────────────┐
                        │ weather_   │
                        │ aggregates │
                        └────────────┘
```

#### 5. Land-Based Weather Request
```typescript
// Request weather for specific land
POST /functions/weather
{
  "action": "land",
  "landId": "ca9687fa-e0d8-41fa-b77c-07325384a898"
}

// System fetches center_lat/center_lon from lands table
// Stores data linked to that land_id
```

## 📋 Database Schema (Post-Migration)

### weather_current
```sql
id, station_id, latitude, longitude,
land_id,      -- NEW: Links to specific land
tenant_id,    -- NEW: Multi-tenant isolation
temperature_celsius, feels_like_celsius,
humidity_percent, pressure_hpa,
wind_speed_kmh, wind_direction_degrees, wind_gust_kmh,
visibility_km, uv_index,
rain_1h_mm,   -- 1-hour rainfall
rain_3h_mm,   -- NEW: 3-hour rainfall
rain_24h_mm,  -- 24-hour rainfall
snow_1h_mm,   -- Snowfall tracking
cloud_cover_percent,
weather_main, weather_description, weather_icon,
sunrise, sunset, moon_phase,
evapotranspiration_mm, soil_temperature_celsius,
soil_moisture_percent, growing_degree_days,
data_source, observation_time, created_at,
location_key, -- Grid key (lat,lon)
expires_at    -- 1-hour cache expiration
```

### weather_forecasts
```sql
id, station_id, latitude, longitude,
land_id,      -- NEW: Links to specific land
tenant_id,    -- NEW: Multi-tenant isolation
forecast_time, forecast_type (daily/hourly),
temperature_celsius, temperature_min_celsius, temperature_max_celsius,
feels_like_celsius, humidity_percent, pressure_hpa,
wind_speed_kmh, wind_direction_degrees, wind_gust_kmh,
uv_index,
rain_probability_percent, -- Chance of rain
rain_amount_mm,           -- Expected rainfall
snow_amount_mm,           -- Expected snowfall
cloud_cover_percent,
weather_main, weather_description, weather_icon,
evapotranspiration_mm, soil_temperature_celsius,
growing_degree_days,
data_source, created_at, location_key
```

### weather_observations (Historical)
```sql
id, tenant_id, farmer_id, land_id,
observation_date, observation_time,
temperature_celsius, humidity_percent,
rainfall_mm,    -- Actual recorded rainfall
snow_1h_mm,     -- NEW: Snowfall tracking
wind_speed_kmh, wind_direction,
weather_condition, pressure_hpa, visibility_km,
uv_index, feels_like_celsius, dew_point_celsius,
cloud_coverage_percent, metadata,
created_at, updated_at
```

### weather_aggregates (Daily Summary)
```sql
id, tenant_id, farmer_id, land_id,
aggregate_date,
rain_mm_total,      -- Total daily rainfall
rain_mm_morning,    -- Morning rainfall
rain_mm_afternoon,  -- Afternoon rainfall
rain_mm_evening,    -- Evening rainfall
rain_mm_night,      -- Night rainfall
temp_min_celsius, temp_max_celsius, temp_avg_celsius,
humidity_avg_percent,
wind_speed_avg_kmh, wind_speed_max_kmh,
sunshine_hours,
frost_risk, heat_stress_risk, disease_risk_level,
agricultural_alerts,
created_at, updated_at
```

## 🔧 API Free Tier Limits

| Provider | Daily Limit | Rate Limit | Usage |
|----------|------------|------------|-------|
| OpenWeather | 1,000 calls | 60/min | Primary |
| Tomorrow.io | 500 calls | 25/hr | Fallback |

### Optimization Strategy
- **1km grid caching**: Coordinates rounded to 2 decimals
- **1-hour cache**: Fresh API call only after 1 hour
- **Stale fallback**: Returns expired cache if API fails
- **Shared data**: Lands in same 1km grid share weather

## ✅ Testing Checklist

- [ ] Weather API returns data for land with coordinates
- [ ] `weather_current` receives new records with `land_id`
- [ ] `weather_forecasts` receives new records with `land_id`
- [ ] `weather_observations` stores historical data
- [ ] `weather_aggregates` updates daily summaries
- [ ] Rain data (1h, 3h, 24h) is captured correctly
- [ ] OpenWeather is used first, Tomorrow.io as fallback
- [ ] Cache expires after 1 hour
- [ ] Stale cache returned when API fails

## 📝 Files Modified

1. `supabase/functions/weather/index.ts` - Complete overhaul
   - Added `land_id` and `tenant_id` to all storage operations
   - Added `rain_3h_mm` tracking
   - Enhanced logging for debugging
   - Fixed column name mappings

2. Database Migration - Added columns:
   - `weather_current.land_id`
   - `weather_current.tenant_id`
   - `weather_current.rain_3h_mm`
   - `weather_forecasts.land_id`
   - `weather_forecasts.tenant_id`
   - `weather_observations.snow_1h_mm`
   - Created performance indexes
