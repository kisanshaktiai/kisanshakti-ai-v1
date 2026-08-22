# GDD Pipeline — Code-Side Repair (Fixes E, G, H, I)

The database side (accumulator functions, guardrail constraints, health view, cron) is already repaired and is treated as untouchable. This plan covers only the remaining code work.

## Verified current state

- No TypeScript writes `land_gdd_daily`. All hits are reads (`env-intelligence`, `proactive-evaluator/env-derived`, `ai-agriculture-chat` phenology reconciler and state loader). So there is no duplicate writer to delete — only a check to keep it that way.
- `weather_aggregates` has **no `temp_source` column** yet; it must be added.
- `weather_aggregates` already has `UNIQUE NULLS NOT DISTINCT (tenant_id, location_key, aggregate_date, land_id)`, and the weather function already upserts on that key. What is missing is min/max hygiene and land-scoped rows.
- `location_key` is built by `roundCoordinates()` in `supabase/functions/weather/index.ts` using `toFixed(2)` + `Number()`, which drops trailing zeros ('16.9,74') — the format bug named in the report. Cell resolution comes from `CONFIG.CELL_RESOLUTION_DEG`.
- `land_weather_state`: 439 rows, **all** have `gdd_daily = 0`; it is written in `weather/index.ts` from `indices.gdd`.
- `weather_aggregates` spans 2025-12-30..2026-08-22 but only 579 rows; `land_gdd_daily` has 222 rows for 10 anchored lands — consistent with the ~3-week effective window.
- `v_gdd_pipeline_health` and `system_health_events` exist and are readable by `authenticated`.
- Admin-facing diagnostics page already exists at route `diagnostics/environment` (`src/pages/EnvDiagnostics.tsx`) with a role gate for super_admin / tenant_admin / tenant_manager — Fix I lands there rather than in a new page.

## Fix E — Weather ingestion hygiene (`supabase/functions/weather/index.ts`)

1. Migration: add `weather_aggregates.temp_source text` (nullable, no default backfill) plus a check limiting it to `observed | mean_only_synthesized | reanalysis`.
2. Canonical key: change `roundCoordinates()` to emit `lat.toFixed(1) + ',' + lon.toFixed(1)` so the decimal is always present. Existing rows are left alone (the DB join tolerates both).
3. Diurnal synthesis: in `updateWeatherAggregate`, when the provider gives no true daily extremes, stop writing `current.temp` into both min and max. Synthesize from the mean with the seasonal range (6 °C Jun–Sep, 14 °C Dec–Feb, 10 °C otherwise) and set `temp_source='mean_only_synthesized'`; write `'observed'` when real extremes exist. Never let a synthesized row overwrite an observed one.
4. Land scoping: when the fetch was made for a specific land, also write the land-scoped aggregate row with `land_id` set, upserting on the same natural key so a repeated fetch updates instead of duplicating.

## Fix G — `land_weather_state.gdd_daily`

- Change the `land_weather_state` upsert in `weather/index.ts` to source `gdd_daily` from `land_gdd_daily` for `(land_id, metric_date)` instead of `indices.gdd`; write `null` (not 0) when the canonical row does not exist yet, so the two tables can never disagree.
- One-time migration backfill: `UPDATE land_weather_state s SET gdd_daily = d.daily_gdd FROM land_gdd_daily d WHERE d.land_id = s.land_id AND d.obs_date = s.metric_date;`

## Fix H — Historical weather backfill (highest priority)

New edge function `supabase/functions/backfill-historical-weather/`:

1. Target cells from `lands` with a non-null `gdd_anchor_date`, grouped to 0.1°, earliest anchor per cell.
2. Per cell, fetch Open-Meteo ERA5 archive (`temperature_2m_max`, `temperature_2m_min`, `timezone=Asia/Kolkata`) from that anchor to 2026-08-03, with retry/backoff and a bounded per-run cell budget.
3. Upsert into `weather_aggregates` with the canonical `location_key`, `temp_source='reanalysis'`, `observation_count=1`; skip rows whose existing `temp_source='observed'`. Idempotent — a second run changes nothing.
4. Recompute GDD via `recompute_land_gdd_daily(id)` for every anchored land.
5. Print the sanity table (Adsali cane ~3,800–4,600; Dec-2025 cane ~2,300–2,700; rice ~950–1,150 with stage agreement) plus `v_gdd_pipeline_health`.

Interim gate (step 6): until the sanity table passes, mark `current_gdd` low-confidence where it feeds the rule engine (`proactive-evaluator` env-derived / GDD-gated rules) so GDD-gated rules require stage-gate corroboration. This is a temporary flag removed in the same session once backfill acceptance passes.

## Fix I — Surface the telemetry

Extend `src/pages/EnvDiagnostics.tsx` (existing role gate reused) with a "GDD pipeline" section:

- `v_gdd_pipeline_health` rendered as a table, rows with `health <> 'OK'` highlighted destructive.
- Recent `system_health_events` filtered to `gdd_batch_run` / `gdd_land_error`.
- Per-land sparkline of `daily_gdd` and `cumulative_gdd` from `land_gdd_daily` for the land already selected on that page.

## Technical notes

- Files touched: `supabase/functions/weather/index.ts`, new `supabase/functions/backfill-historical-weather/index.ts`, `supabase/functions/proactive-evaluator/env-derived.ts` (temporary confidence flag), `src/pages/EnvDiagnostics.tsx`, plus two migrations (temp_source column; land_weather_state backfill).
- No new writer of `land_gdd_daily` is introduced; the backfill triggers recomputation only through the existing RPC.
- Verification: `rg` for TS writers, an idempotency re-run of the backfill, a constraint-violation probe against `chk_gdd_no_silent_zero`, and a `land_weather_state` vs `land_gdd_daily` equality query.
