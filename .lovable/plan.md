# Neuro-Symbolic Decision Brain — Graph Result Loss Fix

## Verified root cause (from code + log, not assumption)

`orchestrator.ts` builds `ConversationState` at **L4469** with `hypotheses: []`, then calls `emitBrainTrace(conversationState, …)` at **L4486**. This runs **BEFORE** the hypothesis graph executes at **L4811**. That is why the log shows `hyp=0 candidate=0 winner=none` even though `[HYP_GRAPH] survived=4` fires later.

Additional confirmed defects:
- Graph output stored on `this._graphHypothesisResult` at L4833 but never re-projected back into `ConversationState.hypotheses`, so any consumer reading state sees `[]`.
- No invariant asserts `graph.candidates > 0 ⇒ conversationState.hypotheses > 0`, so silent drops are unobservable.
- `[OBS_TO_HYP]` is only emitted inside `hypothesis-graph-evaluator.ts` (per rg); orchestrator emits `[HYP_TO_RULE]` (L6798) and `[RULE_RESULT]` (L6825) but never re-emits `[OBS_TO_HYP]` at the orchestrator boundary, so lineage grep breaks between files.
- `runtime/clarification-contract.ts` `assertClarificationContract` at L307 still enforces a **TypeScript-side allowlist** (`key not in allowlist dropped`). This is the exact log line the user sees — the DB-brain path from the prior fix is not the one gating final serialization.
- `orchestrator.ts` L4105/L4122 still runs `[CrossCropFix] Blocked N terminal codes` using in-file logic instead of DB authority.

## Fix (5 patches, all in existing files — no new files, no LLM/prompt/schema changes)

### Patch 1 — Project graph result into ConversationState (BUG 1)
In `agents/orchestrator.ts`, immediately after the L4811-L4853 hypothesis graph block:
- Mutate `(this as any).__conversationState.hypotheses` and `conversationState.hypotheses` to the array of `graphOut.candidates.map(c => ({ hypothesis_id: c.hypothesis_id, canonical_group: c.canonical_group, score: c.raw_score }))`.
- Also update `conversationState.coverage` from graph coverage if provided.
- **Move `emitBrainTrace(...)` from L4486 to a new site AFTER the graph block** (and pass rule-stage phase counts once rules run — the POST_RULE trace at L7047 already carries eligible/winner, so the primary emit moves to right after L4853 so `hyp` is real).

### Patch 2 — Graph handoff invariant (BUG 2)
In `agents/orchestrator.ts`, immediately after Patch 1's projection:
```
if (graphOut.candidates.length > 0 && conversationState.hypotheses.length === 0) {
  throw new Error(`GRAPH_RESULT_DROPPED: graph=${graphOut.candidates.length} state=0 trace=${traceId}`);
}
```
Same invariant is repeated once more right before the primary decision object is built (search for `layeredRuleResult = evaluateRulesLayered` at L6807) to catch any late reset.

### Patch 3 — Emit full graph lineage at orchestrator boundary (BUG 3)
Add a single orchestrator-side `[OBS_TO_HYP]` line right after L4837:
```
[OBS_TO_HYP] trace=<id> obs=[...12] hyp=[...12] survived=N eliminated=M edge_missing=K
```
`[HYP_TO_RULE]` (already at L6798) and `[RULE_RESULT]` (L6825) stay. Add matching `[OBS_TO_HYP]` counters to `[BRAIN_TRACE]` so a single grep on `trace=` reconstructs the full edge chain.

### Patch 4 — Remove residual TS agriculture gates (BUG 4)
- `agents/orchestrator.ts` L4105-L4130 (`CrossCropFix` block): replace the in-file "terminal codes" filter with a passthrough that trusts `observation_master.can_generate_question` + `is_farmer_observable` from the DB (migration already added in prior turn). Keep the log tag but only log DB-driven decisions.
- `runtime/clarification-contract.ts` `assertClarificationContract` (L292-L314): change the `allowedKeys` source. Instead of the caller-supplied Set, resolve at runtime from `intent_observation_mapping` + `clarification_fallback_questions` (the DB tables the prior migration created). Callers keep the same signature; the function itself does the DB lookup once per call and caches it on the request. Concretely: if `allowedKeys.size === 0`, fall back to the DB-derived set for the ctx (intent, crop, stage); never drop silently.

### Patch 5 — BRAIN_TRACE reads live rule counts (BUG 1 finishing touch)
`runtime/brain-trace.ts` already accepts `BrainTracePhases`. After Patch 1's move, wire the single canonical emit at the end of the rule stage (right after the `[BRAIN_TRACE][POST_RULE]` block at L7047), replacing the two current lines with **one** authoritative line that carries `hyp`, `candidates`, `eligible`, `winner`. Delete the placeholder emit at old L4486 site.

## Files touched
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (Patches 1, 2, 3, 4, 5)
- `supabase/functions/ai-agriculture-chat/runtime/clarification-contract.ts` (Patch 4)
- `supabase/functions/ai-agriculture-chat/runtime/brain-trace.ts` (Patch 5 — accept `hypotheses_count` override so the emitter doesn't rely on stale state)

**Not touched:** LLM prompts, observation extraction, DB tables/agriculture data, `hypothesis-graph-evaluator.ts`, `HypothesisGraphLoader.ts`, `GraphRuntime.ts`.

## Success signals in the next log for `भात अजून उगवले नाही`
```
[OBS_TO_HYP] trace=… survived=4 eliminated=… edge_missing=…
[HYP_TO_RULE] trace=… candidate_rules=[…]
[RULE_RESULT] trace=… winner=<rule_id or none> reason=match|RULE_COVERAGE_GAP
[BRAIN_TRACE] … hyp=4 candidates=>0 eligible=>0 winner=<id>|coverage_gap
```
Forbidden combinations that would fail the invariant and throw `GRAPH_RESULT_DROPPED`:
- `[HYP_GRAPH] survived=4` **and** `[BRAIN_TRACE] hyp=0`
- `[CONTRACT_VIOLATION] key not in allowlist` for keys that exist in `intent_observation_mapping` or `clarification_fallback_questions`
- `[CrossCropFix] Blocked … terminal codes` without a DB-authority reason attached
