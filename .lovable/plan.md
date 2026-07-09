
# Forensic fix: farmer never sees observation cards

## Evidence (from uploaded edge log, trace `trace_mrdaicsf_hd7ofn`)

```
[ClarificationTrigger] Evaluating: ...symptoms=10, coverage=100%, ambiguous=false
   Details: {"should_clarify":false,"reason":"SUFFICIENT_SYMPTOM_COVERAGE","symptom_count":10,"coverage":1}
[EVIDENCE_CLASSIFICATION] raw_count=13 real_symptom_count=13 ignored_metadata_count=0
BRAIN_TRACE ... confirmed=2(info=1) inferred=13 ... clarify=false(sufficient_evidence)
              observation_required=false observation_option_count=0
[OBS_TO_HYP_GAP] ... hypotheses=0 ... action=route_to_clarification_question   ← warn only, ignored
[DIRECT_MODE] Intent EMERGENCE_FAILURE / route GENERAL_INFO skips symptom clarification
```

The farmer typed only "पीक अजून उगवले नाही" → 1 confirmed symptom (`POOR_GERMINATION`). The 13 "real" symptoms are INFERRED IOM LITERAL peers and alias expansions. They are being fed into the ClarificationTrigger, coverage engine, and hypothesis graph as farmer evidence — that is the contract violation.

## Root causes (five, all runtime; no DB / no crop hardcoding)

1. **CT-INPUT-LEAK** — Orchestrator call site to `shouldTriggerClarificationFirst` builds `symptom_count` from `inductionResult.symptoms.length` and passes `symptom_coverage` from the coverage engine, but never populates `confirmed_observation_count` / `diagnostic_intent`. The `OBSERVATION_STATE_CONTRACT` gate at `clarification-strategy.ts:290-300` therefore never fires. (`orchestrator.ts` ~6471–6500 — the `__confirmedCountForTrigger` local is computed but not passed into the input object.)
2. **EVIDENCE-CLASSIFICATION-LEAK** — `[EVIDENCE_CLASSIFICATION]` classifies every non-metadata code as `real_symptom_count`, ignoring `ObservationAuthority`. INFERRED codes must not be counted as "real" for coverage or trigger inputs.
3. **DIRECT-MODE-ORDER-LEAK** — `DIRECT_MODE_DIAGNOSTIC_VETO` (orchestrator ~3655) is guarded so it doesn't fire for `route=GENERAL_INFO + diagnosticIntent` when the current condition also permits `DIRECT_MODE_BYPASS` (~3662). Log shows the BYPASS ran and the veto did not. Needs an unconditional pre-check: if `diagnosticIntent && confirmed==0 && candidate_pool>0`, refuse both bypass paths.
4. **OBS_TO_HYP_GAP-SOFT-EXIT** — The second `[OBS_TO_HYP_GAP]` emission in the BRAIN_TRACE finalizer (~7887) is `console.warn` only. When `graph_ran && diagnostic && hyp=0 && confirmed>0`, it must set `observationRequired=true`, load candidate options from `intent_observation_mapping` + `observation_master`, and short-circuit to the observation-card response.
5. **NAVIGATOR-CANDIDATE-MISS** — When the runtime enters `WAITING_FOR_OBSERVATION` (either from `graph-runtime OBS_GATE` or the invariant), the response builder does not attach `candidate_observations`, so the UI sees `observation_option_count=0`. `navigator-response.ts` must be given the candidate codes from `ObservationMappingCache.getObservationsForIntent(intent)`, hydrated through `observation_master` for display_text.

## Fix plan (surgical, generic across all crops/domains)

### F1 — Pass full state into ClarificationTrigger  *(orchestrator.ts, ~6470–6510)*
Replace the input builder with the frozen `ConversationState`:
```
symptom_count            = conversationState.confirmed.length            // was inductionResult.symptoms.length
symptom_coverage         = conversationState.confirmed_coverage           // NEW field; inferred excluded
confirmed_observation_count = conversationState.confirmed.length
diagnostic_intent        = requiresAgronomicReasoningIntent(intentCode)
```
Delete the `__confirmedCountForTrigger` shim once the object is wired.

### F2 — Authority-aware evidence classifier  *(runtime/observation-state.ts + orchestrator EVIDENCE_CLASSIFICATION log site)*
Extend `ObservationState` with `confirmed_coverage()` and change the `[EVIDENCE_CLASSIFICATION]` log to emit both counts:
```
real_symptom_count = state.confirmed.length     // authority ∈ {CONFIRMED, EXTRACTED}
inferred_count     = state.inferred.length      // no longer counted as evidence
```
No coverage numerator may include INFERRED / SYNTHETIC. This is the single source of `symptom_count` / `symptom_coverage`.

### F3 — Hard preempt for diagnostic + zero-confirmed  *(orchestrator.ts ~3620–3670)*
Move the `DIRECT_MODE_DIAGNOSTIC_VETO` block above the `DIRECT_MODE_BYPASS` block and make the condition:
```
if (isDiagnosticIntent && confirmed.length === 0 && candidateOptions.length > 0) {
  bypassClarification = false;
  directModeBypass    = false;
  agentsUsed.push('DIRECT_MODE_DIAGNOSTIC_VETO');
}
```
This is crop-agnostic; `candidateOptions` comes from `ObservationMappingCache.getObservationsForIntent(intentCode).observation_codes`.

### F4 — Promote OBS_TO_HYP_GAP to a hard router  *(orchestrator.ts ~7870–7920)*
When `graph_ran && diagnosticIntent && hypotheses.length === 0`:
- set `(this as any).__observationRequired = true`
- attach `candidate_observations` from IOM cache (see F5) to the response envelope
- set `layeredRuleResult = null` (do NOT emit `INVARIANT_FALLBACK`)
- push `agentsUsed: ['OBS_TO_HYP_GAP_ROUTER']`
- log promoted from `warn` → `info`, keep the same `[OBS_TO_HYP_GAP]` marker.

### F5 — Navigator emits candidate observations  *(runtime/navigator-response.ts + graph-runtime.ts)*
- `runGraphRuntime` already exposes `state: WAITING_FOR_OBSERVATION` + `candidate_observations`. Pipe both into the response envelope (`observation_required: true`, `observation_option_count: candidate_observations.length`).
- `navigator-response.ts` hydrates each candidate code via `observation_master` (label/description/affected_plant_part) in a single `.in()` chunked query — no per-crop table, no hardcoded label map.

### F6 — Regression tests  *(tests/observation-state-contract_test.ts)*
Add T7–T9, parametrized across `[RICE, COTTON, SUGARCANE, TOMATO, ONION]`:
- T7: 1 confirmed + 13 inferred ⇒ `clarify=true, reason=NO_CONFIRMED_OBSERVATIONS_ENOUGH_FOR_HYP`, `observation_option_count>0`, `route=OBSERVATION_CARDS`.
- T8: `graph_ran && hyp=0 && confirmed>0` ⇒ `OBS_TO_HYP_GAP_ROUTER` fires and no `INVARIANT_FALLBACK` is emitted.
- T9: `route=GENERAL_INFO && diagnosticIntent && confirmed=0` ⇒ direct-mode bypass refused.

## Files touched (no schema, no LLM, no crop-specific lists)

Edit:
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`  (F1, F3, F4)
- `supabase/functions/ai-agriculture-chat/agents/clarification-strategy.ts`  (accept `symptom_coverage` from confirmed-only)
- `supabase/functions/ai-agriculture-chat/runtime/observation-state.ts`  (F2 helper)
- `supabase/functions/ai-agriculture-chat/runtime/navigator-response.ts`  (F5 hydration)
- `supabase/functions/ai-agriculture-chat/runtime/graph-runtime.ts`  (F5 envelope passthrough)

New:
- `supabase/functions/ai-agriculture-chat/tests/observation-state-contract_test.ts`  (F6, extend existing)

Update memory: `mem://architecture/observation-classification-db-ssot` — record the confirmed-only coverage rule and the OBS_TO_HYP_GAP router.

## Success invariants (must all hold post-fix)

```
diagnostic_intent = true
AND confirmed_observations = 0
⇒ observation_required = true
AND observation_option_count > 0
AND no decision_rule fired
AND no INVARIANT_FALLBACK narration emitted
```

```
diagnostic_intent = true
AND graph_executed = true
AND hypotheses = 0
⇒ observation cards rendered (OBS_TO_HYP_GAP_ROUTER),
   never legacy rule fallback.
```

No agronomy is added or moved into TS. All candidate options come from `intent_observation_mapping` + `observation_master`. Works for every crop / pest / disease / nutrient / stress domain.
