# Forensic Audit — AI Chat Neuro-Symbolic Decision Brain

Audit only. No code changes, no DB changes. Everything below was verified against the live database and the deployed function tree (`supabase/functions/ai-agriculture-chat`, 91,844 lines / 178 TypeScript modules, BUILD_TAG `ai-agri-chat::canonical-context-exit::2026-08-04T18:40Z`).

## 1. Knowledge base — tables actually read at runtime

59 distinct tables and 5 RPCs are touched by the chat function. Verified live row counts for the symbolic core:

| Layer | Table | Rows | Role |
|---|---|---|---|
| Perception | observation_master | 2,550 | Observation ontology SSOT (semantic_class, discriminator/frequency/clarity score, polarity, applies_to_stages, is_farmer_observable) |
| Perception | observation_aliases | 11,161 | Surface text / alias -> canonical_code |
| Perception | observation_translations | 5,429 | Farmer-language display text |
| Intent | observation_intent_master | 98 | Intent SSOT (routing_target, clarification_mode, max_clarification_rounds, cultivation_method_applicable) |
| Intent | intent_observation_mapping | 14,023 | Intent -> observation retrieval keys, scoped by crop/stage/DAS/cultivation_method + assertion_strength |
| Intent | intent_assertion_pattern | 76 | Regex-driven assertion strength by intent |
| Intent | intent_semantic_class_allowlist | 90 | Semantic gate allowlist |
| Hypothesis | hypothesis_master | 364 | Causal hypotheses (canonical_group, applicability JSONB, severity_model) |
| Hypothesis | hypothesis_conditions | 794 | Predicates (STAGE, DAS_RANGE, DAT_RANGE, WEATHER, NDVI…), is_required / is_discriminator / weight |
| Hypothesis | hypothesis_rule_mapping | 1,844 | Hypothesis -> rule bridge |
| Prescription | decision_rules | 1,866 | 171-column action/prescription SSOT |
| Prescription | master_products | 210 | Dose/PHI/product resolution |
| Phenology | crop_stage_master / crop_stage_graph | 231 / 155 | Stage nodes + typed transition edges |
| Phenology | cultivation_method_master | 17 | Lane hierarchy via parent_method_code |

Context feeds: `lands`, `crop_schedules`, `crops`, `weather_current/forecasts/observations/aggregates/historical`, `ndvi_data`, `soil_health`, `land_gdd_daily`, `agro_climatic_zones`, `crop_baseline_guidelines_v2`, `variety_resistance`, `chemical_regulatory_status`, `chemical_rotation_group`.
Telemetry/learning: `ai_chat_sessions`, `ai_chat_messages`, `ai_chat_audit_logs`, `ai_decision_log`, `advisory_audit_log`, `hypothesis_metrics`, `rule_performance`, `treatment_outcomes`, `confidence_adjustments`, `learning_suggestions`, `observation_vocabulary_gaps`, `expert_escalations`, `stage_transition_log`.
RPCs: `resolve_crop_phenology_for_land` (x3), `apply_stage_transitions`, `increment_hypothesis_metric`, `check_farmer_quota`, `jsonb_set_nested`.

## 2. Referential integrity (verified via pg_constraint)

Real FKs exist and form the graph spine:

```text
observation_master.observation_code
  <- observation_aliases.canonical_code
  <- observation_translations.observation_code
  <- intent_observation_mapping.observation_code
  <- decision_rules.condition_code            (ON UPDATE CASCADE, ON DELETE RESTRICT)

observation_intent_master.intent_code
  <- intent_observation_mapping.intent_code
  <- intent_translations.intent_code

hypothesis_master.hypothesis_id
  <- hypothesis_conditions.hypothesis_id
  <- hypothesis_rule_mapping.hypothesis_id -> decision_rules.rule_id

crop_stage_master.id  <- crop_stage_graph.from_stage_id / to_stage_id
                      <- crop_stage_aliases.canonical_id
                      <- self: parent/prev/next/canonical_stage_id
crop_stage_master.cultivation_method -> cultivation_method_master.method_code
intent_observation_mapping.cultivation_method -> cultivation_method_master.method_code
cultivation_method_master.parent_method_code -> self (lane hierarchy)
decision_rules.category -> rule_category_master.category (NOT VALID)
```

Integrity gaps found (audit finding, not fixed here):
- `hypothesis_master.crop_code` / `crop_group` and `observation_master.crop_group` / `applicable_crop_groups` have **no FK** to `crops` or `crop_groups` — crop scoping is string-matched, so casing/synonym drift is only guarded in TypeScript (`utils/canonical-code.ts`, `crop-code-normalizer.ts`).
- `observation_intent_master.cultivation_method_applicable` (text[]) has no referential guard against `cultivation_method_master`.
- `decision_rules.category` FK is `NOT VALID` — unregistered categories are possible and only caught at runtime by `mapBundledCategory`.

## 3. Graph node data flow (in -> out, with owning file and function)

```text
HTTP  index.ts:serve
  -> guardTenantAccess / checkRateLimit / check_farmer_quota
  -> AIAgentOrchestrator.orchestrate            agents/orchestrator.ts (12,266 lines)

N0 CONTEXT       in: land_id, farmer_id  out: CanonicalContext v2.1.0 (frozen)
   files: decision/canonical-context-contract.ts, decision/authoritative-state-loader.ts,
          agents/canonical-state-builder.ts, runtime/session-ssot.ts
   reads: lands, crop_schedules, weather_*, ndvi_data, soil_health, agro_climatic_zones

N1 PHENOLOGY     in: canonical ctx, GDD/NDVI  out: growth_stage + confidence, lane
   files: runtime/phenology-reconciler.ts, utils/stage-knowledge-cache.ts,
          runtime/stage-family-shim.ts, decision/crop-calendar-lookup.ts
   reads: crop_stage_master, crop_stage_graph, land_gdd_daily; RPC resolve_crop_phenology_for_land
   note: DAS demoted to 0.5-confidence fallback; families come only from crop_stage_graph

N2 LANGUAGE      in: farmer text  out: normalized text + language
   files: agents/language-normalizer.ts (v2.0.0), agents/language-induction-layer.ts,
          utils/crop-synonyms-cache.ts, utils/crop-vocabulary-cache.ts

N3 INTENT        in: text + crop + lane  out: intent_code, intent_confidence
   files: agents/intent-classifier.ts:classifyFarmerIntent, agents/semantic-extractor.ts,
          agents/query-router.ts, agents/intent-lock.ts
   reads: observation_intent_master, intent_translations, intent_observation_mapping
   gate: [INTENT_LANE_SCOPE] via getIntentCodesForLane()

N4 OBSERVATION   in: intent + text + lane  out: confirmed/candidate observation codes
   files: utils/observation-mapping-cache.ts:getObservationsForIntent,
          utils/db-ssot/observation-source.ts, utils/db-ssot/observation-index.ts,
          agents/observation-extractor.ts, decision/observation-code-mapper.ts
   gates: decision/semantic-validator.ts (allowlist, fail-closed),
          decision/evidence-confidence.ts:scoreEvidenceSet (minInjectConfidence),
          runtime/farmer-observable-gate.ts, decision/iom-gate.ts

N5 HYPOTHESIS    in: observations + canonical ctx  out: scored candidates + winner
   files: runtime/graph-runtime.ts:runGraphRuntime (SOLE entry),
          decision/hypothesis-evaluator.ts:evaluateCandidateHypotheses,
          decision/hypothesis-graph-evaluator.ts, decision/causal-hypothesis-engine.ts (v1.2.1)
   reads: hypothesis_master, hypothesis_conditions
   invariant: zero confirmed observations -> WAITING_FOR_OBSERVATION, evaluator not called

N6 CLARIFICATION in: surviving hypotheses + lane  out: discriminating option set
   files: decision/hypothesis-clarification-builder.ts, decision/differential-diagnosis-clarifier.ts,
          agents/clarification-strategy.ts, agents/clarification-generator.ts,
          runtime/observation-selector-contract.ts, runtime/decision-graph-navigator.ts:navigate

N7 RULE          in: winner hypothesis  out: prescriptions (actions, dosage, PHI)
   files: decision/symbolic-reasoner.ts:executeSymbolicReasoning, data/rule-repository.ts,
          agents/layered-rule-evaluator.ts, agents/rule-engine-executor.ts,
          agents/product-repository.ts
   reads: hypothesis_rule_mapping, decision_rules, master_products, chemical_regulatory_status

N8 SAFETY/GATE   in: prescriptions  out: PASS / suppressed / escalation
   files: decision/unified-decision-gate.ts:evaluateUnifiedGate, agents/safety-guardian.ts,
          decision/prescription-gate-enforcer.ts, decision/weather-safety-gate.ts,
          decision/scientific-validator.ts

N9 NARRATION     in: symbolic decision  out: farmer-language text (no new agronomy)
   files: agents/deterministic-response-builder.ts, agents/llm-response-formatter.ts,
          agents/communication-generator.ts, utils/llm-output-validator.ts,
          agents/decision-representation.ts:validateLLMOutputIntegrity

N10 PERSIST      ai_chat_messages, ai_chat_audit_logs, ai_decision_log, advisory_audit_log
    files: agents/audit-logger.ts, runtime/runtime-trace-collector.ts, agents/feedback-learning.ts
```

Cross-cutting invariant enforcement: `runtime/graph-truth.ts`, `runtime/graph-invariants.ts`, `runtime/graph-runtime-state.ts` (drift/checkpoint), `runtime/graph-snapshot.ts`, `runtime/graph-node-trace.ts`, `decision/pipeline-self-check.ts` (cold-start assertion).

## 4. Instrumentation coverage gap

`emitNodeTrace` is called at only **5 sites** in orchestrator.ts, covering 3 node labels: `INTENT` (x2), `OBSERVATION` (x2), `FINAL_RESPONSE` (x1). Nodes N0/N1/N5/N6/N7/N8 emit their own ad-hoc `[BRAIN_TRACE]` / `[GRAPH_RUNTIME]` / `[HYP_*]` lines instead of the uniform node-trace envelope. A single turn therefore cannot be reconstructed from one grep key — this is the largest observability weakness found.

## 5. Structural findings

1. `agents/orchestrator.ts` is 12,266 lines with ~70 numbered phase markers whose ordinals are non-monotonic (0, B, C, 1, H, 5, Y, A, 8, 0.3, 0.4B, 9.1, 1.2, …). Phase numbering no longer reflects execution order; this is a comprehension and regression-risk hotspot.
2. Retrieval fan-out is heavily denormalized: 14,023 IOM rows and 11,161 alias rows are cached in memory per cold start (`utils/observation-mapping-cache.ts`, `utils/db-ssot/*`). Any loader that does a single `.select()` without pagination silently truncates at PostgREST's 1000-row cap.
3. `hypothesis_conditions` carries `is_quarantined` / `quarantine_reason`, evidence of live data-quality remediation inside the hypothesis layer rather than in a curation pipeline.
4. Duplicate/parallel implementations coexist: `hypothesis-evaluator.ts` vs `hypothesis-graph-evaluator.ts` vs `causal-hypothesis-engine.ts`; `llm-response-formatter.ts` vs `llm-response-generator.ts` vs `communication-generator.ts` vs `deterministic-response-builder.ts`. Only `runGraphRuntime` is contractually the sole hypothesis entry; the narration side has no equivalent single-entry contract.
5. Lane (cultivation_method) is now enforced at three layers (intent scope, IOM retrieval, hypothesis applicability) but is threaded through call sites manually rather than carried on the frozen canonical context as a required field.

## 6. Suggested next steps (not executed)

- Route every node through `emitNodeTrace` so one trace_id reconstructs a full turn.
- Promote `cultivation_method` to a required field on the frozen CanonicalContext instead of per-call-site threading.
- Add validation FKs for crop scoping columns and validate the `decision_rules.category` FK.
- Split orchestrator.ts along the N0–N10 node boundaries above.
