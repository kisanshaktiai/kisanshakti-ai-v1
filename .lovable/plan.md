# Neuro-Symbolic Decision Brain — Forensic Fix Plan

Scope: runtime-only. No changes to `decision_rules`, `observation_master`, `observation_aliases`, IOM, `crop_stage_master`, translations, or frontend. No new tables. No new architecture.

## Objective

Make every node emit a single, uniform `[GRAPH_NODE_TRACE]` line keyed by `trace_id`, enforce the invariants below, and cut every code path that silently swaps a valid symbolic decision for a generic template.

## Node-by-node fixes

### 1. `intent-classifier.ts` / `intent-router.ts`
- Emit `[GRAPH_NODE_TRACE] node=INTENT { intent, confidence, crop, query_type }`.
- Invariant: if `intent=UNKNOWN` AND (crop present OR ≥1 real observation), reclassify to `DIAGNOSTIC_INQUIRY` before returning. Log `[INTENT_SALVAGE]` when this fires.

### 2. `observation-extractor.ts` + `canonical-observation-loader.ts` + `db-observation-validator.ts`
- Emit `[GRAPH_NODE_TRACE] node=OBSERVATION { llm_observations, alias_resolved, canonical_observations, farmer_selected_observations, rejected_observations, rejection_reason }`.
- Ensure `observation_aliases` resolution runs **before** validator rejection (currently a subset of aliases is checked after canonicalization).
- Never drop a `farmer_selected_observation`; only strip metadata via `evidence-classifier.isRealObservation()`.
- Invariant: after this node, `real_observation_count` is authoritative and passed forward on `ConversationState`.

### 3. `biological-state.ts` + `orchestrator.ts` (already partially fixed)
- Keep the reconciler as the sole stage writer. Add hard assertions in `gdd-phenology-engine.ts`, `crop-stage-advisor.ts`, and `context-validator.ts`: call `blockStageWriteIfLocked()` (existing helper) at every remaining `growth_stage` assignment site; log `[BIO_STATE_WRITE_BLOCKED]`.
- Emit `[GRAPH_NODE_TRACE] node=BIO_STATE { crop, variety, das, gdd, biological_stage, stage_uuid, evidence_sources[], confidence }` once at lock time.

### 4. Stage validation (`stage-knowledge-cache.ts`, `context-validator.ts`)
- On empty result from `stage_transition_conditions` / `stage_validation_rules` / `variety_phenology_profile`, log `[STAGE_DECISION_REASON] fallback=generic_crop_das` explicitly instead of silently defaulting.

### 5. `evidence-classifier.ts` (already added) + call sites in `canonical-state-builder.ts`, `layered-rule-evaluator.ts`, `decision/prescription-gate-enforcer.ts`
- Replace remaining `observations.length` prescription/coverage checks with `classifyEvidence(codes).real_symptom_count`.
- Rule: evidence classifier **must never delete** farmer-selected symptoms because of stage mismatch — only lower per-observation `confidence`. Add `evidence_downgraded=true` flag on the node rather than dropping.
- Emit `[GRAPH_NODE_TRACE] node=EVIDENCE { accepted, rejected, downgraded }`.

### 6. `hypothesis-evaluator` / `causal-hypothesis-engine.ts` / `observation-cause-mapper.ts`
- Emit `[GRAPH_NODE_TRACE] node=HYPOTHESIS { input_observations, generated_hypotheses, blocked_hypotheses, block_reason }`.
- Invariant: `real_observation_count > 0` AND `generated_hypotheses.length === 0` → log `[HYPOTHESIS_GAP]` with the miss reason (no matching cause row, stage filter, etc.). Never return silently.

### 7. `layered-rule-evaluator.ts` + `rule-engine-executor.ts`
- Emit `[GRAPH_NODE_TRACE] node=RULE_ENGINE { loaded, crop_scoped, stage_eligible, observation_matched, blocked, block_reasons[], winner }`.
- Bio-contradiction path: if `real_observation` describes a stage-incompatible fact (e.g. `NO_GERMINATION` at TILLERING), route to `BIOLOGICAL_CONTRADICTION` clarification instead of dropping to generic fallback. Reuse existing contradiction engine output (already surfaced by navigator-adapter).
- Stage mismatch alone must not zero-out diagnostic rules; keep them with `stage_penalty` applied.

### 8. Scientific gate (`decision/scientific-validator.ts`, `decision/prescription-gate-enforcer.ts`)
- Split `allow_diagnosis` from `allow_treatment`. Missing product/chemical/baseline blocks treatment only. Diagnosis is emitted with `treatment_gated=true`.
- Emit `[GRAPH_NODE_TRACE] node=SCIENTIFIC_GATE { allow_diagnosis, allow_treatment, block_reasons[] }`.

### 9. `communication-generator.ts` + `llm-response-generator.ts` + `deterministic-response-builder.ts`
- Add hard guard at the fallback branch: fallback allowed **only** when `!crop || real_observation_count===0 || hypotheses.length===0 || system_error`. Any other trigger throws `[FALLBACK_FORBIDDEN]` and returns the symbolic decision instead.
- Emit `[FINAL_RESPONSE_CONTRACT] { symbolic_decision_available, diagnosis_available, fallback_trigger, fallback_reason, source }`.
- `source` ∈ {`symbolic_decision_graph`, `clarification_graph`, `diagnosis_graph`}. `generic_template` is only permitted with the 4 explicit reasons above.

## Invariant assertions (new `runtime/graph-invariants.ts`)

Central helper called at end of orchestrator turn:
- `assertNoFallbackWhenSymbolicAvailable(state)`
- `assertRuleEngineTracedWhenLoaded(state)`
- `assertObservationForwardedToRules(state)`
- `assertBioLockedImpliesNoGenericFallback(state)`

Assertion failure → `console.error('[GRAPH_INVARIANT_VIOLATION] ...')` and force `source=symbolic_decision_graph` when a symbolic decision exists.

## Trace unification

Single helper `runtime/graph-node-trace.ts::emitNodeTrace(trace_id, node, payload)` used by every node above. Existing `brain-trace.ts` remains for the final summary line.

## Non-goals

- No DB migration.
- No changes to rule content, ontology, IOM, crop_stage_master, translations, or any frontend file.
- No new LLM prompts. No new fallback templates.

## Files touched

New: `runtime/graph-node-trace.ts`, `runtime/graph-invariants.ts`.
Edited: `agents/intent-classifier.ts`, `agents/intent-router.ts`, `agents/observation-extractor.ts`, `agents/canonical-observation-loader.ts`, `agents/db-observation-validator.ts`, `agents/canonical-state-builder.ts`, `agents/orchestrator.ts`, `agents/gdd-phenology-engine.ts`, `agents/crop-stage-advisor.ts`, `decision/context-validator.ts`, `agents/layered-rule-evaluator.ts`, `agents/rule-engine-executor.ts`, `agents/causal-hypothesis-engine.ts` (or `hypothesis-evaluator.ts`), `decision/scientific-validator.ts`, `decision/prescription-gate-enforcer.ts`, `agents/communication-generator.ts`, `agents/llm-response-generator.ts`, `agents/deterministic-response-builder.ts`, `agents/stage-knowledge-cache.ts`.

## Verification

After deploy, one Rice "crop has not germinated" turn must show in edge logs, in order:
`INTENT_RESOLVED → OBSERVATION_CANONICALIZED → BIO_STATE_LOCKED → EVIDENCE_ACCEPTED(count>0) → HYPOTHESIS_CREATED → RULE_ENGINE_EXECUTED → SCIENTIFIC_GATE_DECISION → FINAL_RESPONSE source=symbolic_decision_graph` with `BIOLOGICAL_CONTRADICTION` clarification — no flood recommendation, no generic young-crop template.
