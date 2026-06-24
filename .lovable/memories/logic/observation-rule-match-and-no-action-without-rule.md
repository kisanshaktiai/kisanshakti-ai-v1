---
name: Observation→Rule bridge + "no rule no recommendation" invariant
description: Symbolic brain invariants — observation symbols must satisfy visual_symptom conditions; treatment text NEVER ships when rules_fired = 0.
type: constraint
---

# Wave-Q symbolic invariants (DO NOT regress)

1. `matchesConditions()` in `agents/layered-rule-evaluator.ts` must satisfy `conditions.visual_symptom` either via the typed `state.visual_symptom` enum **OR** via `state.confirmed_observations` / `state.visual_symptoms` (normalized `UPPER_SNAKE_CASE`, substring-tolerant). Reverting to the enum-only check re-breaks the observation→rule bridge after lower_snake_case migrations.

2. `decision/unified-decision-gate.ts` young-crop block MUST NOT return `PROVIDE_OBSERVATION_ONLY` based on `confirmed_observation_has_safe_rule`. That bypass is informational only (log line). The symbolic engine must fire.

3. `index.ts` OBSERVATION-mode response path MUST consume `observationRuleHit.text` only when `rules_fired > 0`. With `rules_fired === 0` → fall back to `generateYoungCropMonitoringResponse(...)` and log `SymbolicInvariant` suppression. **Why:** `observationRuleHit.text` is a stored `decision_rules.action_text` that bypassed evaluation; emitting it violates "NO RULE FIRED → NO RECOMMENDATION".

4. `decision/diagnosis-first-generator.ts` `formatForClarificationUI` MUST build chip labels from `observation_label` only, never from `cause_label`. Strip labels containing treatment tokens (carbendazim/trichoderma/resow/mancozeb/कार्बेन्डाझ/पुनर्पेरण/seed treatment/dose…) and humanize `observation_key` instead. `cause` may still ride on the payload for backend routing but must never render.

Violations to flag: `source=rule_action_text` reaching the farmer; `bypass:confirmed_safe_rule_exists`; clarification chip containing chemical names; `rules_fired=0` with non-empty `products`/`dosages`/`action_text`.
