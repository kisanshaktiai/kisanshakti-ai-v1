## Chain A audit — what the DB and code actually say

**DB is healthy.** `hypothesis_rule_mapping` returns 13 active rules for `HYP_RICE_LODGING_001`, all present in `decision_rules` with `is_active=true` and `crop_code='rice'` (verified this turn). `hypothesis_master` row exists with `crop_group='rice'`, `is_active=true`. So the graph substrate is intact.

**The failure is downstream of the DB read, inside the orchestrator turn state.**

Log evidence:
```
[HYP_TO_RULE] hyp=[HYP_RICE_LODGING_001] candidate_rules=[] missing_edges=[] reason=HYPOTHESIS_RULE_EDGE_MISSING
```

Reading `agents/orchestrator.ts`:
- Line 5797–5807 collects `graphHypothesisRuleIds` by iterating `graphOut.candidates[i].candidate_rule_ids`. If a candidate has zero rules it is pushed to `graphHypothesisEdgeMissing`.
- Line 8261–8264 reads the set that drives HYP_TO_RULE:
  ```ts
  const graphRuleIdSet = new Set(
    __graphRuntimeState?.hypothesis_rule_ids ?? _graphHypothesisRuleIds ?? []
  );
  ```

The log is internally contradictory under the current code: if the candidate's `candidate_rule_ids` were empty, `missing_edges` would contain `HYP_RICE_LODGING_001`; if it were populated, `candidate_rules` would show 13 entries. Both being empty means **`_graphHypothesisRuleIds` and `__graphRuntimeState.hypothesis_rule_ids` are being cleared between step 8 (line 5805) and the HYP_TO_RULE log (line 8330)**, while `_graphHypothesisResult.candidates` (used at 8305 for `hyp=[…]`) survives.

**Confirmed candidate resets (grep of `_graphHypothesisRuleIds`):**
- Line 6005–6010 — `_graphHypothesisRuleIds = []` + `setHypothesisRuleIds([])` on the "non-fatal no-survivor" catch. This is scoped to a caught graph exception; if a benign later exception (e.g. GraphTruth build, PROJECTION audit) is misclassified as `nonFatalNoSurvivorGraph`, the rule list is wiped even though `graphOut.candidates` is intact.
- Line 5867 — merged-snapshot re-projection **only reassigns rule ids when `merged.rules.length > 0`**; if `buildGraphRuntimeSnapshot` returns `rules=[]` for any reason (e.g., `engineA` prior snap over-wrote parent edges), the pre-existing 13 stay in `_graphHypothesisRuleIds` but `__graphRuntimeState` may already have been mutated by an earlier `setHypothesisRuleIds([])` in a prior sub-turn without matching reset of the `this.*` field.
- Line 1456 — `_graphHypothesisRuleIds = []` at per-turn reset. Fine on its own, but paired with the `??` in line 8262 there is no fallback if the runtime-state getter returns a frozen empty `readonly []` (a valid non-null value, so `??` does NOT fall through).

**Root cause (highest-confidence, unverified until instrumented):** the `??` in line 8262 makes `__graphRuntimeState.hypothesis_rule_ids` authoritative even when it is an empty array set by the merged-snapshot / non-fatal-catch path, silently masking the 13 rules still present in `_graphHypothesisRuleIds`.

## Fix — three surgical patches to `agents/orchestrator.ts` only

**P1 · Restore `_graphHypothesisRuleIds` as the authoritative fallback when the runtime-state mirror is empty**
Replace the `??` union with an explicit "prefer non-empty" merge:
```ts
const grsRuleIds = (this as any).__graphRuntimeState?.hypothesis_rule_ids ?? [];
const selfRuleIds = ((this as any)._graphHypothesisRuleIds ?? []) as string[];
const graphRuleIdSet = new Set<string>(
  grsRuleIds.length > 0 ? grsRuleIds : selfRuleIds,
);
```
Log a one-liner `[HYP_RULE_SRC] grs=<n> self=<n> chosen=<n>` so the next log makes the source unambiguous.

**P2 · Reconstruct `graphRuleIdSet` from `_graphHypothesisResult.candidates` when both mirrors are empty but the graph produced candidates**
Immediately before line 8305 (`graphHypIdsForTrace = …`):
```ts
if (graphRuleIdSet.size === 0 && _graphSurvivors.length > 0) {
  const reRuleIds = _graphSurvivors
    .flatMap((c: any) => Array.isArray(c?.candidate_rule_ids) ? c.candidate_rule_ids : [])
    .filter(Boolean);
  if (reRuleIds.length > 0) {
    for (const rid of reRuleIds) graphRuleIdSet.add(String(rid));
    console.warn(`[HYP_RULE_RECOVERED] trace=${traceId} from=_graphHypothesisResult n=${reRuleIds.length}`);
  }
}
```
This makes `_graphHypothesisResult.candidates` the single ontological source of truth for HYP→RULE edges and eliminates the mirror-drift class of bugs. If Chain B (queryRuleMapping) truly returned zero, this block is a no-op.

**P3 · Tighten the `nonFatalNoSurvivorGraph` catch (line 5979-6019)**
Only wipe `_graphHypothesisRuleIds` when we actually observed zero survivors:
```ts
const shouldZeroRules = nonFatalNoSurvivorGraph
  && ((this as any)._graphHypothesisResult?.candidates?.length ?? 0) === 0;
if (shouldZeroRules) { /* existing reset block */ }
```
Prevents a later non-fatal error from erasing valid Chain-A rule edges.

## Verification

1. Redeploy `ai-agriculture-chat`.
2. Replay the Rice / DAS 47 / lodging query; grep edge log for `[HYP_RULE_SRC]`, `[HYP_TO_RULE]`, `[HYP_GRAPH_SCOPE]`.
3. Expected: `[HYP_TO_RULE] hyp=[HYP_RICE_LODGING_001] candidate_rules=[RICE_DIAG_LODGING_CAUSE_001,RICE_WEATHER_LODGING_RISK_001,…] reason=OK` followed by `[HYP_GRAPH_SCOPE] N → M`.
4. If `[HYP_RULE_RECOVERED]` ever fires, that is a P0 alert: it means the runtime-state mirror is being cleared while `_graphHypothesisResult` still has the rules — a state we can then chase with a stack trace on the setter.

## Scope

Modify **only** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`. No DB migrations, no changes to `hypothesis-graph-evaluator.ts`, `graph-snapshot.ts`, or `graph-runtime-state.ts`.
