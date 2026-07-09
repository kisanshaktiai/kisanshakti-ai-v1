## Executive Diagnosis

Two production 500s share ONE root cause: the **observation-selector contract enforcer** (`runtime/observation-selector-contract.ts`) has three hard-throw exits that fire whenever the hypothesis-graph curator gap collides with a real turn. When the graph legitimately has no downstream edge for a `(crop, stage, DAS, observation)` cell, the enforcer should degrade — not 500. It already degrades for **Case B** when `realObservationCount > 0`, but two ancillary defects still route real turns into the throw:

1. **Case B degrade is bypassed** in trace `mrddu422_bpwjh6` because `realObservationCount` reaches the enforcer as `0` even though the log records `confirmed_observations=4`. The value is read from `orch._lastRealObservations`, which is written on only ONE orchestrator path (`orchestrator.ts:4996`). The seed-graph clarification path that produced this turn never sets it, so the enforcer defaults to 0 → throws `empty_options type=CLARIFICATION_QUESTION`.

2. **Case C has no degrade path at all** — trace `mrdebxev_a7q3mn` (stage-fallback with 0 rules) hits `DECISION_PROVIDED` with no primary/secondary/comm-text, `loadObservationSelectorOptions` returns 0, and the enforcer throws `empty_options type=DECISION_PROVIDED reason=no_recommendations`. This is the same curator-gap class as Case B and must degrade the same way.

3. **The second contract pass** in `index.ts` (post unified-gate, line 1935) does not forward `realObservationCount`, so even after fix (1) it would still throw on the re-run.

None of this is agronomy, DB schema, LLM, or graph-execution logic. It is a boundary-enforcer resilience defect.

## Broken Graph Trace

**Trace 1 (`mrddu422_bpwjh6`)** — Rice / transplanting / DAS=31, farmer confirmed leaf curl:
```
Expected: RequestScope → LandAuth → Semantic → Obs→Hyp (0 matches) →
          GRAPH_CONTRACT_ERROR logged → DIAGNOSTIC_ESCALATION returned to UI
Actual:   … → GRAPH_CONTRACT_ERROR logged → CLARIFICATION_QUESTION w/ 0 opts →
          enforcer Case B sees realObservationCount=0 (not propagated) →
          throws OBSERVATION_CONTRACT_VIOLATION → 500
```

**Trace 2 (`mrdebxev_a7q3mn`)** — Rice / transplanting / DAS=31, selected `OBS_RICE_NO_EMERGENCE`:
```
Expected: … → OPTION_SELECTED → 0 rules matched → stage fallback →
          DIAGNOSTIC_ESCALATION with curator-triage log
Actual:   … → stage fallback → DECISION_PROVIDED (empty) →
          enforcer Case C loads 0 options → throws unconditionally → 500
```

## Critical Issues

| P | File | Function | Bug | Evidence | Impact | Root cause |
|---|------|----------|-----|----------|--------|------------|
| P0 | `runtime/observation-selector-contract.ts` | `ensureObservationSelectorContract` Case C (line 187-190) | Throws when `DECISION_PROVIDED` is empty and no options loadable, even though real observations were confirmed upstream | Trace 2 error at line 110 of file | Every stage-fallback turn with no rule match returns 500 | Missing degrade path symmetrical to Case B |
| P0 | `index.ts` around line 1935 | Post-unified-gate contract call | Does not pass `realObservationCount` to enforcer | `grep _realObservationCountForContract` shows only first call site | Case B degrade cannot fire on the post-gate re-run | Missing field in ctx object |
| P1 | `agents/orchestrator.ts` seed-graph clarification path | Whichever branch emits `CLARIFICATION_QUESTION` after `GRAPH_CONTRACT_ERROR` | Does not set `this._lastRealObservations` even though confirmed observations exist | Log shows `confirmed_observations=4` but enforcer receives 0 | Case B degrade cannot fire on first contract pass | Only one write site (line 4996) covers this contract |

## Surgical Fix Plan

**Fix 1 — extend Case C degrade (`runtime/observation-selector-contract.ts`, lines 185-198)**
- WHAT: When `hasPrimary && hasSecondary && hasCommText` are all false AND `loadObservationSelectorOptions` returns 0, if `ctx.realObservationCount > 0` degrade to `DIAGNOSTIC_ESCALATION` with `[OBSERVATION_CONTRACT_DEGRADE] from=DECISION_PROVIDED reason=stage_fallback_no_rules_after_confirmed_observations` and set `metadata.graph_reason = ctx.graphReason || 'NO_RULES_MATCHED_AFTER_OBSERVATION'`. Only throw when `realObservationCount === 0` (true contract leak).
- WHERE: same file only, mirroring the Case B block already committed at lines 143-166.
- WHY: The stage-fallback path is a legitimate curator gap, not a runtime bug. Throwing violates the "graph exhaustion degrades, never 500s" invariant.
- HOW to verify: run trace 2 fixture → assert response type flips to `DIAGNOSTIC_ESCALATION`, response has 200 status, log line `[OBSERVATION_CONTRACT_DEGRADE] from=DECISION_PROVIDED` present.

**Fix 2 — forward `realObservationCount` on the post-gate pass (`index.ts` ~1935-1961)**
- WHAT: Add `realObservationCount:` derived exactly like the first pass (`_orchAnyForCtx2._lastRealObservations?.length ?? orchestratorResponse.metadata.real_observations?.length ?? 0`) to the ctx object.
- WHERE: index.ts only, inside the existing `try` around line 1935.
- WHY: Without it, Case B/C degrade paths can't fire when the post-gate re-run hits the same graph gap.
- HOW to verify: unit test on the post-gate branch with a stubbed orchestrator having `_lastRealObservations.length === 3` and an empty response → returns 200 with `DIAGNOSTIC_ESCALATION`.

**Fix 3 — populate `_lastRealObservations` on the seed-graph clarification path (`agents/orchestrator.ts`)**
- WHAT: In the code path that emits `CLARIFICATION_QUESTION` after `GRAPH_CONTRACT_ERROR` (the branch producing trace 1's log line `HYP_CLARIFICATION graph_gap=NO_DISCOVERY_SEEDS`), assign `(this as any)._lastRealObservations = confirmedObservationCodes` before returning, using the SAME confirmed-observation array already computed for the log line. No new state is introduced; only the existing SSOT-derived array is mirrored to the field the contract enforcer already reads.
- WHERE: orchestrator only, additive assignment (no logic change).
- WHY: The contract enforcer's Case B degrade already exists; the only reason it doesn't fire is that this write site is missing on this branch.
- HOW to verify: replay trace 1 fixture → enforcer log shows `real_observations=4` and returns `DIAGNOSTIC_ESCALATION` instead of throwing.

**Explicitly not touched:** DB schema, rule matching, agronomy logic, LLM prompts, hypothesis graph, `hypothesis-clarification-builder`, gates, orchestrator routing, multi-tenant scope, IOM cache. This is a boundary-enforcer + one missing state-mirror only.

## Regression Tests

Add to `tests/observation-selector-contract_test.ts`:

1. `Case C degrades on stage-fallback with confirmed observations` — DECISION_PROVIDED empty + `realObservationCount=1` + 0 loadable options → returns `DIAGNOSTIC_ESCALATION`, no throw.
2. `Case C still throws when no confirmed observations` — same shape with `realObservationCount=0` → throws `OBSERVATION_CONTRACT_VIOLATION`.
3. `Post-gate pass propagates realObservationCount` — grep assertion in `index.ts` similar to existing `graph-integrity_test.ts:466`, requiring `realObservationCount` to appear in BOTH ensureObservationSelectorContract call sites.
4. `Seed-graph clarification writes _lastRealObservations` — grep test asserting `_lastRealObservations =` appears on the seed-graph clarification branch.
5. Cross-crop replay: rice/cotton/sugarcane fixtures each with confirmed observations but no matching hypotheses → all three degrade, none throw.

## Final Architecture (unchanged; enforcer boundary reinforced)

```text
Farmer → RequestScope → LandAuthority(SSOT) → Semantic → Obs→Hyp Graph →
Hypothesis Validation → Hypothesis→Rules → Symbolic Engine → Safety Gates →
Decision Object ──► ContractEnforcer (degrades on curator gap, never 500) ──►
LLM Narrator → Farmer
```

## Final Validation

After these three surgical edits the same enforcer correctly handles rice / cotton / sugarcane / tomato / wheat / unknown-crop turns with confirmed observations but no curator-authored hypothesis edge — because the degrade path is crop-agnostic and driven entirely by `realObservationCount` from SSOT-derived arrays. No new agronomy, no new hardcoding, no schema change.