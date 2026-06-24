# Wave P — Neuro-symbolic decision brain: differential + chips

**Status:** Stage 1 + Stage 2 + Stage 4 shipped. Stage 3 (feedback loop on chip-tap) deferred to Wave P-3.

## Root cause

Replay trace `trace_mqq7c04q_5rgdhp` (Marathi, Rice / NURSERY / DAS 15, symbolic confidence 0.55, mode=NONE):

```
UnifiedGate → PARTIAL → DIAGNOSTIC_ESCALATION
generateDiagnosticEscalationData({ ..., matched_rules: [] })   ← decision/unified-decision-gate.ts:738
                          ↓
index.ts → matched_rules: orchestratorResponse.metadata?.matchedRules || []  ← index.ts:1874
                          ↓
hypotheses = []  → response = intro + "current 55% / threshold 70%" + expert note
                          ↓
Farmer sees one generic yes/no question. No causes. No chips. No way to advance.
```

The escalation path never received hypothesis candidates because `matched_rules` was hard-coded `[]` and the orchestrator's `metadata.matchedRules` is only populated inside the early-return `DIAGNOSIS_ONLY` branch (`agents/orchestrator.ts:6810`), which the young-crop gate never reaches.

## What Wave P ships

### Stage 1 — Differential enrichment (server)

New module `supabase/functions/ai-agriculture-chat/decision/diagnostic-differential-enricher.ts`:

- Takes crop / growth_stage / DAS / observations / NDVI / user_query / language.
- Calls `evaluateCandidateHypotheses` (the existing symbolic hypothesis evaluator) inline.
- Returns up to 5 ranked `matched_rules` and up to 6 deduplicated `clarification_chips` built from the candidates' `observable_characteristics[]` (already i18n-ready with `label_mr / label_hi / label_en`).
- Localized chip prompt for `mr / hi / en`.

### Stage 2 — Observation chips in the response

- `decision/authority-types.ts` — `DiagnosticEscalationData` extended with `clarification_chips[]` and `clarification_question`.
- `supabase/functions/ai-agriculture-chat/index.ts` — after the unified gate decides `DIAGNOSTIC_ESCALATION`, the enricher is invoked, the rebuilt escalation payload is rendered, and chips are exposed through `metadata.clarification_options` using the exact shape the existing chip renderer already consumes (`{ question, options: [{label, value, description, observation_key}], selectionType: 'SINGLE_CHOICE' }`). No frontend change required.

### Stage 4 — Invariant + telemetry

- If `enrichment.matched_rules.length === 0` AND `legacy_hypotheses.length === 0` AND `symptom_keys.length > 0`, the orchestrator logs `🚨 [SYMBOLIC_CONTRACT_VIOLATION] DIAGNOSTIC_ESCALATION emitted with zero hypotheses — downgrading to OBSERVATION mode` and falls through to the OBSERVATION branch. A hollow escalation response can never reach a farmer again.
- New per-turn telemetry on `metadata.wave_p_enrichment`: `{ candidate_count, top_confidence, chips_rendered, enricher_version }` and `metadata.hypotheses_count`.

## Validation queries

After 24 h of forward traffic:

```sql
-- 1. New DIAGNOSTIC_ESCALATION rows should always carry ≥1 hypothesis.
SELECT count(*) AS zero_hypothesis_escalations
FROM public.ai_chat_messages
WHERE role = 'assistant'
  AND created_at > '2026-06-23 00:00:00+00'
  AND metadata->>'orchestrator_type' = 'DIAGNOSTIC_ESCALATION'
  AND COALESCE((metadata->>'hypotheses_count')::int, 0) = 0;
-- Expect: 0
```

```sql
-- 2. Chip render rate.
SELECT
  count(*) FILTER (WHERE jsonb_array_length(metadata->'clarification_options'->'options') > 0) AS with_chips,
  count(*) AS total_escalations
FROM public.ai_chat_messages
WHERE role = 'assistant'
  AND created_at > '2026-06-23 00:00:00+00'
  AND metadata->>'orchestrator_type' = 'DIAGNOSTIC_ESCALATION';
-- Expect: with_chips / total_escalations ≥ 0.9 when crop_name + growth_stage are known.
```

## Stage 3 — Feedback loop (deferred, Wave P-3)

When the farmer taps a chip the frontend sends a new user message carrying `metadata.selected_observation_code`. The orchestrator must:

1. Detect that field (new `INTENT_ASSERT_OBSERVATION` route).
2. Inject the observation into `allObservationsForPreAuth` with `assertion_strength: USER_CONFIRMED, weight: 0.85`.
3. Re-enter the symbolic brain. If the new confidence crosses the treatment threshold → return a full prescription via the `DIAGNOSIS_ONLY` branch. Otherwise → re-emit a narrower differential (max 3 chips) targeting the runner-up cause.

Wiring touches `agents/orchestrator.ts`, `agents/intent-classifier.ts` and requires one `intent_assertion_pattern` row + N `intent_observation_mapping` rows for chip-tap routing. Tracked separately to keep Wave P shippable in isolation.
