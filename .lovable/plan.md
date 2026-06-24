# Symbolic Decision Authority Unification

## Audit findings — exact files & lines where symbolic authority is lost

### 1. Two competing decision authorities run sequentially

| Authority | File | Entry point |
|---|---|---|
| **A** LayeredRuleEvaluator (correct) | `agents/layered-rule-evaluator.ts:450` `evaluateRulesLayered()` | Produces authoritative `primary_decision`, `matched_responses`, `rules_applied` (rule-id list). |
| **B** RuleEngineExecutor (competing) | `agents/rule-engine-executor.ts:200-260` `execute()` | Runs AFTER A. Builds its own `decisionOutput` via `resolveConflicts(decisions)` + `formatDecisionOutput()` / `generateDefaultDecision()` / `formatBlockedDecision()` (lines `468`, `541`, `618`, `746`). Generates an independent `rules_applied` (`generateAppliedRules(decisions)`, line ~`816`) and an independent `primary_decision` (line `803`). It knows NOTHING about `layeredRuleResult`. |

Orchestrator wiring that lets B override A:
- `orchestrator.ts:7549` — call site: `let decisionOutput = await this.ruleEngine.execute(ruleEngineInput);` — B's output becomes the canonical object that every downstream gate reads.
- `orchestrator.ts:7553-7559` — recovery only triggers when B's `primary_decision.rule_id` is falsy. When B's `formatDecisionOutput()` builds a SUCCESS primary, the recovery is **skipped** and A's `primary_decision` is discarded.
- `orchestrator.ts:7672-7684` — `rules_applied` from A is propagated **only when B's array is empty**. B almost always emits a non-empty list, so A's fired-rule-id list is silently replaced.

### 2. Where the mismatch is detected (symptom, not cause)

- `decision/symbolic-invariant-gate.ts:95` `fired = firedRuleIds(decisionOutput)` — reads `decisionOutput.rules_applied` (B's list).
- `decision/symbolic-invariant-gate.ts:162-205` — compares `primary.rule_id` (recovered from A at orchestrator:7569) against B's fired set → identity mismatch → `RULE_EMISSION_MISMATCH_HARD_GATE` → scrubs `primary_decision = null`, sets `response_mode = 'OBSERVATION'`, surfaces INFORMATION_ONLY.
- `runtime/rules-fired.ts:37-53` — SSOT correctly reads `dec.rules_applied`; the contamination is upstream (B writes a non-matching list).

### 3. Other places `DecisionOutput` is rebuilt / mutated

- `agents/orchestrator.ts:2466-2873` (OPTION_SELECTED path) — re-runs `evaluateRulesLayered` and rebuilds `primary_decision` inline (line 2873).
- `agents/orchestrator.ts:7028-7065` (`SymbolicMerge`) — synthesises `primary_decision` from `symbolicResult.recommendations[0]` and pushes synthetic rule_ids (`'SYMBOLIC'`) into `matched_responses`. These synthetic ids never appear in A's `rules_applied`, so they are guaranteed to trip the identity gate.
- `agents/orchestrator.ts:7567-7645` (PRIMARY_DECISION RECOVERY) — overwrites `decisionOutput.primary_decision` after B already populated it.
- `agents/rule-engine-executor.ts:478, 551, 628, 701, 803` — five separate `primary_decision: {…}` constructors (default / fallback / blocked / weather-delayed / success).

### 4. Net effect (matches production logs)

`LayeredRuleEvaluator` logs `Primary decision: <RULE_ID>`, `matched_responses=N`, `rules_applied=[...]`. Then `RuleEngineExecutor.formatDecisionOutput` overwrites both arrays with a different rule_id set. `symbolic-invariant-gate` sees the mismatch and nulls the primary → `actions=0`, `RULE_EMISSION_MISMATCH_HARD_GATE`, `INFORMATION_ONLY`.

---

## Target architecture (single source of truth)

```text
Observation
   → Hypothesis (hypothesis-evaluator)
   → LayeredRuleEvaluator  ◀── ONLY authority for primary_decision + rules_applied + matched_responses
   → DecisionOutput adapter (pure projection of layeredRuleResult)
   → RuleEngineExecutor.enrich() (economics, contingency, follow-up — NO primary, NO rules_applied)
   → Safety / Invariant Gates
   → Response Builder
   → LLM Translation
```

## Implementation plan

### Step 1 — Demote `RuleEngineExecutor` to enrichment

File: `supabase/functions/ai-agriculture-chat/agents/rule-engine-executor.ts`

- Add `enrich(decisionOutput, input): DecisionOutput` that ONLY computes `economic_assessment`, `contingency_planning`, `follow_up_schedule`, `audit_trail`, `confidence_metrics`. It must accept a `decisionOutput` already containing the authoritative `primary_decision` / `rules_applied` / `matched_responses` and must never write to those three fields.
- Mark `execute()` deprecated; route it internally to `enrich()` and require callers to pass `authoritative_primary` + `authoritative_rules_applied` + `authoritative_matched_responses` in the input. If they are missing, `enrich()` returns the input untouched (no synthetic primary, no default `MONITOR_ONLY`).
- Delete the five competing `primary_decision: {…}` constructors at lines 478/551/628/701/803 (or guard them behind `if (!input.authoritative_primary)` returning an empty shell with `primary_decision: null`).
- `generateAppliedRules()` (line ~816) must be replaced with a pass-through of `input.authoritative_rules_applied`.

### Step 2 — Make the orchestrator construct `DecisionOutput` from `layeredRuleResult`

File: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

- After `evaluateRulesLayered(...)` at line ~6692 succeeds, build a `decisionOutput` skeleton directly from `layeredRuleResult` (new helper `buildDecisionOutputFromLayered(layeredRuleResult, ruleEngineInput)`). That skeleton owns `primary_decision`, `rules_applied` (array of `{rule_id, …}` derived from `layeredRuleResult.rules_applied`), `matched_responses`, `secondary_recommendations`.
- Replace line 7549 `await this.ruleEngine.execute(...)` with `await this.ruleEngine.enrich(decisionOutput, ruleEngineInput)`.
- Delete the recovery block at 7553-7645 (no longer needed — A is authoritative from the start).
- Delete the conditional `rules_applied` propagation at 7672-7684 — `rules_applied` is set once at skeleton creation and immutable thereafter.
- In `SymbolicMerge` (7028-7065), stop writing synthetic `'SYMBOLIC'` rule_ids into `matched_responses` / `primary_decision`. If symbolic-reasoner has no concrete rule_id, keep its output in a NEW `decisionOutput.symbolic_advisory` field that the invariant gate ignores.
- In OPTION_SELECTED path (2466-2873), apply the same `buildDecisionOutputFromLayered` helper so primary/rules_applied are never reconstructed by hand.

### Step 3 — Lock the invariant gate to authority A

File: `supabase/functions/ai-agriculture-chat/decision/symbolic-invariant-gate.ts`

- Add a debug assertion (warn, do not throw): if `decisionOutput.primary_decision?.rule_id` is set and `decisionOutput.rules_applied` is empty, log `SYMBOLIC_AUTHORITY_DESYNC` with `trace_id` — this catches future regressions where someone bypasses Step 2.
- No behavioural change otherwise; with Steps 1 & 2 in place the identity-mismatch branch becomes unreachable on the happy path.

### Step 4 — Forensic logging

File: `supabase/functions/ai-agriculture-chat/runtime/decision-logger.ts` (or nearest existing logger)

- Emit `decision_authority_trace` once per turn containing: `layered.primary_rule_id`, `layered.rules_applied.length`, `decisionOutput.primary_decision.rule_id`, `decisionOutput.rules_applied.length`, `gate_reason`. Lets us prove A == final on every request.

### Step 5 — Tests

- Update `_tests/wave_r_no_rule_no_treatment_test.ts` to assert that when `evaluateRulesLayered` returns a primary, `RuleEngineExecutor.enrich` never overwrites `primary_decision.rule_id` and the invariant gate returns `PASS`.
- Add a new test: when `evaluateRulesLayered` returns `primary_decision = null`, `enrich` must NOT synthesise a `MONITOR_ONLY` primary (current `generateDefaultDecision` behaviour is removed).

## Out of scope

- No changes to `LayeredRuleEvaluator` internals, hypothesis scoring, observation mapping, or `unified-decision-gate.ts`. Those are working as designed; the bug is exclusively in who owns the output.

## Acceptance criteria

1. For the failing Marathi query, edge logs show `layered.primary_rule_id == decisionOutput.primary_decision.rule_id`, and `gate_reason ∈ {PASS, NO_RULES_FIRED_HARD_GATE}` — never `RULE_EMISSION_MISMATCH_HARD_GATE`.
2. `RuleEngineExecutor.execute` returns `primary_decision: null` when `authoritative_primary` is absent (no MONITOR_ONLY fallback).
3. Grep `rg "primary_decision\s*[:=]\s*\{" supabase/functions/ai-agriculture-chat` returns matches only in `layered-rule-evaluator.ts` and the new `buildDecisionOutputFromLayered` helper.
