# NEURO_SYMBOLIC_PIPELINE_AUDIT
_Forensic, read-only. No code or DB changes performed._
_Scope: full runtime path from farmer message → orchestrator → phenology → hypothesis → decision rules → response, plus every stage-producing / stage-consuming site._

---

## 0. TL;DR

- `resolve_crop_phenology()` **exists and is wired** in `orchestrator.buildEnhancedContext`, and correctly overrides the client label on `context.growth_stage`.
- **But it is NOT the only biological brain at runtime.** At least **5 competing stage producers** still write into the same context object and/or bypass it entirely. The `??` fallback + downstream mutations let the client label re-appear.
- **Phase G (validation/transitions) is functionally dead**: SQL functions reference columns that do not exist. Any call to `apply_stage_transitions()` or `evaluate_stage_validation()` will raise, meaning the phenology resolver's Phase-E "transition override" branch silently degrades to the `crop_stage_master` DAS lookup.
- **Curated data is empty**: `variety_phenology_profile=0`, `stage_transition_conditions=0`, `stage_validation_rules=0`, `land_gdd_daily=0`, `stage_transition_log=0`. Only `crop_stage_master` (220) and `variety_resistance` (183) carry real rows. The variety brain is skeletal.
- **Observation → decision path is intact** in structure, but the "expected vs observed" biological-conflict object called for in Part 4 does **not** exist yet — no producer, no consumer.

---

## 1. Runtime path (producer / consumer map)

```text
Farmer text
   │
   ▼
index.ts  (handleFarmerTurn)
   │  loads landContext = { current_crop, growth_stage, ...} via crop_schedules/lands
   ▼
orchestrator.buildEnhancedContext(landId)             ← PHENOLOGY SSOT ENTRYPOINT
   │  ├── SELECT crop_schedules → derives growthStage HEURISTICALLY (DAS buckets)   [P1]
   │  ├── land.current_crop fallback → hardcodes 'VEGETATIVE'                       [P2]
   │  ├── RPC resolve_crop_phenology(land_id)  → phenology.growth_stage             [P3 ✅ SSOT]
   │  └── authoritativeStage = phenology?.growth_stage ?? heuristic
   ▼
context = { growth_stage, phenology, morphology_evidence, ... }
   │
   ├─▶ gdd-phenology-engine.calculatePhenologicalStage()  → mutates
   │     landContext.growth_stage = phenologyResult.current_stage                   [P4 ❌ competing]
   ├─▶ index.ts:1564  landContext.growth_stage = renderContext.growth_stage         [P5 ❌ competing]
   ├─▶ index.ts:1753  landContext.growth_stage = 'GERMINATION' (hardcode)           [P6 ❌ competing]
   ├─▶ canonical-state-builder.ts:945  fallback chain uses landContext.growth_stage [C]
   ├─▶ context-authority.ts:270,311     result.growth_stage = landContext.growth_stage [C]
   └─▶ hypothesis-evaluator.ts          input.growth_stage → rule filter            [C]
   ▼
layered-rule-evaluator → decision_rules → response
```

Legend: **P**=producer, **C**=consumer.

### Producers (five, must be reduced to one)

| # | Site | File:line | What it writes | Verdict |
|---|---|---|---|---|
| P1 | schedule heuristic | `orchestrator.ts:8360-8402` | `growthStage` from DAS bucket | fallback only, tolerable if it never wins vs P3 |
| P2 | lands fallback | `orchestrator.ts:8416` | `growthStage='VEGETATIVE'` hardcoded | ❌ must be replaced by "unknown / require resolver" |
| P3 | **`resolve_crop_phenology` RPC** | `orchestrator.ts:8432-8445` | authoritative stage | ✅ **SSOT — keep** |
| P4 | GDD phenology engine | `agents/gdd-phenology-engine.ts` via `orchestrator.ts:5098` | `landContext.growth_stage = phenologyResult.current_stage` | ❌ competes with P3 |
| P5 | render-context merge | `index.ts:1564` | overwrites `landContext.growth_stage` from `renderContext` | ❌ silent mutation |
| P6 | germination hardcode | `index.ts:1753` | `landContext.growth_stage = 'GERMINATION'` | ❌ hardcoded |
| P-client | `src/lib/cropStage.ts::stageFromProgress` | client 7-bucket English label → `lands.crop_stage` | ❌ still writes DB column; consumed by P1 chain when no schedule |

### Consumers (must all read from the single frozen `context.phenology`)

| Site | File:line | Reads |
|---|---|---|
| canonical-state-builder | `canonical-state-builder.ts:945` | `landContext.growth_stage` (should read `context.phenology.growth_stage`) |
| context-authority | `context-authority.ts:119,270,287,311` | `landContext.growth_stage` |
| canonical-context-contract | `canonical-context-contract.ts:160` | `landContext.growth_stage` |
| hypothesis-evaluator | `hypothesis-evaluator.ts:653-1094` | `input.growth_stage` (string) |
| layered-rule-evaluator | `layered-rule-evaluator.ts:1314+` | `current_crop_stage` case-sensitive `GERMINATION` |
| context-manager | `context-manager.ts:498` | `landContext.growth_stage` → confirmed_facts |
| rule-evaluation-layer, stage-knowledge-cache, stage-normalizer | mixed | derive category from raw string, no phenology object |

---

## 2. DB layer status

### 2.1 Ontology tables

| Table | Rows | Purpose | Status |
|---|---|---|---|
| `crop_stage_master` | 220 | Base biological lifecycle (crop × DAS-window) | ✅ populated, SSOT for P3 |
| `variety_phenology_profile` | **0** | Variety-level duration/GDD/morphology delta | ❌ empty → resolver never applies variety override |
| `variety_resistance` | 183 | Variety pest/disease susceptibility | ✅ used by hypothesis-evaluator (Phase F) |
| `stage_transition_conditions` | **0** | Guardrails against impossible jumps | ❌ empty; `evaluate_stage_transitions` always returns no match |
| `stage_validation_rules` | **0** | Photoperiod/temp/moisture guardrails | ❌ empty; `evaluate_stage_validation` returns `blocked=false` for everything |
| `land_gdd_daily` | **0** | Thermal age accumulation | ❌ empty; `resolve_crop_phenology` uses `lands.current_gdd` directly (mostly NULL) |
| `stage_transition_log` | **0** | Audit trail for stage promotions | never written because `apply_stage_transitions` errors on every call (see §2.3) |

### 2.2 `resolve_crop_phenology(p_land_id, p_as_of)` — VERIFIED

- Reads `lands.{current_crop, crop_cycle, current_crop_variety_id, planting_date, last_sowing_date, transplant_date, current_gdd}` ✅ (all columns exist).
- Joins `crop_stage_master` by `(crop_code, crop_cycle, das ∈ [das_min, das_max])` ✅.
- Calls `evaluate_stage_transitions(land, stage)` for transition override — **but treats the SETOF result as a single row (`SELECT ... INTO v_transition_match`)** which is legal only if the callee `RETURNS TABLE` (it does). ✅
- Then reads `variety_phenology_profile` for variety delta — but table is empty ⇒ code path dead.
- Returns 24 columns including `growth_stage, current_das, current_gdd, expected_ndvi_min/max, confidence, source, resolver_version=5`. ✅ shape matches `orchestrator.ts:8438` consumption.

### 2.3 Phase-G functions — BROKEN

`evaluate_stage_validation(p_land_id, p_target_stage)` references columns that do not exist:

| Reference in function | Actual schema | Result |
|---|---|---|
| `lands.days_since_sowing` | column does not exist on `lands` | ⛔ runtime error `column "days_since_sowing" does not exist` |
| `land_weather_metrics.tmax_c, tmin_c, soil_moisture_pct, obs_date` | table has `temperature_c, humidity_percent, total_rainfall_mm, metric_date` — no min/max split, no soil moisture, no `obs_date` | ⛔ error on the aggregate SELECT |
| (implicit) `weather_observations.observation_code` (mentioned in prior audits) | table has no `observation_code` column | N/A here but breaks `event_present` rule if ever added |

`apply_stage_transitions(p_land_id)` is doubly broken:

1. Calls `evaluate_stage_transitions(...)` (which `RETURNS TABLE`) and immediately does `v_eval->>'ok'` — ⛔ cannot cast a TABLE to jsonb, function will raise `operator does not exist: record ->> unknown`.
2. Inserts into `stage_transition_log(land_id, from_stage, to_stage, matched_rule_id, applied, reason, evidence)` — the table columns are `land_id, from_stage_uuid, to_stage_uuid, rule_id, trigger_type, confidence, evidence, evaluated_at`. ⛔ every listed column but `land_id`/`evidence` is wrong.

Consequence: `apply_stage_transitions` **has never successfully written a row** (log count = 0 confirms). The cron job that invokes it is a no-op / silent-error loop.

### 2.4 `calc_day_length_hours(lat, date)` ✅ pure SQL, correct signature, callable.

---

## 3. Phenology SSOT rule (Part 2 target) — GAP LIST

For `resolve_crop_phenology()` to be the **only** runtime biological brain, the following competing producers must be neutralised (currently active):

1. **Client** `src/lib/cropStage.ts::stageFromProgress` → `SmartLandConfirmCard` writes `lands.crop_stage` verbatim. Fix intent per Part 2: this column is display/cache only, must never re-enter runtime. Currently `orchestrator.buildEnhancedContext` reads it via `land.current_crop_stage` in the `landContext` and it survives if `resolve_crop_phenology` returns nothing (e.g., no sowing date).
2. **`gdd-phenology-engine.calculatePhenologicalStage()`** (`orchestrator.ts:5098`) unconditionally overwrites `landContext.growth_stage`. This happens **after** the SSOT resolver already produced `context.growth_stage`, so the two objects can now disagree in the same request.
3. **`index.ts:1564`** merges `renderContext.growth_stage` back onto `landContext.growth_stage`.
4. **`index.ts:1753`** hardcodes `'GERMINATION'`.
5. **`orchestrator.ts:8416`** hardcodes `'VEGETATIVE'` on the `lands.current_crop`-only fallback.
6. Every downstream reader (`canonical-state-builder`, `context-authority`, `hypothesis-evaluator`, `layered-rule-evaluator`) still reads `landContext.growth_stage` (a mutable string) instead of the frozen `context.phenology` object.

**No file currently reads `context.phenology.growth_stage` after `buildEnhancedContext` returns.** The SSOT is produced then thrown away outside the local scope.

---

## 4. Expected vs Observed biology (Part 4) — MISSING

- `morphology-reconciler.reconcileMorphology(phenology, {ndvi, plant_height_cm, leaf_count})` ✅ exists and is called (`orchestrator.ts:8470`).
- It emits `MorphologyEvidence` with an `overall_status` (e.g. `NDVI_BELOW_BAND`) and a `confidence_delta`.
- But there is **no `biological_status` / `possible_causes` object** anywhere in the code — searched `stage_conflict`, `biological_status`, `possible_causes` → 0 hits.
- Farmer text ("crop not germinated") is NOT correlated with `phenology.growth_stage` to produce the `stage_conflict=true` verdict required by the spec.
- Hypothesis-evaluator does not consume `morphology_evidence`; it only reads `growth_stage` as a string.

**Gap**: no producer, no consumer, no schema for the expected/observed conflict object.

---

## 5. Observation pipeline (Part 5) — mostly compliant, two leaks

- `observation_master` (220 rows) + `observation_translations` + `observation_aliases` + `intent_observation_mapping` are all present and read by `canonical-observation-loader` and `observation-ontology`.
- `OPTION_SELECTED` handling in `orchestrator.ts` and `index.ts` does map farmer label → `observation_code`. ✅
- **Leaks found**:
  - `layered-rule-evaluator.ts` still uses raw stage strings (`current_crop_stage = 'GERMINATION'`) for filtering — should be structured phenology.
  - `clarification-strategy.ts` builds farmer-visible questions from the observation ontology but occasionally interpolates internal codes when translation is missing (visible in prior audits; not re-verified end-to-end here).

---

## 6. Decision rules connection (Part 6)

- `layered-rule-evaluator` reads `decision_rules.conditions_json.observations` and `stage_applicable`. ✅
- Input to the evaluator is `{crop_code, growth_stage(string), confirmed_observations, soil, weather, variety_context}` — **matches the required shape except `phenology_state` is a bare string, not the resolver object.** The evaluator cannot distinguish "expected tillering, observed no-emergence" from "expected tillering, observed nothing" — it will treat them identically.

---

## 7. LLM boundary (Part 7)

- `llm-response-generator.ts` + `llm-response-formatter.ts` are narration-only in the current source (verified in memory / no agronomy generation calls).
- `fallback-response-generator` was hardened in an earlier phase to be narration-only.
- ✅ No fresh violations found in this audit.

---

## 8. Traces (Part 8) — partial

Present today:
- `[PHENOLOGY_SSOT]` — `orchestrator.ts:8439`
- `[MORPHOLOGY]` — `orchestrator.ts:8475`
- `[STAGE_SSOT]` — `utils/stage-normalizer.ts`
- `[HypothesisEval]` — `hypothesis-evaluator.ts`

Missing per spec:
- `[PHENOLOGY_TRACE]` with `observed_conflict` (no producer of the conflict object).
- `[OBSERVATION_TRACE]` with `farmer_input / canonical_observation / source` in a single line — currently split across multiple prefixes.
- `[RULE_TRACE]` with `candidate_rules / matched_rules / rejected_reason` — `hypothesis-evaluator` logs candidate counts but not per-rule rejection reasons.

---

## 9. Bug list (concrete, must-fix)

| ID | Severity | File / Object | Bug |
|---|---|---|---|
| BUG-1 | HIGH | `evaluate_stage_validation` (SQL) | References `lands.days_since_sowing` (nonexistent) |
| BUG-2 | HIGH | `evaluate_stage_validation` (SQL) | References `land_weather_metrics.tmax_c, tmin_c, soil_moisture_pct, obs_date` (nonexistent; actual: `temperature_c, metric_date`, no min/max split, no soil moisture) |
| BUG-3 | HIGH | `apply_stage_transitions` (SQL) | Treats `evaluate_stage_transitions` (TABLE) as jsonb (`v_eval->>'ok'`) — always errors |
| BUG-4 | HIGH | `apply_stage_transitions` (SQL) | Inserts into non-existent columns `from_stage, to_stage, matched_rule_id, applied, reason` on `stage_transition_log` (real cols: `from_stage_uuid, to_stage_uuid, rule_id, trigger_type, confidence, evidence`) |
| BUG-5 | HIGH | `orchestrator.ts:5098` | `landContext.growth_stage` overwritten by `gdd-phenology-engine` AFTER `resolve_crop_phenology` already produced SSOT — dual authority |
| BUG-6 | HIGH | `orchestrator.ts:5118` | Passes `landContext.current_stage` (never assigned; always `undefined`) to `checkPhotoperiodTrigger` |
| BUG-7 | HIGH | `index.ts:1564,1753` | Reassigns `landContext.growth_stage` (merge + hardcoded `'GERMINATION'`) post-SSOT |
| BUG-8 | HIGH | `orchestrator.ts:8416` | Hardcodes `growthStage='VEGETATIVE'` fallback — should defer to resolver or return `UNKNOWN` |
| BUG-9 | MED  | `hypothesis-evaluator.ts:653` | Consumes `growth_stage: string`; no access to `phenology` object; case-sensitive comparisons across the codebase |
| BUG-10 | MED | `layered-rule-evaluator.ts:1314` | Case-sensitive stage filter (`GERMINATION`) — brittle to any producer that emits mixed case |
| BUG-11 | MED | `src/lib/cropStage.ts` + `SmartLandConfirmCard` | Client heuristic still writes `lands.crop_stage` (English, mixed case) — must become display-only, never enter runtime |
| BUG-12 | MED | Missing | No `biological_status / stage_conflict / possible_causes` producer or consumer for Part 4 expected-vs-observed logic |
| BUG-13 | LOW | Data | `variety_phenology_profile`, `stage_transition_conditions`, `stage_validation_rules`, `land_gdd_daily` all empty — the variety/environmental brain has no facts to reason from |
| BUG-14 | LOW | Traces | `[RULE_TRACE]` rejection reasons and unified `[OBSERVATION_TRACE]` not emitted |

---

## 10. Before / After data-flow

### BEFORE (today)
```text
farmer → landContext(growth_stage from lands.crop_stage or heuristic)
       → buildEnhancedContext → phenology(SSOT) → context.growth_stage
                                                 └─ landContext.growth_stage (unchanged, stale)
       → GDD engine OVERWRITES landContext.growth_stage
       → index.ts merges/hardcodes landContext.growth_stage
       → canonical-state-builder reads landContext.growth_stage (stale)
       → hypothesis-evaluator sees stale string
       → decision_rules matched against wrong stage
       → LLM narrates wrong stage
```

### AFTER (target, Parts 2-8)
```text
farmer → landContext (raw, non-authoritative)
       → buildEnhancedContext:
            phenology = resolve_crop_phenology(land)         ← ONLY producer
            reconcileMorphology(phenology, observed)
            detectStageConflict(phenology, farmer_obs, ndvi) ← NEW
       → context = { phenology (frozen), morphology, stage_conflict }
       → all downstream reads: context.phenology.growth_stage
       → hypothesis-evaluator input includes phenology object + stage_conflict
       → decision_rules receive {crop, phenology, observations, weather, soil, variety}
       → LLM narrates deterministic verdict
       [PHENOLOGY_TRACE] [OBSERVATION_TRACE] [RULE_TRACE] emitted every request
```

---

## 11. Files touched by the fix (proposed, none edited yet)

**DB (single migration)**
- Rewrite `evaluate_stage_validation` to use real columns (`lands.last_sowing_date` → derive DAS, `land_weather_metrics.temperature_c` + tolerance for min/max via daily aggregate, drop `soil_moisture_pct` or source it from `soil_health.moisture_content`).
- Rewrite `apply_stage_transitions` to (a) treat evaluator as `SELECT ... FROM evaluate_stage_transitions(...)`, and (b) insert into real `stage_transition_log` columns.

**Edge (`ai-agriculture-chat`)**
- `agents/orchestrator.ts`: remove GDD-engine stage overwrite; delete `'VEGETATIVE'` hardcode; freeze `context.phenology` and stop mutating `landContext.growth_stage` after SSOT; introduce `detectStageConflict()` producer.
- `index.ts`: remove `landContext.growth_stage = renderContext.growth_stage` merge and `= 'GERMINATION'` hardcode.
- `decision/hypothesis-evaluator.ts`: accept and read `phenology` object; keep string for backwards compat but stop making decisions on case-sensitive raw strings.
- `agents/canonical-state-builder.ts`, `decision/context-authority.ts`, `decision/canonical-context-contract.ts`: swap reads from `landContext.growth_stage` to `context.phenology.growth_stage`.
- `agents/layered-rule-evaluator.ts`: case-insensitive stage match; pass phenology object.
- Add `[PHENOLOGY_TRACE] [OBSERVATION_TRACE] [RULE_TRACE]` emitters.

**Frontend**
- `src/lib/cropStage.ts` / `SmartLandConfirmCard.tsx`: keep for display, remove `crop_stage` from create-land payload (or leave column but stop reading it in edge).

**No new tables. No new edge functions.**

---

## 12. Acceptance-test predictions (once fixed)

- **Test 1** ("भात अजून उगवले नाही", rice, DAS 20):
  `phenology.growth_stage='SEEDLING'`, `farmer_observation='NO_EMERGENCE'` → `stage_conflict=true` → hypothesis-evaluator opens `EMERGENCE_FAILURE` branch, not tillering advice.
- **Test 2** ("पाने पिवळी झाली"):
  Observation → `LEAF_YELLOWING` (canonical). No direct N-deficiency verdict; clarifier fires on stage/soil/pattern per DB rules.
- **Test 3** (Rice A 90d vs Rice B 140d, same DAS):
  Once `variety_phenology_profile` is populated, `resolve_crop_phenology` returns different `stage_uuid` per variety at identical DAS — currently identical because the table is empty.

---

## 13. Verdict

The **architecture** for a single SSOT phenology brain is in place. The **wiring** is not:

1. Five stage-producing paths coexist and mutate the same context field.
2. Two Phase-G SQL functions are structurally broken and never execute successfully.
3. The expected-vs-observed conflict object required for Part 4 does not exist.
4. Curated data for variety / transitions / validation is empty.

Fixes are surgical and stay inside the current architecture (no new tables, no new edge function). Awaiting approval to proceed with Parts 2-8 in one code+migration pass.
