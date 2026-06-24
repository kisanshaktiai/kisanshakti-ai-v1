
# Fix: Neuro-Symbolic Brain Re-ordering — Hypothesis-First Diagnosis

## Root cause (confirmed via audit)

The orchestrator currently runs the **Understanding Gate at line ~4251** (before hypothesis arbitration at line ~6415). The flow is:

```text
Intent → Observation → Understanding Gate → CLARIFY
                                            ↑
                              (Hypothesis engine never reached)
```

Logs from trace `4df27292…` confirm: `understanding=VERY_LOW` → `Decision: CLARIFY from UNDERSTANDING_GATE` fires while the hypothesis evaluator (which has 346 hypotheses and the RICE germination rules R-…) is bypassed entirely. Confirmed observations (`germination_failure`, `poor_germination_percent`, `delayed_germination`) never get to compete in hypothesis space.

This matches the user's diagnosis: **the gate is gating on metadata completeness (severity/photo/affected_part) instead of on hypothesis competition quality (top score, spread, evidence strength).**

## What we will change

### Phase 1 — Re-order the pipeline (the core fix)

In `agents/orchestrator.ts`, move the hypothesis arbitration block (currently ~6415, `runCausalHypothesisArbitration`) to run **before** the Understanding Gate clarification branch (currently ~5143). New order:

```text
Intent
  ↓
Observation extraction + alias fan-out  (keep as-is)
  ↓
Hypothesis arbitration  (MOVED UP)
  ↓
Rule evaluation on scoped rules  (MOVED UP)
  ↓
Decision Readiness Gate  (NEW — replaces premature Understanding Gate)
  ↓
Clarification ONLY IF:
    • top_hypothesis_score < 0.55, OR
    • confidence_spread (top1 − top2) < 0.10, OR
    • no rule fired AND no terminal/emergency observation present
```

The existing `UnderstandingChecker` (severity/photo/affected_part) is demoted to an **input-quality signal** that feeds hypothesis scoring (small weight), not a hard gate.

### Phase 2 — Decision Readiness Gate

New module `decision/decision-readiness-gate.ts` (recreated; was deleted earlier). Inputs:
- `hypothesisResult.candidates[]` with scores
- `ruleEvaluationResult.firedRules[]`
- terminal/emergency observation flags

Output: `{ ready: true } | { ready: false, reason, targeted_clarification_observation_codes[] }`. Clarification questions are now **derived from the top hypothesis's missing evidence slots** (e.g. for `SEED_ROT`: ask soil moisture / rainfall / seed treatment), not from a generic severity/photo checklist.

### Phase 3 — Runtime instrumentation (mandatory for verification)

Add a single structured log per turn in `audit-logger.ts`:

```text
[BRAIN_TRACE] turn=<id>
  INTENT: EMERGENCE_FAILURE (0.82)
  OBSERVATIONS (confirmed=6, extracted=8, inferred=5): [...]
  HYPOTHESES (top 5): 1.SEED_ROT(0.71) 2.WATERLOGGING(0.66) 3.POOR_VIABILITY(0.59) ...
  RULES (fired): R-104, R-221
  DECISION: CLARIFY_TARGETED (missing: soil_moisture)  |  RESPOND
  GATE_REASON: spread<0.10
```

Without this we cannot prove the fix; with it we can audit any future regression.

### Phase 4 — Bypass guards (safety)

Keep terminal-damage and advisory-route bypass paths that already exist (~5139). Add one new bypass: if top hypothesis ≥ 0.70 AND a rule fires, skip clarification entirely.

### Out of scope (deliberately)

- No DB migrations. Observation→hypothesis coverage (20.8%) is a separate curation task (`hypothesis_conditions` rows) tracked elsewhere; the architectural fix unblocks the engine even at current coverage.
- No vocabulary unification yet (that is a multi-week effort).
- No reachability dashboard yet (Phase 4 of the user's roadmap) — add after runtime instrumentation lands.

## Files to edit

1. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` — re-order blocks; replace Understanding Gate clarification branch with Decision Readiness Gate call.
2. `supabase/functions/ai-agriculture-chat/decision/decision-readiness-gate.ts` — new file.
3. `supabase/functions/ai-agriculture-chat/agents/audit-logger.ts` — add `[BRAIN_TRACE]` structured log.
4. `supabase/functions/ai-agriculture-chat/agents/clarification-generator.ts` — accept `targeted_clarification_observation_codes` from readiness gate and derive questions from top hypothesis's missing slots (instead of generic completeness checklist).

## Verification

1. Deploy `ai-agriculture-chat`.
2. Re-run the RICE/DAS=16/EMERGENCE_FAILURE query.
3. Expect `[BRAIN_TRACE]` log showing ≥1 hypothesis with score ≥0.55 and at least one fired rule; expect the response to be a diagnostic answer (or a *targeted* clarification like "was there rainfall after sowing?"), **not** the current generic severity/photo clarification.
4. Confirm no regression on a healthy-crop query (should not over-diagnose).

## Risk

- Re-ordering a 9k-line orchestrator is high-risk. Mitigation: keep the old Understanding Gate code path behind a feature flag `BRAIN_ORDER_V2 = true` so we can flip back if a regression appears.
