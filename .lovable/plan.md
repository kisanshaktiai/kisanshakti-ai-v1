
# AI Chat Symbolic Decision Brain — Full Pipeline Deep Audit & Production Fix

You confirmed: audit is not 4 stages but the **entire 13-node symbolic decision brain graph**, every chat-touched table column-checked, code + DB migrations approved. The plan below treats every node as a first-class subsystem with its own input contract, output contract, validation, confidence, timing, failure mode, and fallback.

## The contract we are restoring

```text
Farmer Query (any language, any dialect, voice/text/photo)
   │
   ▼
[N1]  Language Layer        — detect script/lang/dialect; normalize
[N2]  Intent Layer          — classify intent + confidence (DB-driven)
[N3]  Entity Extraction     — crop, stage, observations, modifiers, qty/units
[N4]  Context Loader        — farmer, land, crop_history, subscription, locale
[N5]  Land State Builder    — weather, soil, NDVI, GDD, phenology, irrigation
[N6]  Symbolic Graph        — assemble canonical state + evidence graph
[N7]  Rule Evaluation       — decision_rules + hypothesis_* deterministic match
[N8]  Evidence Aggregation  — confirmed / extracted / inferred buckets + weights
[N9]  Decision Selection    — arbitration, conflict resolution, safety gates
[N10] Confidence Engine     — symbolic_confidence SSOT, clarification trigger
[N11] Response Formatter    — deterministic 2030-Ready JSON (8/10 sections)
[N12] LLM Explanation       — narrate ONLY (no new advice, no new products)
[N13] Final Response        — validation gate, language SSOT, delivery
```

LLM is restricted to N1 (perceive) and N12 (narrate). Every agronomic fact in the final response MUST trace back to a DB row surfaced at N7–N9.

## Per-node audit matrix

For each node we will document and fix:

| Field | What we verify |
|---|---|
| Input | Exact type/shape, required vs optional, source node |
| Output | Exact type/shape, downstream consumers |
| Validation | Schema check, DB existence check, range/enum check |
| Confidence | Where it's produced, how it's combined, the threshold |
| Execution time | Instrument with `performance.now()` boundaries; budget per node |
| Failure mode | What breaks (timeout, missing col, empty result, LLM hallucination) |
| Fallback path | Deterministic degraded path (never silent generic response) |

Output artifact per node: a section in `_audit/NODE_FINDINGS.md` with file:line refs, before/after diffs, and trace samples.

## Scope of code under audit

Grouped by graph node (every file walked line-by-line):

- **N1 Language:** `llm-understanding-layer.ts`, `agents/language-induction-layer.ts`, `language-normalizer.ts`, `dialect-normalizer.ts`, `rural-language-dictionary.ts`, `agents/language-quality-validator.ts`, `i18n/translation-loader.ts`, `i18n/observation-label-loader.ts`.
- **N2 Intent:** `agents/intent-classifier.ts`, `intent-router.ts`, `intent-lock.ts`, `decision/intent-resolver.ts`, `query-router.ts`, `question-classifier.ts`, `agents/nlu-agent.ts`.
- **N3 Entities/Observations:** `semantic-extractor.ts`, `observation-extractor.ts`, `entity-normalizer.ts`, `entity-code-mapper.ts`, `observation-key-mapper.ts`, `observation-cause-mapper.ts`, `agricultural-vocabulary.ts`, `cross-crop-symptom-mapper.ts`, `raw-observation-contract.ts`, `agronomic-validator.ts`, `nlp-agriculture-validator.ts`, `photo/*`, `visual-agent.ts`, `multimodal-fusion.ts`.
- **N4 Context Loader:** `index.ts` (session + auth), `agents/context-manager.ts`, `context-manager-types.ts`, `decision/context-authority.ts`, `context-validator.ts`, `decision/canonical-context-contract.ts`, `utils/resolveCropTimeline.ts`, `utils/crop-*-cache.ts`, `utils/agro-zone-cache.ts`, `utils/baseline-guidelines-cache.ts`.
- **N5 Land State:** `agents/soil-ndvi-state-calculator.ts`, `crop-stage-advisor.ts`, `gdd-phenology-engine.ts`, `photoperiod-calculator.ts`, `spray-window-calculator.ts`, `irrigation-decision-module.ts`, `decision/crop-calendar-lookup.ts`, `decision/disease_risk_model` reads.
- **N6 Symbolic Graph / State Build:** `agents/canonical-state-builder.ts`, `canonical-advisory-schema.ts`, `decision/canonical-state-invariants.ts`, `decision/authoritative-state-loader.ts`, `decision/fact-extractor.ts`, `decision/induction-to-observation-mapper.ts`, `agents/decision-graph-bridge.ts`, `symbolic-rules-bridge.ts`, `decision-representation.ts`.
- **N7 Rule Evaluation:** `agents/orchestrator.ts` (rule section), `rule-engine-executor.ts`, `layered-rule-evaluator.ts`, `rule-module-resolver.ts`, `decision/symbolic-reasoner.ts`, `hypothesis-evaluator.ts`, `causal-hypothesis-engine.ts`, `observation-rule-lookup.ts`, `observation-code-mapper.ts`, `bundled-rules/loader.ts`, `utils/id-normalizer.ts`.
- **N8 Evidence Aggregation:** `decision/diagnostic-signal-detector.ts`, `failure-class-detector.ts`, `observation-ontology.ts`, `cross-crop-symptom-ontology.ts`, `agents/diagnostic-flow-controller.ts`, `clarification-strategy.ts`.
- **N9 Decision Selection / Arbitration / Safety:** `decision/unified-decision-gate.ts`, `decision-readiness-gate.ts`, `prescription-gate-enforcer.ts`, `weather-safety-gate.ts`, `safety-gates.ts`, `safety-enhancement.ts`, `agents/conflict-resolver.ts`, `diagnosis-conflict-resolver.ts`, `nutrition-conflict-arbitrator.ts`, `agents/safety-guardian.ts`, `phi-enforcement-guardian.ts`, `pollinator-protection-rules.ts`, `static-data-gate.ts`, `decision/etl-gate.ts`, `decision/diagnosis-only-mode.ts`, `decision/diagnosis-first-generator.ts`.
- **N10 Confidence Engine:** `decision/confidence-calculator.ts`, `confidence-thresholds.ts`, `decision/clarification-validator.ts`, `agents/canonical-observation-loader.ts`, `clarification-renderer.ts`, `clarification-scope-resolver.ts`, `clarification-generator.ts`, `dynamic-clarification-generator.ts`, `differential-diagnosis-clarifier.ts`, `services/observation-question-resolver.ts`, `diagnostic-options-i18n.ts`, `understanding-completeness-checker.ts`, `agents/feedback-learning.ts`.
- **N11 Response Formatter:** `agents/deterministic-response-builder.ts`, `decision/response-generator.ts`, `agents/communication-data-extractors.ts`, `communication-types.ts`, `decision/explanation-chain-builder.ts`, `agents/llm-response-formatter.ts`, `next-crop-recommender.ts`, `economic-calculator.ts`, `market-product-lookup.ts`, `product-repository.ts`.
- **N12 LLM Explanation:** `agents/communication-generator.ts`, `llm-response-generator.ts`, `communication-translation-dictionary.ts`, `agents/diagnostic-escalation-generator.ts`, `agents/follow-up-generator.ts`.
- **N13 Final Response / Delivery:** `agents/response-validation-gate.ts`, `delivery-validator.ts`, `audit-logger.ts`, `index.ts` (response path), `runtime/*`.

## DB tables column-verified (every `.from/.select/.eq/.in/.contains/.order` reference)

`decision_rules`, `decision_rules_history`, `decision_rules_translations_archive`, `hypothesis_master`, `hypothesis_conditions`, `hypothesis_rule_mapping`, `hypothesis_contradictions`, `hypothesis_metrics`, `hypothesis_versions`, `observation_master`, `observation_aliases`, `observation_translations`, `observation_versions`, `observation_differential_questions`, `observation_intent_master`, `intent_observation_mapping`, `intent_translations`, `intent_semantic_class_allowlist`, `emergency_observation_codes`, `cultural_strategies`, `direct_advisory_routes`, `crop_stage_master`, `crop_synonyms`, `crop_vocabulary`, `crop_baseline_guidelines_v2`, `crop_groups`, `crops`, `disease_risk_model`, `variety_resistance`, `master_products`, `master_product_variety_crops`, `chemical_regulatory_status`, `agro_climatic_zones`, `weather_current`, `weather_forecasts`, `weather_aggregates`, `weather_observations`, `land_weather_metrics`, `soil_health`, `soil_types`, `irrigation_types`, `water_sources`, `lands`, `land_crops`, `land_activities`, `farmers`, `crop_history`, `crop_schedules`, `schedule_tasks`, `ndvi_data`, `ndvi_micro_tiles`, `ai_chat_sessions`, `ai_chat_messages`, `ai_chat_audit_logs`, `ai_decision_log`, `ai_chat_analytics`, `hallucination_detection_logs`, `semantic_bridge_metrics`, `orchestrator_metrics`, `safety_verifications`, `treatment_outcomes`, `advisory_audit_log`, `advisory_feedback`, `feedback_learning_*`, `farmer_subscriptions`.

For each table, the live `information_schema.columns` is pulled and diffed against every column the chat function references; mismatches (wrong name, wrong case, wrong type) land in `_audit/SCHEMA_DRIFT.md`.

## Execution phases

### Phase A — Schema truth & usage diff (read-only)
1. Snapshot `information_schema.columns` + `pg_indexes` for all tables above.
2. Build `column-usage.json` from grep of every Supabase query chain in the chat function.
3. Emit `_audit/SCHEMA_DRIFT.md` (missing column, case drift, wrong join key, missing index causing slow path).

### Phase B — Node-by-node audit + fix (N1 → N13)
For each node:
- Read every listed file.
- Verify the per-node matrix (input/output/validation/confidence/timing/failure/fallback).
- Apply minimal fixes (column rename, missing await, missing pagination past PostgREST 1000-row cap, missing null guards using `?.`, missing language SSOT injection, missing safety gate ordering, etc.).
- Instrument structured trace: `[N{k}|{NodeName}] in=… out=… conf=… ms=… mode=…`.
- Add a unit test covering the node's primary success path + its fallback path.

### Phase C — Cross-node invariants
- LLM ⊂ {N1, N12}: static check + runtime guard — any DB call or advice token produced inside N12 fails the response-validation gate.
- Symbolic confidence is computed only at N10 and is the SSOT (no node downstream may overwrite it).
- Canonical-language SSOT (per existing memory) injected at N12 and re-validated at N13.
- Snapshot triggers honor text-PK rule (`NEW.rule_id` / `NEW.hypothesis_id` / `NEW.observation_code`).
- Every `decision_rules.category` is registered in `mapBundledCategory`; unknowns emit `SYMBOLIC_CONTRACT_VIOLATION`.
- No `*_DEFICIENCY_*` / `*_TOXICITY_*` cause-named aliases reach the loader (already enforced; verified + DB CHECK added).
- Safety gates (PHI, pollinator, weather, prescription) run AFTER every unified gate.

### Phase D — DB migrations (only where Phase A proves drift)
Single migration:
- Lowercase any residual UPPER_CASE values in `observation_*`, `intent_*`, `hypothesis_*`, join columns of `decision_rules`; add CHECK constraints to prevent regression.
- Add CHECK rejecting cause-named alias patterns on `observation_aliases.alias_code`.
- Add missing FK indexes the audit identifies on hot rule-engine paths.
- No table drops; no destructive renames; data-preserving only.

### Phase E — Regression & contract tests (`supabase/functions/ai-agriculture-chat/_tests/`)
- `pipeline_contract_test.ts` — 8 representative queries (Hindi, Marathi, Punjabi, Telugu, Tamil, Bengali, Gujarati, English-romanized) covering biotic, abiotic, pre-emergence, post-harvest, irrigation, fertilizer, market, greeting. For each: assert N1..N13 traces present, advice fields byte-identical to rule payload, narration carries no DB-absent product/dose.
- `node_fallback_test.ts` — force each node's failure mode (timeout / empty DB / malformed input) and assert the documented fallback fires (never the generic response).
- `schema_contract_test.ts` — assert every column referenced in code exists in `information_schema.columns` (catches future drift).
- Extend existing `rule_id_lc_contract_test.ts` to also assert every observation_code in `decision_rules.trigger_observations` exists in `observation_master`.
- Extend `generic_response_regression_test.ts` to fail when generic template is emitted while symptom evidence is present.

### Phase F — Verification
- Run `supabase--test_edge_functions` for `ai-agriculture-chat`.
- Curl the function with the 8 representative queries; capture `[N1..N13]` traces; verify per-node ms budgets and final crop/stage-specific responses; cross-check `ai_decision_log` rows.

## Deliverables (single build-mode pass)

1. `supabase/functions/ai-agriculture-chat/_audit/SCHEMA_DRIFT.md`
2. `supabase/functions/ai-agriculture-chat/_audit/NODE_FINDINGS.md` (13 sections, file:line refs, before/after)
3. Code fixes across the files listed above (no out-of-scope changes; no frontend changes)
4. One migration under `supabase/migrations/` (only if Phase A produces drift)
5. New/updated tests under `_tests/`
6. Verification log proving the 13-node contract holds end-to-end

## Technical notes

- All edits stay inside `supabase/functions/ai-agriculture-chat/**` plus one migration file.
- LLM stays on `google/gemini-3-flash-preview` via the existing Lovable AI Gateway helper.
- All existing memory rules (canonical-language SSOT, observation pagination past 1000 rows, snapshot trigger PKs, rule-category registration, cause-named alias ban, safety-gate ordering, Vite ui-vendor chunk, etc.) are enforced — any code violating them is treated as a finding.
- No destructive DB operations; no schema drops; no auth-schema changes.
