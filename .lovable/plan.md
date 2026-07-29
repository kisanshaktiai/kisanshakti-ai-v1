# Biological Stage Inference — Forensic Audit & Surgical Fix (rev. 2)

## 1. Current Runtime Audit (verified, not inferred)

Live pipeline for stage (traced through actual callers):

```text
orchestrator.ts:10170  rpc('resolve_crop_phenology_for_land')
        ↓
SQL resolve_crop_phenology(land) → resolve_crop_phenology(crop, cycle, method, variety, sow, transplant, gdd)
        ↓
orchestrator.ts:10208  reconcilePhenology()   (runtime/phenology-reconciler.ts)
        ↓
buildBiologicalState() → Object.freeze → landContext.biological_state (locked)
        ↓
GraphRuntime → hypothesis-graph-evaluator (HARD stage gate) → rule selection → LLM
```

Where DAS decides stage today:

| # | Location | Behaviour | Verdict |
|---|---|---|---|
| 1 | `resolve_crop_phenology(...)` line ~144: `v_das BETWEEN csm.das_min AND csm.das_max` | **DAS is the primary and only stage selector.** Variety profile, GDD index and prev/next merely decorate the DAS-picked row. | Incorrect — root cause |
| 2 | `evaluate_stage_transitions` → `stc_eval_single` | Supports `das`, `dat`, `gdd`, `observation`, `event` and `composite` triggers. **All 10 seeded `stage_transition_conditions` rows are `trigger_type='das'`, crop `rice` only.** The evidence layer is also a calendar. | Correct engine, wrong data |
| 3 | `runtime/phenology-reconciler.ts` | Documents 5 tiers but builds only 3 candidates: DAS (0.70), GDD (0.80–0.90), completed transitions (0.90). No morphological/observation candidate exists in code; no weather, soil or NDVI candidate at all. | Needs refactor |
| 4 | `phenology-reconciler.ts:139` | Selects `to_stage_code, transition_date` from `stage_transition_log`, but the real columns are `to_stage_uuid`, `evaluated_at`. The query silently returns nothing → tier is dead. | Bug |
| 5 | GDD tier | Only **13 of 231** `crop_stage_master` rows have `gdd_min` populated, so the tier almost never fires even though `land_gdd_daily` holds 910 rows. | Data gap |
| 6 | `biological-state.ts::evaluateBiologicalConstraints` | Reads `decision_rules WHERE category='BIOLOGICAL_CONSTRAINT'` — **0 such rows exist**. `predicted_stage_confidence` therefore never decays. Machinery live, inert. | Correct code, no data |
| 7 | Persistence | `apply_stage_transitions` writes `stage_transition_log`, but **no runtime code calls it** and the table has **0 rows**. Nothing is remembered, so every chat re-derives stage from DAS. | Missing wiring |
| 8 | `evaluate_stage_validation` | Reads `land_weather_metrics`, which has **0 rows**; real weather lives in `weather_observations` / `weather_aggregates` (959 rows each). Validation runs blind. | Wrong source table |
| 9 | `src/lib/cropStage.ts` (client) | `stageFromProgress(daysSinceSowing/duration)` writes an English stage into `lands.crop_stage` — a fourth calendar authority. | Remove from write path |
| 10 | `iom-gate.ts`, `observation-mapping-cache.ts`, `crop-calendar-lookup.ts`, `contradiction-engine.ts`, `failure-class-detector.ts` | Use `das_min/das_max` only to scope or validate rows, never to assign stage. | Correct — leave alone |

The rice DSR example reproduces exactly: DAS 20 picks the vegetative window, no emergence evidence is consulted, nothing decays confidence, nothing persists.

## 2. Verified Biological Stage Design (existing DB only)

No new tables. Reused surfaces, each verified to exist with row counts where relevant: `crop_stage_master` (231), `crop_stage_graph` (155), `stage_transition_conditions` (10), `stage_validation_rules` (12), `crop_lifecycle_events` (9), `stage_transition_log` (0), `variety_phenology_profile` (22), `observation_master`, `hypothesis_master`, `hypothesis_conditions`, `decision_rules`, weather (`weather_observations` 959, `weather_aggregates` 959, `weather_forecasts` 378), soil (`soil_health` 36), GDD (`land_gdd_daily` 910), NDVI (`ndvi_data` 2,481), land tables (`lands` 41, `crop_schedules` 10 active).

The stage engine operates on a multi-source evidence hierarchy, not DAS:

```text
Canonical Evidence → Evidence Freeze
        ↓
[A] Existing Biological Stage
    (latest stage_transition_log row for land + active crop cycle)
        ↓ present → continue biological progression, skip B and C
        ↓ absent
[B] Autonomous Environmental Stage Inference
    weather history → rainfall since sowing/transplant → irrigation history
    → soil moisture → temperature → GDD → NDVI trend → cultivation method
    → variety phenology → observation graph
    ⇒ expected biological stage + expected stage confidence + evidence set
        ↓
[C] Validation Layer
    farmer confirmation (only if confidence < configured threshold)
    → photo evidence (if available, confidence modifier only)
    ⇒ confirmed biological stage → persist to stage_transition_log
        ↓
[D] DAS Validation
    crop_stage_master window → stage_validation_rules → confidence adjustment
    ⇒ final biological stage
        ↓
Hypothesis Expansion → Hypothesis Validation → Rule Selection → Decision → LLM
```

Evidence priority, in strict order:

1. Previously confirmed biological stage
2. Environmental evidence — weather history, rainfall, irrigation, soil moisture, NDVI trend, temperature, GDD, cultivation method, variety phenology
3. Observation graph
4. Farmer confirmation — only when confidence is insufficient
5. Photo evidence — optional high-confidence validation
6. DAS — validation only

This reflects Indian field reality: most farmers will never upload a photo and many give minimal observations, while weather, soil, NDVI, irrigation, cultivation method and variety are available automatically. Environmental evidence is therefore the primary autonomous inference engine, farmer confirmation is an exception mechanism, photo is an optional booster, and DAS is a plausibility validator that must never determine stage.

## 3. Surgical Fix Plan

**S1 — SQL: demote DAS in `resolve_crop_phenology`** (migration, function body only, unchanged signature)
Resolution order becomes: (a) latest `stage_transition_log` row for the land whose cycle matches the active `crop_schedules` row → `source='biological_ledger'`; (b) else evidence-matched transition via `evaluate_stage_transitions` starting from the earliest lane stage; (c) else the current DAS window with `source='das_provisional'` and confidence capped at 0.5. Same return columns; only `source`/`confidence` values change. Risk: medium — DAS branch retained as final fallback.

**S2 — Environmental inference tiers in the reconciler** (`runtime/phenology-reconciler.ts`)
Fix the dead ledger tier (`to_stage_uuid`, `evaluated_at`, join `crop_stage_master`). Add candidates for: morphological/observation evidence (from frozen confirmed observations against `observation_master.applies_to_stages`), NDVI trend (`ndvi_data` against `crop_stage_master.expected_ndvi_min/max` and `variety_phenology_profile`), soil moisture (`soil_health`), rainfall/temperature since sowing (`weather_aggregates`/`weather_observations`), and irrigation history. Each candidate carries a DB-sourced confidence; no thresholds hardcoded in TypeScript — all read from `system_config`. Risk: medium.

**S3 — Persist the confirmed state** (`agents/orchestrator.ts`, single call site near 10208)
After reconciliation, when the winner differs from the ledger head and `evaluate_stage_validation` does not block, write the `stage_transition_log` row with `evidence` = {stage, confidence, evidence sources, confirmation source, timestamp}. One write per turn, short-circuited on no change. Risk: low — table is append-only and empty today.

**S4 — Autonomous stage initialization & reconfirmation policy** (`agents/orchestrator.ts`, `agents/clarification-generator.ts`)
At the start of a land-specific crop cycle the runtime first checks for a confirmed biological stage; if one exists it is reused immediately and initialization is skipped entirely.

If none exists, the runtime runs Autonomous Environmental Stage Inference (S2 tiers: weather history after sowing/transplant, cumulative rainfall, irrigation history, soil moisture, NDVI trend, temperature, GDD, cultivation method, variety phenology, observation graph), producing an expected stage, an expected confidence and a supporting-evidence set.

- Confidence **above** the configured threshold → persist the stage directly. No farmer interaction.
- Confidence **below** threshold → generate a clarification dynamically from the biological stage graph (`crop_stage_master` + `crop_stage_graph` candidates for the active lane), routed through the existing DB-provenance clarification contract. No hardcoded questions.
- If a photo is present, Vision AI converts it to canonical observations that strengthen or weaken confidence; photo never assigns a stage.

On confirmation, persist stage, confidence, supporting evidence, evidence sources and timestamp to `stage_transition_log`; the stage then progresses continuously through the neuro-symbolic graph.

Reconfirmation is requested only when: a new crop cycle begins, crop changes, cultivation method changes, environmental evidence strongly contradicts the current stage, confirmed farmer observations contradict it, photo evidence contradicts it, or confidence falls below the configured threshold. Never during normal conversation. Risk: medium (UX-visible) — gated on the ledger-empty / contradiction conditions.

**S5 — Seed evidence-driven transitions and constraints** (data migration, no schema change)
Add `stage_transition_conditions` rows with `trigger_type='observation'|'composite'` for germination/emergence/establishment boundaries per seeded crop and lane, and `decision_rules` rows with `category='BIOLOGICAL_CONSTRAINT'` (e.g. no emergence evidence under a dry spell) so `evaluateBiologicalConstraints` finally decays `predicted_stage_confidence`. All agronomy lives in rows, none in TypeScript. Risk: medium — seeded and verified crop-by-crop.

**S6 — Point stage validation at the populated weather tables** (migration)
`evaluate_stage_validation` currently reads the empty `land_weather_metrics`; repoint it at `weather_aggregates`/`weather_observations` so validation rules see real temperature and rainfall. Risk: low.

**S7 — Retire the client calendar writer** (`src/lib/cropStage.ts`, `SmartLandConfirmCard`)
Stop writing the derived stage into `lands.crop_stage`; the helper stays for display-only progress. Risk: low.

**S8 — Photo evidence path** (`photo/photo-observation-mapper.ts` → orchestrator)
Feed canonical observations from Vision AI into the S2 morphological candidate as a confidence modifier only. Risk: low.

## 4. Validation Report (how it will be proven)

Before/after on the rice DSR case, read from edge logs of a real turn:

- Before: `[GRAPH_NODE_TRACE][bio-lock] … stage_source=crop_stage_ssot das=20 biological_stage=VEGETATIVE constraints=[]`
- After: `[GRAPH_NODE_TRACE][bio-lock] … stage_source=environmental_inference stage=GERMINATION das=20 predicted_stage_confidence<0.5 constraints=[EMERGENCE_NOT_CONFIRMED(BLOCK)]`

Checks after each step:

1. `stage_transition_log` goes from 0 to ≥1 row per active land; a second chat in the same cycle logs `source=biological_ledger` and asks no stage question.
2. A land with high-confidence environmental evidence is initialized with **zero** farmer clarifications.
3. A land with weak evidence produces exactly one DB-generated stage clarification, then never again in that cycle.
4. `[BIO_CONSTRAINT_GRAPH] constraints_count>0` on the dry-spell land.
5. DSR vs transplanted rice at identical DAS resolve different lanes (existing lane regression preserved).
6. No turn shows `source='das_provisional'` with confidence > 0.5.
7. Existing suites under `tests/edge/ai-agriculture-chat/` stay green.

### Technical notes

- Persistence reuses `stage_transition_log` as the per-land append-only biological-state ledger and `crop_lifecycle_events` for farmer/photo confirmation events — no new tables, no new columns.
- Only function bodies change in SQL; signatures, return columns and every TypeScript contract (`BiologicalState`, GraphRuntime split-check) stay identical.
- All thresholds come from `system_config`; all new agronomic knowledge is inserted as `stage_transition_conditions` / `decision_rules` rows. Zero crop-specific logic enters TypeScript.
