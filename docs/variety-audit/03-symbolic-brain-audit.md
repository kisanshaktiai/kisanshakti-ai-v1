# 03 — Symbolic Decision Brain Audit

Pipeline traced: `supabase/functions/ai-agriculture-chat/`

```text
agents/orchestrator.ts
  → llm-understanding-layer.ts
  → decision/observation-code-mapper.ts
  → decision/symbolic-reasoner.ts            ← confidence weighting site
  → decision/hypothesis-evaluator.ts         ← hypothesis ranking site
  → layers/rule-evaluation-layer.ts
  → decision/unified-decision-gate.ts
  → decision/diagnosis-first-generator.ts    ← deterministic builder
  → decision/response-generator.ts           ← narration
```

## 1. Variety Awareness — Current State

`grep variety` across this tree returns matches only in `context-authority.ts`, `authoritative-state-loader.ts`, `orchestrator.ts`. They carry `crop_variety` **as a text string** sourced from `crop_schedules.crop_variety`. Nothing in the decision graph consults `master_products` or `variety_resistance`.

There is **no `VarietyContext` loaded in the chat pipeline today.** The Phase 3 loader exists only in `ai-smart-schedule`.

## 2. Required Integration Points

### 2.1 Resistance-Aware Confidence (highest leverage)
Site: `decision/symbolic-reasoner.ts` + `decision/hypothesis-evaluator.ts`

When a candidate hypothesis maps to an observation that has a `variety_resistance` row for the active variety, multiply hypothesis confidence by:

| Resistance level | Multiplier |
|---|---|
| HR | 0.20 |
| R  | 0.35 |
| MR | 0.65 |
| MS | 1.10 |
| S  | 1.25 |
| HS | 1.40 |
| unknown / no row | 1.00 |

Multiplier is applied *after* base symbolic confidence per `mem://architecture/symbolic-confidence-ssot-authority` so the SSOT remains the rule engine — variety merely modulates.

**Blocker:** §3.1 of the DB audit. Resistance rows currently can't be joined to observations.

### 2.2 Recommendation Suppression
Site: `decision/prescription-gate-enforcer.ts` + `decision/diagnosis-first-generator.ts`

For any recommendation classed `chemical_spray` whose target observation is R/HR for the active variety, the deterministic builder MUST:
- replace with `MONITORING` task (per project Core rule allowing monitoring substitution when resistance is high), and
- preserve audit trail in `ai_decision_log` with `reason: 'variety_resistance_HR'`.

Exception preserved: `agronomic-safety-and-negligence` memory — emergency pests (e.g. shoot borer) still bypass monitoring substitution.

### 2.3 Variety Narration
Site: `decision/response-generator.ts`

Currently surfaces `crop_variety` text verbatim. Required: when `VarietyContext.label_<lang>` exists, narrate in the canonical language per `mem://architecture/canonical-language-governance` (Devanagari for hi/mr, etc.) and strip any ALL_CAPS variety codes from farmer-visible copy. Code/brand stays in metadata.

### 2.4 Crop-Identity Context
Site: `decision/context-authority.ts` `LandContext`

Extend `LandContext` with `variety_context?: VarietyContext` and resolve it from `lands.current_crop_variety_id` at load time (single round trip). The orchestrator already loads `landContext`; the loader should be the shared `_shared/variety-context.ts` extracted in step 4 of the backlog.

## 3. Memory Cross-Checks

| Memory | Required alignment |
|---|---|
| `symbolic-confidence-ssot-authority` | Multiplier applied after base confidence; never replaces it. |
| `deterministic-response-builder` | Variety substitution happens before the 10-section builder runs. |
| `agronomic-safety-and-negligence` | Emergency pests bypass monitoring substitution. |
| `farmer-response-json-contract` | New optional field `variety_resistance_applied: {level, observation_code}` in section metadata. |
| `canonical-language-governance` | Variety name surfaced in `label_<lang>` not `name`. |
| `intent-observation-mapping-integrity` | Resistance lookup uses canonical `observation_code` (post §3.1 fix). |
| `prescription-gate-evidence-override` | Strong biotic evidence still overrides variety-resistance suppression. |

## 4. Acceptance Tests (for the implementation round)

1. Given variety with `HR` to `SC_DISEASE_RED_ROT_*`, a chat that flags red-rot symptoms produces **no** carbendazim recommendation; it produces a monitoring task with `reason: 'variety_resistance_HR'` in `ai_decision_log`.
2. Hypothesis confidence for red-rot drops below 0.5 in `ai_decision_log.symbolic_confidence`.
3. Farmer-visible narration mentions the variety in the canonical language and never includes its ALL_CAPS code.
4. Emergency pest (shoot borer) still produces treatment recommendation regardless of resistance row.

## 5. Risk Notes

- **Confidence drift:** Without re-tuning thresholds in `calibrated-confidence-thresholds`, the 0.20× multiplier could push HR hypotheses below the clarification threshold and create chatty re-questioning. Recalibrate per crop after rollout.
- **Data quality:** Resistance rows curated from breeder catalogs are not always farm-realistic. Add `variety_resistance.trial_score` weighting so weakly-sourced HR claims don't fully suppress recommendations.
- **Multi-variety lands:** intercrop varieties are currently text; until §3.3 of DB audit is fixed, resistance gating applies only to the primary crop variety.
