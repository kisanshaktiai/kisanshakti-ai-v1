# Weather Page + Widget: Audit and Rewiring to the New Weather Database

## What the audit found (verified against code and the live database)

1. **The new Layer-2 agronomy table is not used by the weather UI at all.**
   `land_weather_state` holds 29 fresh rows (latest 2026-08-06 19:48 UTC) with `et0_mm`, `vpd_kpa`, `gdd_daily`, `effective_rainfall_mm`, `water_deficit_mm`, `irrigation_needed`, `irrigation_urgency`, `disease_risk_score/level`, `crop_stress_level`, `water_balance_status`, `soil_type_used`, `confidence`. It is read only by the chat context hook, the schedule view, and the climate banner. Neither `src/pages/Weather.tsx` nor `WeatherWidget.tsx` touch it.

2. **Agronomy on the weather page is invented client-side.**
   `FarmingRecommendations.tsx` and `AgriculturalInsights.tsx` derive irrigation, spraying and planting advice from raw temp/humidity/wind with hardcoded thresholds. This contradicts the soil-aware, crop-aware values the edge function already computes and stores, and it violates the project rule that advice comes from the database, not from UI heuristics.

3. **Data provenance is computed but never shown.**
   `useWeather` returns `locationSource` (`explicit | gps | farm | regional`), `weatherDistanceKm`, `weatherStationName` and `regionalFallbackLabel`. The page destructures none of them, so a farmer cannot tell whether he is seeing his own field, a station 20 km away, or the Kolhapur regional fallback.

4. **Dead weight on the page.** `WeatherCard`, `SyncIndicator`, `AgriculturalInsights`, `WeatherMap`, `HourlyTimeline` are imported but never rendered.

5. **Duplicate fetch loops.** The page and the widget each call `useWeather()`, so two proximity queries and two 10-minute refresh intervals run whenever both are mounted, even though the zustand store is shared.

6. **Widget is thin and non-actionable.** It shows temp/feels-like/humidity/wind/rain-chance only — no rain-in-next-hours signal, no irrigation/spray verdict, no staleness or provenance treatment beyond "Nm ago".

## What will be built

### A. Land-scoped agronomy strip (new, DB-driven)
- New hook `useLandWeatherState(landId)` reading the latest row of `land_weather_state` for the farmer's land (tenant + land scoped, ordered by `metric_date` desc).
- New component `LandAgronomyPanel` on the weather page rendering DB values only: irrigation urgency + water deficit, ET0, VPD, GDD today, disease risk level/score, crop stress, water balance, soil type used, and `computed_at` freshness with `confidence`.
- If the farmer has more than one land, a compact land selector at the top of the page; single-land farmers get it auto-selected with no picker.
- Empty/stale state: if no row exists for today, show "Field metrics not computed yet" rather than falling back to guessed values.

### B. Retire the invented agronomy
- `FarmingRecommendations` keeps only what is honestly derivable from forecast data (rain chance, wind-based spray window) and takes irrigation/disease directly from `land_weather_state` when a land is selected; the hardcoded irrigation/disease branches are removed.
- `AgriculturalInsights` and the unused imports are removed from the page.

### C. Provenance and trust surface
- Hero card gains a provenance chip: "Your field", "Nearby station — 6.2 km", or "Kolhapur (regional)", plus a stale badge when store data is older than 15 minutes.

### D. Single fetch owner
- `useWeather` gains a lightweight leader/subscriber guard so only the first mounted consumer runs the interval and the proximity lookup; the widget becomes a pure store reader.

### E. Widget upgrade (2030 mobile)
- Adds next-6h rain probability from the hourly array and a single agronomy verdict line (irrigation urgency) when land state is available, keeps the opaque-surface / no-blur mobile performance rules, and keeps tap-through to the weather page.

## Technical notes

- Files touched: `src/hooks/useWeather.ts`, new `src/hooks/useLandWeatherState.ts`, `src/pages/Weather.tsx`, `src/components/weather/WeatherWidget.tsx`, `src/components/weather/WeatherHeroCard.tsx`, `src/components/weather/FarmingRecommendations.tsx`, new `src/components/weather/LandAgronomyPanel.tsx`. `AgriculturalInsights.tsx` is left on disk but unimported.
- No database migration and no edge-function change: the required columns already exist and are populated by `refresh_land_cells` / `derive_land_state`.
- Model A (display, proximity substitution allowed) and Model B (land-scoped agronomy, no substitution) stay strictly separated: the agronomy panel renders only rows keyed to the selected `land_id`, never a nearby cell.
- Colors and surfaces use existing semantic tokens; no hardcoded color utilities.
