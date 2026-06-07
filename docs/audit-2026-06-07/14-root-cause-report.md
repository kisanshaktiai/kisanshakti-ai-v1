# Forensic Root-Cause Report — AI Chat + Symbolic Decision Brain
**Date:** 2026-06-07  
**Scope:** End-to-end confidence pipeline + accuracy/crop-lifecycle path  
**Architecture:** preserved — only repair, harden, stabilize.

---

## Executive summary

Two unrelated bug classes produced the observed symptoms:

1. **Confidence=0 everywhere** is caused by a JavaScript operator-precedence bug in `ui-response-builder.ts:195`, compounded by a narrow fallback chain in the confidence bridge and a floor-leak in the invariant guard.
2. **Wrong answers on harvested lands** are caused by missing `NO_ACTIVE_CROP` short-circuit and an incomplete intent regex (already partially mitigated in the previous turn).

Both classes are fixed in this round. Architecture, DB schema (column names), graph topology, and rule data are untouched.

---

## RCA table

| # | Issue | Evidence | Root cause | Impact | Severity | Fix | Validation |
|---|---|---|---|---|---|---|---|
| 1 | Farmer-visible confidence shown as 0 / 0.5 | `ui-response-builder.ts:195` reads `safeMeta.confidence ?? safeGate.confidence_level ? parse(gate) : 0.5` | `??` binds tighter than `? :` in JS; the numeric `safeMeta.confidence` is dropped. Final value is either `parseConfidenceLevel(gate)` or the `0.5` floor — never the actual symbolic score. | Every chat bubble + advisory card understates confidence; mode-driven UI gates trip incorrectly | **Critical** | Explicit numeric-first resolution chain: `safeMeta.confidence → safeDecision.confidence_score → safeGate.decision_confidence (normalized) → parseConfidenceLevel(level) → 0.5`. | `tests/chat/confidence-pipeline.test.ts` |
| 2 | `INVARIANT … symbolic_confidence=0` repeated in logs | `index.ts:1334-1338` only read `weighted_confidence ?? confidence_score ?? 0` from `layered_rule_result.primary_decision` | The layered evaluator and orchestrator write to several confidence keys depending on the path (`primary_decision.score`, `primary_decision.rule_confidence`, `hypothesis_result.hypothesis_score`). Any path that didn't set the first two left confidence at 0. | Treatment-allowed gate decisions were being suppressed by the 0-floor and forced into clarification | **Critical** | Widened fallback chain to 7 sources (layered → primary → hypothesis → metadata). | Same test |
| 3 | When the invariant fires, downstream surfaces still see 0 | `index.ts:1371` set `unifiedGateInput.decision_confidence = 50` but left `symbolicConfidence` const = 0 | The floor patched only the gate input; metadata, persistence, and UI builder still read the original `symbolicConfidence` | UI shows 0 even after the invariant log printed a floor | **High** | Convert const to `let`, mutate the SSOT, propagate to `orchestratorResponse.metadata.confidence` and `.confidence_score`. | Manual log check + test |
| 4 | DB column drift: code references `symbolic_confidence`, table has `confidence_score` | `\d ai_decision_log` shows no `symbolic_confidence`; logs reference that name | Old naming retained in log strings after a prior migration | Confusing log labels; future queries break | **Low (cosmetic)** | Not fixed in this round (schema-frozen per your boundary). Log labels remain readable; audit doc records the drift. | n/a |
| 5 | Diagnostic flow on harvested land | Reproduced in earlier "Khari" trace | `canonical-context-contract` threw on missing crop, forcing diagnostic path | Wrong answers, leaked `{symptom}` token | Critical | Already implemented in previous turn (`NO_ACTIVE_CROP` status, last-harvested fallback, template guard) | `static-data-gate` + manual repro |
| 6 | Marathi past-tense crop-lookup missed | Previous trace | Regex used `पीक` (ी), user typed `पिक` (ि) and `होते` | Wrong responder | High | Already implemented previous turn | Regex now covers both |

---

## Confidence pipeline (field-level trace, post-fix)

```
decision_rules.confidence_score (DB, 0..1)
   │
   ▼
symbolic-reasoner.ts → match.confidence (0..1)
   │
   ▼
layered_rule_result.primary_decision.{weighted_confidence|confidence_score|rule_confidence|score}
   │
   ▼  ← index.ts:1334 (NEW fallback chain)
symbolicConfidence (let, mutable, NaN/range-guarded)
   │  ├─► unifiedGateInput.decision_confidence  (0..100)
   │  ├─► orchestratorResponse.metadata.confidence       (0..1)   ← NEW propagate
   │  └─► orchestratorResponse.metadata.confidence_score (0..1)   ← NEW propagate
   │
   ▼
ui-response-builder.ts → safeMeta.confidence (0..1)
   │  ← :195 (NEW explicit precedence; numeric-first)
   ▼
UIResponseContract.context.decision_confidence (0..1)
   │
   ▼
Frontend: DecisionBrainCards.tsx:347, CanonicalAdvisoryCard, FarmerMessageCard
   (Math.round(value * 100), clamped 0..100)
```

Every node now carries the **same numeric value**; the only conversion is the final `* 100` for display.

---

## What we did NOT change

- Symbolic engine, hypothesis evaluator, rule data — all preserved.
- Graph topology and orchestrator routing — preserved.
- Frontend rendering — preserved (it was already correct after the previous `* 100` fix).
- `ai_decision_log` schema — preserved (column-drift logged as cosmetic).

---

## Validation

- `tests/chat/confidence-pipeline.test.ts` — locks both fixes against regression.
- Manual: after deployment, send any sugarcane diagnostic query and verify the edge-function log line `📊 [ConfidenceBridge] symbolic_confidence=` shows a non-zero value, and the rendered advisory card displays the same percentage.
