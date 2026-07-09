## Surgical fix plan

### Confirmed audit findings
- `runtime/observation-selector-contract.ts` currently hydrates clarification options from `intent_observation_mapping` via `loadIOMAllowed()` and stamps `observation_source = INTENT_OBSERVATION_MAPPING_SSOT`.
- `runtime/clarification-contract.ts` explicitly declares `intent_observation_mapping` as the clarification authority and builds farmer UI options from IOM + `observation_master` + translations.
- `agents/orchestrator.ts` also replaces diagnosis-first options with `loadClarificationCandidates()` from IOM.
- Uploaded edge log confirms the failure: pending options like `POOR_GERMINATION`, `UNEVEN_EMERGENCE`, `SEEDLING_DIED` are generated, then `confirmed_observations > 0` but `candidate_hypotheses = 0` / `matched_rules = 0`.
- Option persistence keeps label/value/observation_key, but does not persist hypothesis edge identity (`hypothesis_id`, `hypothesis_condition_id`, source graph metadata).
- The OPTION_SELECTED path has direct layered rule evaluation before a mandatory graph-owned Observation → Hypothesis → Rule decision, so it can bypass the intended graph contract.

### What I will change

#### 1. Add `decision/symbol-resolver.ts`
Create a DB-backed symbol identity resolver:
- Resolve input symbols through `observation_aliases` first, then `observation_master` identity.
- Expose `resolveObservationSymbol()`, `resolveObservationSymbols()`, and `sameNode()`.
- No string guessing, no crop-specific mappings, no manual prefix stripping.
- Use DB identity only; if DB has no relationship, the resolver returns an unresolved symbol with a traceable reason.

#### 2. Add `decision/observation-hypothesis-resolver.ts`
Create the mandatory Observation → Hypothesis graph edge resolver:
- Input: confirmed observations + crop/stage/DAS context.
- Resolve observation nodes through `symbol-resolver.ts`.
- Query `hypothesis_conditions` where `condition_type = OBSERVATION` and match by canonical DB node identity.
- Join `hypothesis_master` for active crop-applicable hypotheses.
- Apply existing DB-authored required `STAGE` and `DAS_RANGE` gates.
- Join `hypothesis_rule_mapping` for candidate rule edges.
- Return matched hypotheses with `matched_conditions`, `missing_conditions`, `confidence_score`, and candidate rule IDs.
- If confirmed observations exist but no hypotheses resolve, emit `GRAPH_CONTRACT_ERROR` with confirmed nodes and attempted edge evidence; do not silently continue.

#### 3. Add/repair `decision/hypothesis-clarification-builder.ts`
Make the hypothesis graph own farmer clarification options:
- Input: `{ intent_code, crop_code, crop_stage, DAS, land_context, confirmed_observations }`.
- Use IOM only as a discovery seed for possible observation nodes, never as UI output.
- Expand from seed observations into candidate hypotheses through `hypothesis_conditions` + `hypothesis_master`.
- Filter candidate hypotheses by crop applicability, active status, required stage, and required DAS.
- Traverse candidate hypotheses back to farmer-observable `hypothesis_conditions`.
- Gate every option through `observation_master.is_active`, `is_farmer_observable`, and `can_generate_question` where available.
- Load labels from `observation_translations`.
- Return options with graph identity:

```ts
{
  observation_id,
  observation_code,
  observation_key,
  hypothesis_id,
  hypothesis_condition_id,
  display_text,
  label,
  value,
  confidence_weight,
  source: 'hypothesis_graph'
}
```

If no graph-valid observations exist for the locked crop/stage/DAS, return an explicit graph knowledge/stage-context gap instead of falling back to generic IOM options.

#### 4. Replace IOM-based clarification emitters
Update these live paths to call the new hypothesis clarification builder:
- `runtime/observation-selector-contract.ts`
  - Replace `loadObservationSelectorOptions()` IOM hydration with `buildHypothesisClarificationOptions()`.
  - Stamp `metadata.observation_source = 'hypothesis_graph'`.
  - Set question source to `hypothesis_graph`.
- `runtime/clarification-contract.ts`
  - Keep translation/build helpers if useful, but stop using `loadClarificationCandidates()` as a direct IOM UI source.
  - Update comments/contracts so IOM is discovery seed only.
- `agents/orchestrator.ts`
  - Replace the diagnosis-first `loadClarificationCandidates()` replacement block with graph-derived clarification options.
  - Ensure any graph-exhaustion clarification asks only graph-derived farmer-observable conditions.

#### 5. Make graph runtime mandatory after farmer selection
Update the OPTION_SELECTED path in `agents/orchestrator.ts`:
- After the selected observation is confirmed, run the Observation → Hypothesis resolver / graph runtime before layered rule evaluation.
- If hypotheses resolve: scope rule evaluation to graph-derived hypothesis rule IDs.
- If zero hypotheses resolve: return `CLARIFICATION_QUESTION` or `GRAPH_KNOWLEDGE_GAP` from the hypothesis graph builder.
- Never continue into direct diagnosis, proactive rules, or LLM agronomic output when `confirmed_observations > 0 && candidate_hypotheses == 0`.

#### 6. Preserve graph identity in session state
Extend the existing structured pending option record persisted in `index.ts`:
- Add `observation_id`, `observation_code`, `hypothesis_id`, `hypothesis_condition_id`, `graph_version`, and `source`.
- On next-turn option selection, resolve from the structured record first.
- Stop relying on label reconstruction except as a logged legacy fallback.
- Keep backward compatibility for current frontend shape (`label`, `value`, `observation_key`) so no UI rewrite is required.

#### 7. Regression tests
Add Deno regression tests under the existing edge function test suite:
- Rice transplanting query path: clarification options must have `source = hypothesis_graph`, not raw IOM.
- Farmer selects `UNEVEN_EMERGENCE`: confirmed observations must not proceed with zero candidate hypotheses silently; resolver must return hypotheses or a graph contract error/clarification gap.
- Symbol identity: `UNEVEN_EMERGENCE`, `uneven_emergence`, and a DB alias resolve through `symbol-resolver.ts` to the same node when the DB relationship exists.
- Multi-crop protection: `EMERGENCE_FAILURE` for rice/cotton/sugarcane must derive options from graph + crop/stage/DAS context, not a shared intent-only list.
- Structural guard: no live clarification path may stamp `INTENT_OBSERVATION_MAPPING_SSOT` as farmer UI authority.

### Files expected to change
- `supabase/functions/ai-agriculture-chat/decision/symbol-resolver.ts` (new)
- `supabase/functions/ai-agriculture-chat/decision/observation-hypothesis-resolver.ts` (new)
- `supabase/functions/ai-agriculture-chat/decision/hypothesis-clarification-builder.ts` (new/repair)
- `supabase/functions/ai-agriculture-chat/runtime/observation-selector-contract.ts`
- `supabase/functions/ai-agriculture-chat/runtime/clarification-contract.ts`
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
- `supabase/functions/ai-agriculture-chat/index.ts`
- `supabase/functions/ai-agriculture-chat/tests/graph-integrity_test.ts`

### Boundaries
- No database schema changes.
- No seed-data edits.
- No crop-specific TypeScript logic.
- No hardcoded pest/disease/nutrient rules.
- No LLM diagnosis fallback.
- IOM remains valid as a discovery/ontology seed, but farmer UI options come from the hypothesis graph.