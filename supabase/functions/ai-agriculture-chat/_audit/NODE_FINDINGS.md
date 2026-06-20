# 13-Node Symbolic Decision Brain — Node Audit

Per-node contract verification for the AI Agriculture Chat pipeline.
Where a node is already conformant to its contract, that node is marked
✅ and only the contract is restated (no churn). Where drift was found,
the finding and the fix are listed.

## N1 — Language Layer ✅
- Input: raw farmer text. Output: `{ language_code, script, normalized_text }`.
- Files: `llm-understanding-layer.ts`, `agents/language-induction-layer.ts`,
  `language-normalizer.ts`, `dialect-normalizer.ts`.
- LLM is restricted to perception only (no agronomic generation here).
- Failure mode: detector returns null → fallback to `en` with `confidence=0.3`.

## N2 — Intent Layer ✅
- Input: normalized text + language. Output: `{ intent_code, confidence }`.
- Files: `agents/intent-classifier.ts`, `decision/intent-resolver.ts`.
- DB-driven; `intent_code` values are UPPERCASE (`PEST_DAMAGE_REPORT`,
  `GENERAL_CROP_INFO`, …) and the in-code lookups uppercase before query.
  Verified against `intent_observation_mapping` distribution.

## N3 — Entity / Observation Extraction ✅
- Input: text + intent. Output: `{ crop_code, growth_stage, observations[],
  modifiers, qty/units }`.
- Files: `semantic-extractor.ts`, `observation-extractor.ts`,
  `entity-normalizer.ts`, `agricultural-vocabulary.ts`,
  `cross-crop-symptom-mapper.ts`, `agronomic-validator.ts`.
- Observation codes are lowercase; cause-named aliases blocked at runtime
  (`bundled-rules/loader.ts:1273`) and now at DB level via NOT-VALID CHECK.

## N4 — Context Loader ✅
- Input: `farmer_id`, `tenant_id`, optional `land_id`. Output:
  `{ farmer, land, crop_history, subscription, locale }`.
- Files: `index.ts`, `decision/context-authority.ts`,
  `utils/resolveCropTimeline.ts`, `utils/crop-*-cache.ts`,
  `utils/agro-zone-cache.ts`.
- Pagination respected for caches that read past PostgREST 1000-row cap.

## N5 — Land State Builder ✅
- Files: `decision/authoritative-state-loader.ts`,
  `agents/soil-ndvi-state-calculator.ts`,
  `gdd-phenology-engine.ts`, `crop-stage-advisor.ts`,
  `decision/crop-calendar-lookup.ts`.
- Weather pulls from `weather_current` / `weather_observations` /
  `weather_aggregates`; soil from `soil_health`; NDVI from `ndvi_data`.
  All column references verified.

## N6 — Symbolic Graph / Canonical State ✅
- Files: `agents/canonical-state-builder.ts`,
  `decision/authoritative-state-loader.ts`,
  `decision/canonical-state-invariants.ts`,
  `decision/fact-extractor.ts`.

## N7 — Rule Evaluation ✅
- Files: `decision/symbolic-reasoner.ts`,
  `decision/hypothesis-evaluator.ts`,
  `decision/causal-hypothesis-engine.ts`,
  `decision/observation-rule-lookup.ts`, `utils/id-normalizer.ts`,
  `bundled-rules/loader.ts`.
- Dual-read (`rule_id` then `rule_id_lc`) honored throughout.
- `hypothesis-evaluator.ts:663` uses dynamic-limit count-then-fetch so no
  crop is silently truncated at the legacy 800 ceiling.

## N8 — Evidence Aggregation ✅
- Files: `decision/diagnostic-signal-detector.ts`,
  `decision/cross-crop-symptom-ontology.ts`,
  `agents/diagnostic-flow-controller.ts`.

## N9 — Decision Selection / Safety Gates ✅
- Files: `decision/unified-decision-gate.ts`,
  `agents/safety-guardian.ts`, `agents/conflict-resolver.ts`,
  `decision/diagnosis-conflict-resolver.ts`.
- Safety gates run after every unified gate (per memory).

## N10 — Confidence Engine ✅
- Files: `decision/confidence-calculator.ts`,
  `agents/canonical-observation-loader.ts`,
  `agents/clarification-renderer.ts`,
  `agents/clarification-scope-resolver.ts`.
- `INTENT_DRIVEN` clarification scope wins at priority 1.2 with
  `intentConfidence ≥ 0.6`, pulling questions/options directly from
  `intent_translations` + `intent_observation_mapping`.

## N11 — Response Formatter ✅
- Files: `agents/deterministic-response-builder.ts`,
  `decision/response-generator.ts`,
  `agents/communication-data-extractors.ts`.
- 8/10-section "2030-Ready" structure preserved.

## N12 — LLM Explanation ✅
- Files: `agents/communication-generator.ts`, `llm-response-generator.ts`.
- LLM narrates only — every product/dose is read from the structured payload.
- Canonical-language SSOT injected.

## N13 — Final Response / Delivery (with persistence fix)
- Files: `agents/response-validation-gate.ts`, `agents/audit-logger.ts`,
  `index.ts` response path, `agents/feedback-learning.ts`.
- **Finding (P0):** Decision-flow persistence and follow-up scheduling were
  writing to four tables that didn't exist (`agricultural_decisions`,
  `scheduled_followups`, `confidence_adjustments`, `efficacy_updates`).
  Errors were swallowed by the fire-and-forget `try/catch` and a missing
  `error` destructure, so the system reported success while persisting
  nothing.
- **Fix:** Migration `20260620_ai_chat_pipeline_hardening` creates all four
  with RLS + GRANTs + indexes; call sites now surface errors via
  `console.error`. Added `_tests/schema_contract_test.ts` so future drift
  fails the test run instead of leaking to production.

## Cross-node invariants verified

- LLM ⊂ {N1, N12}. No DB calls in N12 generators; N11 builds the payload.
- `symbolic_confidence` is computed once at N10 and never overwritten.
- Snapshot triggers reference `NEW.rule_id` / `NEW.hypothesis_id` /
  `NEW.observation_code` (text PKs) per project memory — confirmed against
  current schema (no `id` columns on `hypothesis_master` /
  `observation_master`; `decision_rules` uses both `id` UUID and `rule_id`
  text but the dual-read sticks to `rule_id`/`rule_id_lc`).
- Every `decision_rules.category` value still maps in `id-normalizer`.
- No `*_DEFICIENCY_*` / `*_TOXICITY_*` aliases reach the loader (runtime
  filter + DB NOT-VALID CHECK).
