# Complete GraphTruth Migration

Scope spans ~15k LOC across orchestrator + canonical-state + ontology modules. Executing in one shot risks breaking the live edge function. Splitting into 6 verifiable phases, each independently deployable and traceable.

## Phase 1 — Immutability Enforcement (Task 1)

**Goal:** After `[GRAPH_TRUTH_BUILT]`, no code path may write `crop_code`, `stage`, `DAS`, or `observation_codes`.

- `runtime/graph-truth.ts`: add `validateGraphTruth(gt, callsite)` — recomputes hash from current fields, compares to `gt.hash`, throws on mismatch. Add `assertGraphTruthLocked(ctx, site)` helper.
- `agents/orchestrator.ts`: audit every mutation of `landContext.current_crop`, `landContext.growth_stage`, `landContext.days_since_sowing`, `allObservations`, `canonicalObservations` after the `TURN_EVIDENCE_LOCK`. Wrap with `blockStageWriteIfLocked`-style guards; emit `[GRAPH_MUTATION_BLOCKED]` and skip write.
- Insert `validateGraphTruth(graphTruth, '<site>')` calls immediately before:
  - hypothesis engine invocation
  - IOM gate
  - layered rule evaluator
  - deterministic/LLM response builder
- Emit `[GRAPH_VALIDATED] site=<x> hash_match=true` on success.

## Phase 2 — Single Stage Authority (Task 2)

**Goal:** `BiologicalState` (from `crop_stage_master` / `variety_phenology_profile` / `stage_transition_conditions`) is the only writer of `growth_stage`.

- `agents/canonical-state-builder.ts`: remove any assignment that overwrites `growth_stage` when `isBiologicalStateLocked(landContext)` is true. Downgrade to read.
- `decision/context-authority.ts`: `resolveFinalRenderContext` must not promote `landContext.growth_stage` above `BiologicalState`. If BS is locked, always use BS stage.
- `agents/gdd-phenology-engine.ts`: any `landContext.growth_stage = …` after BS lock → replace with `blockStageWriteIfLocked` + log `[GDD_STAGE_WRITE_BLOCKED]`. GDD may still write `gdd_accumulated` (evidence), never stage.
- Add `[BIO_STATE_LOCKED]` trace at lock; add `[STAGE_WRITE_BLOCKED site=…]` at every blocked site.

## Phase 3 — Hypothesis reads GraphTruth (Task 3)

- Change hypothesis engine entrypoint in orchestrator: pass `graphTruth.canonical_observations` (frozen array) instead of the mutable `canonicalObservations`/`allObservations` list.
- Delete symptom→observation conversion inside hypothesis path; conditions query already keys on `observation_code` in `hypothesis_conditions`.
- No changes to `hypothesis_conditions` schema or SQL. Only the caller wiring.

## Phase 4 — Remove TypeScript agriculture ontology (Task 4)

Move every hardcoded crop/stage/symptom/pest/disease/synonym constant to the DB loader path (already have `crop_synonyms`, `crop_stage_master`, `observation_master`, `observation_aliases`).

- `agents/symptom-enums.ts`: delete enum bodies; keep string-type aliases (`type CanonicalSymptomSymbol = string`) for TS shape only. All consumers already tolerate strings.
- `agents/language-induction-layer.ts`: remove `CROP_KEYWORDS`, `STAGE_SYNONYMS`, `STAGE_FAMILIES`, `CATEGORY_PATTERNS`, `PLANT_PART_PATTERNS`, symptom regex maps. Replace with lookups into an in-memory cache built from `crops`, `crop_synonyms`, `crop_stage_master`, `observation_aliases` at boot.
- `agents/entity-normalizer.ts`: remove pest/disease alias tables. Replace with `observation_aliases` lookup (`raw_token → observation_code`).
- `agents/cross-crop-symptom-mapper.ts`: delete cross-crop hardcoded symptom map; route through `observation_aliases` + `intent_observation_mapping`.
- If `agents/observation-ontology.ts` exists in imports, move to DB loader.
- Provide `agents/db-ontology-cache.ts` (new, ~120 lines) — request-scoped cache loaded lazily via existing `supabase` client. No agriculture values in code.

## Phase 5 — CanonicalState becomes view model (Task 5)

- `agents/canonical-state-builder.ts`: strip all inference. Inputs = `GraphTruth`. Output = flat, read-only projection for legacy consumers (`canonicalState.crop`, `.stage`, `.observations`) — sourced verbatim from `graphTruth`.
- Remove any calculation of crop/stage/symptom inside builder. Add JSDoc header: `VIEW MODEL ONLY — derives nothing`.

## Phase 6 — Regression harness (Task 6)

Add `supabase/functions/ai-agriculture-chat/scripts/graph-determinism.test.ts` (Deno test):

- Fixture: Rice land, DAS=26.
- Queries:
  1. `भात अजून उगवले नाही`
  2. `या शेतातील पिक अजून उगवले नाही`
  3. `खराब उगवण`
- Assert equal: `graphTruth.hash`, `crop_code`, `stage_uuid`, sorted `observation_codes`, winning `hypothesis_id`, rule execution path.
- Fail if any query yields UNKNOWN crop/stage, generic fallback, or a proactive rule for a diagnostic query.
- Use `supabase--test_edge_functions` to run after each phase.

## Deployment order

Phase 1 → deploy → verify `[GRAPH_VALIDATED]` in logs.
Phase 2 → deploy → verify `[BIO_STATE_LOCKED]` followed by zero `[STAGE_WRITE_BLOCKED]` in happy path (blocks appear only when legacy sites attempt writes).
Phase 3 → deploy → verify hypothesis winner unchanged for baseline query.
Phase 4 → deploy → verify DB ontology cache hits (`[ONTOLOGY_SOURCE=db]`).
Phase 5 → deploy → verify CanonicalState hash equals GraphTruth hash.
Phase 6 → run regression → three identical hashes.

## Non-goals / strict rules honored

- No hardcoded crop, stage, symptom, pest, disease, synonym additions.
- No `if crop === 'rice'` branches, no rice-only patches.
- No changes to `decision_rules`, `crop_stage_master`, `observation_master`, `hypothesis_conditions` schemas or rows.
- No new enums; existing enums downgraded to string-shape only.
- No schema migrations.

## Deliverables per phase

1. Files changed list
2. Authorities removed (line references)
3. Before/after `[GRAPH_NODE_TRACE]` snippet from live edge log
4. `[GRAPH_VALIDATED]` / `[STAGE_WRITE_BLOCKED]` counts
5. Phase 6: three regression traces with identical hashes

## Request

Approve the phased plan, or tell me to collapse phases (higher risk, single deploy) or reorder. On approval I start with Phase 1 immediately.
