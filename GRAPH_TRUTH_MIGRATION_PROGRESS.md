# GraphTruth Migration — Progress Report

## Delivered (Phases 1 & 2 — Immutability + Stage Authority)

### Files changed
- `supabase/functions/ai-agriculture-chat/runtime/graph-truth.ts`
  - Added `assertGraphTruthIntegrity(gt, callsite)` — recomputes FNV-1a hash from current fields and compares to stored `gt.hash`.
  - Emits `[GRAPH_VALIDATED] site=<x> hash_match=true` on success; `[GRAPH_CONTRACT_VIOLATION]` on drift.
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
  - Import `assertGraphTruthIntegrity` from `runtime/graph-truth.ts` (line 199).
  - Validation call inserted before each downstream stage:
    - `PRE_HYPOTHESIS_ENGINE` (before `evaluateCandidateHypotheses`, ~line 4779)
    - `PRE_IOM_GATE` (before `loadIOMAllowed`, ~line 4812)
    - `PRE_LAYERED_RULE_EVALUATOR` (before `evaluateRulesLayered`, ~line 6583)
    - `PRE_RESPONSE_BUILDER` (before `generateLLMResponse`, ~line 5919)
  - Post-lock stage guard added at the crop-context fallback authority (~line 6231): now routed through `blockStageWriteIfLocked`, matching the pattern already in place at GDD (5493), context-validation reconciler (6355).

### Removed / neutralized authorities
- Fallback `canonicalState.growth_stage = cropContextAuthority.growth_stage` now aborted when `BiologicalState` is locked.
- Existing guards at GDD engine and context-validation reconciler retained; both now uniformly gate on `blockStageWriteIfLocked`.

### DB tables used (unchanged, no schema mutations)
- `crop_stage_master`, `variety_phenology_profile`, `stage_transition_conditions` — sole stage authority through `BiologicalState`.
- `observation_master`, `observation_aliases`, `intent_observation_mapping`, `hypothesis_conditions`, `decision_rules` — unchanged.

### Expected traces (live edge log)
```
[GRAPH_TRUTH_BUILT] hash=<h> crop=rice stage=SEEDLING das=26 obs=[POOR_GERMINATION]
[GRAPH_VALIDATED]   site=PRE_HYPOTHESIS_ENGINE      hash_match=true hash=<h> ...
[GRAPH_VALIDATED]   site=PRE_IOM_GATE               hash_match=true hash=<h> ...
[GRAPH_VALIDATED]   site=PRE_LAYERED_RULE_EVALUATOR hash_match=true hash=<h> ...
[GRAPH_VALIDATED]   site=PRE_RESPONSE_BUILDER       hash_match=true hash=<h> ...
```
Any post-lock mutation attempt now surfaces as `[BIO_STATE_WRITE_BLOCKED]` (existing) or `[GRAPH_CONTRACT_VIOLATION]` (new).

### Deployment
- `ai-agriculture-chat` edge function deployed.

---

## Deferred (Phases 3 – 6, non-trivial — proposal below)

Phases 3-5 span ~15k LOC and require deep re-architecture. Executing them in a single turn risks silently breaking the live edge function. Each is scoped and ready to execute on your go-ahead:

- **Phase 3 — Hypothesis reads GraphTruth directly**
  Rewire `evaluateCandidateHypotheses` caller to pass `graphTruth.canonical_observations` instead of the mutable `currentObservations`. Removes the last silent divergence path between wording variants.

- **Phase 4 — Delete TypeScript agriculture ontology**
  Strip hardcoded crop/stage/symptom/pest/disease maps from `symptom-enums.ts`, `language-induction-layer.ts`, `entity-normalizer.ts`, `cross-crop-symptom-mapper.ts`. Replace with request-scoped DB cache built from `crops` / `crop_synonyms` / `crop_stage_master` / `observation_aliases`. High blast radius — needs full regression pass.

- **Phase 5 — CanonicalState → view model**
  Convert `canonical-state-builder.ts` (1338 lines) into a pure projection of GraphTruth. Removes all in-builder inference.

- **Phase 6 — Determinism regression harness**
  Deno test hitting `ai-agriculture-chat` with three Marathi/Hindi variants of the same agronomic meaning on a Rice/DAS=26 fixture. Asserts identical `graphTruth.hash`, `crop_code`, `stage_uuid`, sorted `observation_codes`, winning `hypothesis_id`, and rule path. FAILs on UNKNOWN crop/stage, hash drift, generic fallback, or proactive-rule win on diagnostic query.

## Verification path for Phases 1-2
Run the same farmer query against a Rice/DAS=26 land and confirm four `[GRAPH_VALIDATED]` lines with `hash_match=true` and identical `hash` in the edge log. If any `[GRAPH_CONTRACT_VIOLATION]` appears, the callsite string identifies the exact upstream mutator to fix in Phase 3.
