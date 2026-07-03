
# Crop‑Stage Brain — Deep Audit (Phases A → G)

Scope: verify that the migrations that shipped for the variety‑aware crop‑stage brain match (a) the actual database schema in this project and (b) the TypeScript code that is supposed to consume them. Read‑only. No fixes applied.

Legend: ✅ live & wired · ⚠️ live but partial/inconsistent · ❌ broken (compiles but will fail at runtime)

---

## 1. What actually shipped in the DB

Tables present (verified in `information_schema`):
- `crop_stage_master` ✅ — has `base_temperature_c`, `gdd_min/max`, `expected_ndvi_min/max`, `expected_height_cm_*`, `expected_leaf_count_*`, `phenology_index`, `phenology_model`, `stage_node_type`, `prev/next_stage_id`, `is_photoperiod_sensitive`.
- `variety_phenology_profile` ✅ — Phase B override layer. Columns match resolver (`gdd_target`, `phenology_model_override`, `expected_*`, `base_temperature_c_override`, `das_min/max_override`, `variety_id`, `stage_uuid`, `crop_cycle`).
- `land_gdd_daily` ✅ — Phase D per‑day accumulator.
- `stage_transition_conditions` ✅ — Phase E rule store (`from_stage_uuid`, `to_stage_uuid`, `trigger_type`, `trigger_config`, `combinator`, `priority`, `confidence`).
- `stage_transition_log` ✅ — audit table with columns `land_id, from_stage_uuid, to_stage_uuid, rule_id, trigger_type, confidence, evidence, evaluated_at`.
- `stage_validation_rules` ✅ — Phase G guardrails (`crop_code, stage_code, rule_code, rule_type, rule_config, severity, description, confidence, active`).

Functions present (verified in `pg_proc`):
- `resolve_crop_phenology(uuid, date)` ✅ — v4, returns Phase‑D shape including `current_gdd`, `phenology_index`, `evidence_sources`, `resolver_version=4`. Phase E migration re‑declared it (v5 logic with transition override) and this v5 is the one that survived — it selects the top matched transition via `evaluate_stage_transitions` and swaps `v_stage` to `to_stage_uuid`.
- `accumulate_gdd_for_land(uuid, int)` ✅ — single‑triangle GDD, ±3‑day imputation, upserts into `land_gdd_daily`, updates `lands.current_gdd / gdd_anchor_* / gdd_last_computed_at`.
- `accumulate_gdd_batch(int)` ✅.
- `evaluate_stage_transitions(uuid, uuid)` ✅ — returns SETOF rows (`rule_id, from_stage_uuid, to_stage_uuid, trigger_type, priority, confidence, matched, evidence`).
- `stc_eval_single(...)` ✅.
- `calc_day_length_hours(numeric, date)` ✅.
- `evaluate_stage_validation(uuid, text)` ⚠️ — see §4.
- `apply_stage_transitions(uuid)` ❌ — see §4.

Cron:
- `gdd-accumulator-6h` scheduled `0 */6 * * *`, body `SELECT public.accumulate_gdd_batch(500);` — target function exists ✅.

`lands` new columns present: `current_gdd`, `gdd_anchor_type`, `gdd_anchor_date`, `gdd_last_computed_at`, `stage_uuid`, `stage_source`, `stage_resolved_at`, `transplant_date`, `current_crop_variety_id`, `center_lat`, `crop_stage` (legacy heuristic still there — Phase A did NOT remove it, only overlaid).

---

## 2. Data population

```
variety_phenology_profile  0 rows
stage_transition_conditions 0 rows
stage_validation_rules     0 rows
stage_transition_log       0 rows
land_gdd_daily             0 rows
crop_stage_master with base_temperature_c: 120 rows ✅
crop_stage_master with gdd_min/max:          0 rows ⚠️
lands with current_gdd:                     0 rows
lands with sowing_date:                     2 rows
```

Consequences:
- Phase B (variety override) is inert until `variety_phenology_profile` is seeded — the resolver still returns v4/v5 shape but always falls through to the crop_stage_master defaults, `confidence` stays at `0.75`, and `phenology_index` never uses the GDD path (`v_gdd_target` is null everywhere).
- Phase E (`stage_transition_conditions`) is inert — evaluator always returns 0 matched rules, resolver's transition override never fires.
- Phase G (`stage_validation_rules`) is inert — `evaluate_stage_validation` returns `blocked=false` for every stage.
- Phase D cron has run but there are no lands with GDD → likely the batch was scheduled but hasn't fired yet, or `weather_aggregates` has no rows for the two sown lands. Needs one manual `SELECT public.accumulate_gdd_batch(500);` and a check of `system_health_events` for the batch log line.
- Phase A resolver is being called by the orchestrator (see §3) but with only 2 sown lands and no seeded overrides its practical impact today is: it just re‑derives what `crop_stage_master` already says, ignoring the stale `lands.crop_stage` string — which was the whole point of the fix.

---

## 3. Code linkage (TS ↔ DB)

`supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
- Line 8434 — `supabase.rpc('resolve_crop_phenology', { p_land_id: landId })` ✅. Row is stored on `context.phenology` and used to compute `authoritativeStage`, `authoritativeDas`, `stage_authority = 'phenology_ssot' | 'schedule_heuristic' | 'lands_fallback'`. This is the Phase A wiring and it is live.
- Line 8471 — `reconcileMorphology(phenology, { ndvi, plant_height_cm:null, leaf_count:null })` ✅. Consumes `expected_ndvi_*` / `expected_height_*` from the resolver and emits `morphology_evidence` with `confidence_delta` and `stage_shift_hint`. The Phase D GDD‑vs‑DAS drift branch inside `morphology-reconciler.ts` reads `phen.current_gdd` / `phen.phenology_index` / `phen.current_das` from the same row — shape matches resolver v4/v5. ✅
- Lines 5083–5100 — legacy `calculatePhenologicalStage(...)` (from `gdd-phenology-engine.ts`) is still run **in parallel** and its result overwrites `landContext.growth_stage`. ⚠️ **Drift risk**: `context.growth_stage` (built later from `phenology.growth_stage`) and `landContext.growth_stage` (from the TS GDD engine) can disagree. Downstream code reads a mix of both.
- Lines 5110–5135 — photoperiod block. `checkPhotoperiodTrigger(cropCode, lat, das, currentStage)` receives `landContext.current_stage`. ❌ **`landContext.current_stage` is never assigned anywhere in `orchestrator.ts`** (only `landContext.growth_stage` and `landContext.gdd_phenology.current_stage`). `currentStage` is always `undefined`, so `integratePhotoperiodWithPhenology` immediately returns `photoperiod_suitable:true, warning:undefined`, making the trigger effectively no‑op for onion/rice.
- Lines 4402, 5331 — `variety_id` is pulled from `landContext.current_crop_variety_id` and passed into the clarification / hypothesis path. ✅ matches the column on `lands`.
- No call site for `evaluate_stage_transitions`, `apply_stage_transitions`, `evaluate_stage_validation`, or `calc_day_length_hours` exists in TS. Phase E and Phase G are pure DB features today — they only take effect when the resolver invokes `evaluate_stage_transitions` internally, and never when `apply_stage_transitions` is triggered (nothing triggers it).

`supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`
- `loadVarietyResistance(supabase, variety_id)` at line 163 queries `variety_resistance` ✅ (table has 12 columns per the tables listing). Gated on `input.variety_id`, which is fed from `landContext.current_crop_variety_id`. Phase F wiring is intact.

`supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts`
- Threads `variety_id` through to the hypothesis input at line 421 ✅.

`src/lib/cropStage.ts` and `src/components/land/SmartLandConfirmCard.tsx`
- Still write the crop‑agnostic 7‑bucket English label into `lands.crop_stage` at land creation time (per `CROP_STAGE_CONFLICT_REPORT.md`). ⚠️ **Not addressed by any of Phases A–G.** The resolver overrides it at read time in the AI orchestrator, but every non‑AI reader (community feed, dashboards, `crop_schedules` UI, `layered-rule-evaluator` when it falls back to `landContext.current_crop_stage`) still sees the stale English string.

---

## 4. Concrete bugs found

**B1 — Phase G `evaluate_stage_validation` references columns that do not exist.** Runtime error on first call.
- `SELECT ... days_since_sowing FROM public.lands` → `lands.days_since_sowing` **does not exist** (only `last_sowing_date`, `planting_date`, `transplant_date`).
- `SELECT max(tmax_c), min(tmin_c), avg(soil_moisture_pct) FROM public.land_weather_metrics WHERE obs_date ...` → `land_weather_metrics` has `metric_date`, `temperature_c`, no `tmax_c`/`tmin_c`/`soil_moisture_pct`/`obs_date`. Every temp/moisture rule will throw `column "tmax_c" does not exist`.
- `observation_present` branch reads `weather_observations.observation_code` and `.obs_date` → real columns are `observation_date` (no observation_code at all on this table). Any `observation_present` rule crashes.

**B2 — Phase G `apply_stage_transitions` treats the Phase E `evaluate_stage_transitions` as if it returned jsonb.** It does not; it returns `SETOF (rule_id, from_stage_uuid, to_stage_uuid, trigger_type, priority, confidence, matched, evidence)`. The line `v_eval := public.evaluate_stage_transitions(p_land_id, NULL);` will fail (assigning a set‑returning function into a jsonb variable), and every downstream expression (`v_eval->>'ok'`, `v_eval->'matched'`) is against a shape that never existed.

**B3 — Phase G `apply_stage_transitions` writes to `stage_transition_log` with the wrong columns.** It inserts into `(land_id, from_stage, to_stage, matched_rule_id, applied, reason, evidence)`. The table's actual columns are `(land_id, from_stage_uuid, to_stage_uuid, rule_id, trigger_type, confidence, evidence, evaluated_at)`. There is no `applied` / `reason` / `matched_rule_id` / `from_stage`/`to_stage` column. Insert will fail even if B2 were fixed.

**B4 — Orchestrator passes `undefined` for `currentStage` into `checkPhotoperiodTrigger`.** `landContext.current_stage` is never set; the correct field is `landContext.growth_stage` (or `landContext.gdd_phenology.current_stage`). Result: photoperiod block silently no‑ops for onion/rice.

**B5 — Dual stage authority in orchestrator.** `landContext.growth_stage` is overwritten by the TS `calculatePhenologicalStage` at line 5098, but the canonical `context.growth_stage` used for the deterministic response (line 8459) is derived from the DB resolver (`phenology.growth_stage ?? growthStage`). Two sources of truth for stage inside one request; downstream consumers that read from `landContext.*` vs `context.*` can disagree.

**B6 — `crop_stage_master.gdd_min/max` are 0 rows populated.** Phase D added the columns but no rows have values. The resolver's GDD path (`v_gdd_target := v_vpp.gdd_target`) also depends on `variety_phenology_profile.gdd_target` which is empty. Net effect: `current_gdd` is exposed and reconciler drift logic reads it, but `phenology_index` is still the static value from `crop_stage_master.phenology_index` — no thermal‑time progression yet.

**B7 — `lands.crop_stage` producer path untouched.** The whole reason this refactor started (client‑side 7‑bucket English string persisted into `lands.crop_stage`) is still exactly as documented in `CROP_STAGE_CONFLICT_REPORT.md`. No migration and no code change removes the writer, no trigger normalizes the value, and no writer replaces it with `stage_uuid` / `stage_code`. The read path via `resolve_crop_phenology` masks the conflict inside the AI orchestrator only.

---

## 5. What is missing to close the "variety‑based crop staging brain"

1. **Seed data**: `variety_phenology_profile` (variety → GDD target + expected bands), `stage_transition_conditions` (per crop from/to stage triggers), `stage_validation_rules` (photoperiod / temp / moisture / event guardrails), and back‑fill `crop_stage_master.gdd_min/max`. Without seeds, Phases B/E/G are structurally live but semantically inert.
2. **Kill or normalize the client stage writer**: replace `SmartLandConfirmCard.tsx` write of `lands.crop_stage` with either (a) a DB trigger that maps to `stage_uuid` via `crop_stage_master`, or (b) an RPC that calls `resolve_crop_phenology` at write time and stores `stage_uuid` + `stage_source='resolver'`.
3. **Fix the four DB bugs (B1–B3) + orchestrator wiring (B4, B5)** — none are seed‑dependent; they will fail the first time a caller exercises them.
4. **Wire `evaluate_stage_transitions` / `apply_stage_transitions` into an actual caller.** Currently no cron and no edge function invokes them, so even after fixes the transitions table is decorative until either the GDD cron also calls `apply_stage_transitions(land_id)` per land or the orchestrator invokes it on read.
5. **Expose `current_gdd` / `phenology_index` / `stage_authority` on the canonical context** consumed by rule evaluators, so `decision_rules` can predicate on GDD ranges — right now only the reconciler reads them.
6. **Documentation update**: `.lovable/plan.md` still describes Phase D as the roadmap ("Phase E next"), but Phases E/F/G already shipped. Refresh it so future audits don't repeat this reconciliation.

---

## 6. One‑line status per phase

| Phase | DB shipped | Code wired | Data seeded | Working end‑to‑end? |
|---|---|---|---|---|
| A — resolver v2/v4 SSOT | ✅ | ✅ orchestrator RPC | n/a (uses `crop_stage_master`) | ✅ read‑side; write‑side untouched (B7) |
| B — variety overrides | ✅ | ✅ (resolver joins vpp) | ❌ 0 rows | ⚠️ inert |
| C — morphology reconciler | ✅ (pure TS) | ✅ | n/a | ✅ |
| D — GDD accumulator + cron | ✅ | ✅ (resolver reads `lands.current_gdd`) | ❌ 0 rows in `land_gdd_daily` | ⚠️ cron scheduled, not yet observed |
| E — transition conditions | ✅ | ⚠️ resolver internal only, no external caller | ❌ 0 rows | ⚠️ inert |
| F — variety_resistance in hypotheses | n/a schema pre‑existed | ✅ evaluator + clarification threads variety_id | depends on curated `variety_resistance` | ✅ conditional on curation |
| G — validation rules + apply_stage_transitions | ✅ tables + `calc_day_length_hours` + `evaluate_stage_validation` | ❌ no TS caller | ❌ 0 rows | ❌ B1–B3 will crash on first call |

---

## Deliverable

This is a read‑only audit. No files changed. Recommended next step (with your approval, in a separate turn): a single fixup migration that (a) rewrites `evaluate_stage_validation` to real column names, (b) rewrites `apply_stage_transitions` to consume the SETOF from `evaluate_stage_transitions` and insert into the real `stage_transition_log` schema, and (c) a one‑line orchestrator patch replacing `landContext.current_stage` with `landContext.growth_stage` at the photoperiod call site. Seed data and killing the client writer are separate, larger workstreams.
