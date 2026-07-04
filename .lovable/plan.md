## Forensic findings (confirmed against code + DB + edge log)

The neuro-symbolic contract is being violated by two hidden mini rule engines in code. Ontology tables are correct; the runtime keeps overriding them.

**Evidence**

- `canonical-state-builder.ts` contains hardcoded Marathi/Hindi/English → `VisualSymptom` map, including `poor_germination → STUNTED_GROWTH`, plus `mapStageToEnum()` doing `includes('grand'|'veget'|'flower'|...)` stage classification.
- Log confirms `real=[POOR_GERMINATION]` becomes `Symptom: STUNTED_GROWTH`, and `stage=transplanting` (BIO_STATE) becomes `ACTIVE_TILLERING/TILLERING` downstream.
- `causal-hypothesis-engine.ts` queries `.eq('crop_group', cropGroup)` where runtime passes `RICE` but DB stores `rice` → `📭 No hypotheses for crop_group=RICE`. `hypothesis_master` returned `[]` for `RICE` in a live DB check, confirming the case mismatch drops the entire graph.
- With hypotheses empty, rule universe stays broad; `PROACTIVE_FLOOD_PREPAREDNESS_001` wins a no-germination turn.
- DB rules `RICE_GERMINATION_DIAGNOSTIC_001` and `RICE_GERMINATION_RESOW_DECISION_001` exist keyed on `obs_rice_no_emergence`, but runtime never bridges `POOR_GERMINATION → obs_rice_no_emergence` before condition matching.
- Farmer observations are appended to the ledger as `confirmed=false`, so `navigator-adapter` reports `confirmed=0` and returns `INSUFFICIENT_EVIDENCE`.

**Scope of change**

Runtime only. No changes to `decision_rules`, `observation_master`, `intent_observation_mapping`, `crop_stage_master`, `hypothesis_master`, BiologicalState, phenology resolver, or translations.

## Repair plan

### Phase 1 — Remove symptom authority from `canonical-state-builder.ts`

- Delete the `symptomMap` inside `mapObservationsToSymptom()` and the Marathi/Hindi/English keyword lists.
- New behavior: pass through the first already-canonical observation code unchanged (must match `/^[A-Z0-9_]+$/`); otherwise return `VisualSymptom.UNKNOWN`. Never guess.
- Remove the `hasTerminalDamage` and `poor_germination → STUNTED_GROWTH` forcing branches in `orchestrator.ts` that override `canonicalState.visual_symptom`.
- Add invariant in `buildCanonicalState`: if input `farmerObservations` contained a real code `A` (per `EvidenceClassifier.isRealObservation`) and output `visual_symptom !== A`, log `[CANONICAL_MUTATION_BLOCKED] before=A after=B` and restore `A`.

### Phase 2 — Remove stage authority from `canonical-state-builder.ts`

- Replace `mapStageToEnum()` body with a strict enum lookup only (exact `UPPER_SNAKE` match to `CropStage`); anything else returns `CropStage.UNKNOWN`.
- Delete all `normalized.includes('grand'|'veget'|'flower'|'फुलोरा'|...)` branches.
- `buildCanonicalState` must consume `canonicalContext.growth_stage` when locked, else `landContext.growth_stage`, else `null`. No calculation.
- Add invariant: if `canonicalContext.is_locked` and resolved `crop_stage` differs, log `[STAGE_MUTATION_BLOCKED]` and force back to the locked value.

### Phase 3 — Fix crop-group normalization in `causal-hypothesis-engine.ts`

- Change `normalizeCropGroup()` to lower-case (`.toLowerCase()`), matching DB storage.
- Update the `hypothesis_master` query and cache key to use the lowercase form. Remove the hardcoded `CROP_CODE_TO_GROUP` uppercase map; keep only a minimal alias table for short codes (`sc → sugarcane`, `paddy → rice`) that still returns lower-case.
- Add trace: `[HYPOTHESIS_LOAD] input_crop=<raw> resolved_crop_group=<lower> hypothesis_count=<n>`.

### Phase 4 — Ontology-driven observation matching (no hardcoded dictionary)

- Add a lightweight resolver `resolveObservationCanonical(code, cropCode, supabase)` that, in order:
  1. Applies existing `bridgeToCropVocab()` (`concept-bridge.ts`) for the crop.
  2. Looks up `observation_aliases` (existing table) by alias → canonical.
  3. Verifies against `observation_master.observation_code`.
- Use this resolver in `causal-hypothesis-engine.ts` and in the layered evaluator condition matcher, replacing `string.includes()` / substring matching for observation codes.
- Trace: `[OBSERVATION_BRIDGE] input=POOR_GERMINATION resolved=obs_rice_no_emergence source=concept_bridge|aliases|master`.
- Bridge the observation set once, right after `POST_MERGE`, and reuse everywhere (avoid multiple partial bridges).

### Phase 5 — Farmer evidence is confirmed in the graph ledger

- In `orchestrator.ts` post-collection ledger seed loop, for every code originating from `EXTRACTED`, `CONFIRMED`, or `LLM_SEMANTIC_EXTRACTOR` (per `AuthoredObservationSet`), call `graph.observation_ledger.confirm(code, actor)` immediately after `append()`.
- Keep `INFERRED`/`SYNTHETIC` as unconfirmed.
- Trace: `[GRAPH_NODE_TRACE] node=OBSERVATION real_count=<n> confirmed=<n>`.

### Phase 6 — Missing data becomes a confidence penalty

- In `causal-hypothesis-engine.ts` scoring, `SKIPPED_NO_DATA` conditions must:
  - Not set `is_eliminated=true`
  - Reduce `weighted_score` by a bounded penalty proportional to the condition weight
- Elimination remains only for `FAILED` required conditions or `CONTRADICTION`.

### Phase 7 — Farmer-language safety in clarifications

- Remove any English string-building for discriminator questions/options in `causal-hypothesis-engine.ts` and orchestrator’s fallback paths.
- Route every clarification text through the existing `observation_translations` / `translateClarificationOptions()` layer using `options.language`. If translation fails, use language-aware safe fallback (`getSafeAskMoreInfoMessage`) already in `llm-response-generator.ts`.
- Never emit an English response when farmer language is non-EN.

### Phase 8 — Final graph consistency invariant

- Before response persistence in `orchestrator.ts`, run a check:
  - If `turnEvidence.real_codes` (from `EvidenceClassifier` at POST_MERGE) contains `A` and the response’s driving symptom/decision references a different symbolic identity `B` without a recorded bridge, log `[GRAPH_CONSISTENCY_ERROR] original=A resolved=B mutation_source=<stage>` and block the outgoing generic template.
  - If farmer real evidence exists, forbid:
    - generic ask-more-details template
    - non-diagnostic proactive winners (`PROACTIVE_*`) unless they intersect real evidence
    - English response for non-EN language
  - Replace with: symbolic decision output, contradiction clarification, or the language-aware safe question.

## Verification

Run the same turn `भात अजून उगवले नाही` (Rice, DAS=26, transplanting) and confirm logs:

```text
[EVIDENCE_CLASSIFICATION] real=[POOR_GERMINATION]
[OBSERVATION_BRIDGE] input=POOR_GERMINATION resolved=obs_rice_no_emergence source=concept_bridge
[HYPOTHESIS_LOAD] input_crop=RICE resolved_crop_group=rice hypothesis_count>=0
[GRAPH_NODE_TRACE] node=OBSERVATION real_count=1 confirmed=1
[BIO_STATE_LOCKED] stage=transplanting
No [CANONICAL_MUTATION_BLOCKED] fires (or fires with restore)
No [STAGE_MUTATION_BLOCKED] fires
No [GRAPH_CONSISTENCY_ERROR] fires
Winner is a diagnostic/contradiction path, NOT PROACTIVE_FLOOD_PREPAREDNESS_001
Final response is Marathi, specific to germination/contradiction
```

## Files touched (runtime only)

- `supabase/functions/ai-agriculture-chat/agents/canonical-state-builder.ts` (Phase 1, 2)
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (Phase 1 override removal, Phase 4 bridge reuse, Phase 5 confirm, Phase 8 invariant)
- `supabase/functions/ai-agriculture-chat/decision/causal-hypothesis-engine.ts` (Phase 3, 4, 6, 7)
- `supabase/functions/ai-agriculture-chat/agents/layered-rule-evaluator.ts` (Phase 4 matcher lookup)
- `supabase/functions/ai-agriculture-chat/decision/concept-bridge.ts` (extend to call `observation_aliases` when supabase is passed; no new hardcoded lists)
- `supabase/functions/ai-agriculture-chat/agents/llm-response-generator.ts` (Phase 7 language-safe fallback wiring)

Not touched: DB schema, ontology tables, `decision_rules`, `crop_stage_master`, `observation_master`, `intent_observation_mapping`, `hypothesis_master`, BiologicalState, phenology resolver, translations.