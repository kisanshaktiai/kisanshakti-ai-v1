# Phase D — GDD Accumulator & Weather-Driven Phenology (DB-Only, No Edge Function)

## Constraint
Project is at the 100 edge-function cap. **No new edge function can be created.** All Phase D compute must live inside Postgres and be driven by `pg_cron` calling SQL directly (no `pg_net`, no HTTP hop).

## Goal
Move stage progression from calendar-only (DAS) to thermal-time (GDD). Per-land daily Tmax/Tmin from `weather_aggregates` + `crop_stage_master.base_temperature_c` (added in Phase A) feed a daily GDD accumulator entirely in SQL. The phenology resolver becomes variety- **and** weather-aware. Zero new HTTP surface.

---

## What ships this phase

### 1. Schema — single migration (approval required)

**New table `public.land_gdd_daily`** — one row per land per day.
- Columns: `land_id`, `obs_date`, `tmax_c`, `tmin_c`, `base_temp_c`, `upper_cap_c`, `daily_gdd`, `cumulative_gdd`, `days_from_anchor`, `anchor_type` (`sowing`|`transplant`), `anchor_date`, `method` (`single_triangle`), `source` (`weather_aggregates`|`imputed`), `created_at`.
- PK `(land_id, obs_date)`. RLS on. Farmer read via land ownership; service-role write. Grants: `SELECT` to `authenticated`, `ALL` to `service_role`.

**New columns on `public.lands`**:
- `current_gdd numeric` (nullable)
- `gdd_anchor_type text` (nullable, check `('sowing','transplant')`)
- `gdd_anchor_date date` (nullable)
- `gdd_last_computed_at timestamptz` (nullable)

**New columns on `public.crop_stage_master`**:
- `gdd_min numeric` (nullable)
- `gdd_max numeric` (nullable)

**SQL function `public.accumulate_gdd_for_land(p_land_id uuid, p_lookback_days int default 365)`** — `SECURITY DEFINER`, `SET search_path = public`.
- Resolves anchor: `lands.transplant_date` if present, else `crop_schedules.sowing_date`, else `lands.last_sowing_date`. Aborts silently (returns `0`) if no anchor.
- Resolves `base_temp_c` from `crop_stage_master` for the crop (min across stages if multiple), fallback `8`. Upper cap `30`.
- Loops days from `greatest(anchor_date, current_date - p_lookback_days)` to `current_date`, joins `weather_aggregates` on `(land_id, obs_date)`.
- Single-triangle GDD: `daily = greatest(0, ((least(tmax,cap) + greatest(tmin,base))/2) - base)`. Missing day → interpolate from ±3-day window; if still missing mark `source='imputed'` with `daily_gdd=0`.
- `INSERT ... ON CONFLICT (land_id, obs_date) DO UPDATE` idempotent.
- Recomputes `cumulative_gdd` window and writes `lands.current_gdd`, `gdd_anchor_type`, `gdd_anchor_date`, `gdd_last_computed_at`.
- Returns `bigint` (days processed).

**SQL function `public.accumulate_gdd_batch(p_limit int default 500)`** — `SECURITY DEFINER`.
- Selects active lands (`last_sowing_date IS NOT NULL AND coalesce(harvest_status,'') <> 'harvested'`) ordered by oldest `gdd_last_computed_at` (nulls first). Calls `accumulate_gdd_for_land` for each. Logs `{lands_processed, days_total, elapsed_ms}` into `system_health_events`.

**`resolve_crop_phenology` → v4** (append-only, frozen return shape).
- Reads `lands.current_gdd`, `gdd_anchor_date`, `gdd_last_computed_at`.
- When `variety_phenology_profile.gdd_target` is present for the resolved stage, sets `stage_progress_pct` from GDD; otherwise keeps DAS-based value.
- Populates already-existing `current_gdd` field (previously always `NULL`). Adds `gdd_source` to `evidence_sources` when used. `resolver_version` bumped to `4`.

### 2. Cron via `pg_cron` — installed inside the migration

- Guarded: `CREATE EXTENSION IF NOT EXISTS pg_cron`. **We do NOT need `pg_net`** — the job calls the SQL function directly.
- Job `gdd-accumulator-6h` — `0 */6 * * *` — body: `SELECT public.accumulate_gdd_batch(500);`
- Idempotent registration: `DELETE FROM cron.job WHERE jobname = 'gdd-accumulator-6h'` before `cron.schedule(...)`.
- No secrets, no URL, no anon key required — the whole job stays inside the DB. Safe on remix (no user-specific values), so it can ship in a normal migration.

### 3. Client / orchestrator wiring — pure code edits, no new function

- `landContext.gdd = { current_gdd, anchor_type, anchor_date, last_computed_at }` — read from the extended phenology payload returned by resolver v4. Passed through the canonical context contract unchanged in shape (add optional field).
- `morphology-reconciler.ts` (Phase C) gains an optional GDD-vs-DAS drift check: when `current_gdd` and a variety `gdd_target` for the current stage are both present, emit a `stage_shift_hint` if progress deviates >25% from the DAS-based expectation. Pure module — no I/O.
- No changes to any existing edge function's deployment; only source edits to `ai-agriculture-chat/agents/orchestrator.ts` and `decision/morphology-reconciler.ts`.

---

## Explicitly OUT of Phase D
- `stage_transition_conditions` (T3) — Phase E.
- Photoperiod calc — Phase G.
- Backfill of historical weather beyond `p_lookback_days` (365) — enough for the current season.
- Any new edge function (blocked by the 100-fn cap).
- `pg_net` HTTP calls (unnecessary; direct SQL job replaces the HTTP hop).

---

## Technical details

**GDD formula (single-triangle, McMaster–Wilhelm):**
```
tmean = ( least(tmax, upper_cap) + greatest(tmin, base) ) / 2
daily_gdd = greatest(0, tmean - base)
```
Base = `crop_stage_master.base_temperature_c` (fallback `8°C`). Upper cap = `30°C`.

**Anchor precedence:** `lands.transplant_date` → `crop_schedules.sowing_date` (latest active) → `lands.last_sowing_date`.

**Imputation:** missing day → mean of ±3-day window; still missing → `source='imputed'`, `daily_gdd=0`. Long gaps (>5 consecutive missing) stop accumulation and record a gap row.

**Ordering (batch fairness):** `ORDER BY gdd_last_computed_at NULLS FIRST` so freshly-planted lands and never-computed lands catch up on the next cron tick.

**Cost:** 6 tick/day × up to 500 lands = 3,000 function calls/day, each ~365-day loop bounded by lookback. Cheap; runs in-process, no HTTP.

**Approval order (single approval):**
1. Migration (schema + functions + resolver v4 + cron.schedule) — one atomic file.
2. Orchestrator + reconciler source edits — no approval, no redeploy of a new function.

---

## Roadmap after Phase D
- Phase E: `stage_transition_conditions` (event/GDD/observation triggers), still DB-only, replaces scattered TS stage guards.
- Phase F: wire `variety_resistance` into hypothesis-evaluator (code-only inside existing `ai-agriculture-chat`).
- Phase G: photoperiod + `stage_validation_rules`.

All remaining phases planned as **DB-only** or **code-only inside existing edge functions** to respect the 100-function cap.
