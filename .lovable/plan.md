# Weather Page & Widget: Forensic Audit + Fixes + Marathi/Hindi Localisation

## What the audit found (verified against code and the live database)

### 1. Duplicate forecast days — confirmed root cause
`weather_forecasts` intentionally appends one row per `issued_at` (forecast-skill history). Live data confirms it: for `location_key 16.7,74.2` the day `2026-08-11` has 3 rows, `2026-08-12` has 2 rows — same day, different `issued_at`.

The cache reader in `supabase/functions/weather/index.ts` selects **all** rows for the location ordered by `forecast_time` and pushes each into `daily[]` with no de-duplication. So the same calendar day is emitted 2-3 times and the list shows "tomorrow" repeatedly. The hourly array has the same defect.

### 2. Day labels are wrong on top of that
`SevenDayForecast.getDayLabel` returns "Today" whenever `index === 0`, regardless of the real date. When the cache filters `forecast_time >= now` (which drops today's 00:00 row), the first entry is actually tomorrow but is still printed "Today", and every later day is off by one. "Tmrw" is also a hardcoded English abbreviation.

### 3. Translation keys don't match the locale files
`weather.json` (en/hi/mr) uses snake_case: `not_recommended`, `high_rain_advice`, `irrigation_advice`, `good_conditions`. The components call camelCase: `t('weather.farming.notRecommended')`, `t('weather.voice.highRainAdvice')`, etc. Every one of these silently falls back to the English default string, so Hindi/Marathi users see English.

### 4. Newly added UI is 100% untranslated
`LandAgronomyPanel`, `WeatherWidget`, the land selector ("Select field"), the hero-card provenance chips ("Your field", "Nearby station", stale badge), the quick-stat labels (Wind / Humidity / Visibility / UV / Dew Pt), the rainfall and 7-day footers ("Low", "High", "rainy days"), `HourlyForecastChart` ("Now"), and the sync toasts are hardcoded English.

### 5. Locale files lack keys for the new database-driven agronomy
There is no vocabulary for irrigation urgency, water deficit, ET0, VPD, GDD, disease risk level, crop stress, water balance, soil type, confidence or freshness in any of the three `weather.json` files.

### 6. Column wiring is otherwise correct
`useLandWeatherState` → `weather` edge function `land_state` → `land_weather_state` returns and renders the real columns (`et0_mm`, `vpd_kpa`, `gdd_daily`, `water_deficit_mm`, `irrigation_urgency`, `disease_risk_level/score`, `crop_stress_level`, `water_balance_status`, `soil_type_used`, `confidence`, `computed_at`). No schema change needed. Dead imports remain on the page (`WeatherCard`, `SyncIndicator`, `AgriculturalInsights`, `WeatherMap`, `HourlyTimeline`) — imported, never rendered.

## What will be fixed

### A. De-duplicate the forecast (root cause fix)
In the edge-function cache reader, keep only the newest `issued_at` per `(forecast_type, forecast_time)` before building the arrays, and collapse daily rows by calendar day in IST rather than raw timestamp. The append-only history table stays untouched — only the read collapses.
Defensive second layer: the page de-dupes by IST calendar day before rendering, so a stale client or a direct-provider payload can't re-introduce repeats.

### B. Correct day labels
`getDayLabel` uses the real date only — `isToday` → "Today", `isTomorrow` → "Tomorrow", otherwise a localised weekday. Weekday names come from i18n, not `date-fns` English.

### C. Fix the broken key names
Rename the camelCase call sites in `FarmingRecommendations` and `VoiceWeatherSummary` to the snake_case keys that already exist in the locale files, so Hindi and Marathi actually render.

### D. Full i18n pass over the weather surface
Add `t()` to `LandAgronomyPanel`, `WeatherWidget`, `WeatherHeroCard` provenance, quick stats, land selector, rainfall/forecast footers, `HourlyForecastChart`, and the sync toasts.

### E. New i18n keys in en / hi / mr
Farmer-first wording, not literal dictionary translation. Examples of the intended register:

| meaning | hi | mr |
|---|---|---|
| Your field | आपका खेत | तुमचं शेत |
| Nearby station — 6 km | पास का केंद्र — 6 किमी | जवळचं केंद्र — 6 किमी |
| Irrigate today | आज पानी दें | आज पाणी द्या |
| Water shortage 12 mm | पानी की कमी 12 मिमी | पाण्याची कमतरता 12 मिमी |
| Disease risk: high | रोग का खतरा: ज्यादा | रोगाचा धोका: जास्त |
| Crop stress | फसल पर तनाव | पिकावर ताण |
| Not calculated yet | अभी गणना नहीं हुई | अजून मोजणी झाली नाही |
| Rainy days | बारिश के दिन | पावसाचे दिवस |

Technical units (ET0, VPD, GDD) get a farmer-readable label plus the abbreviation in brackets — e.g. "पाण्याचं बाष्पीभवन (ET0)" — instead of a bare acronym.

### F. Housekeeping
Remove the five dead imports from `src/pages/Weather.tsx`.

## Technical notes

- Files touched: `supabase/functions/weather/index.ts` (cache-read de-dup only), `src/pages/Weather.tsx`, `src/components/weather/SevenDayForecast.tsx`, `FarmingRecommendations.tsx`, `VoiceWeatherSummary.tsx`, `LandAgronomyPanel.tsx`, `WeatherWidget.tsx`, `WeatherHeroCard.tsx`, `HourlyForecastChart.tsx`, and `src/i18n/locales/{en,hi,mr}/weather.json`.
- No database migration: the duplication is a read-side bug, and the append-only forecast history is deliberate.
- Day bucketing uses `Asia/Kolkata` so a UTC-midnight row is never split across two Indian days.
- Existing snake_case key convention in `weather.json` is kept; the code is changed to match it, not the other way round, so the three locale files stay aligned.
