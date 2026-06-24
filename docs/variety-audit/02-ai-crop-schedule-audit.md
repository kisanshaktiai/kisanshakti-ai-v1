# 02 — AI Crop Schedule Audit (P0)

Pipeline traced: `supabase/functions/ai-smart-schedule/`

```text
index.ts
  └─ resolve land + state + cropName + cropVariety
  └─ loadVarietyProfile()              ✅ Phase 3 wired (variety-context-loader.ts)
  └─ formatVarietyProfileForPrompt()   ✅ injected into prompt
  └─ lean-prompt-builder.ts            ❌ still consults generic crop defaults first
  └─ agro-knowledge-base.ts            ❌ hard-codes per-crop disease/timing matrices
  └─ scientific-validator.ts           ❌ validates against crop baselines, not variety
  └─ decision-graph-integration.ts     ❌ no resistance/irrigation gating
  └─ post-processor.ts                 ❌ does not down-rank tasks against variety profile
  └─ INSERT crop_schedules             ✅ persists variety_id (line 4243)
  └─ INSERT schedule_tasks             ❌ does not carry variety_id
```

## 1. Six-Intelligence Gap Matrix

| Intelligence | Variety column(s) | Current behaviour | Required behaviour | Touchpoint |
|---|---|---|---|---|
| **Maturity** | `maturity_days_min/max` | Prompt block contains it but `getMaxDASForCrop()` still falls back to `crop_baseline_guidelines_v2.das_end` even when variety is known. Schedule horizon set from crop, not variety. | When `varietyProfile.maturity_days_max` exists, it MUST win over crop baseline (per `mem://database/variety-master-schema-v1` consumer contract §2). | `ai-smart-schedule/index.ts` `getMaxDASForCrop()`; new helper `resolveScheduleHorizonDays(variety, crop)`. |
| **Irrigation** | `water_demand_mm_per_season`, `water_demand_category`, `irrigation_sensitivity.critical_stages`, `drought_tolerance` | Irrigation tasks generated from generic crop interval + weather only. `irrigation_sensitivity` is in the prompt but never read in code paths that emit tasks. | Compute per-stage irrigation cadence from variety water demand + critical_stages; force a task on each critical stage; if `drought_tolerance='high'` and rainfed regime, raise interval. | `agro-knowledge-base.ts` (irrigation matrix); new `irrigation-planner.ts`. |
| **Yield** | `yield_irrigated_qtl_per_acre`, `yield_rainfed_qtl_per_acre`, `yield_potential_qtl_per_acre` | Yield target absent from schedule output. | Carry yield target into the response (`expected_yield`) selected by irrigation regime; surface to UI/proactive. | `post-processor.ts`; `crop_schedules` insert payload. |
| **Climate** | `climate_suitability` (temp_min/max, rainfall_min/max, altitude_max, photoperiod) | `scientific-validator.ts` validates crop-level only. | Cross-check against weather context + land elevation; emit warning task `VARIETY_CLIMATE_MISMATCH` when out of band. | `scientific-validator.ts`; surface via `post-processor.ts`. |
| **Soil** | `soil_suitability` (textures, ph_min/max, drainage) | No soil-vs-variety check. | When land has `soil_health` row, compare; emit warning when texture not in `textures[]` or pH outside band. Defer (don't suppress) recommendations. | New `soil-fit-check.ts` invoked before final response. |
| **Regional** | `state_suitability_ids`, `agro_climatic_zones` | `VarietyContext.state_match` boolean is computed but only narrated. Not used to gate or warn. | When `state_match===false`, attach prominent warning to schedule + degrade `data_confidence_score` impact downstream. | `index.ts` after `loadVarietyProfile`. |

## 2. `getMaxDASForCrop()` Contract Drift
The memory file `database/variety-master-schema-v1` defines the fallback chain as:
```
master_products.maturity_days_max (variety) → crop_baseline_guidelines_v2.das_end (crop) → 120
```
Current implementation reads only the crop baseline. The variety branch is missing. This is the single highest-leverage one-line fix.

## 3. `agro-knowledge-base.ts` Hard-Coded Matrices
Inspect reveals per-crop dictionaries (e.g. sugarcane disease list at line ~1125) baked into source. These violate the Core rule `100% of agronomic advice MUST originate from database`. They predate the variety system; the variety profile cannot override them today because the matrix is consulted first.

**Recommendation:** demote `agro-knowledge-base.ts` to a fallback used only when both `master_products` and `crop_baseline_guidelines_v2` are silent for the crop; gate behind a feature flag for staged rollout.

## 4. Resistance Gating in Schedule Generation
The prompt block instructs the LLM to skip preventive sprays for R/HR pathogens, but this is currently a narration directive only — the deterministic builder does not filter tasks. Once §3.1 in the DB audit is fixed, the post-processor must:
```
for task in tasks where task.kind == 'preventive_spray':
    if variety_resistance.level[task.target_observation] in {'R','HR'}:
        task.kind = 'monitor'
        task.priority = 'low'
```

## 5. Persistence Gaps on Write Path
| Insert site | Field carried | Field missing |
|---|---|---|
| `crop_schedules` insert (line 4243) | `variety_id` ✅ | `variety_data_confidence_score`, `variety_state_match` |
| `schedule_tasks` insert | — | `variety_id` (needed to filter tasks by variety after retirement) |
| `ai_schedule_refinements` | — | `variety_id` |

## 6. Telemetry
The function logs `🌾 [Variety] Resolved …` on success but never logs `loadVarietyProfile=null` reasons. Add structured log:
```ts
log({ tag: 'variety_resolution', variety_input: cropVariety, resolved: !!profile, source: profile?.source, state_match: profile?.state_match })
```

## 7. Outcome
The variety profile is already loaded and injected into the LLM prompt. What is missing is **deterministic enforcement** in the code path that runs *after* the LLM and *before* `crop_schedules` is written. Implementation plan delivered in `05-backlog-and-migration-plan.md` § "AI Crop Schedule wiring (P0)".
