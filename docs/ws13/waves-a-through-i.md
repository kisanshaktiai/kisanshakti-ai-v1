# WS13 — Waves A through I (Foundation Audit)

> Re-materialised 2026-06-22 from prior session summaries. The original `audit/evidence/ws13-cap-audit-waves-a-through-i.md` was not committed to git.

## Wave A / A.5 — Fail-closed CLARIFICATION_GATE + crop-aware pest guard
- `SAFETY_GATES_VERSION = 1.3.0` in `supabase/functions/ai-agriculture-chat/decision/safety-gates.ts`.
- A.5e: crop-aware pest guard added to `entity-normalizer.ts` (`ENTITY_NORMALIZER_VERSION = 1.1.0`).
- A.5f: observability marker `BYPASS_SYMBOLIC:HYBRID_NO_CROP` in `orchestrator.ts`.

## Wave B — Bundled-rule shadow mode
- `RULE_SOURCE = 'db' | 'bundled' | 'shadow'` flag in `runtime/feature-flags.ts`.
- `bundled-rules/db-rule-executor.ts` compares DB vs bundled rule firings in shadow mode.

## Wave C — Per-turn pipeline-drop attribution
- `runtime/funnel-tracker.ts` — `funnelStart(traceId)` invoked at the entry of every turn in `index.ts:260`.
- Every drop point emits a `funnelDrop(stage, reason)` record consumed by analytics.

## Wave D — Drop-point reason expansion
- Drop-reason taxonomy normalised across orchestrator (`index.ts:2494`) and decision brain.

## Wave E — Silent-match telemetry
- Discovered **42/47 (89 %)** of silent matches were `pre_brain_clarification` emissions where rules HAD fired but the orchestrator still asked a clarification question (see `index.ts:2346`).
- This finding seeded Waves I → M.

## Wave F — Clarification origin tag
- `metadata.clarification_origin ∈ {pre_rule_clarification, pre_brain_clarification, post_match_*, emergency_triage, hypothesis_differential, intentional_followup, intentional_gate}` written at emission.

## Wave G — Multi-match competition fix
See [`wave-g-multimatch-fix.md`](./wave-g-multimatch-fix.md).

## Wave H — Crop canonical realign
See [`wave-h-crop-canonical-realign.md`](./wave-h-crop-canonical-realign.md).

## Wave I — Attribution view
- `public.v_ai_clarification_attribution_90d` created — joins `clarification_origin`, `clarification_site`, `disposition`, `crop_context`, `rules_fired`, `top_confidence` into a single grouping view.
- The 12-site `disposition` map (`INTENTIONAL_*` vs `DEFECT_SUSPECT` vs `UNKNOWN`) is inlined in the view DDL.

## Exit state at end of Wave I

| Origin | Site | Disposition | Turns |
|---|---|---|---|
| `pre_brain_clarification` | `orch.intent_lock_all_filtered` | DEFECT_SUSPECT | 42 |
| `pre_rule_clarification` | `untagged` | UNKNOWN | 28 |
| `non_clarification` | `untagged` | UNKNOWN | 98 (DECISION_PROVIDED) + 9 (DIAGNOSTIC_ESCALATION) + 10 (GENERAL_LLM_DIRECT) |

The 42 `DEFECT_SUSPECT` rows became the explicit target of Waves J → L.
