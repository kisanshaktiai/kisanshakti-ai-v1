# Environmental Intelligence Engine — Pre-Flight Confirmation

No files were modified. This is a read-only verification of the audit facts before the database migration prompt.

## (a) Files located

- `supabase/functions/weather/index.ts` (provider routing, cell dedup, caching, land_state)
- `supabase/functions/weather/agricultural-calculations.ts`
- `supabase/functions/weather/imd-provider.ts`, `imd-token.ts`
- `src/hooks/useWeather.ts`

## (b) Fabricated Tmax/Tmin — CONFIRMED

`agricultural-calculations.ts` lines 500-501 default `temperature_max_c = temperature_c + 3` and `temperature_min_c = temperature_c - 5`, and those fabricated values feed `calculateET0Hargreaves` (line 518) and `calculateDailyGDD` (line 521). Exactly as stated in D3.

Also confirmed:
- D4: only `calculateET0Hargreaves` exists; no Penman–Monteith.
- D5: `calculateDiseaseRisk` takes `leafWetnessHours: number = 0` and no caller ever computes it, so the `>4` / `>8` branches are dead.
- D6: `index.ts` lines 753 and 773 hardcode `confidence: current.provider === "IMD" ? 0.9 : 0.75`.
- D7: `weather_field_master` contains exactly 5 active rows — temperature, humidity, rainfall_last_24h, rain_probability, wind_speed. No derived indices reach the Decision Brain.
- D8: `crop_coefficient = 1.0` default (line 510); no NDVI input.
- D9: no TAW/RAW/depletion logic anywhere in the weather function.
- Preserved invariants present as described: `CELL_RESOLUTION_DEG: 0.10`, capability-based IMD → OpenWeather → Tomorrow.io routing with per-attempt logging, IST day bucketing, forecast de-duplication on read.

## (c) Discrepancies against the stated facts

1. **D10 is only partly accurate.** Forecasts are not strictly OpenWeather-only: `index.ts` has a Tomorrow.io forecast fetcher (line 451) and an IMD `daily` capability attempt (line 1485), used as sequential fallbacks. The real defect is that it is *single-source at a time with no cross-provider ensemble or skill scoring* — not that only one provider exists. Later prompts should target ensemble/consensus, not "add a second provider".
2. **`weather_field_master` has no `field_key` column** — the primary identifier is `field_code`, alongside `unit`, `description`, `supplied_by`, `is_active`. New rows must use that shape.
3. **`sci_method_registry` does not exist yet** — as expected, it arrives in the next prompt. Nothing currently references it.
4. `agricultural-calculations.ts` also holds a soil-type coefficient block in `index.ts` (~line 1103) with literal constants (0.75 for red/laterite/alfisol); these are additional magic numbers that will need registry rows under rule 2.

## (d) Readiness

Ready for the database migration prompt. Constraints acknowledged and will be held for the whole series: additive-only DDL, RLS enabled at creation with tenant-scoped reads and service-role writes, every computed value carrying unit/source/timestamp/method version/computed confidence, no fabricated inputs (emit `MISSING_TMAXMIN` and skip), no raw meteorological internals on farmer-facing surfaces, and the three out-of-scope items left to the README.
