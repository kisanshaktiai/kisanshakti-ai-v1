# Executive Summary — AI Chat + Symbolic Decision Brain Audit

**Date:** 2026-06-15  **Mode:** Read-only forensic audit. No DB, code, or deploy changes made.

## Headline findings

| # | Finding | Severity | Phase |
|---|---|---|---|
| F1 | **Case-mismatch hazard between ID classes.** `observation_master.observation_code` is 100% lowercase (`obs_rice_no_emergence`), but `decision_rules.rule_id` (1850/1852) and `hypothesis_master.hypothesis_id` (all) are UPPER_SNAKE. Every code path that compares an ID with `.eq()` / `===` is case-sensitive. | Critical | 2, 6 |
| F2 | **Test fixtures + a few code constants reference uppercase `OBS_*` codes** that do not exist in the DB; live DB rows are lowercase. Tests pass against mocks, never against real schema. | High | 6 |
| F3 | **`decision/symbolic-reasoner.ts:327` BIOTIC_OBS_KEYS** does `obs.includes('BORE_HOLES')` — case-sensitive substring vs. lowercase DB → biotic detection is silently dead for some flows. | High | 7 |
| F4 | **2 of 1,852 rules deviate from UPPER_SNAKE** rule_id convention — non-deterministic authoring. | Medium | 2 |
| F5 | **No table in the symbolic core has a `version_hash` column** (rules, hypotheses, observations) — auditability gap; can't prove a deployed rule matches what was reasoned over. | Medium | 3 |
| F6 | **`hypothesis_metrics`, `hypothesis_rule_mapping`, `rule_conflict_matrix` lack `created_at`/`updated_at`** — provenance gap. | Medium | 3 |
| F7 | **No `tenant_id` on the reference tables** (`decision_rules`, `hypothesis_master`, `observation_master`, `intent_observation_mapping`) — acceptable for global ontology, but means tenant-specific overrides require a separate override table. Document the contract. | Info | 3 |
| F8 | **0 active rules have a Marathi translation** in `decision_rules_translations_archive` (1,846 missing) — all `mr` responses fall back to English `action_text`. Same for Hindi if applicable. | High | 5 |
| F9 | **Module-level mutable state remaining:** `agents/intent-classifier.ts` (`_validIntentCodes`), `agents/next-crop-recommender.ts` (TTL cache), `agents/market-product-lookup.ts` (`ingredientProductCache`), `bundled-rules/loader.ts` (`conditionLedgerCache`), `decision/causal-hypothesis-engine.ts` (`hypothesisCache`), `decision/observation-code-mapper.ts` (`OBS_ALIAS_CACHE`). All read-only or TTL-bounded; verify per-tenant safety. | Medium | 7 |
| F10 | **Cross-tenant leakage inventory (W1 baseline) shows 16 `createClient(` sites** — count unchanged in current scan. RequestScope adoption incomplete. | Medium | 7 |
| F11 | **1 observation_alias still encodes a cause** (`*_(DEFICIENCY|TOXICITY)_*`) — violates `mem://safety/sugarcane-k-deficiency-hotfix` rule. | Medium | 4 |
| F12 | **No orphan FK violations** detected (rules→observations, intent_map→observations, hypothesis_rule_map→rules). FK constraints are present and enforced. ✅ | — | 3,4 |
| F13 | **Naming standard for ontology can be unified WITHOUT moving observations** — they're already lowercase. Only rules + hypotheses need the phased migration. Smaller blast radius than originally feared. | Info | 9 |

## Production Readiness Score (preview — full breakdown in Phase 10)

**77 / 100.** Strong foundation (FKs intact, RLS enabled, observation ontology already canonical), held back by translation coverage, case-inconsistency between ID classes, and audit-column gaps.

## Recommended order of operations after this audit

1. **Phase 6 hotfix (P0):** Normalize all symptom-code comparisons to a single case at the boundary (lowercase, since 2,537 obs rows are lowercase). Fix `BIOTIC_OBS_KEYS` and the test fixtures.
2. **Translation backfill (P1):** Bulk-populate `decision_rules_translations_archive.response_mr`/`response_hi` for the 1,846 active rules.
3. **Schema hardening (P1):** Add `version_hash`, `updated_at` triggers, and missing audit columns on the 4 tables called out in F5/F6 (additive, non-breaking).
4. **Lowercase ID migration (P2):** Execute Stage 1 (alias columns) of the design in `09-lowercase-migration-design.md`. Scope is `decision_rules` + `hypothesis_master` only.
5. **Runtime hardening (P2):** Finish RequestScope migration for the 16 `createClient` sites.

See per-phase deliverables for evidence and SQL drafts.
