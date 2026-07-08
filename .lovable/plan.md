## Forensic audit — DAS / crop / variety / stage SSOT

**Verdict:** the neuro-symbolic brain currently has **four competing stage resolvers**. `public.resolve_crop_phenology()` is the true SSOT (it already reads `lands.current_crop`, `current_crop_variety_id`, `planting_date`/`last_sowing_date`/`transplant_date`, `crop_stage_master`, `variety_phenology_profile`, `evaluate_stage_transitions`, `current_gdd`, and emits `stage_uuid`, `growth_stage`, `current_das`, `confidence`, `source`, `resolver_version`). Multiple upstream and sibling code paths bypass it or run their own hardcoded ladders in parallel.

### Violations found (all live on the request path)

**1. `agents/orchestrator.ts` lines 9707–9779** — 85-line hardcoded ICAR ladder `calculateGrowthStage` for WHEAT/RICE/SUGARCANE/COTTON/SOYBEAN/MAIZE + DEFAULT. **Called at line 9325 BEFORE `resolve_crop_phenology` runs at line 9373.** Second brain, competing with the RPC every single turn.

**2. `decision/authoritative-state-loader.ts` lines 638–645** — 7-line hardcoded DAS ladder that fires when the RPC returns no row and emits `EARLY_VEGETATIVE` / `GRAND_GROWTH` / `MATURITY`. Should emit `null` + `stage_source='UNKNOWN'`.

**3. `decision/context-validator.ts::validateGrowthStage` lines 231–284** — recomputes DAS from `sowing_date` and calls `getStageByDAS(crop, DAS)` (crop_stage_master only, **variety-blind**). Third brain, ignores `biological_state.growth_stage` that the RPC already produced.

**4. `decision/crop-calendar-lookup.ts::calculateGrowthStageFromDAS`** — still exported, wraps `getStageByDAS` (variety-blind). Any consumer bypasses the phenology RPC and variety overrides.

### SSOT columns the loader is NOT reading

`authoritative-state-loader.ts` line 370 selects nothing from these already-computed SSOT columns on `public.lands`:

- `das` (int) — precomputed authoritative DAS
- `stage_uuid`, `crop_stage`, `stage_source`, `stage_resolved_at` — resolved stage + audit
- `current_crop_id` (FK to `crops.id`), `current_crop_variety_id` (FK to variety)
- `planting_date`, `last_sowing_date`, `transplant_date`, `current_gdd`, `crop_cycle`

Loader line 379 selects only `crop_name, crop_variety, sowing_date, expected_harvest_date, status, is_active` from `crop_schedules` — ignores `variety_id`, `transplant_date`, `stages_covered` (jsonb).

**Consequence:** the loader recomputes DAS from `crop_schedules.sowing_date` alone (line 445) while the RPC coalesces `lands.planting_date > lands.last_sowing_date > crop_schedules.sowing_date` (RPC lines 57–61) — the two DAS values disagree whenever `lands.planting_date` is set. Everything downstream that reads `land_state.crop.days_since_sowing` (instead of `biological_state.das`) sees the drifted value.

### Crop identity drift

`AuthoritativeLandState.crop.current_crop` is set from `crop_schedules.crop_name` (text) at loader line 663, not from `lands.current_crop_id → crops.id → crops.value`. This is exactly the anti-pattern the user called out: canonical `crops.id` is the SSOT, `crop_schedules.crop_name` is a mirror that can drift.

### Variety-aware phenology not propagated

`variety_phenology_profile.das_min_override / das_max_override / stage_uuid` are consulted **only inside** the RPC. `getStageByDAS` in `stage-knowledge-cache.ts` is variety-blind. `AuthoritativeLandState.crop` does not carry `variety_id`. Downstream rule scoping (`landContext.current_crop_variety_id`) survives only because the orchestrator plumbs it from a different upstream source (frontend context) — fragile.

### Proposed remediation (surgical PRs — one at a time)

```text
PR-4a  orchestrator.calculateGrowthStage        DELETE 85-line ladder + its
                                                 pre-RPC call site
PR-4b  authoritative-state-loader ladder        DELETE 7-line fallback; emit
                                                 null + stage_source='UNKNOWN'
PR-4c  context-validator.validateGrowthStage    Consume biological_state /
                                                 land_state.crop.growth_stage;
                                                 stop importing getStageByDAS;
                                                 add stage_source='LOCKED'
PR-4d  authoritative-state-loader queries       SELECT lands.{das,stage_uuid,
                                                 crop_stage,current_crop_id,
                                                 current_crop_variety_id,
                                                 stage_source,planting_date,
                                                 last_sowing_date,
                                                 transplant_date,crop_cycle,
                                                 current_gdd}; add crop_id,
                                                 variety_id, transplant_date,
                                                 stage_uuid, precomputed_das
                                                 to AuthoritativeLandState.crop
PR-4e  BiologicalState in loader                Build BiologicalState inside
                                                 authoritative-state-loader so
                                                 crop.growth_stage NEVER comes
                                                 from a ladder — single freeze
                                                 point
PR-4f  Variety-aware getStageByDAS              Extend stage-knowledge-cache
                                                 to preload variety_phenology_
                                                 profile; getStageByDAS(crop,
                                                 das, varietyId?) prefers
                                                 override bands
PR-4g  Canonical crop identity                  Resolve crop_code via
                                                 lands.current_crop_id →
                                                 crops.value; fall back to
                                                 crop_schedules.crop_name only
                                                 when the FK is null
PR-4h  Integrity tests                          graph-integrity_test asserts
                                                 (a) no DAS→stage ladders in
                                                 decision/ or agents/, (b)
                                                 context-validator does not
                                                 import getStageByDAS, (c)
                                                 loader queries include the
                                                 lands SSOT columns above
```

### Contract after all PRs land

```text
resolve_crop_phenology(land_id)   ← the only stage/DAS producer
        │
        ▼
BiologicalState (frozen, single writer)
        │
        ▼
AuthoritativeLandState.crop { crop_id, variety_id, growth_stage,
                              stage_uuid, das, sowing_date,
                              transplant_date, crop_cycle }
        │
        ▼
Every downstream consumer READS from the frozen state.
No module recomputes DAS. No module resolves stage. No hardcoded ladder.
```

### Technical proof points (verified live)

- `resolve_crop_phenology` signature verified via `pg_proc` — emits 24 columns including `stage_uuid`, `growth_stage`, `current_das`, `confidence`, `source`, `resolver_version`.
- `lands` columns verified: `das int`, `stage_uuid uuid`, `crop_stage varchar`, `current_crop_id uuid`, `current_crop_variety_id uuid`, `stage_source text`, `stage_resolved_at timestamptz`, `transplant_date date`, `last_sowing_date date`, `planting_date` (implicit from RPC), `crop_cycle text`.
- `crop_schedules` columns verified: `crop_name`, `crop_variety`, `variety_id uuid`, `sowing_date`, `transplant_date`, `stages_covered jsonb`.
- `variety_phenology_profile` columns verified: `crop_code`, `variety_id`, `stage_uuid`, `stage_code`, `das_min_override int`, `das_max_override int`.
- All four competing stage resolvers cited above are on the live orchestrator path (verified by `rg` and file reads).

### Question before implementation

Which PR do you want first? I recommend **PR-4a** (delete the 85-line ladder inside orchestrator + its pre-RPC call site) — smallest change, biggest single-brain gain, zero schema impact, immediately eliminates the largest hardcoded agronomic table still on the request path.