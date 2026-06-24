# Neuro-Symbolic Decision Brain — Architectural Refactor

## 1. Current Broken Flow (audit findings)

Authority over `response_mode` / `clarification_required` / `recommendation_allowed` is **fragmented across 8+ files**. Each can independently mutate state, so the "ambiguity → clarification" invariant is repeatedly overridden by "rules matched → emit recommendation" shortcuts.

Concrete violations found:

| # | File | Lines | Violation |
|---|------|-------|-----------|
| V1 | `agents/orchestrator.ts` | 4350, 4355, 4874 | Sets `understandingResult.clarification_required = false` whenever photo codes ≥2 OR `diagnosisOnlyModeActive` (rules-matched ⇒ certainty) |
| V2 | `agents/orchestrator.ts` | 4923-4933 | `isTerminalOrSignificantWithLandContext` bypasses `evidenceInsufficient` based on rule-derived damage taxonomy, not on competing-hypothesis count |
| V3 | `agents/orchestrator.ts` | ~7028-7065, ~7549-7684 | `RuleEngineExecutor` rebuilds `primary_decision`, `rules_applied`, `matched_responses` after layered evaluator already produced them — competing authority |
| V4 | `decision/symbolic-invariant-gate.ts` | 156, 222 | Mutates `decisionOutput.response_mode = 'OBSERVATION'` from a gate that should be read-only |
| V5 | `decision/unified-decision-gate.ts` | 84-194 (`applySuppressionGuard`) | Reverses FAIL → PASS purely because "rules fired"; encodes `rulesMatched > 0` as proof of certainty |
| V6 | `index.ts` | 1838-1839, 1928 | Rewrites `unifiedGateResult.response_mode` after the fact (safety override + zero-hypothesis downgrade) |
| V7 | `agents/clarification-generator.ts`, `dynamic-clarification-generator.ts` | multiple | Generate generic yes/no questions (no information-gain ranking); clarification answers re-enter as plain text, not as `OBS_*` evidence nodes |
| V8 | `decision/decision-readiness-gate.ts` + `unified-decision-gate.ts` + `prescription-gate-enforcer.ts` | n/a | Three "readiness" gates with overlapping rules — no single certainty model |
| V9 | `agents/diagnostic-flow-controller.ts` | 69-79 | Owns its own `DiagnosticStatus` state machine, independent of the authority pipeline |

There is **no graph** — `evidence`, `hypothesis`, `diagnosis`, `rule`, `recommendation` are all flat fields on `decisionOutput`. There is **no certainty model** — confidence is recomputed inline in 5+ places. There is **no information-gain ranker** — clarifications come from `differential-diagnosis-clarifier.ts` heuristics. There is **no telemetry** identifying which component wrote which field.

## 2. Target Flow

```text
Farmer Reality
      │
      ▼
┌─────────────────────────┐
│  Evidence Graph         │  OBS_* nodes (text, photo, clarification answers, sensor)
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│  Context Graph          │  crop, stage, DAS, weather, soil, NDVI, land
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│  Hypothesis Graph       │  competing causes w/ prior + posterior confidence
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│  Diagnosis Graph        │  arbitrated hypotheses + contradictions
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│  Rule Graph             │  decision_rules matched against diagnosis nodes
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│  Recommendation Graph   │  actions, products, dosages, PHI, contingencies
└─────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────────┐
│           DiagnosticDecisionAuthority  (SSOT)                  │
│  Reads all graphs → emits ONE AuthorityDecision:               │
│    diagnostic_state, response_mode, clarification_required,    │
│    recommendation_allowed, diagnostic_certainty                │
└────────────────────────────────────────────────────────────────┘
      │
      ▼
Read-only Unified Gate → Response Generator (formatting only) → LLM Translation
```

## 3. New Modules

```
decision/
  graph/
    evidence-graph.ts          # OBS_* nodes; mutateFromClarification()
    context-graph.ts           # crop/stage/weather/soil/NDVI
    hypothesis-graph.ts        # candidates + priors
    diagnosis-graph.ts         # arbitrated diagnoses + contradictions
    rule-graph.ts              # matched decision_rules
    recommendation-graph.ts    # actions/products/dosages
    graph-types.ts             # node/edge interfaces + provenance
  authority/
    diagnostic-certainty-model.ts   # ONE function: computeCertainty(graphs) → number + breakdown
    diagnostic-decision-authority.ts # SSOT writer for diagnostic_state, response_mode, clarification_required, recommendation_allowed
    information-gain-engine.ts       # ranks candidate clarification questions by H(hypotheses|answer)
  telemetry/
    authority-trace.ts          # logs {field, old, new, source, trace_id} for every mutation
```

## 4. Certainty Model (single source of truth)

```ts
// diagnostic-certainty-model.ts
computeCertainty({ evidence, hypothesis, diagnosis, rules }) => {
  evidence_coverage,         // required_obs_for_top_hyp ∩ confirmed
  contradiction_score,       // negated evidence count
  competing_hypotheses,      // hypotheses with conf > 0.3
  observation_confidence,    // mean of evidence node confidences
  visual_confidence,         // photo-derived contribution
  rule_confidence,           // top rule's weighted_confidence
  certainty                  // weighted aggregate ∈ [0,1]
}
```

`DiagnosticDecisionAuthority.decide(certainty, graphs)` returns:

```
if competing_hypotheses > 1
   || required_observations_missing > 0
   || certainty < THRESHOLD
   || visual_confirmation_required
→ response_mode=CLARIFICATION, clarification_required=true,
  recommendation_allowed=false
else if certainty ≥ TREATMENT_THRESHOLD && rule_graph.has_match
→ response_mode=TREATMENT, recommendation_allowed=true
else
→ response_mode=OBSERVATION
```

## 5. Information Gain Engine

Question selector:

```
score(q) = H(hypothesis_graph) − E_a[H(hypothesis_graph | q=a)]
```

Inputs: current `hypothesis_graph`, candidate questions from `observation_differential_questions` + `decision_rules.required_observations`. Returns top-N questions whose answers most reduce entropy. **No generic questions** — every question must reference at least one OBS code that splits ≥2 candidate hypotheses.

## 6. Clarification → Evidence Mutation Contract

`clarification-generator.ts` emits options as `{label, value, observation_key, polarity}`. The receiving turn calls `evidence-graph.mutateFromClarification(answers)` which creates `OBS_*` nodes with `source='CLARIFICATION'`, then re-runs hypothesis/diagnosis/rule graphs. Clarification text is **never** re-fed to the LLM as free text.

## 7. Patches to Existing Files

| File | Change |
|---|---|
| `agents/orchestrator.ts` | Remove all `understandingResult.clarification_required = false` assignments (4350, 4355, 4874). Remove `evidenceInsufficient` / `isTerminalOrSignificantWithLandContext` block (4878-4933). Replace with call to `DiagnosticDecisionAuthority.decide()`. Remove inline `primary_decision` rewrites in `SymbolicMerge` and OPTION_SELECTED paths |
| `agents/rule-engine-executor.ts` | Demoted to `enrich()` only — economics, contingency, follow-up, audit_trail. Remove all `primary_decision` / `rules_applied` / `matched_responses` writes |
| `agents/layered-rule-evaluator.ts` | Wrap output into `rule-graph` projection; no direct mutation of `decisionOutput` |
| `decision/unified-decision-gate.ts` | Convert to **read-only validator**. Delete `applySuppressionGuard`'s FAIL→PASS reversal entirely. Gate may emit `validation_errors[]` but **never** writes `response_mode`, `treatments_allowed`, `clarification_required` |
| `decision/symbolic-invariant-gate.ts` | Lines 156, 222: stop mutating `decisionOutput.response_mode`. Emit `invariant_violation` event read by `DiagnosticDecisionAuthority` instead |
| `decision/decision-readiness-gate.ts` | Delete file (folded into Authority + Certainty model) |
| `decision/differential-diagnosis-clarifier.ts` | Replace heuristic ranker with call to `information-gain-engine.ts` |
| `agents/clarification-generator.ts` + `dynamic-clarification-generator.ts` | Return `{questions, options[]}` typed against `observation_key` only; remove free-text fallback |
| `index.ts` | Lines 1838-1839, 1928: remove `unifiedGateResult.response_mode =` rewrites. Route through `DiagnosticDecisionAuthority.revise()` if safety/zero-hypothesis events fire |
| `agents/understanding-completeness-checker.ts` | Becomes an evidence-graph contributor only; does not set `clarification_required` |
| `agents/diagnostic-flow-controller.ts` | Drop its private `DiagnosticStatus`; consume `DiagnosticDecisionAuthority.diagnostic_state` |

## 8. Telemetry Contract

Every write to `diagnostic_state`, `response_mode`, `clarification_required`, `recommendation_allowed` goes through `authority-trace.log({field, old, new, source, trace_id, certainty_snapshot})`. CI test asserts that **only files in `decision/authority/`** call `authority-trace.log` as writer; all other modules are read-only consumers.

## 9. Regression Tests (new `_tests/`)

```
_tests/neurosymbolic_graph_authority_test.ts
  - Input: "भात अजून उगवले नाही" (no land context, no photo)
    Expect: response_mode = CLARIFICATION,
            clarification_required = true,
            questions.length >= 3,
            questions all reference distinct OBS_* codes,
            recommendations.length === 0,
            certainty < TREATMENT_THRESHOLD

  - Input: same + clarification answers {SEED_ROT=yes, WATERLOGGING=no}
    Expect: evidence_graph has 2 new OBS nodes,
            hypothesis_graph updated, competing_hypotheses == 1,
            response_mode = TREATMENT,
            recommendations.length >= 1

_tests/single_authority_invariant_test.ts
  - Static grep: no file outside decision/authority/ assigns response_mode,
    clarification_required, recommendation_allowed, diagnostic_state
  - Runtime: every authority-trace.log entry's `source` ∈ allowlist

_tests/information_gain_engine_test.ts
  - With 3 competing hypotheses sharing 1 OBS and differing on 2,
    selected question MUST be one that discriminates the 2 differing OBS

_tests/no_rulesmatched_bypass_test.ts
  - With rules_matched > 0 but competing_hypotheses == 2,
    response_mode MUST remain CLARIFICATION
```

## 10. Rollout

1. Add new graph/authority/telemetry modules (no behavior change yet, shadow-mode logs).
2. Flip `DiagnosticDecisionAuthority` to authoritative; demote `RuleEngineExecutor`, `unified-decision-gate`, `symbolic-invariant-gate` to read-only.
3. Delete dead bypass branches in `orchestrator.ts` + `index.ts`.
4. Add regression suite; block deploy on failure.
5. Edge function redeploys automatically.

## Out of Scope

- `LayeredRuleEvaluator` internal scoring (kept as-is, output projected into rule-graph)
- `observation_master` / `decision_rules` schema changes (consumed unchanged)
- Frontend chat renderer (already option-aware after prior fix)
