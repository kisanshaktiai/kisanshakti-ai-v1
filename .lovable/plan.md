## Neuro-symbolic split-brain — surgical fix plan

### Diagnosis (confirmed from code + latest edge log)

Two hypothesis engines run per turn inside `agents/orchestrator.ts`:

1. **Engine A — `runGraphRuntime` → `evaluateCandidateHypotheses`** (line ~5380)
   - Produces `hypothesisResult.candidates` (e.g. `RICE_GERMINATION_FAILURE`) and downstream candidate rules (`RICE_SOIL_CRUST_BREAKING_001`, …).
   - Feeds only the diagnosis-first response builder.
   - Result is never projected onto `ConversationState.hypotheses` or `_graphHypothesisIds`.

2. **Engine B — `evaluateHypothesisGraph`** (line ~5188)
   - Applies stage/DAS penalties; on `transplanting` mismatch it currently returns `candidates=[]`.
   - Its (empty) `candidates` are the ONLY thing projected to `_graphHypothesisIds`, `_graphObsToHypEdges`, `_graphHypothesisRuleIds`, and `ConversationState.hypotheses`.

Because `emitBrainTrace` and downstream invariants read the Engine B projection, the final line shows `hyp=0 obs_to_hyp=0` even when Engine A + `HYP_TO_RULE` already succeeded. When the diagnosis-first branch short-circuits before Engine B runs, orchestrator additionally emits the illegal synthetic line:

```
[OBS_TO_HYP] synthesized=true reason=diagnosis_first_path sequence=2
```

That "synthesized" branch (orchestrator.ts:7302-7305) is the second graph authority the user is asking us to delete.

### Fix (surgical, no DB changes, no crop patches)

#### 1. Create a single `GraphRuntimeResult` per turn
File: `supabase/functions/ai-agriculture-chat/runtime/graph-runtime.ts`

- Extend `GraphRuntimeResult` (already exported) so callers can produce and consume one immutable snapshot:

  ```ts
  export interface GraphRuntimeSnapshot {
    trace_id: string;
    observations: readonly string[];           // canonical observation ids
    hypotheses: ReadonlyArray<{
      id: string;
      confidence: number;
      matched_conditions: readonly string[];
      candidate_rule_ids: readonly string[];
    }>;
    rules: readonly string[];                  // union of candidate_rule_ids
    graph_state: 'READY_FOR_DECISION' | 'NEED_MORE_EVIDENCE' | 'NO_HYPOTHESIS' | 'GRAPH_EXHAUSTED';
    source: 'REAL_GRAPH_PATH';
    reason?: string;                           // eg GRAPH_CONTEXT_EXHAUSTED
  }
  ```
- Add `buildGraphRuntimeSnapshot(engineA, engineB, ctx)` that:
  - Unions Engine A + Engine B canonical hypothesis ids (preferring canonical `hypothesis_id`, deduped).
  - Collects rule ids from `candidate_rule_ids` on either engine output.
  - Computes `graph_state`:
    - `hypotheses.length === 0` → `NO_HYPOTHESIS`
    - any `hypothesis.confidence < TAU_DECISION` (existing threshold) or missing required evidence → `NEED_MORE_EVIDENCE`
    - otherwise `READY_FOR_DECISION`
  - Returns a `Object.freeze()`d structure — no downstream code may mutate.

#### 2. Orchestrator becomes a graph-runtime consumer, not a scorekeeper
File: `agents/orchestrator.ts`

- Where Engine A finishes (~5399): call `buildGraphRuntimeSnapshot(engineA, /*engineB=*/undefined, ctx)` to produce an initial snapshot and stash it on `this._graphSnapshot`.
- Where Engine B finishes (~5196): rebuild the snapshot with both engines' outputs and overwrite `this._graphSnapshot`. Merge, never replace-with-empty.
- Replace ALL of these separate fields with reads from `this._graphSnapshot`:
  - `_graphHypothesisIds`
  - `_graphHypothesisRuleIds`
  - `_graphHypothesisEdgeMissing`
  - `_graphObsToHypEdges`
  - `_graphHypothesisResult`
  
  Keep the property names as thin getters (`get _graphHypothesisIds() { return this._graphSnapshot?.hypotheses.map(h => h.id) ?? []; }`) so no call-site refactor is needed elsewhere.
- Delete the synthesized branch at lines 7302-7305:

  ```ts
  console.log(`[OBS_TO_HYP] trace=${traceId} synthesized=true reason=diagnosis_first_path sequence=2`);
  ```
  Replace with:
  - if `_graphSnapshot` exists → advance `assertDecisionGraphOrder(this, traceId, 'OBS_TO_HYP')` and emit a real `[OBS_TO_HYP] source=REAL_GRAPH_PATH` line whose numbers come from the snapshot.
  - if not → let the existing `GRAPH_PIPELINE_BYPASSED` throw fire (already there at 5297).

#### 3. BRAIN_TRACE reads only from the snapshot
Files: `runtime/brain-trace.ts`, `agents/orchestrator.ts` (~7631)

- Change `emitBrainTrace(...)` call site to pass the snapshot values directly:

  ```ts
  emitBrainTrace(_cs, {
    ...,
    hypotheses_count: snap.hypotheses.length,
    obs_to_hyp_edges: snap.hypotheses.reduce((n,h) => n + h.matched_conditions.length, 0),
    hyp_to_rule_edges: snap.rules.length,
  });
  ```
- Add a corruption guard just before the emit:

  ```ts
  if (snap && snap.hypotheses.length > 0 && _hypIds.length === 0) {
    throw new Error(`GRAPH_STATE_CORRUPTION_ERROR: snapshot=${snap.hypotheses.length} projection=0 trace=${traceId}`);
  }
  ```
  This is the fail-loud rule the user asked for.

#### 4. Clarification decision comes from `graph_state`, not symptom count
File: `runtime/observation-selector-contract.ts` (and orchestrator sites that call it)

- Replace the current heuristic that skips clarification when symptom coverage is high with:

  ```ts
  if (snapshot.graph_state === 'NEED_MORE_EVIDENCE' || snapshot.graph_state === 'NO_HYPOTHESIS') {
    contract.observation_required = true;
  } else if (snapshot.graph_state === 'READY_FOR_DECISION') {
    contract.observation_required = false;
  }
  ```
- Options continue to be sourced from `hypothesis-clarification-builder.ts`; the trigger authority moves to the snapshot.

#### 5. Guardrail test
File: `supabase/functions/ai-agriculture-chat/tests/graph-integrity_test.ts`

Add contract test:
- Input: `crop=RICE`, `intent=EMERGENCE_FAILURE`, observations include `POOR_EMERGENCE`.
- Stub Engine A to return `{ hypothesis_id: 'RICE_GERMINATION_FAILURE', confidence: 0.7, candidate_rule_ids: ['RICE_SOIL_CRUST_BREAKING_001'] }`.
- Stub Engine B to return `{ candidates: [] }` (stage mismatch path).
- Assertions:
  - `buildGraphRuntimeSnapshot(...).hypotheses.length === 1`
  - projection into orchestrator yields `_graphHypothesisIds.length === 1`
  - `emitBrainTrace` receives `hypotheses_count = 1`
  - simulating projection loss throws `GRAPH_STATE_CORRUPTION_ERROR`
  - the synthesized `diagnosis_first_path` log line does not appear anywhere in captured stdout.

### Non-goals / boundaries

- No changes to `hypothesis_master`, `hypothesis_conditions`, `hypothesis_rule_mapping`, or `decision_rules` (schema or seed).
- No crop-specific branches; snapshot logic is generic across `RICE`, `SUGARCANE`, etc.
- LLM narration path untouched — it will still consume the deterministic decision object, only now the object is the immutable snapshot.
- Stage/DAS penalty logic in `hypothesis-graph-evaluator.ts` remains as-is; merging engines makes it non-fatal when Engine A already found a valid hypothesis.

### Expected new trace (validation target)

```
[GRAPH_RUNTIME] observations=13 hypotheses=1 winner=RICE_GERMINATION_FAILURE state=NEED_MORE_EVIDENCE
[OBS_TO_HYP]    source=REAL_GRAPH_PATH hyp=[RICE_GERMINATION_FAILURE] sequence=2
[HYP_TO_RULE]   rules=[RICE_SOIL_CRUST_BREAKING_001,RICE_SEED_ROT_REMEDIATION_001,RICE_GERMINATION_RESOW_DECISION_001] sequence=3
[BRAIN_TRACE]   hyp=1 obs_to_hyp=1 hyp_to_rule=3 observation_required=true observation_option_count>0
```
