## Wave P — Neuro-symbolic decision brain: differential + feedback loop fix

### Root cause (deep audit findings)

Recent trace `trace_mqq7c04q_5rgdhp` (Rice, NURSERY, DAS 15, confidence 0.55):

```
UnifiedGate → PARTIAL → DIAGNOSTIC_ESCALATION
generateDiagnosticEscalationData({ ..., matched_rules: [] })   ← line 738
                          ↓
index.ts → matched_rules: orchestratorResponse.metadata?.matchedRules || []   ← line 1874
                          ↓
hypotheses = []  → response = intro + "current 55% / threshold 70%" + expert note
                          ↓
Farmer sees ONE generic yes/no question. No causes. No chips. No way to advance.
```

Five concrete defects:

1. **Hypothesis pipe is dead.** `matched_rules` is hard-coded `[]` in `unified-decision-gate.ts:738`, and the orchestrator only populates `metadata.matchedRules` inside the `DIAGNOSIS_ONLY` early-return branch (orchestrator.ts:6810). The escalation path never receives candidates.
2. **No environmental priors.** `generateDiagnosticEscalationData` ignores NDVI / weather / DAS-band / variety priors when ranking causes. DB has `disease_risk_model`, `hypothesis_conditions`, `land_weather_metrics`, `ndvi_data`, `crop_baseline_guidelines_v2` — none consulted.
3. **No selectable observation chips.** Escalation emits plain markdown. `dynamic-clarification-generator.ts` + `clarification-renderer.ts` (chip UI contract) exist but are not wired into the DIAGNOSTIC_ESCALATION response.
4. **No feedback loop.** When farmer taps a candidate cause, there's no orchestrator path that asserts the chosen `observation_code`, boosts symbolic confidence, and re-runs the hypothesis evaluator + rule engine for a final diagnosis.
5. **Threshold gate is symptom-blind.** `current_confidence: 0.4` hard-coded at line 739 — should be the real symbolic confidence so chip-driven boosts can cross the 0.7 treatment threshold deterministically.

### What we build

**Stage 1 — Populate the differential (server)**
- New `agents/differential-builder.ts`:
  - Inputs: `crop_name`, `growth_stage`, `DAS`, `symptom_keys`, `ndvi_value`, `weather_window`, `variety`, `soil_class`.
  - Pulls candidate causes from: matched-but-sub-threshold `decision_rules`, `hypothesis_master` joined to `hypothesis_conditions`, `disease_risk_model` (env-conditional), and `observation_intent_master` (symptom→cause).
  - Re-ranks via weighted prior: `0.45·symbolic_match + 0.20·env_fit(NDVI+weather) + 0.15·stage_fit(DAS band) + 0.10·variety_resistance + 0.10·base_prevalence`.
  - Returns top-5 `DifferentialCandidate[]` with `cause_code`, `cause_name`, `confidence`, `supporting_evidence[]`, `confirming_observation_codes[]` (the chip values).
- `unified-decision-gate.ts:732-741`: pass real `current_confidence` (from `input.symbolic_confidence`) and call `differentialBuilder` before constructing `escalationData`. Populate `matched_rules`.
- `index.ts:1868-1882`: stop reading the empty `metadata.matchedRules` — read the differential from `unifiedGateResult.diagnostic_escalation.hypotheses`.

**Stage 2 — Observation chips in the response (server + frontend contract)**
- Extend `DiagnosticEscalationData` with `clarification_chips: ClarificationOption[]` — each chip is `{ id, observation_code, label_i18n, hypothesis_id, confidence_lift, icon }`.
- New renderer `decision/diagnostic-escalation-renderer.ts`: produces the structured payload the chat UI already consumes (same contract as `clarification-renderer.ts` so the existing `OptionChips` component renders it without UI changes).
- `index.ts` response assembly: attach `metadata.clarification_options = escalation.clarification_chips` and set `orchestratorResponse.type = 'CLARIFICATION_DIAGNOSTIC'` so the frontend renders chips + markdown together.

**Stage 3 — Confidence-boost feedback loop**
- New orchestrator intent `INTENT_ASSERT_OBSERVATION`:
  - Triggered when the next user turn carries `metadata.selected_observation_code` from a chip tap.
  - Adds the asserted observation with `assertion_strength: USER_CONFIRMED, weight: 0.85` into `allObservationsForPreAuth`.
  - Re-enters the symbolic brain with the boost. If new confidence ≥ 0.70 → `DIAGNOSIS_ONLY` branch returns full prescription. If still below → re-emit a narrower differential (max 3 chips) targeting the runner-up.
- DB: insert `intent_observation_mapping` rows so the orchestrator routes chip taps deterministically (no LLM re-classification).

**Stage 4 — Telemetry + invariants**
- Log per turn: `differential_size`, `top_cause`, `confidence_pre`, `confidence_post_chip`, `chips_rendered`, `chip_selected`, `final_disposition`.
- Add gate invariant: `escalationData.hypotheses.length >= 1` whenever `response_mode === DIAGNOSTIC_ESCALATION` AND `symptom_keys.length > 0`. Violations → SYMBOLIC_CONTRACT_VIOLATION log + fall back to OBSERVATION mode (never emit a zero-hypothesis escalation again).
- Memory update: new `mem://logic/differential-builder-contract.md` core rule.

### Files to touch

```
NEW  supabase/functions/ai-agriculture-chat/agents/differential-builder.ts
NEW  supabase/functions/ai-agriculture-chat/decision/diagnostic-escalation-renderer.ts
EDIT supabase/functions/ai-agriculture-chat/decision/unified-decision-gate.ts          (~L720-770)
EDIT supabase/functions/ai-agriculture-chat/decision/diagnostic-escalation-generator.ts (add chips + env priors hook)
EDIT supabase/functions/ai-agriculture-chat/decision/authority-types.ts                 (DiagnosticEscalationData.clarification_chips)
EDIT supabase/functions/ai-agriculture-chat/index.ts                                    (~L1860-1900 + chip-tap routing ~L1100-1200)
EDIT supabase/functions/ai-agriculture-chat/agents/orchestrator.ts                      (INTENT_ASSERT_OBSERVATION handler)
NEW  docs/ws13/wave-p-differential-and-feedback-loop.md
NEW  mem://logic/differential-builder-contract.md  + index update
SQL  migration: 1 row in intent_assertion_pattern + N rows in intent_observation_mapping for chip-tap routing
```

### Validation

1. Replay trace `trace_mqq7c04q_5rgdhp` (Marathi, "पिक अद्याप उगवले नाही", Rice/NURSERY/DAS 15) — must return ≥3 ranked causes + chips, not a generic question.
2. Tap top chip in dev → second turn must enter `DIAGNOSIS_ONLY` and return full prescription with confidence ≥ 0.70.
3. SQL audit: zero new `DIAGNOSTIC_ESCALATION` rows in `ai_chat_messages` with `metadata.hypotheses_count = 0` after deploy.
4. Confidence telemetry: median `confidence_post_chip - confidence_pre ≥ 0.20`.

### Out of scope (next waves)
- Vision-AI fusion into the chip set (Wave Q).
- Voice chip-tap via STT (Wave R).
- Photo-after-chip confirmation when category=DISEASE (Wave S).

Shall I ship Stage 1+2 first (server-side differential + chips render) and then Stage 3 (feedback loop) as a follow-up, or all four stages in one go?
