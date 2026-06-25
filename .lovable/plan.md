# Neuro-Symbolic Decision Brain — Runtime Repair (Condensed)

LLM stays presentation-only. No schema redesign, no new agents, no API changes, no new hardcoded agronomy. Every change observable via `[BRAIN_TRACE]`.

---

## Phase A — Forensics & Ownership Map (read-only)
Covers original Phases 1, 2, 3, 13.

Deliverable: `/mnt/documents/PIPELINE_FORENSICS_2026_06_25.md` containing:
- Stage-by-stage runtime trace (inputs, outputs, confidence, tables, functions, rules fired, evidence lost/added) for all 17 pipeline stages.
- Coverage matrix for the 18 symbolic tables: Used / Partial / Dead / Shadowed / Hardcoded-Replacement with file:line.
- Evidence lineage diff (created/modified/lost/ignored/overwritten) from one live `ai_decision_log` trace.
- Runtime Ownership Map: each concept (crop, stage, intent, observation, emergency code, baseline, irrigation/NDVI thresholds, stage advice) → single owning module + DB table. Secondary owners flagged for removal in Phase C.
- Current vs intended mermaid flow diagram.

No code changes.

---

## Phase B — Evidence + Confidence Backbone
Covers original Phases 3 (instrumentation), 4, 11.

- New `evidence-ledger.ts`: per-request ledger recording create/modify/lose/ignore/overwrite per stage.
- New `confidence-chain.ts`: single object `{intent, observation, semantic, hypothesis, rule, scientific, authority}` carried through orchestrator context; each stage multiplies its factor in, none reset.
- Final `recommendation.confidence = product(chain)`; written to `ai_decision_log.confidence_breakdown` and `reasoning_trace` (existing jsonb columns) — full explainability lineage in one place.
- `[BRAIN_TRACE]` emits the lineage so every decision is reproducible from edge logs.

---

## Phase C — Mandatory Gates: Semantic → Intent → Scientific
Covers original Phases 5, 6, 7.

1. **Semantic gate** (`semantic-validator.ts`): between Observation Extraction and Hypothesis Generation. Consumes `intent_semantic_class_allowlist` + `observation_master.semantic_class`. Drops observations whose semantic_class isn't allowed for active intent.
2. **Intent gating on rules**: `bundled-rules/loader.ts` adds mandatory `rule_intent` filter (via `intent_observation_mapping`). Rules with NULL `rule_intent` treated as generic and demoted (never promoted above intent-matched rules). Fixes "cyclone rule wins emergence query".
3. **Scientific gate** (`scientific-validator.ts`): between Rule Evaluation and Safety. Consults `crop_baseline_guidelines_v2` for irrigation volume, fertilizer dose, PHI, max applications, stage suitability. Baseline-violating recommendations rejected with `rejection_reason='BASELINE_VIOLATION'` to `advisory_audit_log` — never reach builder.

All three gates write to the evidence ledger and confidence chain from Phase B.

---

## Phase D — Authority Ordering + Weighted Arbitration
Covers original Phases 9, 10.

- Reorder orchestrator: `DiagnosticDecisionAuthority.decide()` runs **before** `DeterministicBuilder.build()`. Builder receives only authority-approved rule(s); rejected payloads cannot be serialized. Response JSON shape unchanged.
- Replace observation-overlap-only scorer in `rule-arbiter.ts` with weighted sum across: intent_match, observation_match, semantic_match, stage_match, growth_stage, hypothesis_score, scientific_validation, safety, rule_priority, rule_confidence, rule_version, evidence_strength. Weights stored in `system_config` (tunable without redeploy). Generic rules get a hard penalty.

---

## Phase E — SSOT Cleanup + Translation Fallback
Covers original Phases 8, 12.

- **Stage SSOT**: extend existing `stage-knowledge.ts` as the single cached reader of `crop_stage_master` + `crop_stage_knowledge`. Strip duplicated stage arrays / young-crop thresholds / stage families / stage advice from `utils/stage-normalizer.ts`, `agents/irrigation-decision-module.ts`, and orchestrator inline maps.
- **Translation fallback chain** in `translation-service.ts`: LLM translate → on failure/timeout (>1500 ms) → `observation_translations` + `intent_translations` dictionary → cached prior translation → return canonical-language string with `translation_degraded=true`. Marathi/Hindi farmers never see English on degraded paths.

---

## Phase F — Self-Check Safety Gate
Covers original Phase 14.

`pipeline-self-check.ts` runs on edge cold start and asserts: intent preserved, observation preserved, semantic gate present, hypothesis validated, rule_intent enforced, scientific gate present, authority-before-builder, translation fallback wired, confidence chain wired, evidence ledger wired, no hardcoded agronomic constants (build-time grep guard), DB SSOT reachable.

Failure → single `PIPELINE_SELF_CHECK_FAILED` log + degrade to safe-mode clarification response instead of returning wrong advice.

---

## Execution Order
1. **A** (audit only) → review.
2. **B** (backbone) → enables observability for everything after.
3. **C** (gates) → first real behavior change.
4. **D** (ordering + arbitration).
5. **E** (cleanup + translation safety).
6. **F** (self-check) → gates future deploys.

## Files Touched
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
- `.../agents/irrigation-decision-module.ts`
- `.../bundled-rules/loader.ts`
- `.../decision/decision-readiness-gate.ts`, `rule-arbiter.ts` (extend)
- New: `.../decision/semantic-validator.ts`, `scientific-validator.ts`, `confidence-chain.ts`, `evidence-ledger.ts`, `pipeline-self-check.ts`
- `.../runtime/observation-resolver.ts`, `stage-knowledge.ts` (consolidate)
- `.../utils/stage-normalizer.ts` (strip duplicates)
- `.../services/translation-service.ts` (fallback chain)

## Out of Scope
Schema migrations, new agents/models, UI changes, request/response JSON shape changes.
