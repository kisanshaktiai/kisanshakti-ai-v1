
# Surgical Fix: Neuro-Symbolic Graph Handoff & Response Honesty

The graph runtime already works end-to-end (obs→hyp→rule). The failure is **downstream state drift** and **fabricated fallbacks**. This plan fixes handoff, contracts, and honesty — no crop code, no DB changes, no LLM diagnosis fallback.

## Root cause (verified against edge log)

- `GraphRuntimeSnapshot` reports `hypotheses=1 rules=4`.
- `EVIDENCE_COUNT_TRACE` and `ORCHESTRATOR_EXIT` read `candidate_hypotheses=0`.
- With `hyp=0`, downstream picks `MONITOR_ONLY` → response mode defaults to `INFORMATION`.

Cause: canonical state fields (`candidate_hypothesis_count`, `matched_rules_count`, `hypothesis_ids`) are never written from the frozen snapshot. Multiple writers race; snapshot is not the single authority. Rule condition matcher compares raw strings instead of alias-resolved canonical keys.

## Files touched (surgical, no rewrites)

- `agents/canonical-state-builder.ts` — write graph counts from snapshot exactly once.
- `agents/orchestrator.ts` — call the sync after `POST_EVIDENCE_FREEZE`; add `[STATE_SYNC]` / `[GRAPH_HANDOFF_CHECK]` traces; freeze snapshot as sole authority; mark legacy fields as derived getters.
- `agents/layered-rule-evaluator.ts` + `bundled-rules/loader.ts` — resolve every condition key and observation through `observation_aliases` before comparison; emit `[RULE_COND_CANON]` + `[RULE_CONDITION_LEDGER]`.
- `decision/causal-hypothesis-engine.ts` — declare `pipeline_role=CAUSAL_ARBITRATION`; consume graph hypotheses instead of producing new ones.
- `agents/decision-representation.ts` / response builder — replace fabricated `MONITOR_ONLY` with `INSUFFICIENT_KNOWLEDGE` + `gap_reason`.
- Response mode resolver — replace default `INFORMATION` with `COVERAGE_GAP_DISCLOSURE`.
- `agents/biological-state.ts` / orchestrator — surface `stage_context_conflict` object, do not silently penalize confidence.
- `tests/graph-handoff_test.ts` (new) — seven regression tests.

Every touched file gets its `CHANGE LOG` header updated per project rule.

## The seven fixes

### 1. Canonical state synchronization (single write from snapshot)

After the graph pipeline resolves and `POST_EVIDENCE_FREEZE` fires, the orchestrator invokes one new helper:

```text
syncCanonicalStateFromSnapshot(state, snapshot):
  state.candidate_hypothesis_count = snapshot.hypotheses.length
  state.matched_rules_count        = snapshot.rules.length
  state.hypothesis_ids             = snapshot.hypotheses.map(h => h.hypothesis_id)
  state.rule_ids                   = snapshot.rules.map(r => r.rule_id) // non-orphan
  state.orphan_rule_ids            = [...snapshot.orphan_rule_ids]
  log("[STATE_SYNC]", { hypotheses, rules, source: "GRAPH_RUNTIME" })
```

Called exactly once. Any later mutation of these fields is a `GRAPH_CONTRACT_VIOLATION`.

### 2. Single snapshot authority + handoff guard

- `graphResult` / `_graphSnapshot` is `Object.freeze`d and stored on `state.__graph_snapshot__`.
- `_graphHypothesisIds`, `_graphHypothesisRuleIds`, `_graphObsToHypEdges` become **read-only getters** derived from the snapshot. No independent writes.
- Allowed readers: `BrainTrace`, `DecisionRenderer`, `ClarificationEngine`, `RuleExecutor`.
- New guard right before orchestrator exit:

```text
[GRAPH_HANDOFF_CHECK]
  snapshot.hyp === state.candidate_hypothesis_count === exit.hypotheses
  snapshot.rules === state.matched_rules_count === exit.rules
  mismatch => throw GRAPH_CONTRACT_VIOLATION (do NOT silently repair)
```

### 3. Engine pipeline ownership (no dual authorship)

Neither engine is deleted. Explicit roles logged on every candidate:

- `pipeline_role=GRAPH_STEP_8` — owns candidate hypotheses (Engine B / graph evaluator).
- `pipeline_role=CAUSAL_ARBITRATION` — only ranks/arbitrates the graph-owned set; must not add hypotheses.

Causal engine now receives `snapshot.hypotheses` as input and returns a reordered subset — never a superset.

### 4. Canonical rule condition matching

All condition→observation comparisons route through the symbol resolver:

```text
raw condition key ──► symbol_resolver ──► observation_aliases ──► canonical_id
raw observation   ──► symbol_resolver ──► observation_aliases ──► canonical_id
compare canonical_ids only
```

Traces per rule:

```text
[RULE_COND_CANON] rule_id, raw_key, canonical_key, matched, via
[RULE_CONDITION_LEDGER] rule_id, passed[], failed[], missing[]
```

No crop branches. Alias table is the only vocabulary bridge.

### 5. Remove fabricated `MONITOR_ONLY`

When the rule executor returns `winner=none`:

- Replace advice with `verdict=INSUFFICIENT_KNOWLEDGE`.
- Populate `gap_reason ∈ {NO_RULE_MATCH, NO_HYPOTHESIS, STAGE_CONTEXT_CONFLICT, COVERAGE_GAP}`.
- `MONITOR_ONLY` is emitted **only** when a DB rule explicitly returns it.

### 6. Remove silent `INFORMATION` fallback

`ResponseModeResolver` default becomes `COVERAGE_GAP_DISCLOSURE`. Narrator prompt must produce three literal blocks and nothing agronomic:

- `farmer_reported` — verbatim observations.
- `graph_understood` — hypotheses/rules from snapshot.
- `evidence_missing` — hypothesis conditions still unmatched.

LLM MUST NOT synthesize any treatment.

### 7. Stage conflict as first-class signal

- `biological-state` emits `state.stage_context_conflict = { declared_stage, observed_stage_family, evidence[] }` whenever DAS-derived stage disagrees with symptom-implied stage family from DB `crop_stage_graph`.
- Hypothesis evaluator treats stage as **uncertain context** (soft) rather than eliminating the hypothesis.
- Clarification engine promotes stage-clarifying questions when the conflict flag is set.
- No hardcoded stage table — all lookups via existing `crop_stage_graph` cache.

## Regression tests (`tests/graph-handoff_test.ts`)

1. Snapshot `hyp=1` ⇒ `EVIDENCE_COUNT_TRACE.candidate_hypotheses=1`.
2. `ORCHESTRATOR_EXIT` counts equal snapshot counts (mismatch throws).
3. `rules=4` present ⇒ never `hyp=0` in exit.
4. Rule condition matching emits `[RULE_COND_CANON]` and lookups go through aliases.
5. `RULE_RESULT.winner=none` never yields `MONITOR_ONLY`; yields `INSUFFICIENT_KNOWLEDGE`.
6. No path emits default `INFORMATION`; uses `COVERAGE_GAP_DISCLOSURE`.
7. `BIO_STATE_CONTRADICTION` populates `state.stage_context_conflict`.

## Expected trace after fix

```text
GRAPH_RUNTIME       hypotheses=1 rules=4
STATE_SYNC          hypotheses=1 rules=4 source=GRAPH_RUNTIME
EVIDENCE_COUNT      candidate_hypotheses=1 matched_rules=4
RULE_COND_CANON     rule_id=… matched=true via=alias
GRAPH_HANDOFF_CHECK ok
ORCHESTRATOR_EXIT   hypotheses=1 rules=4
```

If evidence still insufficient: `ClarificationEngine → observation_required=true` with advisor-style questions built from `hypothesis_conditions` — never `MONITOR_ONLY`, never generic `INFORMATION`.

## Guarantees

- No hardcoded agriculture; no crop branches; no DB migration.
- Working graph, snapshot builder, and observation resolver are untouched.
- Every edited file (all under `supabase/functions/ai-agriculture-chat/**`) gets a dated `CHANGE LOG` header entry per project rule.
