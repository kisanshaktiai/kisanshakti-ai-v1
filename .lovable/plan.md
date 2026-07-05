## Forensic audit — uploaded log `trace_mr84hdk0_iu7mcn`

### Finding 1 (primary): the log is from the OLD runtime, before the mandatory-graph-gate patch

Grepping the uploaded CSV for every marker introduced by the last three patches returns **zero hits**:

```text
MANDATORY_GRAPH_GATE      0
executeDecisionGraph      0
assertDecisionGraphOrder  0
GRAPH_ORDER_ERROR         0
GRAPH_PIPELINE_BYPASSED   0
ORCHESTRATOR_EXIT         0
OBS_TO_HYP                0
HYP_TO_RULE               0
RULE_RESULT               0
RULE_STAGE_TRACE          0
GRAPH_RUNTIME             0
sequence=                 0
```

The single `[BRAIN_TRACE]` line in the log also uses the **old field schema** — no `sequence=`, no `obs_to_hyp=`, no `hyp_to_rule=`. `brain-trace.ts` in the tree emits all three today, and it is the only `[BRAIN_TRACE] trace=` emitter in the whole edge function (`rg` confirms one hit). So the deployed edge function serving this request predates the patch. Nothing about the log proves the new gate is wrong; it proves the new gate never ran.

Root-cause reading of the OLD behaviour that the log DOES show, so the picture is complete:

```text
DIRECT_MODE      intent=EMERGENCE_FAILURE route=GENERAL_INFO
                 → skips symptom clarification (advisoryIntent=false, hardBypass=false)
DIRECT_MODE_VETO 5 informative obs detected — override
POST_EVIDENCE_FREEZE real_observations=5 frozen=true
BRAIN_TRACE      hyp=0 candidates=0 winner=none clarify=false(sufficient_evidence)
```

i.e. the old orchestrator vetoed DIRECT_MODE and froze evidence, but the branch that runs the hypothesis graph was still gated behind `diagnosisWithOptionalClarification && !directHardBypass`, so the graph never ran, and BRAIN_TRACE reported `hyp=0`. That is exactly the class of leak the new `MANDATORY_GRAPH_GATE` + `assertDecisionGraphOrder` + `GRAPH_PIPELINE_BYPASSED` closes — the fix is present in source, it just has not executed yet.

### Finding 2: two residual bypass sites still exist even with the new gate

Re-reading `orchestrator.ts` around the new instrumentation:

1. `assertDecisionGraphOrder(..., 'POST_EVIDENCE_FREEZE')` at L4857 sits **inside** the `diagnosisFirstOutput` branch. If a diagnostic turn takes the option-selected short-circuit or an advisory-shaped early return before L4857, sequence counter never starts, so `GRAPH_ORDER_ERROR` cannot fire and `GRAPH_PIPELINE_BYPASSED` at the `index.ts` boundary depends only on `graphExecuted` being false. That is one-sided coverage.
2. There is still an `emitBrainTrace(...)` reachable on the option-selected path (per prior audit note in `.lovable/plan.md`, item 4). It is not the canonical post-`RULE_RESULT` emitter, and it can log `hyp=0` legally because the sequence guard at L7206 only runs on the diagnosis branch.

### Plan

1. Move `assertDecisionGraphOrder(..., 'POST_EVIDENCE_FREEZE')` and the `__decisionGraphSequence` init to the single point right after evidence-freeze, **before** any branch (diagnosis / option / advisory / direct). Every diagnostic intent turn starts the sequence exactly once.
2. Remove the option-path `emitBrainTrace(...)` and replace with `[OPTION_SELECTED_TRACE]` (non-canonical tag) so only the post-`RULE_RESULT` site can emit `[BRAIN_TRACE]`.
3. Add a boot-time `console.log('[GRAPH_GATE_BUILD] rev=<short-hash> hasMandatoryGate=true')` line in `index.ts` so the next log upload immediately shows whether the deployed bundle contains the patch. This turns "old runtime vs new runtime" into a one-line grep instead of a schema-diff argument.
4. In `index.ts` boundary audit, if `_decisionGraphSequence < 4` AND intent is diagnostic AND `realObs > 0`, throw `GRAPH_PIPELINE_BYPASSED: sequence_incomplete stage=<n>` — this catches cases where the graph technically "ran" but did not reach `RULE_RESULT`.
5. No changes to LLM prompts, observation extraction, `decision_rules`, or any agriculture table.

### Verification

After deploy, send `भात अजून उगवले नाही` and confirm the log contains, in order:

```text
[GRAPH_GATE_BUILD] rev=... hasMandatoryGate=true
[MANDATORY_GRAPH_GATE] trace=... intent=EMERGENCE_FAILURE
POST_EVIDENCE_FREEZE  sequence=1
OBS_TO_HYP            sequence=2
HYP_TO_RULE           sequence=3
RULE_RESULT           sequence=4
[BRAIN_TRACE] ... sequence=5 hyp>0
```

If `[GRAPH_GATE_BUILD]` is missing from the next log, the deploy pipeline itself is the culprit, not the runtime code.
