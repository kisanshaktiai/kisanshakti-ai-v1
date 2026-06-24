---
name: Differential Builder Contract
description: DIAGNOSTIC_ESCALATION responses MUST carry ≥1 hypothesis and chips when symptoms exist; enrich via diagnostic-differential-enricher.
type: feature
---

When the Unified Decision Gate returns `ResponseMode.DIAGNOSTIC_ESCALATION`, the response handler in `supabase/functions/ai-agriculture-chat/index.ts` MUST:

1. Invoke `enrichDiagnosticDifferential()` from `decision/diagnostic-differential-enricher.ts` to derive `matched_rules[]` and `clarification_chips[]` from the symbolic hypothesis evaluator. Never pass `matched_rules: []` to `generateDiagnosticEscalationData`.
2. Expose chips via `metadata.clarification_options = { question, options[], selectionType: 'SINGLE_CHOICE' }` so the existing chip renderer surfaces them with no frontend change.
3. Enforce the **zero-hypothesis invariant**: if both the enricher and the gate produce zero hypotheses AND `symptom_keys.length > 0`, log `SYMBOLIC_CONTRACT_VIOLATION` and downgrade the response_mode to `OBSERVATION`. A DIAGNOSTIC_ESCALATION message with `hypotheses.length === 0` is a contract violation — never let it reach the farmer.
4. Set `current_confidence` to the real `symbolicConfidence` (not the hard-coded 0.4) so chip-driven boosts can deterministically cross the treatment threshold once Wave P-3 lands the feedback loop.

**Why:** Pre-Wave-P traces (e.g. `trace_mqq7c04q_5rgdhp`) collapsed to a single tautological yes/no question because `unified-decision-gate.ts:738` hard-coded `matched_rules: []`. This rule prevents regressions in any future escalation path.

**How to apply:** When adding a new branch that emits DIAGNOSTIC_ESCALATION, route through the enricher; do not bypass it. If the hypothesis evaluator cannot run (missing crop/stage), downgrade to OBSERVATION mode rather than emit a hollow escalation.
