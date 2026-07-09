
# Observation-State Contract Fix — Single Phase

## Root cause (from edge log + code audit)

The runtime conflates three distinct epistemic classes into one "symptom_count":
- **candidate** (UI options loaded from `intent_observation_mapping`)
- **inferred** (alias expansion, LLM extraction, IOM LITERAL peers)
- **confirmed** (farmer tapped an option / explicit statement / photo)

`ClarificationTrigger` sees `real_symptom_count=13` (mostly INFERRED) → declares `SUFFICIENT_SYMPTOM_COVERAGE` → overwrites `[UnderstandingChecker].ClarificationRequired=true` and `[OBS_TO_HYP_GAP].action=route_to_clarification_question` → graph runs with `confirmed=2, hyp=0` → rules fire without evidence. Terminal-damage shortcut compounds this by skipping observation graph entirely.

Fix is crop-agnostic, DB-driven, no new agronomic logic.

---

## Patches (single phase, ordered)

### Patch 1 — Three-state Observation Contract
**File:** `supabase/functions/ai-agriculture-chat/runtime/observation-state.ts` (new)

```ts
interface ObservationState {
  candidate_observations: string[];   // UI only
  inferred_observations:  string[];   // ranking / hypothesis prior only
  confirmed_observations: string[];   // ONLY input allowed into OBS_TO_HYP
}
```

Frozen per turn. Built from `AuthoredObservationSet`:
- `CONFIRMED` authority → `confirmed_observations`
- `EXTRACTED` authority (pattern match on farmer's own text) → `confirmed_observations`
- `INFERRED` / `SYNTHETIC` (alias expand, IOM LITERAL peer, cross-crop, LLM guess) → `inferred_observations`
- Loaded IOM candidates not yet chosen → `candidate_observations`

### Patch 2 — ClarificationTrigger uses confirmed-only
**File:** `runtime/conversation-state.ts`, `agents/clarification-generator.ts`, and wherever `SUFFICIENT_SYMPTOM_COVERAGE` / `real_symptom_count` is computed for the gate.

- `informative_count` and `coverage` must count `confirmed_observations` ONLY (drop INFERRED from the coverage numerator).
- Replace gate with:
  ```
  if (diagnosticIntent && confirmed_observations.length === 0) {
    clarification_required = true;
    reason = 'no_confirmed_observations';
    // load & return candidate_observations for UI
  }
  ```
- Remove any path where INFERRED codes flip `should_clarify` to false.

### Patch 3 — Graph gate before OBS_TO_HYP
**File:** `agents/orchestrator.ts` (at TURN_EVIDENCE_LOCK, before `evaluateCandidateHypotheses`).

```
if (diagnosticIntent && confirmed_observations.length === 0) {
  return {
    state: 'WAITING_FOR_OBSERVATION',
    source: 'intent_observation_mapping',
    candidate_observations,
  };
}
```

Emits `[OBS_GATE] awaiting_confirmed_observations` and short-circuits into ClarificationEngine.

### Patch 4 — Remove terminal-damage rule-engine shortcut
**Files:** `agents/diagnostic-flow-controller.ts`, `runtime/diagnosis-only-mode.ts` (or wherever `TERMINAL_DAMAGE → RULE_ENGINE` bypass lives).

Replace bypass with:
```
if (terminalDamage) {
  hypothesisPriorityBoost = true;
  // still runs OBSERVATION_GRAPH → OBS_TO_HYP → HYP_TO_RULE
}
```

Terminal codes only *raise priority* of matching hypotheses; they never skip observation confirmation. Retains sovereignty of the symbolic graph.

Note: this supersedes `.lovable/memories/logic/diagnosis-only-mode-terminal-damage-v1.md`; memory will be updated to reflect the new invariant.

### Patch 5 — Impossible-state invariant
**File:** `runtime/graph-contracts.ts` (extend existing module).

```
export function assertObservationRequiredWhenNoHypothesis(ctx) {
  if (ctx.diagnosticIntent
      && ctx.hypotheses.length === 0
      && ctx.observation_required === false
      && ctx.graphExecuted) {
    throw new GraphContractViolation(
      'IMPOSSIBLE_STATE: diagnostic intent + 0 hypotheses + observation_required=false'
    );
  }
}
```

Called at orchestrator exit. Dev = throw; prod = log `[GRAPH_CONTRACT_VIOLATION]` + force `observation_required=true` + route to clarification (fail-closed).

### Patch 6 — Regression tests
**File:** `supabase/functions/ai-agriculture-chat/tests/observation-state-contract_test.ts` (new)

Parametrized across Rice / Sugarcane / Cotton / Tomato / Onion:
- T1: farmer text with 0 confirmed + N inferred → `clarification_required=true`, candidates returned, graph NOT executed.
- T2: farmer selects 1 candidate → moves to `confirmed_observations`, OBS_TO_HYP runs.
- T3: terminal damage present, 0 confirmed → still routes to observation graph with priority boost (no rule-engine bypass).
- T4: `hypotheses=0 && observation_required=false && diagnosticIntent=true` → `GraphContractViolation` in dev.
- T5: INFERRED-only evidence never satisfies coverage gate.

---

## Files touched

- **new**: `runtime/observation-state.ts`, `tests/observation-state-contract_test.ts`
- **edit**: `runtime/conversation-state.ts`, `runtime/evidence-coverage.ts`, `runtime/graph-contracts.ts`, `agents/orchestrator.ts`, `agents/diagnostic-flow-controller.ts`, `agents/clarification-generator.ts`, `runtime/diagnosis-only-mode.ts` (if present), `runtime/navigator-response.ts`
- **memory**: update `logic/diagnosis-only-mode-terminal-damage-v1.md` to record the removal of the rule-engine bypass

## Contracts added

1. `OBSERVATION_STATE_CONTRACT` — three disjoint sets; only `confirmed` enters graph.
2. `CLARIFICATION_TRIGGER_CONTRACT` — coverage computed on confirmed-only.
3. `OBS_GATE_CONTRACT` — diagnostic intent + 0 confirmed ⇒ `WAITING_FOR_OBSERVATION`.
4. `TERMINAL_DAMAGE_CONTRACT` — priority boost, never bypass.
5. `HYPOTHESIS_INVARIANT_CONTRACT` — `hyp=0 ∧ obs_required=false ∧ diagnostic` is impossible.

## Expected before/after trace (rice emergence turn)

**Before:** `confirmed=2 inferred=13 hyp=0 clarify=false observation_required=false` → rule fallback.

**After:** `confirmed=0 inferred=13 candidates=8 clarify=true reason=no_confirmed_observations observation_required=true` → farmer sees selectable options → on tap → `confirmed=1` → OBS_TO_HYP → hypotheses ≥ 1 → HYP_TO_RULE → decision.

## Non-goals

- No DB schema changes.
- No new LLM prompts or agronomic reasoning in TypeScript.
- No crop-specific code paths.
- No changes to `intent_observation_mapping`, `observation_master`, `hypothesis_conditions`, or `decision_rules`.
