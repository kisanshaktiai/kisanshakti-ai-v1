## Scope

Read-only inventory of every file and DB object involved in cultivation method + biological stage (phenology) logic. No code changed.

---

## 1. Database layer (stage SSOT)

**Functions found in `public` (verified via pg_proc):**

| Function | Signature | Role |
|---|---|---|
| `resolve_crop_phenology` | `(p_crop_code, p_crop_cycle, p_cultivation_method, p_variety_id, p_sow_date, p_transplant_date, p_current_gdd, p_as_of, p_land_id)` | Core stage resolver — cultivation-method aware |
| `resolve_crop_phenology` | `(p_land_id)` | Overload |
| `resolve_crop_phenology_for_land` | `(p_land_id, p_as_of)` | The only resolver actually called from code (4 call sites) |
| `resolve_crop_stage_full` | `(p_land_id, p_as_of)` | Extended resolution (no code call sites found) |
| `apply_stage_transitions` | `(p_land_id)` | Persists confirmed transitions |
| `evaluate_stage_transitions` | `(p_land_id, p_from_stage)` | Per-edge trigger evaluation |
| `evaluate_stage_validation` | `(p_land_id, p_target_stage)` | Validates a candidate stage |
| `derive_stage_transition_conditions` / `derive_biological_stage_transitions` | `(p_crop_code)` | Seeders for transition rules |
| `initialize_crop_cycle_stage` | `(p_land_id)` | Autonomous cycle anchoring (S4) |
| `accumulate_gdd_for_land` / `accumulate_gdd_batch` | | GDD accumulation feeding non-DAS triggers |
| `sync_land_stage_cache` | `()` | Cache sync |

**Tables read by stage modules (from source):** `crop_stage_master`, `crop_stage_graph`, `crop_stage_knowledge`, `stage_transition_log`, `land_gdd_daily`, `crop_growth_analysis`, `crop_schedules`, `lands`, `ndvi_data`, `soil_health`, `weather_current`, `weather_observations`, `intent_observation_mapping`, `decision_rules`.

**Migrations carrying cultivation/stage DDL:** `20260712183336`, `20260729144228`, `20260729145903`, `20260729153551`, `20260729154106`, `20260729165059`, `20260730173557`, `20260730173811`, plus earlier stage seeds (`20260703*`, `20260704*`).

---

## 2. Edge runtime — `supabase/functions/ai-agriculture-chat`

### 2a. Stage authority core
| File | Lines | Role |
|---|---|---|
| `utils/stage-knowledge-cache.ts` | 410 | DB-only stage SSOT cache. Owns the `AsyncLocalStorage` cultivation lane (`enterCultivationLane`, `runWithCultivationLane`, `currentLane`, `setActiveCultivationMethod`). Loads `crop_stage_master` / `crop_stage_graph` / `crop_stage_knowledge`; exposes `getStageRow`, `getStageByDAS`, `getStageFamilyFromDB`, `stagesEquivalentFromDB` |
| `utils/stage-normalizer.ts` | 209 | Canonical stage keys + `StageCategory`, `areStagesCompatible`, `calculateStageRelevanceScore` |
| `runtime/stage-family-shim.ts` | 105 | `stageFamily` / `stagesEquivalent` delegates; `STAGE_FAMILIES` is intentionally frozen-empty (DB-only) |
| `runtime/phenology-reconciler.ts` | — | Multi-tier inference: morphology (`crop_growth_analysis`) → GDD (`land_gdd_daily`) → `crop_stage_master` → DAS fallback (0.5); writes `stage_transition_log` |
| `agents/biological-state.ts` | 322 | `buildBiologicalState`, lock/assert helpers, `evaluateBiologicalConstraints` (reads `decision_rules`) |
| `decision/stage-symbol-resolver.ts` | 84 | `resolveStageSymbol`, `sameStageNode`, `sameStageFamily`, `stageCompatibility` |
| `decision/crop-calendar-lookup.ts` | — | Calendar/DAS lookups, cultivation-aware |
| `decision/authoritative-state-loader.ts` | 864 | ASL: calls `resolve_crop_phenology_for_land`, merges land/soil/NDVI/weather/schedule into `AuthoritativeLandState` |
| `decision/canonical-context-contract.ts` | 581 | Immutable `CanonicalContext` incl. stage + cultivation_method |

### 2b. Consumers of stage / cultivation lane
`agents/orchestrator.ts` (central binder — 18 cultivation refs, 134 DAS refs, lane binding + `apply_stage_transitions` at ~L10289), `agents/canonical-observation-loader.ts`, `agents/layered-rule-evaluator.ts`, `agents/canonical-state-builder.ts`, `agents/crop-stage-advisor.ts`, `agents/static-data-gate.ts`, `agents/soil-ndvi-state-calculator.ts`, `agents/clarification-*` (generator / renderer / strategy / scope-resolver), `decision/hypothesis-evaluator.ts`, `decision/hypothesis-graph-evaluator.ts`, `decision/hypothesis-clarification-builder.ts`, `decision/iom-gate.ts`, `decision/failure-class-detector.ts`, `decision/symbolic-reasoner.ts`, `decision/morphology-reconciler.ts`, `decision/temporal-constraint-validator.ts`, `decision/context-authority.ts`, `decision/unified-decision-gate.ts`, `decision/prescription-gate-enforcer.ts`, `runtime/contradiction-engine.ts`, `runtime/session-ssot.ts`, `runtime/graph-truth.ts`, `runtime/graph-runtime*.ts`, `runtime/observation-selector-contract.ts`, `index.ts`.

### 2c. Other edge functions
- `ai-smart-schedule/index.ts` (80 DAS refs) and `ai-smart-schedule/agro-knowledge-base.ts` — **hardcoded DAS/stage split schedules in TS**, not DB-sourced.
- `ai-smart-schedule/decision-graph-integration.ts`, `proactive-evaluator/index.ts`, `ai-crop-scan/index.ts`, `ai-query-understanding/index.ts` — read stage/cultivation context.
- `seed-decision-rules/rules/sugarcane/*.json` — stage-keyed rule seeds.
- `weather/agricultural-calculations.ts` — GDD inputs.

---

## 3. Frontend

| File | Role |
|---|---|
| `src/hooks/useLandChatContext.ts` | Only client caller of `resolve_crop_phenology_for_land`; documents "never derive stage on the client" |
| `src/lib/cropStage.ts` | **Client-side stage derivation from sowing date + duration** (`stageFromProgress` hardcoded thresholds) — used by `SmartLandConfirmCard` |
| `src/components/land/SmartLandConfirmCard.tsx` | Writes `crop_stage`, planting/sowing/cultivation dates |
| `src/components/chat/*` (`LandContextCard`, `DataAuditCards`, `DecisionBrainCards`, `DiagnosticResponseCard`, `EnhancedAIChatInterface`, `GeneralChatLandPicker`) | Display stage/context |
| `src/components/crop-growth/*`, `src/hooks/useCropGrowthTracking.ts` | Morphology capture feeding `crop_growth_analysis` |
| `src/components/schedule/*` (`CropDateInput`, `CropScheduleView`, `ModernScheduleCard`), `src/hooks/useSchedules.ts`, `src/services/schedulesApi.ts` | Schedule surface |
| `src/hooks/useLands.ts`, `src/services/landsApi.ts`, `src/pages/LandDetails.tsx`, `LandManagement.tsx`, `NDVIAnalysis.tsx` | Land stage fields |
| `src/decision-graph/{types,fact-extractor,audit-logger}.ts`, `src/types/decision-rules.types.ts` | Client mirror of graph types |
| `src/services/{localDB,offlineDataService,syncService}.ts` | Offline cache of stage fields |

---

## 4. Architecture map

```text
                 crop_stage_master / crop_stage_graph / crop_stage_knowledge
                 stage_transition_conditions | land_gdd_daily | crop_growth_analysis
                                     |
        resolve_crop_phenology(_for_land) <— cultivation_method, variety, GDD, DAS(fallback 0.5)
                                     |
   +-------------------------------- + --------------------------------+
   |                                                                   |
   v                                                                   v
EDGE: authoritative-state-loader.ts  ->  orchestrator.ts        CLIENT: useLandChatContext.ts
        (ASL: land/soil/ndvi/weather)      | enterCultivationLane()        (read-only display)
                                           | phenology-reconciler.ts
                                           | apply_stage_transitions()
                                           v
                     stage-knowledge-cache.ts  (AsyncLocalStorage lane, DB-only families)
                          |            |                |
              stage-normalizer   stage-family-shim   stage-symbol-resolver
                          |            |                |
        hypothesis-graph-evaluator / iom-gate / symbolic-reasoner / clarification-builder
                                           |
                                    decision output
```

## 5. Observations worth flagging (not yet fixed)

- `src/lib/cropStage.ts` derives a stage client-side from progress thresholds, contradicting the "DB is the only stage authority" rule in `useLandChatContext.ts`.
- `ai-smart-schedule` carries hardcoded per-crop DAS/stage split schedules in TS rather than reading `crop_stage_master`.
- `resolve_crop_stage_full` and the 9-arg `resolve_crop_phenology` overload have no code call sites — only `resolve_crop_phenology_for_land` is used.
