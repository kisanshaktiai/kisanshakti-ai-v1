# Wave-Q — Symbolic bridge restoration

**Problem (from edge-function trace).** Selected observation `OBS_RICE_NO_EMERGENCE` produced:

- `Rules evaluated: 201, Rules matched: 0` → `RULE_DATA_INTEGRITY_ERROR`
- Then a young-crop bypass emitted `RICE_GERMINATION_RESOW_DECISION_001.action_text` (Carbendazim + Trichoderma + resow) directly, with `source=rule_action_text` and `rules_fired=0`.
- Turn-1 clarification chip showed the Marathi prescription instead of the symptom label.

## Three independent root causes (P0)

| ID | File · Line | Defect |
|----|-------------|--------|
| P0-A | `agents/layered-rule-evaluator.ts:376` | `matchesConditions` only checked the typed `VisualSymptom` enum; `state.visual_symptom` was `UNKNOWN` so every rule with a `visual_symptom` requirement failed even when `confirmed_observations=['OBS_RICE_NO_EMERGENCE']`. |
| P0-B | `decision/diagnosis-first-generator.ts:762-787` | Chip `label` combined `cause_label` (a hypothesis decision narrative) with `observation_label`; translation expanded `cause` into the full Marathi prescription. |
| P0-C | `decision/unified-decision-gate.ts:686-722` + `index.ts:1996-1999` | `confirmed_observation_has_safe_rule` returned `PASS + OBSERVATION` and `index.ts` set `responseContent = observationRuleHit.text` — emitting `decision_rules.action_text` while `rules_fired = 0`. |

## Fixes shipped

1. **`matchesConditions` is now observation-aware (P0-A).** Normalizes a state symbol set from `confirmed_observations` + plural `visual_symptoms` + singular `visual_symptom`; a `visual_symptom` condition is satisfied via enum match OR by symbol-set intersection (UPPER_SNAKE_CASE, substring-tolerant). No agronomy, no rule allowlists.
2. **Chip labels = observation labels only (P0-B).** `formatForClarificationUI` builds labels from `observation_label`; if missing or token-matched as treatment (carbendazim/trichoderma/resow/mancozeb/कार्बेन्डाझ/पुनर्पेरण/…) it falls back to humanized `observation_key`. `cause_label` is no longer rendered. Final filter drops any chip whose label still reads like treatment.
3. **`bypass:confirmed_safe_rule_exists` removed (P0-C).** The young-crop branch now logs the observation→rule match for telemetry only and falls through to the standard CLARIFICATION/ESCALATION path. The symbolic engine must produce the recommendation.
4. **Symbolic invariant in `index.ts`.** OBSERVATION-mode path consumes `observationRuleHit.text` only when `rules_fired > 0`. Otherwise serves `generateYoungCropMonitoringResponse(...)` and emits `🚫 [SymbolicInvariant]` log.

## Expected behaviour after fix

**Turn 1** — `पिक अद्याप उगवले नाही`
- Chip label = `भात अजून उगवले नाही` (observation), no Carbendazim/Trichoderma/resow text.

**Turn 2** — farmer selects `OBS_RICE_NO_EMERGENCE`
- `Rules matched ≥ 1`, primary decision present, no `RULE_DATA_INTEGRITY_ERROR`, no `source=rule_action_text`, no `bypass:confirmed_safe_rule_exists`.
- If the symbolic engine still does not fire, response = neutral monitoring template (no chemical names).

## Invariants (locked)

```
IF rules_fired === 0
THEN actions_returned === 0
  AND no products, dosages, action_text, or prescription text in response_content
```

```
clarification.label MUST originate from observation_label
NEVER from cause / action_text / recommendation / treatment text
```

Memory: `mem://logic/observation-rule-match-and-no-action-without-rule`.

## Files edited
- `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` (matchesConditions observation gate)
- `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts` (formatForClarificationUI label purity)
- `supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts` (removed YOUNG CROP BYPASS)
- `supabase/functions/ai-agriculture-chat/index.ts` (rules_fired>0 gate on observationRuleHit emission)

## Out of scope
No schema changes, no per-crop branches, no new agronomy constants, no rule rows touched.
