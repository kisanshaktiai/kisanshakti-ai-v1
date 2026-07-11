
# Context Preservation Fix — CanonicalContext → GraphRuntime (v3, SSOT-corrected)

## Guiding Invariant

DB = Agriculture Brain (SSOT). GraphRuntime = deterministic reasoning pathway. LLM = farmer language layer only.
**This fix is context preservation, NOT new intelligence.** Every field below already exists in the DB or in `landContext`; nothing new is invented, no new tables, no new agronomy in TS.

## Authoritative Field → Source Table (locked)

| Field | Authority (primary) | Fallback / cache |
|---|---|---|
| crop identity (crop_code, crop_name) | `crop_schedules` | — (no fallback allowed) |
| crop variety (variety_id, crop_variety) | `crop_schedules` | — |
| lifecycle dates (sowing_date, transplant_date, expected_harvest_date, crop_cycle) | `crop_schedules` | — |
| stage_uuid, stage_code, growth_stage | `biological_state` (phenology SSOT) | — |
| DAS | `biological_state` | — |
| GDD accumulated | phenology engine (via `biological_state`) | — |
| soil nutrients (N, P, K) | `soil_health` | `lands` (cache) |
| soil pH | `soil_health` | `lands` (cache) |
| organic carbon % | `soil_health` | `lands` (cache) |
| soil moisture / current_moisture_status | moisture source (soil sensor / `soil_health`) | `lands` (cache) |
| soil_type, soil confidence | `soil_health` | `lands` (cache) |
| NDVI value, reliability, observed_at | `ndvi_data` | `lands.last_ndvi_*` (cache) |
| NDVI trend | ndvi history | `lands` (cache) |
| weather current (temp, humidity, rainfall) | `weather_current` | — |
| weather forecast (forecast_7d) | `weather_forecasts` | — |
| rain history / rainfall_after_sowing_mm | `weather_aggregates` | — |
| irrigation_source, water_source, irrigation_type | `lands` | — |
| village, taluka, district, state | `lands` | — |
| boundary, gps_lat, gps_lng, elevation, slope | `lands` | — |
| land_id, farmer_id, area_acres | `lands` | — |

`lands` role: **identity + management + latest cache** — NOT the authority for soil / NDVI / weather.

## Audit Findings (confirmed)

- `runGraphRuntime` call sites: `agents/orchestrator.ts:5766`, `agents/clarification-strategy.ts:447`, entrypoint `runtime/graph-runtime.ts:101`, test `tests/observation-state-contract_test.ts:116`.
- Both prod callers pass only primitives (`crop_code`, `growth_stage`, `days_since_sowing`, optional NDVI + weather). Field twin is dropped.
- `CanonicalContext` v2.0.0 preserves crop/stage/DAS/NDVI(3)/soil(NPK+pH)/weather(temp/hum/rain) only — misses biological_state ref, dates, moisture, irrigation, geo, forecast, rainfall_after_sowing.
- Evaluators (`hypothesis-graph-evaluator.ts`, `hypothesis-evaluator.ts`) reference **none** of `sowing_date | transplant_date | farming_type | biological_state | soil_moisture | rainfall` — because they never receive them.

## Root Cause

Two-stage compression: (1) `buildCanonicalContext()` discards field-twin fields; (2) both `runGraphRuntime()` sites flatten survivors to primitives. DB rules that could discriminate (DSR vs transplanted, dry vs irrigated, low moisture, rainfall-after-sowing) never see the discriminating facts.

---

# Surgical Patch Plan (execute all)

Zero new files. Zero DB schema changes. No crop-specific TS branches.

### Patch 1 — Extend `decision/canonical-context-contract.ts` → v2.1.0

Additive `readonly` fields on `CanonicalContext`, all optional / nullable (back-compat preserved). Every value carries provenance in a `readonly sources` sub-object.

Additions:
- Crop authority (from `crop_schedules` only):
  `sowing_date`, `transplant_date`, `expected_harvest_date`, `crop_cycle`, `variety_id`, `crop_variety`
- Biological state reference (already immutable):
  `biological_state: Readonly<BiologicalState> | null`
- Soil (extend): `soil.type`, `soil.organic_carbon_percent`, `soil.moisture_status`, `soil.confidence`
- Water: `water.irrigation_source`, `water.water_source`, `water.irrigation_type`
- Weather (extend): `weather.rainfall_after_sowing_mm`, `weather.forecast_7d`
- NDVI (extend): `ndvi.reliability`, `ndvi.observed_at`
- Geo: `geo.village`, `geo.taluka`, `geo.district`, `geo.state`, `geo.gps_lat`, `geo.gps_lng`, `geo.elevation`, `geo.slope`
- Land meta: `area_acres`

**Provenance shape (locked):**
```ts
sources: {
  crop:  'crop_schedules',
  stage: 'biological_state',
  soil:  { primary: 'soil_health',      fallback: 'lands_cache' },
  ndvi:  { primary: 'ndvi_data',        fallback: 'lands_cache' },
  weather: {
    current:  'weather_current',
    forecast: 'weather_forecasts',
    history:  'weather_aggregates',
  },
  water: 'lands',
  geo:   'lands',
}
```

`buildCanonicalContext()` populates these from `landContext` with the **crop-authority guard**: `crop_name`, `crop_variety`, `sowing_date`, `transplant_date`, `expected_harvest_date`, `crop_cycle` are read only from the `crop_schedules`-sourced fields on `landContext`. If absent, they stay `null` — never fall back to `lands.last_sowing_date` / `lands.planting_date` for those six. Soil/NDVI values may use `lands_cache` as fallback and the `sources` sub-tree records which path was taken. Existing invariants (`is_locked`, `phase1_locked`, UNKNOWN guards) untouched.

### Patch 2 — Extend `runtime/graph-runtime.ts`

Add to `GraphRuntimeInput`: `canonical_context?: CanonicalContext`.

Inside `runGraphRuntime`:
1. If both `canonical_context` and primitive counterparts are supplied, run a strict split-check on `crop_code`, `growth_stage`, `days_since_sowing`, `variety_id`, `ndvi_level`, `ndvi_trend`. On mismatch throw `GRAPH_CONTEXT_SPLIT_ERROR` naming the divergent field.
2. If only `canonical_context` supplied, derive primitives from it (back-compat).
3. Forward full `canonical_context` into `evaluateCandidateHypotheses` via existing `passthrough` spread — DB predicates that reference moisture, forecast, transplant_date, irrigation_type, biological_state.stage_uuid now resolve.
4. Emit one additive audit line:
   `[CANONICAL_CONTEXT_FLOW] trace=… crop=… stage=… das=… sowing=… transplant=… irrig=… moisture=… bio_locked=… src.crop=crop_schedules src.soil=soil_health|lands_cache src.ndvi=ndvi_data|lands_cache`

**Unchanged:** single-entrypoint invariant, `markExecuted` semantics, `[GRAPH_RUNTIME]` line, OBS_GATE, PR-2 SSOT.

### Patch 3 — Call-site migration (2 sites)

- `agents/orchestrator.ts:5766` — pass `canonical_context: canonicalContext` alongside existing primitives (kept temporarily so the split-check has both sides).
- `agents/clarification-strategy.ts:447` — add optional `canonical_context` to input type and forward from orchestrator.
- `tests/observation-state-contract_test.ts` — pass `canonical_context`, assert no split error.

### Patch 4 — Evaluator input plumbing (no logic change)

`decision/hypothesis-graph-evaluator.ts` and `decision/hypothesis-evaluator.ts`: extend input types to accept `canonical_context?: CanonicalContext`; store on the evaluation context. **No new rules, thresholds, or crop-specific branches in TS.** DB predicates referencing the newly-plumbed fields now resolve; unrelated predicates unaffected.

### Patch 5 — Split-check guard (scoped)

Fail loud with `GRAPH_CONTEXT_SPLIT_ERROR` ONLY for **authority-owned** fields:
- crop identity (`crop_code`, `crop_name`)
- crop variety
- lifecycle dates (`sowing_date`, `transplant_date`, `expected_harvest_date`, `crop_cycle`)
- biological_state derivatives (`stage_uuid`, `growth_stage`, `das`)

For these, also assert `sources.crop === 'crop_schedules'` and `sources.stage === 'biological_state'`. Any drift or wrong source = throw.

**Do NOT apply strict split-check to** `soil`, `ndvi`, `weather` — `lands_cache` fallback is legitimate (e.g. satellite outage → `lands.last_ndvi_value` still better than nothing). For these, the `sources.*` provenance sub-tree is recorded but a fallback path is NOT an error; it is logged in the `[CANONICAL_CONTEXT_FLOW]` line so audits can distinguish live vs cache.

### Files modified (exact list)

1. `supabase/functions/ai-agriculture-chat/decision/canonical-context-contract.ts`
2. `supabase/functions/ai-agriculture-chat/runtime/graph-runtime.ts`
3. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (single call site ~5766 + builder invocation)
4. `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts` (call site 447 + input type)
5. `supabase/functions/ai-agriculture-chat/decision/hypothesis-graph-evaluator.ts` (input type only)
6. `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` (input type only)
7. `supabase/functions/ai-agriculture-chat/tests/observation-state-contract_test.ts` (pass `canonical_context`)

Every modified file gets its mandatory CHANGE LOG header entry.

### Explicitly out of scope

- No `if rainfall < X` / DSR-vs-transplanted / crop-specific branches in TS.
- No new files, no new DB tables/columns, no new agronomy authority.
- No removal of primitive parameters in this pass (kept for split-check safety net; removal is a follow-up after one clean release).
- Does not touch Phase A/B/C/E deliverables from the master refactor plan.

### Why GraphRuntime contract remains unchanged

Single entrypoint preserved. `evaluateCandidateHypotheses` still called from exactly one place. `[GRAPH_RUNTIME]` trace unchanged. `markExecuted` unchanged. OBS_GATE unchanged. New audit line and optional field are purely additive.

### Rollback

Revert Patches 2–4; Patch 1 canonical context extension is inert without a consumer.
