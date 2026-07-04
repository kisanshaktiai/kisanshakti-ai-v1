## Objective

Make the neuro-symbolic brain **deterministic**: same agricultural meaning ⇒ same graph, regardless of wording. Achieved by installing a single immutable **GraphTruth** node, reordering execution so **land context precedes text**, and removing every code-side agronomy authority. All agronomy stays in the DB.

Scope covers audit findings §1–§9 in `SYMBOLIC_DATA_FLOW_AUDIT.md`, but this plan does NOT touch schema, `decision_rules`, `crop_stage_master`, `variety_phenology_profile`, or ontology tables.

---

## Deliverables

1. `SYMBOLIC_DATA_FLOW_AUDIT.md` — appended with a new "Refactor Plan Execution" section (before/after graph trace).
2. New runtime module: `supabase/functions/ai-agriculture-chat/runtime/graph-truth.ts` (immutable node + builder + validator + hash).
3. Surgical edits to the ten primary files listed by the user (no new agronomy files).
4. Two regression tests wired into the existing `scripts/regression-diagnostic-options.test.ts`.
5. Deploy `ai-agriculture-chat` edge function.

---

## Task-by-task plan

### T1 · Immutable `GraphTruth`

Create `runtime/graph-truth.ts`:

```text
GraphTruth {
  readonly land_id, crop_code, variety_id
  readonly biological_stage, stage_uuid, DAS, GDD
  readonly canonical_observations: readonly string[]
  readonly hypothesis_candidates:  readonly string[]
  readonly evidence_sources:       readonly {code, authority, source}[]
  readonly locked_at, hash
}
```

- `buildGraphTruth(input)` runs ONCE per turn, then `Object.freeze()` (deep freeze of arrays).
- Authority sources are asserted at build time — no field may be provided by any other source:
  - crop / variety ⇐ landContext (fetchComprehensiveLandContext)
  - stage / DAS / GDD ⇐ BiologicalState (`resolve_crop_phenology`)
  - observations ⇐ observation_master via `bridgeCodesDb` + `resolveCropCanonicalObservations`
  - hypotheses ⇐ hypothesis engine output only
- Canonical hash: SHA-256 of `{crop_code, stage_uuid, DAS, sorted(canonical_observations)}`.

### T2 · Fix execution order in `orchestrator.ts`

Replace current `Text → Intent → Observation → Hypothesis` sequence with:

```text
Land Context ─► BiologicalState ─► Farmer Text ─► Observation Resolver
              └────────────────────────────────┴─► GraphTruth LOCK
                                                     │
                                              Hypothesis Engine
                                                     │
                                              Decision Rules
                                                     │
                                                 Response
```

Concretely:

1. Move `fetchComprehensiveLandContext` + `resolve_crop_phenology` block to the top of `runTurn` (already largely there — enforce ordering guard).
2. Only AFTER `BiologicalState` is locked do we call `extractSemanticMeaning` / `classifyFarmerIntent`.
3. Observation extraction → `bridgeCodesDb` → `resolveCropCanonicalObservations` → `buildGraphTruth()` → freeze.
4. All later stages receive `graphTruth` by reference; they read, never write.

### T3 · Strip intent as agronomic authority

In `orchestrator.ts`:

- Delete hardcoded `intentToSymptom` map (~lines 4055-4072).
- Delete hardcoded `advisoryIntents` / `symptomBasedIntents` arrays used to synthesize evidence.
- Delete `causeToIntent` synthesis (if present) that back-fills observations.
- Replace with DB call:
  ```ts
  intent_observation_mapping.rows
    where intent_code = <intent>
      and crop_code in (<landContext.current_crop>, 'universal')
      and assertion_strength = 'LITERAL'
      and is_active
  ```
  → returned `observation_code`s go through the same bridge pipeline and enter `GraphTruth.canonical_observations` with `authority = INFERRED, source = IOM_INTENT_TO_OBSERVATION`.
- Intent's remaining roles (kept):
  - clarification style selection (`clarification-generator.ts`)
  - response formatting hint (narration only)
  - question classification (`question-classifier.ts`)

### T4 · Land-specific chat contract

- In `orchestrator.ts` (right after landContext fetch) install `enforceCropIdentityFromLand()`:
  - `graphTruth.crop_code := landContext.current_crop` (or crop_schedule crop). No text-derived override.
  - `induceCanonicalSymbols` crop output is **discarded** for authority; used only for contradiction detection.
  - If extracted crop differs AND has high confidence AND is in `crop_synonyms` → raise `CROP_MISMATCH_CLARIFICATION` intent (existing clarifier), NEVER overwrite.
- In `language-induction-layer.ts`: neither add to nor remove entries from `CROP_MAP`; instead export `induceCanonicalSymbols(text)` unchanged, but downstream ignores its crop field when `landContext.current_crop` exists.

### T5 · Single stage authority

- Confirm `biological-state.ts` `blockStageWriteIfLocked()` is called at every writer site. Per audit, six writers exist; three unguarded.
- Add explicit calls in:
  - `canonical-state-builder.ts` (stage write path)
  - `context-authority.ts` (stage override path)
  - `orchestrator.ts` GDD/session fallback branches
- After `BIO_STATE_LOCKED` any competing write logs `[GRAPH_MUTATION_BLOCKED]` and returns without mutating.
- `crop_stage_master` + `variety_phenology_profile` remain the sole DB truth (no schema change).

### T6 · Remove TypeScript agronomy ontology (deprecation, not deletion)

Per audit: `STAGE_SYNONYMS`, `STAGE_FAMILIES`, `CROP_KEYWORDS`, `CATEGORY_PATTERNS`, `PLANT_PART_PATTERNS`, 1000+ lines of pest/disease aliases in `entity-normalizer.ts`, and hardcoded enums in `symptom-enums.ts`.

Approach (surgical, no big-bang delete):

- Mark all agronomy constants `@deprecated - moved to DB` and route their readers through DB loaders that already exist:
  - stage synonyms → `crop_stage_aliases`
  - crop keywords → `crop_synonyms`
  - observation vocabulary → `observation_aliases` / `observation_master`
- Keep enums as **type-only** shapes (no value list drives reasoning). Consumers that switch on enum values must be refactored to read the code from GraphTruth / DB row.
- Files touched: `symptom-enums.ts`, `entity-normalizer.ts`, `cross-crop-symptom-mapper.ts`, `iom-gate.ts`, `navigator-adapter.ts`, `contradiction-engine.ts`, `language-induction-layer.ts`.
- Every removed reading site logs `[ONTOLOGY_SOURCE] table=<x>` so we can prove code isn't the source of truth anymore.

### T7 · Correct observation graph pipeline

Guarantee the pipeline is exactly:

```text
Raw farmer text
 → observation-extractor
 → observation_aliases (bridgeCodesDb)
 → intent_observation_mapping LITERAL peers (resolveCropCanonicalObservations)
 → hypothesis_conditions
```

- Forbid any code that rewrites one observation to another (e.g. `POOR_GERMINATION → STUNTED_GROWTH`). Audit removes any such swaps in `cross-crop-symptom-mapper.ts` / `entity-normalizer.ts`.
- Observations are first-class nodes in `GraphTruth.canonical_observations`.

### T8 · Graph contract validator

Add `validateGraphTruth(before, after, callsite)` invoked before:

- hypothesis engine (`hypothesis-evaluator.ts`, `causal-hypothesis-engine.ts`)
- rule engine (`layered-rule-evaluator.ts`)
- response builder (`deterministic-response-builder.ts`)

If any authoritative field changed:

```text
[GRAPH_CONTRACT_VIOLATION] field=<> before=<> after=<> file=<> function=<>
```

Throw in dev, warn+halt-mutation in prod (never silent-repair).

### T9 · Canonical-state hash regression test

Extend `scripts/regression-diagnostic-options.test.ts` with three cases against a Rice land, DAS=26:

- T-A: `"भात अजून उगवले नाही"`
- T-B: `"या शेतातील पिक अजून उगवले नाही"`
- T-C: `"खराब उगवण"`

Assert:
- identical `graphTruth.hash`
- identical `canonical_observations` set (contains `obs_rice_no_emergence`)
- identical `hypothesis_candidates` set
- identical top rule id

---

## Files changed (exhaustive)

Primary edits:
- `runtime/graph-truth.ts` **(new)**
- `agents/orchestrator.ts` — new pipeline order, remove `intentToSymptom` + `advisoryIntents`, wire GraphTruth, validators, hash trace
- `agents/canonical-state-builder.ts` — stage-write guard
- `agents/context-authority.ts` — stage-write guard
- `llm-understanding-layer.ts` — LLM stays translate + intent-only; add crop-binding block from landContext
- `agents/intent-classifier.ts` — prompt hardening: bind generic subjects to `landContext.current_crop`; do not emit crop as authority
- `agents/language-induction-layer.ts` — downgrade `CROP_MAP` output from authority to contradiction-check hint
- `decision/concept-bridge.ts` — no change (already DB-wired); consumer moves to GraphTruth builder
- `agents/hypothesis-evaluator.ts` + `agents/causal-hypothesis-engine.ts` — read from GraphTruth; call `validateGraphTruth`
- `agents/layered-rule-evaluator.ts` — read from GraphTruth; call `validateGraphTruth`

Secondary (deprecation shims + DB routing):
- `agents/symptom-enums.ts`, `agents/entity-normalizer.ts`, `agents/cross-crop-symptom-mapper.ts`
- `runtime/iom-gate.ts` (or `agents/` equivalent), `agents/navigator-adapter.ts`, `agents/contradiction-engine.ts`

Docs/tests:
- `SYMBOLIC_DATA_FLOW_AUDIT.md` — appended "Refactor Plan Execution" with before/after graph trace
- `scripts/regression-diagnostic-options.test.ts` — three new cases + hash assertions

---

## Traces added (for explainability)

```text
[GRAPH_TRUTH_BUILT]        crop=<> stage=<> DAS=<> obs=[..] hash=<>
[GRAPH_TRUTH_LOCKED]       at=<phase> callsite=<>
[GRAPH_CONTRACT_VIOLATION] field=<> before=<> after=<> file=<> function=<>
[GRAPH_MUTATION_BLOCKED]   site=<> attempted=<>
[ONTOLOGY_SOURCE]          table=<> reader=<>
[INTENT_ROLE]              intent=<> role=<clarification|narration> agronomy_authority=false
```

---

## Verification

1. Typecheck (`tsgo` — auto).
2. `supabase--test_edge_functions` on `ai-agriculture-chat` with the new regression file.
3. Live curl to the deployed function for T-A and T-B; grep logs for identical `[GRAPH_TRUTH_BUILT]` hashes.
4. Confirm zero `[GRAPH_CONTRACT_VIOLATION]` and zero `[GRAPH_MUTATION_BLOCKED]` in the happy-path traces.

---

## Strict rules honoured

- No hardcoded crops/stages/symptoms/diseases/pests introduced.
- No schema migrations, no changes to `decision_rules` / ontology tables.
- No rice-only patches — all fixes are crop-agnostic and DB-driven.
- No silent repair — violations throw or halt mutation with an explicit trace.
- Intent is retained only for UX (clarification style, formatting); it is stripped of agronomic authority.

Approving this plan will move me into build mode; I will then execute T1→T9 in order, deploy the edge function, and post the before/after graph trace back into `SYMBOLIC_DATA_FLOW_AUDIT.md`.
