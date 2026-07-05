## Forensic finding

The current fix is still branch-local. In `orchestrator.ts`, the DB graph execution and `[OBS_TO_HYP]` projection live inside the diagnosis-first branch around the evidence-freeze block. That means a diagnostic turn can still pass `POST_EVIDENCE_FREEZE`, skip that branch, and later reach UnderstandingChecker / clarification / response logic without `[OBS_TO_HYP]`, `[HYP_TO_RULE]`, or `[RULE_RESULT]`.

There is also still a second BRAIN_TRACE-shaped log on the option path (`emitBrainTrace` around the option-selected short-circuit) and an extra `[BRAIN_TRACE][PIPELINE_RULE_STAGE]` line before the final canonical post-rule trace. This violates the “one final trace only after RULE_RESULT” rule.

## Implementation plan

### 1. Add one mandatory graph gate immediately after evidence freeze

In `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`:

- Extract the current evidence bridge + graph execution logic into a single local helper path named conceptually `executeDecisionGraph()`.
- Run it unconditionally for any turn that has frozen real agronomic evidence and a reasoning intent, including:
  - `EMERGENCE_FAILURE`
  - `GERMINATION_FAILURE`
  - pest/disease/nutrient/stress/damage/report-symptom intents
  - crop damage and diagnosis modes
- The helper will preserve the existing DB-only flow:

```text
bridgeCodesDb()
resolveCropCanonicalObservations()
evaluateHypothesisGraph()
project graph candidates into ConversationState
store _graphHypothesisIds / _graphHypothesisRuleIds / _graphHypothesisEdgeMissing
emit OBS_TO_HYP
```

- Remove the current dependency on `diagnosisWithOptionalClarification && !directHardBypass` for graph execution. That branch may still choose response mode, but not whether the graph runs.

### 2. Make graph result the only diagnosis-completeness authority

In `orchestrator.ts` around the UnderstandingChecker gate:

- Stop treating “observations exist” or ConversationState coverage as sufficient evidence for diagnosis completeness.
- Replace that authority with:

```text
graph.hypothesis_count > 0
AND
RULE_RESULT exists / rule evaluation has completed
```

- If UnderstandingChecker asks for clarification before graph execution, do not allow it to produce a response. It must be bypassed until the graph gate has run.
- If graph runs and returns no hypotheses/rules, clarification may be generated from graph gaps, not from pre-graph coverage heuristics.

### 3. Add a fail-closed final exit guard for every response

Strengthen the existing guard in `supabase/functions/ai-agriculture-chat/index.ts`:

- Use the orchestrator’s stored state to check:

```text
intent.requiresAgronomicReasoning
AND evidenceFrozen=true
AND graphExecuted=false
```

- Throw exactly:

```text
GRAPH_PIPELINE_BYPASSED
```

with:

```text
trace_id
exit_path
intent
realObs
```

- Extend the guard beyond the current hardcoded diagnostic intent set by using the same runtime helper used by the orchestrator, so new DB diagnostic intents do not bypass the invariant.

### 4. Enforce one BRAIN_TRACE location

In `orchestrator.ts`:

- Remove or rename the option-path `emitBrainTrace(...)` around the option-selected short-circuit so it cannot emit `[BRAIN_TRACE]` before graph lineage.
- Remove the non-canonical `[BRAIN_TRACE][PIPELINE_RULE_STAGE]` log.
- Keep exactly one canonical `emitBrainTrace(...)` call, after `[RULE_RESULT]`, with real values for:

```text
hyp
obs_to_hyp
hyp_to_rule
candidates
eligible
winner
```

- Keep detailed forensic rule-stage data under a different tag such as `[RULE_STAGE_TRACE]`, not `[BRAIN_TRACE]`.

### 5. Add execution-order assertions

Add a per-turn graph order tracker in `orchestrator.ts`:

```text
POST_EVIDENCE_FREEZE = 1
OBS_TO_HYP           = 2
HYP_TO_RULE          = 3
RULE_RESULT          = 4
BRAIN_TRACE          = 5
```

- On each stage, assert the next sequence number.
- If a stage is skipped, duplicated, or emitted out of order, throw:

```text
GRAPH_ORDER_ERROR
```

with:

```text
trace_id
expected
actual
stage
```

- Specifically forbid:

```text
POST_EVIDENCE_FREEZE -> BRAIN_TRACE hyp=0
```

### 6. Preserve all forbidden areas

This patch will not modify:

- LLM prompts
- observation extraction
- agriculture data
- `decision_rules`
- agronomic table contents

Only runtime sequencing, trace authority, and fail-closed invariants will change.

## Success signal

For `भात अजून उगवले नाही`, the trace must show exactly this order:

```text
POST_EVIDENCE_FREEZE sequence=1
OBS_TO_HYP sequence=2
HYP_TO_RULE sequence=3
RULE_RESULT sequence=4
BRAIN_TRACE sequence=5 hyp>0 winner=<rule_id|coverage_gap>
```

Forbidden forever:

```text
POST_EVIDENCE_FREEZE
BRAIN_TRACE hyp=0 winner=none clarify=false(sufficient_evidence)
```