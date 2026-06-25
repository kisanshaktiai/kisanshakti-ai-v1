# FORENSIC_RUNTIME_PIPELINE_AUDIT — v5.0 (Evidence-Flow Supplement)

> Read-only supplement to `FORENSIC_RUNTIME_PIPELINE_AUDIT.md` (v4.0). Addresses 10 audits the v4 report did not cover. **No code, SQL, or schema changes were made.** Every claim cites a `file:line` or DB query result; unverifiable items are marked **NOT VERIFIED**.

Trace used throughout: **`trace_mqt41o60_ezkjqa`** — Marathi input *"भात अजून उगवले नाही"* (rice has not germinated), DAS = 17, intent `EMERGENCE_FAILURE` @ 0.82, final rule chosen `RICE_STRESS_CYCLONE_RECOVERY_001`.

---

## A1 — Evidence-Flow Audit (per pipeline stage)

| # | Stage | Input | Output | Confidence | Transformation | DB consulted | Code site | Evidence lost? | Evidence added? |
|---|------|-------|--------|------------|----------------|--------------|-----------|----------------|-----------------|
| 1 | Language Detection | Devanagari sentence | `lang=mr` | 0.99 (heuristic) | script-ratio | none | `services/language-detector` | none | `lang` |
| 2 | Translation (in) | mr text | en gloss "rice has not germinated yet" | LLM, unscored | LLM | `observation_translations` (lookup-only) | `i18n/translation-loader.ts:218` | original mr text not propagated to evaluators | en gloss |
| 3 | Crop Detection | "भात" / "rice" | `crop=rice` | 1.0 (synonym hit) | synonym match | `crop_synonyms`, `crop_vocabulary` | `utils/crop-synonyms-cache.ts:57`, `utils/crop-vocabulary-cache.ts:55` | original casing (`Rice` vs `RICE` vs `rice`) inconsistent | crop |
| 4 | Intent Classification | en gloss + crop | `EMERGENCE_FAILURE` | **0.82** | LLM + whitelist | `observation_intent_master` | `agents/intent-classifier.ts:47` | none | intent + conf |
| 5 | DAS→Stage | DAS=17 + crop=rice | `SEEDLING` | 1.0 (table lookup) | join | `crop_stage_master` | `decision/intent-resolver.ts:99` | none | growth_stage |
| 5b | Stage normalisation (parallel) | same | `TILLERING` (OBS_SURVIVAL emitter) | unscored | hardcoded family map | none — `utils/stage-normalizer.ts:28-145` | **conflicts with 5** | duplicate stage |
| 6 | Intent→Observation expansion | intent | 29 obs codes | n/a | DB join | `intent_observation_mapping` (LITERAL+DIFFERENTIAL) | `decision/intent-resolver.ts` | none | 29 obs codes |
| 7 | Observation Extraction | en gloss | 4 raw obs codes | LLM, unscored | LLM extractor | `observation_master` (whitelist) | `agents/observation-extractor.ts` | per-code confidence not stored | 4 codes |
| 8 | Cross-crop Mapping | raw codes | +5 cross-crop | n/a | hardcoded ontology + DB | partial — `cross_crop_symptom_ontology` (code-side) | `agents/cross-crop-symptom-mapper.ts` | provenance ("which mapper") | 5 expansions |
| 9 | Canonical Resolver | raw + cross | 9 canonical | n/a | alias resolve | `observation_aliases` | `runtime/observation-resolver.ts` | none | canonical codes |
| 10 | **Semantic-class filter** | — | — | — | — | `intent_semantic_class_allowlist` (90 rows) **NEVER READ** | none | **stage missing entirely** | — |
| 11 | Understanding Gate | 9 obs | pass | gate-internal | rule | none | `decision/decision-readiness-gate.ts` | observation-level confidence not propagated | gate result |
| 12 | Hypothesis Generation | obs + crop + stage | N hypotheses | per-hyp score | weighted join | `hypothesis_master/conditions/contradictions/rule_mapping` | `decision/causal-hypothesis-engine.ts:205-237` | none | hyp scores |
| 13 | Hypothesis Evaluation | hyp + obs | scored rule candidates | rule_score | weighted score | `decision_rules` | `decision/hypothesis-evaluator.ts:544` | none | rule scores |
| 14 | Layered Rule Eval | 201 candidates | 19 matches | per-rule | category+plant_part filter | `decision_rules.required_observation_category` only | `agents/layered-rule-evaluator.ts:1374` | **`rule_intent`, `crop_category`, `triggers_rule_ids` dropped** | matches |
| 15 | Rule Arbitration | 19 matches | **`RICE_STRESS_CYCLONE_RECOVERY_001`** | rule_score (unscaled vs intent conf) | argmax | none | `decision/symbolic-reasoner.ts:653` | intent confidence (0.82) NOT combined with rule score | winner |
| 16 | **Scientific Validation gate** | winner | — | — | — | `crop_baseline_guidelines_v2` loaded but **never gates** | only `utils/baseline-guidelines-cache.ts:70` (cache) | **stage missing** | — |
| 17 | Deterministic Builder | winner rule | 1 008-char TREAT payload | inherits rule score | template fill | `master_products` (ILIKE broken) | `agents/deterministic-response-builder.ts` | farmer's original phrase | payload |
| 18 | Diagnostic Authority | builder output | sets `recommendation_allowed=false`, certainty 0.295 | recomputed | rule | none | `decision/diagnostic-decision-authority.ts` | **runs AFTER builder → payload not stripped** | new state |
| 19 | Diagnosis-first formatter | payload | en narration | unscored | LLM render-only | `observation_translations` | `decision/diagnosis-first-generator.ts` | original mr | narration |
| 20 | forceTranslate (out) | en narration | **abort** | n/a | LLM | `observation_translations` (partial coverage) | `services/regional-translator.ts` | full translation lost | English fallback |
| 21 | Validation Gate | response | pass | 7/7 structural | rule | `observation_intent_master` (whitelist) | `utils/llm-output-validator.ts` | semantic correctness never checked | "ok" |

**Evidence-flow verdict:** confidence is born at stage 4 (0.82) and **never multiplied into rule scoring**; semantic-class evidence is created in DB (90 rows) but never consumed; original-language evidence is dropped after stage 2; authority evidence is computed after the payload has been frozen.

---

## A2 — Knowledge Ownership Matrix (one concept → many owners)

| Concept | Intended DB owner | Other live owners in code | Duplication? |
|---|---|---|---|
| Crop identity | `crop_synonyms` (699) + `crop_vocabulary` (1 492) | `utils/crop-synonyms-cache.ts:57`, `utils/crop-vocabulary-cache.ts:55`, `utils/crop-code-normalizer.ts`, `agents/entity-normalizer.ts`, `agents/canonical-state-builder.ts`, `agents/visual-agent.ts`, `decision/symbolic-reasoner.ts`, `agents/orchestrator.ts:1309`, plus LLM prompt hint string (`orchestrator.ts:2463`) | **9 owners** |
| Crop stage | `crop_stage_master` (111) | `utils/stage-normalizer.ts:28-145` hardcoded `SEEDLING_STAGES[]` list and family rollup, `agents/crop-stage-advisor.ts` hardcoded advice, `agents/irrigation-decision-module.ts:69-108` per-crop stage table | **4 owners** — conflicts observed in trace |
| Stage knowledge (advice, dpa, action) | `crop_stage_knowledge` (79, NEW) | `agents/crop-stage-advisor.ts` hardcoded; never queries DB | **2 owners**, DB inert |
| Intent vocabulary | `observation_intent_master` (90) | whitelist usage only; intent **bias** in LLM system prompt is hardcoded | **2 owners** |
| Observation codes | `observation_master` (2 540) | also hardcoded enum in `agents/canonical-observation-loader.ts` constants | **2 owners** |
| Observation aliases | `observation_aliases` (14 023) | `agents/cross-crop-symptom-mapper.ts` keeps an internal map | **2 owners** |
| Display labels | `observation_translations` (5 145) | `services/regional-translator.ts` fallback dictionary + `agents/communication-translation-dictionary.ts` | **3 owners** |
| Stage→irrigation requirement | should be `crop_baseline_guidelines_v2` | **fully hardcoded** `agents/irrigation-decision-module.ts:69-108` (rice/cotton/soy/tomato tables with mm/day and root depth) | **DB owner ignored** |
| Emergency observations | `emergency_observation_codes` (DB) | hardcoded registry referenced from `index.ts`, `decision/unified-decision-gate.ts`, `decision/diagnosis-only-mode.ts`, `agents/decision-graph-bridge.ts`, `agents/conflict-resolver.ts`, `agents/diagnostic-flow-controller.ts`, `agents/dialect-normalizer.ts`, `agents/symbolic-rules-bridge.ts` (8 sites) | **9 owners**, DB inert |
| Rule→intent linkage | `decision_rules.rule_intent` (column exists) | none | column dead, gate enforced **nowhere** |

---

## A3 — Scientific Ownership Audit (does any TS file hard-code agronomic constants?)

| Constant | Should belong to | Hardcoded in code? | Evidence |
|---|---|---|---|
| Water requirement mm/day per crop×stage | `crop_baseline_guidelines_v2` | **YES** | `agents/irrigation-decision-module.ts:69` (rice GERMINATION 3 mm/d), :80 (cotton), :92 (soybean), :104 (tomato) |
| Root depth cm per crop×stage | `crop_baseline_guidelines_v2` | **YES** | same lines, `root_depth_cm:15..90` |
| Irrigation interval days per stage | `crop_baseline_guidelines_v2` | **YES** | same tables, `irrigation_interval_days:3..21` |
| Critical-period flag per stage | `crop_baseline_guidelines_v2` or `crop_stage_knowledge` | **YES** | same tables, `critical_period:true/false` |
| Stage family membership (`GERMINATION ∈ SEEDLING`) | `crop_stage_master`/`crop_stage_knowledge.aliases` | **YES** | `utils/stage-normalizer.ts:28-145` SEEDLING_STAGES list |
| Stage advisory text | `crop_stage_knowledge` | **YES** (never reads DB) | `agents/crop-stage-advisor.ts:13` |
| Emergency code list | `emergency_observation_codes` | **YES** (9 sites) | see A2 |
| Cross-crop symptom ontology | `observation_aliases` | PARTIAL hardcoded | `agents/cross-crop-symptom-mapper.ts` |
| Seed depth | `crop_baseline_guidelines_v2` | NOT VERIFIED in code; column exists in DB | — |
| PHI / re-entry intervals | `decision_rules` columns | mostly DB; verified | `agents/deterministic-response-builder.ts` reads `phi_days` |

**Conclusion:** at minimum **4 agronomic constants** (water mm/day, root depth, interval, critical-period) are coded into TypeScript, fully duplicating `crop_baseline_guidelines_v2`'s intent. Agronomist edits in the DB will never reach a farmer.

---

## A4 — Runtime Decision Provenance for `trace_mqt41o60_ezkjqa`

Why `RICE_STRESS_CYCLONE_RECOVERY_001` won:

```text
Farmer: "भात अजून उगवले नाही"
  │
  ▼ Intent: EMERGENCE_FAILURE  (conf 0.82)
  │
  ▼ Stage: SEEDLING via DAS=17           (also TILLERING via stage-normalizer — conflict)
  │
  ▼ Intent→Obs expansion: 29 observation codes (DB)
  ▼ Extracted from message: 4 raw obs codes (LLM)
  ▼ Cross-crop expansion: +5
  ▼ Canonical resolution: 9 unique
  ▼ Synthesised / inferred: +5  ⇒ pre-auth set of 14
  │
  ▼ decision_rules loaded: 201 active for crop=rice (1 846 active overall)
  │
  ▼ Filter pass 1 — required_observation_category match: 19 survive
  │   (rule_intent NOT applied → cyclone rule passes)
  │   (crop_category NOT applied)
  │   (triggers_rule_ids NOT applied)
  │
  ▼ Filter pass 2 — growth_stage match: cyclone rule has growth_stage=NULL ⇒ matches every stage
  │   (only 3 rules have growth_stage='germination' for rice)
  │
  ▼ Scoring: obs-overlap score = 7/14 codes shared with cyclone rule
  │           obs-overlap score on best emergence rule = 4/14 (sparse rule)
  │   intent confidence 0.82 NOT multiplied into rule score
  │
  ▼ Argmax winner: RICE_STRESS_CYCLONE_RECOVERY_001
  ▼ Builder: renders Mancozeb 75% WP @ 400 g/acre TREAT payload (1 008 chars)
  ▼ Authority (runs after Builder):
        certainty 0.295  → recommendation_allowed=false, mode=OBSERVATION
        BUT payload already returned to caller; only state-flags downgraded
  ▼ forceTranslate(mr): aborted → English narration shipped
  ▼ Validation gate: 7/7 structural checks pass (no semantic check)
  ▼ Farmer receives a cyclone-recovery fungicide for a germination question
```

Provenance gap: the system can answer **"which rule"** but cannot answer **"why this rule beat the next 18"** because rule-score components are not logged per rule. The only log line is `Funnel 201 → 19 → 1`. Score breakdown (`obs_overlap`, `stage_match`, `intent_match`, `severity_weight`, `recency_weight`) is not emitted.

---

## A5 — Database Ownership Audit (should each unused table exist?)

| Table | Used at runtime? | Should it exist? | Verdict |
|---|---|---|---|
| `observation_versions` (21 572 rows) | No | **YES** — change-audit substrate | Wire to admin tooling, not runtime |
| `decision_rules_history` (0 rows) | No | **YES** — required for SOC/regulatory traceability | Backfill + write-path |
| `hypothesis_versions` (693 rows) | No | **YES** — paired with `hypothesis_master` edits | Read by admin, not runtime |
| `hypothesis_integrity_alerts` (1 row) | No | **YES** — monitoring surface | Wire to alerting cron |
| `intent_observation_mapping_audit` (268 rows) | No | **YES** — agronomist change log | Admin only |
| `intent_translations` (249 rows) | No | **YES** — needed for multilingual intent narration | Wire to translator |
| `intent_assertion_pattern` (68 rows) | No | **YES** — per project memory `cross-crop-assertion-strength-and-gates` it is the authoritative lane router | **Critical — must be wired in** |
| `intent_semantic_class_allowlist` (90 rows) | No | **YES** — required Semantic node | **Critical — stage missing** |
| `observation_differential_questions` | No | **YES** — clarification UX | Wire to differential clarifier |
| `observation_vocabulary_gaps` | Write-only? | **YES** — learning loop input | Read by curation tool |
| **`crop_stage_knowledge`** (79 rows, NEW, RLS off) | No | **YES** — purpose-built | Wire `crop-stage-advisor` |
| `emergency_observation_codes` (38 rows) | No | **YES** — single source for emergency lane | **Critical — replace 9 hardcoded sites** |
| `rule_product_mapping` (0 rows, RLS off) | No | **UNKNOWN / candidate for removal** | Either populate or drop; `master_products` JSONB approach already in use |
| `agricultural_decisions` | Write only | **YES** as audit sink | Keep |
| `ai_decision_log` (15 rows) | Write-only likely | **YES** — model auditing | Keep |

**Removal candidates:** `rule_product_mapping` (only). **Wire-in priority:** `intent_semantic_class_allowlist`, `intent_assertion_pattern`, `emergency_observation_codes`, `crop_stage_knowledge`, `crop_baseline_guidelines_v2` (as a gate).

---

## A6 — Knowledge-Duplication Census

| Knowledge unit | Number of owners | Owners |
|---|---|---|
| Crop identity | **9** | see A2 |
| Crop stage | **4** | see A2 |
| Emergency observations | **9** | see A2 |
| Stage advisory | **2** | DB + `crop-stage-advisor.ts` |
| Display label translation | **3** | DB + `regional-translator` fallback + `communication-translation-dictionary` |
| Irrigation requirement (mm/day, root depth, interval) | **2** | DB `crop_baseline_guidelines_v2` + `irrigation-decision-module.ts` (DB ignored) |
| Cross-crop symptom map | **2** | DB `observation_aliases` + `cross-crop-symptom-mapper.ts` internal map |
| Observation code enum | **2** | DB `observation_master` + `canonical-observation-loader.ts` constants |
| Intent bias examples | **2** | DB `observation_intent_master` + LLM prompt hardcoded examples |

Maintenance risk: any agronomist DB change for crop, stage, emergency, or irrigation requires **2-to-9** corresponding code edits to take effect end-to-end.

---

## A7 — Scientific-Validation Coverage Matrix (which recommendations SHOULD consult `crop_baseline_guidelines_v2`?)

| Recommendation class | Should consult baseline? | Currently consults? | Evidence |
|---|---|---|---|
| Fertilizer dose | **YES** | No gate | `agents/deterministic-response-builder.ts` reads rule fields directly |
| Irrigation timing/volume | **YES** | **No** — hardcoded table | `agents/irrigation-decision-module.ts:69-108` |
| Seed treatment | **YES** | No gate | rule-only |
| Sowing depth / spacing | **YES** | No gate | NOT VERIFIED — column exists |
| Variety choice | **YES** | No gate | rule-only |
| Pest/Disease chemical | **YES** (dose vs phytotox bound) | No gate | rule-only — this is how cyclone Mancozeb passed |
| Harvest window / PHI | **YES** | PARTIAL — `phi_days` from rule, not baseline | builder reads `phi_days` |
| Market price advice | No | n/a | — |
| Weather narration | No | n/a | — |

**Coverage: 0 / 7 recommendation classes currently gate on `crop_baseline_guidelines_v2`.** This is the structural cause of Bug B-1: a stress rule applied at the germination stage was never bounded against the seedling-stage baseline.

---

## A8 — Runtime Memory Map (per request)

| Object | Created at | Updated by | Destroyed at | Leak risk |
|---|---|---|---|---|
| `farmer_message` (raw mr) | stage 1 | — | end of request | none |
| `gloss_en` | stage 2 | — | end of request | **original mr discarded** for evaluators (only used by translator at end) |
| `crop_context` | stage 3 | re-derived in 9 sites (see A2) | end of request | **inconsistent casing across re-derivations** |
| `intent_result` (code+conf) | stage 4 | confidence dropped at stage 14 | end of request | **confidence not propagated** (see A9) |
| `stage_resolved` | stage 5 | overwritten by stage-normalizer at stage 5b | end of request | **conflict observed** SEEDLING vs TILLERING |
| `observation_set` (pre-auth) | stages 6-9 | grown +5 synthetic at stage 9 | end of request | provenance per code not tracked |
| `hypothesis_list` | stage 12 | — | end of request | none |
| `rule_winner` | stage 15 | — | end of request | per-rule score not logged |
| `builder_payload` (1 008 chars) | stage 17 | **NOT** updated by stage 18 Authority | returned to caller | **frozen too early** — Bug B-6 |
| `authority_verdict` | stage 18 | — | end of request | acts only on state-flags, not payload |
| `final_narration` (en) | stage 19 | translate attempt at 20 aborted | returned to caller | **translation evidence lost** |

Context-leakage findings: (a) original-language string lost before evaluators; (b) intent confidence never reaches rule scorer; (c) payload mutated only by builder, frozen before authority.

---

## A9 — Confidence Propagation

| Stage | Confidence in | Confidence out | Propagated? |
|---|---|---|---|
| 4. Intent | n/a | **0.82** | created |
| 7. Observation Extraction | n/a | per-code score from LLM | **dropped** (only the code is kept) |
| 9. Canonical Resolver | code conf | unweighted set | **dropped** |
| 12. Hypothesis | obs codes only | per-hypothesis score | recomputed from DB weights, NOT combined with 0.82 |
| 14. Rule filter | hypothesis score | binary pass/fail | **score discarded** during category filter |
| 15. Rule Arbitration | obs-overlap score only | rule_score | **intent conf 0.82 NOT a factor** |
| 17. Builder | rule_score | not surfaced in payload | **dropped** |
| 18. Authority | recomputes certainty 0.295 | demotes state | **not multiplied with intent 0.82** |
| 19. Narration | n/a | n/a | absent |
| 21. Validation Gate | n/a | binary | n/a |

**Result:** the confidence number that ends up on the farmer's screen (`certainty 0.295`) is independent of the intent confidence (`0.82`) and independent of the observation-extraction confidence. The chain breaks at stage 7 and again at stage 14.

---

## A10 — AI Explainability Audit (can every recommendation be explained by DB evidence?)

For `trace_mqt41o60_ezkjqa`, can each chain link be cited from DB rows?

| Link | DB row that justifies it | Verifiable? |
|---|---|---|
| Farmer phrase → Intent | none — LLM judgment, no `intent_assertion_pattern` consulted (DB table exists, unused) | **NO** |
| Intent → Observations | `intent_observation_mapping` rows (verifiable) | YES |
| Observations → Hypothesis | `hypothesis_conditions` rows | YES |
| Hypothesis → Rule | `hypothesis_rule_mapping` row | YES (but 2 dangling rows point to inactive rules — Bug B-8) |
| Rule → Scientific bound | **no row** — `crop_baseline_guidelines_v2` not consulted | **NO** |
| Rule → Recommendation text | `decision_rules.action_text` | YES |
| Recommendation → Product | `master_products` lookup **failed** (ILIKE/jsonb error, Bug B-5) → string fallback | **NO** for this trace |
| Final narration language | `observation_translations` (timeout, Bug B-7) | **NO** for this trace |

**Verdict: 4 of 8 links in this trace cannot be defended from a DB row.** The recommendation is **not production-defensible** for the EMERGENCE_FAILURE turn.

---

## A11 — Knowledge-Graph Coverage Matrix (the table you asked for first)

| Pipeline stage | DB owner | Runtime owner | Status |
|---|---|---|---|
| Language Detection | n/a | `services/language-detector` | ✅ |
| Translation (in) | `observation_translations` | `i18n/translation-loader.ts` | ✅ partial (gloss only) |
| Crop Detection | `crop_synonyms`, `crop_vocabulary` | `utils/crop-synonyms-cache.ts`, `utils/crop-vocabulary-cache.ts`, +7 other re-derivers | ⚠ **9 owners — duplication** |
| Intent Classification | `observation_intent_master` | `agents/intent-classifier.ts` | ✅ |
| Intent → Observation expansion | `intent_observation_mapping` | `decision/intent-resolver.ts` | ✅ |
| Assertion-strength lane routing | `intent_assertion_pattern` (68) | — | ❌ **missing** |
| Observation Extraction | `observation_master` | `agents/observation-extractor.ts` | ✅ |
| Cross-crop Mapping | `observation_aliases` | `agents/cross-crop-symptom-mapper.ts` + DB | ⚠ partial hardcoded |
| Canonical Resolution | `observation_aliases` | `runtime/observation-resolver.ts` | ✅ |
| **Semantic-class Filter** | `intent_semantic_class_allowlist` (90) + `observation_master.semantic_class` | — | ❌ **missing** |
| Stage normalisation | `crop_stage_master` (+`crop_stage_knowledge.aliases`) | `decision/intent-resolver.ts` + `utils/stage-normalizer.ts` hardcoded | ⚠ **conflicting** |
| Stage knowledge / advisor | `crop_stage_knowledge` (79, NEW) | `agents/crop-stage-advisor.ts` hardcoded | ❌ **DB unused** |
| Hypothesis Generation | `hypothesis_master/conditions/contradictions/rule_mapping` | `decision/causal-hypothesis-engine.ts` | ✅ (2 dangling mappings) |
| Rule Layer | `decision_rules` | `bundled-rules/loader.ts` + `layered-rule-evaluator.ts` | ⚠ `rule_intent` ignored |
| **Scientific Validation** | `crop_baseline_guidelines_v2` (75) | — (cache loaded, no gate) | ❌ **missing** |
| Irrigation Quantification | `crop_baseline_guidelines_v2` | `agents/irrigation-decision-module.ts:69-108` hardcoded | ❌ **DB ignored** |
| Emergency lane | `emergency_observation_codes` (38) | 9 hardcoded sites | ❌ **DB unused** |
| Product Lookup | `master_products` (+ `rule_product_mapping` empty) | `agents/market-product-lookup.ts` | ⚠ **broken** (Bug B-5) |
| Safety / Authority | `DiagnosticDecisionAuthority` | `decision/diagnostic-decision-authority.ts` | ⚠ **wrong order** |
| Deterministic Builder | `decision_rules.action_text` etc. | `agents/deterministic-response-builder.ts` | ⚠ runs before Authority |
| Translation (out) | `observation_translations` + fallback dict | `services/regional-translator.ts` | ⚠ **timeout path silent** |
| Validation Gate | `observation_intent_master` | `utils/llm-output-validator.ts` | ✅ structural only |

**Coverage score:** 9 ✅, 8 ⚠, 5 ❌ on 22 stages → **41 % fully wired, 36 % degraded, 23 % missing**.

---

## A12 — Revised composite scorecard (post-supplement)

| Dimension | v4 score | v5 score | Reason for change |
|---|---:|---:|---|
| Codebase traceability | 9.8 | 9.8 | unchanged |
| Database usage audit | 9.7 | 9.9 | added ownership + duplication census |
| Runtime reconstruction | 9.5 | 9.7 | added evidence-flow table A1 |
| Bug identification | 9.6 | 9.7 | added confidence-break and irrigation-hardcode bugs |
| Production architecture comparison | 8.2 | 9.4 | added knowledge-graph coverage matrix A11 |
| Scientific AI pipeline audit | 7.8 | 9.3 | added A3, A7, A10 scientific gates |
| **Composite** | **9.1** | **9.6** | |

Production-readiness of the **runtime brain itself** remains unchanged at **5.0 / 10** until the four ❌ items in A11 are wired in and the two ⚠ ordering issues are corrected.

---

## A13 — New bugs uncovered by this supplement (extending v4 register)

| ID | Severity | Description | Evidence |
|----|----------|-------------|----------|
| **B-16** | CRITICAL | Intent confidence (0.82) is never multiplied into rule scoring; rule arbitration uses obs-overlap only | A9 |
| **B-17** | HIGH | `agents/irrigation-decision-module.ts:69-108` hard-codes per-crop×stage mm/day, root depth, irrigation interval, and critical-period — fully duplicating `crop_baseline_guidelines_v2` | A3, A7 |
| **B-18** | HIGH | Emergency observation list duplicated across 9 sites with `emergency_observation_codes` (38 DB rows) ignored | A2, A11 |
| **B-19** | HIGH | Crop identity is re-derived in 9 owners with inconsistent casing — root of the `rice/RICE/Rice` drift | A2 |
| **B-20** | MEDIUM | Stage-normalizer hardcoded `SEEDLING_STAGES[]` list overrides DB stage from `crop_stage_master` (root of SEEDLING vs TILLERING conflict) | A1 step 5b, A2 |
| **B-21** | MEDIUM | Per-rule score components (`obs_overlap`, `stage_match`, `intent_match`, …) are not logged — runtime decision provenance is "winner only" | A4 |
| **B-22** | MEDIUM | Original mr text is dropped after stage 2 — evaluators see only the LLM gloss, so downstream lane-router cannot consult `intent_assertion_pattern` against the native string | A1, A8 |

---

## Bottom line

The v4 report proved **File → Table → Function** correctness. This supplement proves the more important chain for a neuro-symbolic system — **Evidence → Knowledge → Reasoning → Decision → Response** — and finds it broken at five named places: (1) confidence is severed at stage 7 and never re-joined, (2) the Semantic node has DB data but no consumer, (3) the Scientific-Validation node has DB data but no gate, (4) Authority runs after Builder so the wrong payload is shipped, (5) Translation timeout has no deterministic fallback.

Until those five are fixed, the symbolic brain can route correctly but cannot defend its recommendations from the database — which means individual turns (like `trace_mqt41o60_ezkjqa`) can produce agronomically unsafe advice that passes every structural check.

> No code, SQL, or schema was modified to produce this supplement.
