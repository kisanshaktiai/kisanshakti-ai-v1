
## GraphRuntimeSnapshot Identity Correction — Surgical Plan (v2)

### Root Cause (verified against source)
`decision/hypothesis-evaluator.ts` (Engine A) emits candidates keyed by `rule_id` (rows of `decision_rules`). `runtime/graph-snapshot.ts` currently fuses identities:

```ts
const id = canonicalId(c.rule_id ?? c.hypothesis_id);   // ← ontology violation
```

Engine A rule_ids are stored as hypotheses; Engine B (which correctly emits `hypothesis_id`) never merges because keys don't intersect. Result: `_graphHypothesisIds` from Engine B is empty → `BRAIN_TRACE hyp=0` while `_graphHypothesisRuleIds` still holds rules → `rules>0 ∧ hyp=0` ontology break in the log.

### Scope (no DB changes, no crop logic, no LLM path)
1. `supabase/functions/ai-agriculture-chat/runtime/graph-snapshot.ts` — rewrite as pure builder with separated node types.
2. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` — supply `edges.ruleToHypothesis`, freeze `graphResult`, collapse legacy counters to read-only mirrors.
3. `supabase/functions/ai-agriculture-chat/tests/graph-snapshot_test.ts` — extend with four contract tests.

### 1. Separate node types (no fusion, ever)

```ts
interface HypothesisNode {
  hypothesis_id: string;                  // canonical from hypothesis_master
  confidence: number;
  matched_observations: readonly string[];
  sources: readonly ('ENGINE_A' | 'ENGINE_B')[];
}
interface RuleNode {
  rule_id: string;
  parent_hypothesis_id: string | null;    // null ⇒ orphan
}
interface GraphRuntimeSnapshot {
  trace_id: string;
  observations: readonly string[];
  hypotheses: readonly HypothesisNode[];  // Map<hypothesis_id, HypothesisNode>
  rules: readonly RuleNode[];
  orphan_rule_ids: readonly string[];
  graph_state: 'READY_FOR_DECISION' | 'NEED_MORE_EVIDENCE' | 'NO_HYPOTHESIS' | 'GRAPH_EXHAUSTED';
  source: 'REAL_GRAPH_PATH';
  reason?: string;
}
```

All layers `Object.freeze`d. Merge key is **strictly `hypothesis_id`**. `rule_id` is never a hypothesis key.

### 2. Pure builder (no I/O)

```ts
buildGraphRuntimeSnapshot({
  trace_id,
  observations,
  engineA,                     // candidates keyed by rule_id
  engineB,                     // candidates keyed by hypothesis_id
  edges: { ruleToHypothesis }, // Map<rule_id, hypothesis_id>
}): GraphRuntimeSnapshot
```

No async, no supabase, no fetch. Orchestrator is responsible for supplying `edges.ruleToHypothesis` — see §5.

### 3. Engine A adapter
For each Engine A candidate `{rule_id, confidence, matched_conditions}`:

- `hid = edges.ruleToHypothesis.get(rule_id)`
- If `hid` present AND `matched_conditions.length > 0`:
  - Upsert `HypothesisNode(hid)` — max-confidence merge, union matched observations, add `'ENGINE_A'` to `sources`.
  - Append `RuleNode(rule_id, parent_hypothesis_id: hid)`.
- Else:
  - Push `rule_id` to `orphan_rule_ids`, append `RuleNode(rule_id, parent_hypothesis_id: null)`.
  - Log once per rule: `[GRAPH_ONTOLOGY] RULE_WITHOUT_HYPOTHESIS_EDGE rule_id=<x> trace=<t>`.
  - Never synthesize a hypothesis from a rule_id.

### 4. Engine B adapter
Engine B already owns `hypothesis_id`. For each candidate:
- Upsert `HypothesisNode(hypothesis_id)` (max-confidence merge, add `'ENGINE_B'` to `sources`).
- For each `candidate_rule_ids[i]` → append `RuleNode(rule_id, parent_hypothesis_id: hypothesis_id)`.

Deduplicate `RuleNode` by `rule_id`; if the same rule_id appears with different parents, prefer the Engine B parent (it owns the edge authoritatively) and log `[GRAPH_ONTOLOGY] RULE_PARENT_CONFLICT`.

Hypothesis `sources` becomes `['ENGINE_A','ENGINE_B']` when both contribute (Test 3 = `BOTH` semantics via array membership; a `source` getter returns `'BOTH' | 'ENGINE_A' | 'ENGINE_B'` for logs).

### 5. Orchestrator wiring
- Invert Engine B's existing `queryRuleMapping` output (already fetched in `hypothesis-graph-evaluator.ts`) into a `Map<rule_id, hypothesis_id>` and stash it on the ConversationState as `_ruleToHypothesis` when Engine B runs (~line 5188 region).
- If Engine A completes before Engine B populated the inversion (rare path), call `queryRuleMapping(supabase, engineA.rule_ids)` on demand and invert. This is the ONLY I/O; it happens in the orchestrator, NOT in the builder.
- Both snapshot build sites (Engine A ~5446–5462, Engine B ~5217–5232) call the pure `buildGraphRuntimeSnapshot({..., edges:{ ruleToHypothesis }})`.
- After `POST_EVIDENCE_FREEZE`: set `const graphResult = Object.freeze(this._graphSnapshot!)`. This is the only authority for BrainTrace, DecisionRenderer, and ClarificationEngine.
- Delete direct writes at 5203, 5256–5257, 5316–5317. Convert `_graphHypothesisIds`, `_graphHypothesisRuleIds`, `_graphObsToHypEdges` into read-only getters that project from `_graphSnapshot` (temporary mirrors so downstream code keeps compiling).
- BRAIN_TRACE emit site (~7658–7672): counts come only from `_graphSnapshot`; drop `_legacyHypIds` fallback; call `assertSnapshotNotCorrupt(snap, snap.hypotheses.length, traceId)` immediately before `emitBrainTrace`.

### 6. Contract guards (in builder)
Computed after adapters run, before freeze:

- **G1 — orphan-only rules with real hypotheses absent:**
  If `hypotheses.length === 0 && rules.some(r => r.parent_hypothesis_id !== null)` → throw `BROKEN_HYP_RULE_EDGE`. (Impossible by construction, but asserts invariant.)
- **G2 — ontology violation:**
  If `rules.some(r => r.parent_hypothesis_id !== null) && hypotheses.length === 0`:
  - `Deno.env.get('GRAPH_STRICT') === '1'` (dev/test) → throw `GRAPH_ONTOLOGY_ERROR`.
  - Production → set `graph_state = 'GRAPH_EXHAUSTED'`, `reason = 'GRAPH_ONTOLOGY_VIOLATION'`, emit `[GRAPH_ONTOLOGY] downgraded_to_exhausted`, return snapshot. No decision will be generated because DecisionRenderer requires `READY_FOR_DECISION`.
- **G3 — post-emit projection guard** (orchestrator side, kept from prior work):
  `assertSnapshotNotCorrupt` throws `GRAPH_STATE_CORRUPTION_ERROR` if `snapshot.hypotheses.length > 0` and projection reads 0.

`graph_state` derivation (unchanged intent, tightened):
- `hypotheses.length === 0` → `NO_HYPOTHESIS` (or `GRAPH_EXHAUSTED` when downgraded by G2 or when `reason` supplied).
- Top hypothesis `confidence >= TAU_DECISION` AND has at least one child rule → `READY_FOR_DECISION`.
- Otherwise → `NEED_MORE_EVIDENCE`.

### 7. Tests (`tests/graph-snapshot_test.ts`)
1. **Rule → hypothesis promotion:** Engine A `RICE_SOIL_CRUST_BREAKING_001` with mapping `→ RICE_GERMINATION_FAILURE` and matched observation → snapshot has 1 hypothesis `RICE_GERMINATION_FAILURE`, 1 rule with `parent_hypothesis_id === 'RICE_GERMINATION_FAILURE'`, `orphan_rule_ids` empty.
2. **Missing mapping → orphan:** Engine A rule with empty `ruleToHypothesis` → `hypotheses.length === 0`, `orphan_rule_ids === [rule_id]`, `RuleNode.parent_hypothesis_id === null`, log line captured. No synthesized hypothesis.
3. **Both engines same hypothesis:** Engine A rule maps to `H1` + Engine B emits `H1` → 1 hypothesis, `sources` contains both, exposed `source` = `'BOTH'`, confidence = max.
4. **BRAIN_TRACE parity:** snapshot with `hypotheses.length === 1` fed to `emitBrainTrace` (via `hypotheses_count`) produces `hyp=1`; simulating projection = 0 makes `assertSnapshotNotCorrupt` throw `GRAPH_STATE_CORRUPTION_ERROR`.
5. **Ontology guard:** rules with non-null parent but zero hypotheses (constructed by stubbing an empty Engine B and Engine A whose promotion is suppressed) with `GRAPH_STRICT=1` throws `GRAPH_ONTOLOGY_ERROR`; unset → `graph_state === 'GRAPH_EXHAUSTED'`.

### Expected trace after fix
```
[GRAPH_RUNTIME] snapshot observations=13 hypotheses=1 winner=RICE_GERMINATION_FAILURE rules=3 orphans=0 state=NEED_MORE_EVIDENCE
[BRAIN_TRACE] hyp=1 obs_to_hyp=1 hyp_to_rule=3 observation_required=true observation_option_count>0
```

### Non-goals
- No edits to `hypothesis-evaluator.ts`, `hypothesis-graph-evaluator.ts`, DB schema, or LLM narration.
- No crop-specific branches; identity model is symbol-agnostic across all crops.
- `_graphHypothesisIds` etc. remain temporarily as read-only getters — a later cleanup PR removes them entirely once no call site references them.
