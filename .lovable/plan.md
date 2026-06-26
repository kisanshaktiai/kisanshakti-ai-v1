
## Root cause (confirmed by code + DB audit)

The auditor's hypothesis is correct. The clarification graph is sourcing options from `decision_rules` metadata without an `observation_master` gate, so diagnosis-level codes leak in as if they were farmer symptoms.

Evidence chain:

1. **`decision_rules.observable_characteristics` is null** for `RICE_DISEASE_TUNGRO_001` (verified: `SELECT observable_characteristics FROM decision_rules WHERE rule_id='RICE_DISEASE_TUNGRO_001'` → `nil`).
2. `hypothesis-evaluator.ts:810-833` then falls back to `rule.conditions_json.observations` and synthesizes `ObservableCharacteristic` entries with `observation_key = obs.toUpperCase()`. Whatever string lives in that JSON (here `tungro_yellow_stunt`, which is a disease name) becomes a "farmer observable."
3. `clarification-strategy.ts:462-522` iterates `candidate.observable_characteristics` and ships them straight to the UI. The only filters are `failure_class domain exclusion` and `stage compatibility` — neither checks `observation_master.is_farmer_observable`.
4. The farmer taps "🔍 TUNGRO YELLOW STUNT", `OPTION_SELECTED` confirms `TUNGRO_YELLOW_STUNT`, but `observation_master` has no such row (verified: empty SELECT), so `[ObsValidation] Rule … references unknown observation: TUNGRO_YELLOW_STUNT` fires and **0 rules match** → `STAGE_FALLBACK`.

Two ontologies (`observation_master` vs `decision_rules.{observable_characteristics, conditions_json.observations}`) are running side-by-side and disagreeing. This is the graph corruption the report describes.

The earlier transport fix (embedded ObservationKey) is intact — the bug is now strictly upstream in the **candidate generator**.

## Fix — single invariant, enforced once

> Every clarification option presented to the farmer MUST correspond to a row in `observation_master` with `is_active = true` AND `is_farmer_observable = true`. Anything else is dropped and logged as a vocabulary gap.

This is a presentation/symbolic-graph fix. No rule-engine, intent-router, or LLM prompt changes.

### Changes

**1. `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`**

- In `extractObservableCharacteristics()` (and the `conditions_json.observations` synthetic path at lines 810–833): after building the candidate `observation_key`s, filter them through `obsMetadataMap` (already loaded from `observation_master`). Keep only keys where the row exists, `is_active=true`, and `is_farmer_observable=true`.
- Rejected keys are recorded once per request via a new `recordVocabularyGap(key, source_rule_id, reason)` helper that inserts into `observation_vocabulary_gaps` (table already exists) with reasons `NOT_IN_MASTER` / `NOT_FARMER_OBSERVABLE` / `INACTIVE`.
- If a rule ends up with zero farmer-observable characteristics AND no other diagnostic signal, mark it `advisory_only` (already handled by the existing skip path) so it cannot drive clarification.

**2. `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts`**

- Add a final "ontology gate" pass right before `allOptions` is returned (around line 522 and the regeneration block at 531–560): re-check each option's `observation_key` against `obsMetadataMap`/observation_master. Any key not satisfying the invariant is dropped with a `[CLARIFICATION_ONTOLOGY_VIOLATION]` log line and a vocabulary-gap record.
- Replace the silent fallback that lets disease codes through with: if no valid farmer-observable options survive, return the existing failure-class fallback (`useHypothesisFallback`) — never emit a diagnosis-level option.

**3. `supabase/functions/ai-agriculture-chat/agents/dynamic-clarification-generator.ts`**

- Same ontology gate applied to any code path that builds a candidate list (rule observable_characteristics, hypothesis_master, or NLU). One shared helper `assertFarmerObservable(keys, obsMetadataMap)` used by both files.

**4. `supabase/functions/ai-agriculture-chat/agents/clarification-renderer.ts`**

- Defense in depth: refuse to render any option whose `observation_key` fails the gate, even if upstream missed it. Logs `[RENDERER_ONTOLOGY_GUARD]`.

**5. Observability**

- Add `[ONTOLOGY_GATE]` summary log per request: `{candidates_in, candidates_kept, dropped_diagnosis_level, dropped_unknown, dropped_not_observable}` so we can see the gate working on every turn.
- No new tables. Reuses existing `observation_vocabulary_gaps`.

### Out of scope (intentionally)

- Rule engine / `layered-rule-evaluator.ts` — not the bug.
- `intent_observation_mapping` — not the bug.
- DB migrations — none required (the invariant is enforced in code against existing `observation_master` columns).
- LLM prompts and translation paths.

### Verification

1. Reproduce the trace: ask the same Rice/SEEDLING question that produced `trace_mquorxjh_dxgavf`. Expected: clarification options now contain only symptoms present in `observation_master` (e.g. `LEAF_YELLOWING`, `STUNTED_GROWTH`, `POOR_TILLERING`), never `TUNGRO_YELLOW_STUNT`.
2. Edge function logs show `[ONTOLOGY_GATE] dropped_diagnosis_level >= 1` and a corresponding row in `observation_vocabulary_gaps`.
3. After the farmer picks a real symptom, `[ObsValidation] references unknown observation` warnings disappear for that turn and the rule engine receives a consistent symbolic set.
4. `tsgo --noEmit` clean on the three edited files.
