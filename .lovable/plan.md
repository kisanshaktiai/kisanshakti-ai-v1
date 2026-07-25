
# Forensic Root Cause Report — Trace `trace_ms09b10x_4c6y7c`

Investigation only. **No code changes proposed.** Every conclusion is anchored to a specific log line from `supabase-logs…_85.csv` and a specific line of live runtime code.

---

## PRIMARY ROOT CAUSE (RC-1)

**`_graphTruth.canonical_observations` is empty (0) at the moment the CanonicalState is projected, even though 3 real farmer observations were extracted upstream. The projection then overwrites `state.observation_codes` from 3 → 0. From that instant, every downstream graph stage runs on an empty observation set.**

### Evidence (log)
Ordered by timestamp for this turn:

1. `[EVIDENCE_CLASSIFICATION] raw_count=3 real_symptom_count=3 ignored_metadata_count=0 real=[RICE_LODGING,STUNTED_GROWTH,AFFECTED_PART_WHOLE] ignored=[]`
2. `[OBSERVATION_CODES_PASSTHROUGH] count=3 codes=[RICE_LODGING,STUNTED_GROWTH,AFFECTED_PART_WHOLE]`
3. `[GRAPH_VALIDATED] site=PRE_CANONICAL_STATE hash_match=true hash=ef623259 crop=RICE stage=tillering das=47 **obs=0**`
4. `[CANONICAL_PROJECTION_ONLY] hash=ef623259 crop:RICE->RICE stage:TILLERING->tillering **obs:3->0** real=[] ignored=[]`
5. `[GRAPH_VALIDATED] site=PRE_LAYERED_RULE_EVALUATOR hash_match=true hash=ef623259 … **obs=0**`

Note there is **no `[GRAPH_TRUTH_BUILT]` line** for this turn even though the only writer of `_graphTruth` (`orchestrator.ts:5989`) always emits it inside `buildGraphTruth`. Combined with the fact that `PRE_CANONICAL_STATE` still validates with hash `ef623259` and `obs=0`, the `_graphTruth` object that the projection consumed **was built in an earlier turn of the same session** (session `bb9c239e-068d-402e-9cb6-5fb94ac2cbdf`, `turn: 400`) when observations were empty, and was reused instead of being rebuilt on this diagnostic turn.

### Runtime code path

| Site | File | Line | Behavior |
|---|---|---|---|
| Truth builder (only writer) | `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` | 5964–5989 | `buildGraphTruth({ canonical_observations: canonical_observation_codes, … })` and assigns `(this as any)._graphTruth = graphTruth`. Emits `[GRAPH_TRUTH_BUILT]`. |
| Projector | `agents/canonical-state-builder.ts` | 1434–1479 | `projectCanonicalStateFromGraphTruth` runs `classifyEvidence(graphTruth.canonical_observations)` and does `state.observation_codes = [...classified.real_codes]`. When the input array is empty the state's obs is overwritten to `[]`. |
| Validator | `runtime/graph-truth.ts` | 229–260 | Hashes {crop, stage_uuid, stage, DAS, obs}. Hash `ef623259` reproduces on 0 obs — so integrity passes even though observations are missing. |

### Why this prevents the final response
`state.observation_codes = []` forces:
- `[OBS_TO_HYP] hyp=[] hypotheses=0 state=GRAPH_EXHAUSTED`
- `[HYP_TO_RULE] hyp=[] candidate_rules=[] missing_edges=[] reason=NO_HYPOTHESIS_EDGE`
- `[GRAPH_SCOPE_BLOCKED] hypothesisCount=0 graphRuleEdges=0 blockedRuleCount=202 reason=NO_HYPOTHESIS_SURVIVED_DB_GATES`
- `[RULE_EVALUATOR_INPUT] count=0` → `[LayeredRuleEvaluator] No rules to evaluate - returning empty result`
- `[POST_RULE_TRACE] winner=none action_text=EMPTY final_diagnosis=none`

No winner rule ⇒ no `decision_output` ⇒ response cannot be built.

---

## SECONDARY CONSEQUENCE (SC-1) — Contract degrader forces `DIAGNOSTIC_ESCALATION`

### Evidence (log)
- `[OBS_TO_HYP_GAP] intent=GROWTH_ANOMALY confirmed_obs=3 real_obs=3 hypotheses=0 reason=no_hypothesis_edge_for_confirmed_observations action=route_to_observation_cards`
- `[GRAPH_ZERO_RULE_MATCH] … obs=[] — refusing keyword fallback. Downstream must emit GRAPH_NEEDS_MORE_EVIDENCE with pending observation codes.`

### Code
`runtime/observation-selector-contract.ts:164–195` (Case B): when the response is `CLARIFICATION_QUESTION` with 0 options and `loadObservationSelectorOptions` returns 0, but `realObservationCount > 0`, the response is force-mutated:

```
response.type = 'DIAGNOSTIC_ESCALATION';
response.metadata.graph_reason = 'NO_HYPOTHESIS_EDGE_FOR_CONFIRMED_OBSERVATIONS';
```

This is a direct downstream effect of RC-1 (obs=0 → no IOM options loadable). The contract layer degrades to escalation instead of throwing.

---

## SECONDARY CONSEQUENCE (SC-2) — Formatter has no `DIAGNOSTIC_ESCALATION` branch

### Evidence (log)
- `📝 [PostProcessor] Converting response type: DIAGNOSTIC_ESCALATION to language: mr`
- `⚠️ Unknown response type: DIAGNOSTIC_ESCALATION - generating helpful fallback`
- `⚠️ No decision_output present in orchestrator response`
- `📋 Returning clarification with 0 options`
- `Actions Returned Count: 0`
- `[RUNTIME_TRACE] winner_rule=- winner_hyp=- clarification_owner=- candidates=- matched=- decision=- confidence=- latency_ms=39839`

### Code
`supabase/functions/ai-agriculture-chat/index.ts:3670-3673` — the `switch(response.type)` in the formatter has **no case** for `'DIAGNOSTIC_ESCALATION'`; it falls through to `default` and calls `generateHelpfulErrorResponse(lang, '')`. That is the actual bytes returned to the farmer.

Session-persistence log confirms the terminal state:
- `persisted_decision_state: no_action_needed`
- `persisted_pending_structured: 0 records`
- `persisted_pending_options: 0`
- `persisted_pending_obs_keys: []`

---

## OBSERVED SYMPTOMS (not causes)
- Empty options card in UI.
- Marathi generic fallback text instead of a graph-driven answer.
- 39.8 s edge latency with `winner_rule=-`.
- Session decision state stuck at `no_action_needed` across turns.

---

## Dependency Tree

```text
RC-1  _graphTruth.canonical_observations = []
      (stale/never-rebuilt graph_truth reused on this turn — no
       [GRAPH_TRUTH_BUILT] in log, hash ef623259 present at
       PRE_CANONICAL_STATE with obs=0)
        │
        ▼
projectCanonicalStateFromGraphTruth overwrites
canonicalState.observation_codes 3 → 0
        │
        ▼
Hypothesis engine: 0 candidates → GRAPH_EXHAUSTED
        │
        ▼
Rule engine: 202 crop rules loaded, 0 evaluated,
winner=none, action_text=EMPTY, decision_output=null
        │
        ├──► SC-1  observation-selector-contract Case B degrades
        │         CLARIFICATION_QUESTION → DIAGNOSTIC_ESCALATION
        │         (loadObservationSelectorOptions returned 0)
        │
        ▼
SC-2  index.ts formatter switch has no DIAGNOSTIC_ESCALATION case
      → falls through to default → generateHelpfulErrorResponse('')
        │
        ▼
Final farmer response = generic Marathi fallback string
(no decision, no options, no reasoning)
```

---

## Answer to the Primary Question

> **Which exact runtime condition prevents the response object from reaching the formatter?**

The formatter **is** reached — with `response.type = 'DIAGNOSTIC_ESCALATION'` and `decision_output = null`. The condition that prevents a *valid* farmer response from being produced is:

> `_graphTruth.canonical_observations.length === 0` at `PRE_CANONICAL_STATE`, which is then propagated by `projectCanonicalStateFromGraphTruth` (`agents/canonical-state-builder.ts:1466`) into `canonicalState.observation_codes = []`. Because the graph_truth object was built (or persisted) with zero observations and reused this turn — the only writer at `agents/orchestrator.ts:5964–5989` never re-executed on this turn (no `[GRAPH_TRUTH_BUILT]` log) — every subsequent gate (`OBS_TO_HYP`, `HYP_TO_RULE`, `LayeredRuleEvaluator`, `unified-decision-gate`) evaluates on an empty observation set, produces no winner rule, and the response is mutated to `DIAGNOSTIC_ESCALATION` at `runtime/observation-selector-contract.ts:176`. The `switch` at `index.ts:3670` has no branch for that type and returns a generic fallback string.

---

## Files & Functions Implicated (read-only reference)

| Concern | File : Function : Line |
|---|---|
| Graph-truth writer (only) | `agents/orchestrator.ts` : `buildGraphTruth` call : 5964–5989 |
| Graph-truth reader / overwriter | `agents/canonical-state-builder.ts` : `projectCanonicalStateFromGraphTruth` : 1434–1479 |
| Hash/validator (accepts obs=0) | `runtime/graph-truth.ts` : `assertGraphTruthIntegrity`, `computeGraphHash` : 116–260 |
| Evidence classifier (metadata strip) | `runtime/evidence-classifier.ts` : `classifyEvidence` : 15, 34–58 |
| Contract degrader (CLAR → ESCAL) | `runtime/observation-selector-contract.ts` : 164–195 (Case B), 238–260 (Case D) |
| Formatter missing case | `supabase/functions/ai-agriculture-chat/index.ts` : `switch(response.type)` default : 3670–3673 |
| Symptom of missing decision | `index.ts` : "No decision_output present" : 1561 |

No fixes proposed. Awaiting direction on which root cause (RC-1 stale/empty graph_truth reuse, SC-1 contract degrader, or SC-2 formatter switch gap) to address first.
