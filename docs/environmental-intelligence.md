# Environmental Intelligence Engine

Status: shipped (PROMPTs 1–6, 2026-08-07). Additive to the existing weather
stack — `src/hooks/useWeather.ts` and the weather UI components were not
modified by this series.

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PROVIDERS                                                                │
│   OpenWeather · Open-Meteo · IMD (blocked, see §7) · future farm stations│
└────────────────────────────┬─────────────────────────────────────────────┘
                             │ raw payloads
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ NORMALIZATION  (supabase/functions/weather/*)                            │
│   unit harmonisation · cell rounding (location_key) · QC flags           │
│   confidence via CONFIDENCE_MODEL (agreement, freshness, lead-time, skill)│
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ DERIVE PIPELINE  (weather/derive-pipeline.ts + agricultural-calculations)│
│   ET0 (FAO-56 Penman–Monteith, Hargreaves fallback) · VPD (Tetens)       │
│   Kc/ETc · soil-water bucket (FAO-56) · GDD · leaf wetness · heat stress │
│   spray suitability · frost · risk-episode hysteresis                    │
│   EVERY step stamps method_id@version from sci_method_registry           │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ OBSERVATION SPINE   public.env_observations (monthly partitions)         │
│   one row = one property · value · unit · u_std · confidence · qc_level  │
│   provenance: source_kind, source_code, method, valid_time, horizon      │
│   public.env_obs_lineage  →  recursive input→output DAG (full traceability)│
│   public.env_derivation_run · env_source_registry · env_property_master  │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ LAND STATE   public.land_weather_state (current authoritative snapshot)  │
│              public.risk_episodes (active/decaying episodes with phase)  │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ CANONICAL STATE   canonicalState.weather.derived                         │
│   et0, etc, vpd, gdd_cumulative, soil_water_depletion, spray_window,     │
│   leaf_wetness_hours, heat_stress_dh, active_episodes[]                  │
│   (authoritative-state-loader.ts — chat + proactive share one loader)    │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ SYMBOLIC DECISIONS   public.proactive_rules (derived.* predicates)       │
│   ENV_NO_SPRAY_TODAY · IRRIGATION_TRIGGER_FAO56 · frost/heat/disease …   │
│   proactive-evaluator/env-derived.ts evaluates; phase transitions gated  │
└────────────────────────────┬─────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ FARMER ADVISORIES  (LLM narrates only) + env-intelligence read API       │
│   Farm Intelligence UI: IrrigationGauge · SprayWindowStrip ·             │
│   RiskEpisodeChips ("Why?" → lineage) · EtoRainMiniTimeline              │
│   farmer_visible=false properties and source_code are filtered out       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The `sci_method_registry` contract

**Nothing executes without an approved row.** Every coefficient, threshold and
equation constant lives in `public.sci_method_registry`; code never hardcodes a
value inside a formula body. The loader
(`supabase/functions/weather/sci-methods.ts`) performs **one** registry read per
edge-function invocation and passes the resulting `MethodsMap` by value into
every calculation — never a DB call from inside a calculation.

A registry row carries: `method_id`, `version`, `method_kind`, `equation_ref`,
`authoritative_source`, `params` (jsonb), `review_status`.
Only `review_status='approved'` rows are loaded. A byte-identical
`REGISTRY_FALLBACK` mirror exists solely for read failures and is flagged with
`qc_flag = REGISTRY_FALLBACK` so a degraded run is never mistaken for a normal one.

### How to version a method

1. `INSERT` a **new row** with the same `method_id` and a higher `version`
   (e.g. `1.1`), `review_status='draft'`. Never `UPDATE` an approved row —
   history must stay reconstructible for any observation already stamped with it.
2. Peer-review the `equation_ref` / `authoritative_source`; then set
   `review_status='approved'`. The loader picks the highest approved version.
3. Regenerate `scripts/sci-methods-manifest.json` (comment at the top of the
   file says so) — the CI guard fails the build if edge-function code references
   a `METHOD_ID@version` tag that is not in the manifest.
4. Old observations keep their original `method` stamp; re-derivation is an
   explicit backfill, never implicit.

---

## 3. Confidence model (summary)

`CONFIDENCE_MODEL@1.0` produces a 0–1 confidence for every observation as a
weighted blend:

| Component | Weight | Meaning |
|---|---:|---|
| agreement | 0.35 | cross-provider spread vs `sigma_ref` per property (AIR_TEMP 2, RH 10, WIND_2M 2) |
| freshness | 0.20 | age of the underlying observation |
| lead time | 0.25 | forecast horizon decay (d0-1 ×1.0, d2-3 ×0.85, d4-7 ×0.65, d8+ ×0.4) |
| skill | 0.20 | historical provider skill for the cell; `neutral_skill` 0.7 when unknown |

Precipitation is additionally multiplied by 0.8 (`precip_multiplier`).
Derived quantities inherit the **minimum** confidence of their lineage inputs,
further reduced by method uncertainty (`u_std`). Constant confidence
(`? 0.9 : 0.75`) is banned by the CI guard.

---

## 4. Adding a FUTURE FARM WEATHER STATION

Zero engine code changes:

> `INSERT` a row into `env_source_registry` (`source_kind='farm_station'`,
> `land_id`, `siting_class` derived from field photos per **WMO-No.8 classes 1–5**,
> `sensor_spec`) **+ point its MQTT/HTTP push at the observation ingest path** —
> zero engine code changes; QC levels and the calibration ledger apply
> automatically.

The station's rows land in `env_observations` alongside model data; the
confidence model treats it as another ensemble member, weighted by its
`siting_class` and calibration history. Derivations, lineage, risk episodes,
proactive rules and the farmer UI pick it up with no redeploy.

---

## 5. ML boundary policy (verbatim, non-negotiable)

> **ML estimates quantities with uncertainty; symbolic rules make decisions;
> LLMs narrate. If it changes what the farmer is told to do, it is symbolic and
> governed.**

---

## 6. Regression locks

`scripts/env-intelligence-guard.mjs` runs on `prebuild` / `npm run check` and
fails the build on: (a) fabricated diurnal temperature spread in
`supabase/functions/weather/`; (b) the literal `? 0.9 : 0.75` constant
confidence anywhere under `supabase/functions/`; (c) a `METHOD_ID@version`
reference missing from `scripts/sci-methods-manifest.json`;
(d) a weather response key recorded in `scripts/weather-contract-snapshot.json`
that the response assembly no longer produces.

---

## 7. OUT OF SCOPE (and why)

| Item | Why it is out of scope |
|---|---|
| **IMD API IP-whitelist fix** | Requires a static-egress proxy outside Supabase — Supabase edge IPs rotate and IMD rejects them. Until fixed, **IMD contributes zero data; this is the platform's #1 data-quality gap.** |
| **NASA POWER / IMD-gridded historical backfill** | An external batch job, not an edge-function concern. Needed to replace the **99.8% imputed GDD history**. |
| **MQTT broker provisioning** | Infrastructure procurement/ops; the ingest contract in §4 is ready and waiting for it. |
