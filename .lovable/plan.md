
# Wave-R…V — From Rule-Retrieval Engine to Neuro-Symbolic Agricultural Diagnostician

Roadmap rewrite. Wave-R stays as the safety shield. Four new waves (S/T/U/V) convert the system from `Query → Rule → Recommendation` to `Query → Intent → Observation → Hypothesis → Evidence Gap → Clarification → Canonical State → Symbolic Evaluation → Confidence → Recommendation`, working for **any crop, any language, any stage, any farmer** with no per-crop code.

## Forensic Audit Recap (what the logs prove)

For `पिक अद्याप उगवले नाही`: 201 rules evaluated, 0 matched, gate logged BLOCKED — yet farmer received `RICE_GERMINATION_RESOW_DECISION_001` (Carbendazim, Trichoderma, resow). Five leak paths confirmed in code:

- `index.ts::hydrateDecisionOutputRichText` (~L3338) copies `action_text` from `primary_decision` / `matched_responses` with no rules-fired precondition.
- `unified-decision-gate.ts` suppression guard (L184–213) uses an OR-chain counter (`rules_applied || matched_responses || candidate_rules`) so candidates inflate "fired".
- `llm-response-formatter.ts` (L1572, L1783) reads `application_details.action_text` directly.
- `observation-rule-lookup.ts::lookupSafeRuleForObservations` returns `{source:'rule_action_text'}` from an independent SQL lookup, bypassing the symbolic engine.
- Vocabulary divergence: state emits `crop_not_germinated`; `decision_rules.conditions_json.observations` ships legacy `UPPER_SNAKE_CASE` enums (`GERMINATION_FAILURE`). Wave-Q substring comparator handles shape, not vocabulary.

Architectural root cause: the pipeline is **rule retrieval**, not **diagnosis**. There is no hypothesis layer, no evidence-gap layer, no canonical observation registry — so the first DB hit becomes the prescription.

## Wave-R (v2) — Symbolic Safety Shield  (UNCHANGED, mandatory, deploy first)

Universal invariant: **`rules_fired === 0` ⇒ no treatment text anywhere**. Plus the 4 reviewer modifications:

1. **SSOT counter** `runtime/rules-fired.ts::rulesActuallyFired()` = `rules_applied.length` only.
2. **Symbolic Invariant Gate** `decision/symbolic-invariant-gate.ts` scrubs `response_payload` but **preserves** `matched_responses`/`candidate_rules`/`primary_decision` under `decisionOutput.internal_candidates` for forensics.
3. **Rule Identity Verification** — `emitted_rule_id ∈ rules_applied.rule_ids` else `RULE_EMISSION_MISMATCH_HARD_GATE`. Filters `secondary_recommendations` and `matched_responses` to only rule_ids that actually fired.
4. **Violation metrics** — DB migration `public.ai_safety_violations` (trace_id, tenant_id, farmer_id, crop_code, reason, emitted_rule_id, fired_rule_ids[], candidate_rule_ids[], intent, observations, language) + `runtime/safety-metrics.ts` emits `safety_violation_count{reason,crop,tenant}` for dashboards (violations/day, /crop, /rule, /tenant). Standard `CREATE TABLE` → GRANT (anon none, authenticated select, service_role all) → RLS ENABLE → service-role-only policy. Indexes on `(occurred_at desc)`, `(reason, occurred_at)`, `(tenant_id, occurred_at)`.
5. Gate `hydrateDecisionOutputRichText` on rules_fired; lock suppression counter to SSOT; formatter reads `response_payload` only and asserts identity; mark `observation-rule-lookup` as `advisory` under `internal_candidates`; DB-only hypothesis fallback in `diagnosis-first-generator`; logger persists `safety_violations` and inserts rows into `ai_safety_violations`.
6. Regression: `wave_r_no_rule_no_treatment_test.ts` (7 cases) + `wave_r_rule_emission_integrity_test.ts` (3 cases incl. `rule_emission_mismatch_blocks_narration`).

## Wave-S — Canonical Observation & Symbol Vocabulary Registry

**Invariant:** one vocabulary across every rule, hypothesis, observation, crop. No code-level aliases.

DB:
- New `public.observation_canonical` (canonical_key text PK, domain, polarity, severity_axis, applies_to_stages text[], description, language-neutral). Seeded from `observation_master`.
- New `public.observation_vocabulary_alias` (alias text PK, canonical_key fk, source text — 'legacy_enum'|'vernacular'|'romanized'|'llm_extract', language text, confidence numeric). Replaces the in-code alias maps.
- Backfill job: every distinct token in `decision_rules.conditions_json.observations`, `hypothesis_conditions.observation_code`, `observation_aliases`, `intent_observation_mapping.observation_key` → alias row (auto-canonicalized via Levenshtein + curator review queue `public.observation_alias_review`).
- Lint cron `governance_cron_jobs`: any rule/hypothesis token absent from `observation_canonical` opens a curation ticket; rule is auto-quarantined (`is_active=false`) until resolved.

Code:
- `agents/layered-rule-evaluator.ts::matchesConditions` resolves through `observation_vocabulary_alias` (no string heuristics, no UPPER/lower comparators).
- `canonical-observation-loader.ts` loads `observation_canonical` (paginated, respects PostgREST cap per memory).

No new agronomy. Closes the 201-evaluated/0-matched gap structurally.

## Wave-T — Universal Hypothesis Engine  (`No Diagnosis ⇒ No Recommendation`)

**Invariant:** rule evaluation runs **only against hypotheses** whose `posterior_confidence ≥ min_diagnostic_confidence` (per crop_group/stage from `confidence_thresholds`). Rules are recommendation generators, not diagnosers.

DB (extend existing tables, no new schemas where possible):
- `hypothesis_master` already exists — add columns: `required_observations text[]`, `supporting_observations text[]`, `contradicting_observations text[]`, `prior_probability numeric`, `min_confidence_for_action numeric`, `applies_to_stage_family text[]`.
- `hypothesis_conditions` — already has observation_code; add `weight numeric` (Bayesian evidence weight) and `polarity` (supporting|contradicting|necessary|sufficient).
- `hypothesis_rule_mapping` — used to gate which rules a confirmed hypothesis unlocks. Add `min_hypothesis_confidence numeric default 0.6`.

Code (new):
- `decision/hypothesis-engine.ts` — pure function: `(intent, observations, stage, crop_group) → ranked H[] with posterior`. Bayesian update using `hypothesis_conditions.weight`. No crop-specific code.
- `agents/orchestrator.ts` rewires: after observation extraction, call hypothesis-engine **before** rule-engine. Rules only consulted for hypotheses passing `min_hypothesis_confidence`. If none pass → route to Wave-U.
- Memory rule: every rule must declare `hypothesis_id` in `hypothesis_rule_mapping` or it cannot fire (lint job + symbolic-invariant-gate enforces).

## Wave-U — Evidence Gap & Clarification Engine

**Invariant:** the next farmer question is always the highest-information observation in the top-ranked open hypothesis.

DB:
- `observation_differential_questions` already exists — extend with `expected_info_gain numeric` (precomputed per hypothesis) and `stage_family text[]`.
- New view `v_evidence_gaps` per session: `required_observations − confirmed_observations` from the top-K hypotheses.

Code (new):
- `decision/evidence-gap-engine.ts` — computes gap set, picks the single most discriminative observation (highest `expected_info_gain × (H1.posterior − H2.posterior)`).
- `decision/diagnosis-first-generator.ts` rewired to emit clarification chips **only** from gap-engine output. Chip labels come from `observation_translations` only — never `cause`, never treatment vocabulary (existing TREATMENT_TOKENS_RE retained).
- Conversation memory: confirmed observations and dismissed hypotheses persist on `ai_chat_sessions` so turns 2…N continue the same diagnosis, not a new query.

## Wave-V — Confidence-Based Diagnosis Engine

**Invariant:** treatment is emitted **only** when:
- `rules_fired > 0` (Wave-R)
- emitted rule_id ∈ fired_rule_ids (Wave-R)
- the rule's `hypothesis_id` has `posterior_confidence ≥ hypothesis_rule_mapping.min_hypothesis_confidence` (Wave-T/V)
- `data_completeness ≥ decision_rules.min_data_completeness` (already in schema, currently under-enforced)

Code:
- `decision/confidence-calculator.ts` extended to expose `diagnosticConfidence(hypothesis_id, state)`.
- `symbolic-invariant-gate` adds a 4th check: `NO_DIAGNOSIS_HARD_GATE` (scrub + `safety_violation_count{reason='no_diagnosis'}`).
- Metric: `diagnostic_confidence_histogram{crop_group,stage,intent}` for observability.

## Files Touched (overall)

| Wave | New | Edited |
|---|---|---|
| R | `runtime/rules-fired.ts`, `runtime/safety-metrics.ts`, `decision/symbolic-invariant-gate.ts`, 2 tests, migration `ai_safety_violations` | `index.ts`, `unified-decision-gate.ts`, `llm-response-formatter.ts`, `observation-rule-lookup.ts`, `diagnosis-first-generator.ts`, `decision-logger.ts` |
| S | migrations `observation_canonical`, `observation_vocabulary_alias`, `observation_alias_review` + lint cron | `layered-rule-evaluator.ts`, `canonical-observation-loader.ts` |
| T | `decision/hypothesis-engine.ts`, migration adding cols to `hypothesis_master`/`hypothesis_conditions`/`hypothesis_rule_mapping` | `orchestrator.ts`, `rule-engine-executor.ts` |
| U | `decision/evidence-gap-engine.ts`, view `v_evidence_gaps`, migration extending `observation_differential_questions` | `diagnosis-first-generator.ts`, `clarification-generator.ts`, `context-manager.ts` |
| V | extend `confidence-calculator.ts`, extend `symbolic-invariant-gate.ts`, metric emitter | `index.ts` (final gate) |

No new agronomy strings anywhere. No crop-specific branches. Every DB migration ends with the standard `GRANT` → `ENABLE RLS` → service-role policy block (per project rules).

## Validation Matrix (works for every crop)

| Query | Pre-Wave-R | Post-Wave-R | Post-Wave-S | Post-Wave-T+U | Post-Wave-V |
|---|---|---|---|---|---|
| Rice "पिक अद्याप उगवले नाही" | Resow + Carbendazim | OBSERVATION (safe, no treatment) | Rule actually matches | Asks `days_after_sowing`, `seedling_count`, `soil_moisture`, `sowing_depth` | Treats only when 1 hypothesis ≥ confidence |
| Cotton "पाने पिवळी" | Random N rec | OBSERVATION | Matches `leaf_yellowing` canonical | Disambiguates N-def vs water vs virus | Treats only after diagnosis |
| Wheat / Sugarcane / Onion / Grape / Mango / Banana | same defect class | same shield | same vocab | same hypothesis flow | same gate |

## Rollout Order (mandatory)
1. **Wave-R** — deploy now. Safety. Watch `safety_violation_count` for 24 h.
2. **Wave-S** — vocabulary first; without it Wave-T fires on empty conditions.
3. **Wave-T** — hypothesis layer; expect "please share more details" spike — that is the engine asking *the right* questions, not failing.
4. **Wave-U** — evidence-gap reduces clarifications to high-value ones.
5. **Wave-V** — final diagnosis gate.

## Out of Scope
- LLM agronomy generation (forbidden by core memory).
- Per-crop branches, hard-coded thresholds, rule-text in code.
- Editing `auth`/`storage`/`realtime` schemas. No edits to `src/integrations/supabase/types.ts`.
