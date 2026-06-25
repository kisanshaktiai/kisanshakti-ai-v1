# FORENSIC_RUNTIME_PIPELINE_AUDIT — v4.0 (Pipeline-First)

> Scope locked to read-only: **no code, SQL, or schema changes**. Every claim below is backed by a direct DB query or a `file:line` reference. Anything I could not confirm is marked **NOT VERIFIED**.

---

## 0. Evidence base used

| Source | What I read |
|--------|------------|
| `supabase_migrations.schema_migrations` (24 migrations between 2026-06-13 and 2026-06-24) | last-month schema delta |
| `information_schema.columns` for 32 authoritative tables | column truth |
| `pg_class.reltuples`, `pg_stat_get_last_analyze_time` | row estimates + ANALYZE freshness |
| `pg_publication_tables` for `supabase_realtime` | realtime membership |
| `supabase/functions/ai-agriculture-chat/**/*.ts` via `rg` | code references |
| Attached prod log file `pasted-2026-06-25T07-13-58-405Z.txt` (4 412 lines, one trace `trace_mqt41o60_ezkjqa`) | live runtime replay |

---

## 1. Last-month migration delta (verified against prod `schema_migrations`)

24 migrations executed between `20260613` and `20260624`. The brain-relevant ones:

| Version | Name | What it actually does |
|---------|------|-----------------------|
| 20260621172301 | `fix_rice_emergence_data_2026_06_21` | Added/edited rice emergence observations (verified) |
| 20260622060810 | `create_audit_manual_review_table` | New audit surface |
| 20260622061944 | `apply_convention_a_to_batch_1_1_hanging_rules` | Sugarcane rule cleanup |
| 20260622063339 | `extract_sugarcane_etl_batch_1_2_with_agronomist_judgment` | Rule ingestion |
| 20260622073402 | `fix_red_rot_resistant_varieties_co0238_to_com0265` | Variety rename |
| 20260622142312-142853 | rice ETL/ingredient/PHI batches 2.x | rice rules expanded |
| 20260624102826 | **`create_crop_stage_knowledge`** | NEW table (18 cols, RLS **off**, no `action_codes` column) |
| 20260624103101 | **`seed_crop_stage_knowledge`** | seeded 79 rows |

Confirmed: the report you reviewed earlier ("schema 100% lower_snake_case complete") **never inspected these last 24 migrations** — they post-date that audit.

---

## 2. Authoritative knowledge graph — DB-side traceability matrix

(`row_estimate` is `pg_class.reltuples`; `-1` means never analyzed. RLS flag from `pg_class.relrowsecurity`.)

| Table | Rows | Cols | ANALYZE | RLS | Referenced in code (file:line) | Verdict |
|-------|-----:|----:|:--------|:---:|--------------------------------|---------|
| `observation_intent_master` | 90 | 13 | 2026-05-29 | on | `utils/llm-output-validator.ts:57`, `agents/intent-classifier.ts:47`, `agents/orchestrator.ts:2829` | **USED** (whitelist only) |
| `intent_translations` | 249 | 6 | 2026-05-29 | on | NOT FOUND | **NOT USED** |
| `intent_assertion_pattern` | 68 | 8 | **NULL** | on | NOT FOUND | **NOT USED** |
| `crop_vocabulary` | 1 492 | 10 | 2026-05-29 | on | `utils/crop-vocabulary-cache.ts:55`, `agents/orchestrator.ts:1309,2463-2464` | **USED** (hint string only) |
| `observation_master` | 2 540 | 24 | 2026-05-29 | on | `bundled-rules/loader.ts:1214`, `decision/symbolic-reasoner.ts:696`, `decision/hypothesis-evaluator.ts:669`, `utils/llm-output-validator.ts:106` | **USED** |
| `observation_aliases` | 14 023 | 10 | 2026-05-29 | on | `bundled-rules/loader.ts:1190`, `decision/observation-code-mapper.ts:509`, `agents/orchestrator.ts:1801-1810` | **USED** |
| `observation_translations` | 5 145 | 7 | 2026-05-29 | on | `i18n/translation-loader.ts:218`, `i18n/observation-label-loader.ts:92`, `agents/orchestrator.ts:668` and 10+ others | **USED** (display only) |
| `observation_versions` | 21 572 | 8 | 2026-05-29 | on | NOT FOUND | **NOT USED at runtime** |
| `observation_differential_questions` | -1 | 7 | **NULL** | on | NOT FOUND | **NOT USED** |
| `observation_vocabulary_gaps` | -1 | 12 | **NULL** | on | NOT FOUND in `from(`; logging only | **WRITE-ONLY / unverified** |
| `intent_observation_mapping` | 13 672 | 12 | 2026-05-29 | on | `decision/intent-resolver.ts` (chain), trace log `DB_INTENT_OBSERVATIONS` | **USED** |
| `intent_observation_mapping_audit` | 268 | 9 | **NULL** | on | NOT FOUND | **NOT USED** |
| `intent_semantic_class_allowlist` | 90 | 5 | **NULL** | on | NOT FOUND | **NOT USED** ← architecturally required, runtime bypass |
| `hypothesis_master` | 346 | 16 | 2026-05-29 | on | `decision/causal-hypothesis-engine.ts:205` | **USED** |
| `hypothesis_conditions` | 713 | 12 | 2026-05-29 | on | `decision/causal-hypothesis-engine.ts:231` | **USED** |
| `hypothesis_contradictions` | 346 | 7 | 2026-05-29 | on | `decision/causal-hypothesis-engine.ts:234` | **USED** |
| `hypothesis_rule_mapping` | 1 806 | 6 | 2026-05-29 | on | `decision/causal-hypothesis-engine.ts:237` | **USED** |
| `hypothesis_metrics` | 67 | 9 | 2026-05-29 | on | `decision/causal-hypothesis-engine.ts:756,767` (upsert) | **USED (write)** |
| `hypothesis_versions` | 693 | 8 | 2026-05-29 | on | NOT FOUND | **NOT USED** |
| `hypothesis_integrity_alerts` | 1 | 9 | 2026-05-29 | on | NOT FOUND | **NOT USED** |
| `decision_rules` | 1 852 (1 846 active) | **163** | 2026-05-29 | on | `bundled-rules/loader.ts:105`, `decision/hypothesis-evaluator.ts:544`, `decision/symbolic-reasoner.ts:653`, `agents/orchestrator.ts:1810,6620`, +5 others | **USED** |
| `decision_rules_history` | 0 | 8 | 2026-05-29 | on | NOT FOUND | **NOT USED** |
| `crop_baseline_guidelines_v2` | 75 | 30 | 2026-05-29 | on | `utils/baseline-guidelines-cache.ts:70` (cache load only) | **USED (read-only cache; never gates recommendation)** |
| **`crop_stage_knowledge`** | 79 | 18 | **NULL** | **OFF** | `agents/crop-stage-advisor.ts:13` ("MIGRATION TARGET" comment only) | **NOT USED — table seeded but runtime ignores it** |
| `crop_stage_master` | 111 | 8 | 2026-05-29 | on | `decision/db-observation-validator.ts:73,84`, `decision/intent-resolver.ts:99` | **USED** |
| `crop_synonyms` | 699 | 9 | 2026-05-29 | on | `utils/crop-synonyms-cache.ts:57` | **USED** |
| `emergency_observation_codes` | -1 | 4 | **NULL** | on | NOT FOUND | **NOT USED** |
| `agricultural_decisions` | -1 | 15 | **NULL** | on | `agents/orchestrator.ts:8294` (insert only) | **WRITE-ONLY audit sink** |
| `ai_decision_log` | 15 | 28 | 2026-05-29 | on | NOT VERIFIED at trace time | **WRITE-ONLY likely** |
| `weather_observations` | 736 | 22 | 2026-05-29 | on | `decision/authoritative-state-loader.ts:404,487,494` | **USED** |
| `master_products` | 173 (196 active) | 134 | 2026-05-29 | on | `agents/market-product-lookup.ts:133` | **USED (but broken — see Bug B-5)** |
| `rule_product_mapping` | **0** | 7 | 2026-05-29 | **off** | NOT FOUND | **EMPTY + NOT USED** |

**Summary of bypassed authoritative tables**
`intent_translations`, `intent_assertion_pattern`, `intent_semantic_class_allowlist`, `observation_versions`, `observation_differential_questions`, `intent_observation_mapping_audit`, `hypothesis_versions`, `hypothesis_integrity_alerts`, `decision_rules_history`, **`crop_stage_knowledge`**, `emergency_observation_codes`, `rule_product_mapping`. Twelve tables of the documented graph are zero-impact at runtime.

---

## 3. Column-level drift (code refers to columns that don't exist; DB exposes columns code ignores)

| Column referenced in code | Real table state | Verdict |
|---|---|---|
| `decision_rules.decision_action` (cited in prior audit) | column **absent**; actual fields are `action_text`, `action_type`, `mode_of_action`, `decision_trace_template`, `requires_field_action`, `interaction_type` | **dead reference** |
| `observation_master.observation_label` | column **absent**; only `description` exists | **dead reference** (`decision/diagnosis-first-generator.ts:52`, hypothesis-evaluator output) |
| `decision_rules.rule_intent` (DB has it) | **never read** by code | **dead column** (gate not enforced) |
| `decision_rules.triggers_rule_ids` (DB has it) | **never read** | **dead column** |
| `decision_rules.crop_category` (DB has it) | **never read** | **dead column** |
| `decision_rules.required_observation_category` | **read** by `bundled-rules/loader.ts:344`, `decision/hypothesis-evaluator.ts:686`, `decision/symbolic-reasoner.ts:793`, `agents/layered-rule-evaluator.ts:1374` | only structural intent-gate the brain has today |

---

## 4. Current runtime pipeline (reverse-engineered, every arrow has a file:line)

```text
Farmer Message
  │  index.ts (entry)
  ▼
Language Detection                 index.ts → services/language-detector
  ▼
Translation (in)                   services/regional-translator.ts:160 (observation_translations cache)
  ▼
Crop Detection                     utils/crop-synonyms-cache.ts + utils/crop-vocabulary-cache.ts
  ▼
Intent Classification              agents/intent-classifier.ts:47 (observation_intent_master whitelist)
  ▼
Intent Resolution                  decision/intent-resolver.ts:99 (crop_stage_master for DAS→stage)
  │                                  └─ DB_INTENT_OBSERVATIONS:
  │                                     intent_observation_mapping (LITERAL / DIFFERENTIAL)
  ▼
Observation Extraction             agents/observation-extractor.ts
  ▼
Cross-crop Symptom Mapping         agents/cross-crop-symptom-mapper.ts → orchestrator.ts:1801
  ▼
Canonical Code Resolution          runtime/observation-resolver.ts  (observation_aliases)
  ▼
Understanding / Readiness Gate     decision/decision-readiness-gate.ts
  ▼
Hypothesis Generation              decision/causal-hypothesis-engine.ts:205-237
                                     ├─ hypothesis_master
                                     ├─ hypothesis_conditions
                                     ├─ hypothesis_contradictions
                                     └─ hypothesis_rule_mapping
  ▼
Hypothesis Evaluation              decision/hypothesis-evaluator.ts:544 (decision_rules)
  ▼
Layered Rule Evaluation            agents/layered-rule-evaluator.ts:1374 (required_observation_category)
                                   bundled-rules/loader.ts:105 (decision_rules bulk loader)
                                   decision/symbolic-reasoner.ts:653/793
  ▼
Unified Decision Gate              decision/unified-decision-gate.ts
  ▼
Deterministic Response Builder     agents/deterministic-response-builder.ts (renders TREAT + ingredient)
  ▼  (writes payload BEFORE authority demotes)
Diagnostic Decision Authority      index.ts → decision/diagnostic-decision-authority.ts
  ▼  (overrides state fields ONLY, not payload — see Bug B-6)
LLM Render-only Formatting         decision/diagnosis-first-generator.ts
  ▼
forceTranslate (out)               services/regional-translator → LLM (timed-out in trace)
  ▼
Validation Gate                    utils/llm-output-validator.ts (7 checks, passed despite wrong rule)
  ▼
Farmer
```

Stages from target architecture that are **missing or bypassed**: see §5.

---

## 5. Target-vs-current stage matrix

| Target stage | Implemented? | Evidence |
|---|---|---|
| Language Detection | YES | `services/language-detector` |
| Translation (in) | YES | `i18n/translation-loader.ts:218` |
| `crop_vocabulary` lookup | PARTIAL — used only as hint string, not enforcing | `agents/orchestrator.ts:2463` |
| Crop Detection | YES | `utils/crop-synonyms-cache.ts` |
| Intent Bias / LLM Understanding / Canonical Intent | YES | `agents/intent-classifier.ts`, NLU log lines |
| Canonical Observation Codes | YES | `runtime/observation-resolver.ts` |
| `intent_observation_mapping` join | YES | `decision/intent-resolver.ts`, trace `DB_INTENT_OBSERVATIONS` |
| `observation_master.semantic_class` | NOT VERIFIED — column present, no code reference found | — |
| **`intent_semantic_class_allowlist`** | **MISSING — runtime bypass** | 90 DB rows, 0 code references |
| Hypothesis Generation & Validation | YES | `causal-hypothesis-engine.ts` |
| Rule layer (`decision_rules`) | YES | `loader.ts:105`, others |
| **`crop_baseline_guidelines_v2` scientific validation gate** | **PARTIAL — cache loads it, no gate consults it before recommendation** | `utils/baseline-guidelines-cache.ts:70` only |
| **`crop_stage_knowledge` runtime advisor** | **MISSING — table created but never queried** | 79 DB rows, comment-only ref |
| DiagnosticDecisionAuthority | YES, **out-of-order** (runs after builder) | see Bug B-6 |
| DeterministicBuilder | YES | `agents/deterministic-response-builder.ts` |
| Translation (out) | PARTIAL — aborts on timeout, no fallback dictionary | `forceTranslate` warning in trace |

---

## 6. Runtime bypass detection — utilization scores

| Table | Queried? | Where | Data used downstream? | Overwritten / bypassed later? | Hard-coded replacement? | Influences final farmer response? | **Score** |
|---|---|---|---|---|---|---|--:|
| `observation_master` | Yes | loader, evaluator | Yes | No | No | Yes | **95 %** |
| `observation_aliases` | Yes | loader/orchestrator | Yes | No | Cross-crop ontology partly hardcoded | Yes | **85 %** |
| `intent_observation_mapping` | Yes | intent-resolver | Yes | No | No | Yes | **90 %** |
| `decision_rules` | Yes | 7 files | Yes | No | No | Yes | **95 %** |
| `hypothesis_*` (master/cond/contra/map) | Yes | causal-engine | Yes | No | No | Yes | **80 %** |
| `crop_synonyms`, `crop_vocabulary` | Yes | caches | Hint only | Yes (LLM may override) | Some normalization helpers | Partly | **55 %** |
| `crop_stage_master` | Yes | db-observation-validator, intent-resolver | Yes | No | Stage-normalizer has hardcoded family map | Yes | **70 %** |
| **`crop_stage_knowledge`** | **No** | — | — | — | Hardcoded stage advice in `crop-stage-advisor.ts` | No | **0 %** |
| **`intent_semantic_class_allowlist`** | **No** | — | — | — | None (silent skip) | No | **0 %** |
| **`intent_assertion_pattern`** | **No** | — | — | — | Lane routing hardcoded | No | **0 %** |
| **`crop_baseline_guidelines_v2`** | Loaded into cache | `baseline-guidelines-cache.ts:70` | **Never consulted by any gate** | n/a | No | No | **10 %** |
| **`rule_product_mapping`** | **No + empty** | — | — | — | `market-product-lookup` does ILIKE on `master_products.active_ingredients::text` | No | **0 %** |
| **`emergency_observation_codes`** | **No** | — | — | — | Hardcoded emergency map in `emergency-diagnostic-registry` | No | **0 %** |
| `observation_translations` | Yes | 8+ sites | Yes | No | No | Yes (display) | **95 %** |
| `master_products` | Yes | market-product-lookup | Yes | No | Brand fallback strings | Yes | **40 %** (broken — Bug B-5) |
| `weather_observations` | Yes | authoritative-state-loader | Yes | No | Fallback to `weather_current` | Yes | **85 %** |
| `agricultural_decisions` | Insert only | orchestrator:8294 | n/a | n/a | n/a | n/a | **audit sink** |

**Aggregate runtime-utilization of authoritative knowledge graph:** 12 of 32 tables are at ≤ 10 % → ~ **62 %** of the documented graph is actually exercised; **38 %** is data created with no live consumer.

---

## 7. Knowledge-graph consistency (does runtime respect the layer order?)

Required chain: `Intent → Observation → Semantic → Hypothesis → Rule → Scientific Validation → Safety → Builder → Translation`.

- **Semantic node skipped:** no use of `intent_semantic_class_allowlist` or `observation_master.semantic_class` between Intent and Hypothesis.
- **Scientific-Validation node skipped:** `crop_baseline_guidelines_v2` is cache-loaded but never gates the recommendation.
- **Authority node out-of-order:** runs after Builder rather than before, so it can demote `recommendation_allowed=false` *after* the Mancozeb payload was already produced (see Bug B-6).
- **Stage-knowledge node missing:** `crop_stage_knowledge` is dark.

---

## 8. Live pipeline replay — `trace_mqt41o60_ezkjqa`

Farmer (mr): **"भात अजून उगवले नाही"** ("Rice has not germinated yet").

| Phase | File / function | Result | Source line |
|---|---|---|---|
| NLU | intent-classifier | `EMERGENCE_FAILURE` @ 0.82 (HIGH) | log: `[IntentResolver] Found 29 observation codes for intent=EMERGENCE_FAILURE` |
| Crop normalisation | crop-synonyms-cache | `crop=Rice/RICE/rice` (3 casings observed) | logs |
| DAS→Stage | `crop_stage_master` via `intent-resolver.ts:99` | stage=**SEEDLING** | Check-5 log |
| Stage shown elsewhere | OBS_SURVIVAL | stage=**TILLERING** ⚠ inconsistent | log JSON |
| `DB_INTENT_OBSERVATIONS` | `intent_observation_mapping` | +6 LITERAL +0 STRONG +3 candidate → 10 confirmed, 3 candidate | log |
| Observation expansion | `observation_aliases` | mapped 4 → expanded 9 → pre-auth 19 → confirmed 14 + 5 synthetic | log |
| Rule evaluation | `bundled-rules/loader.ts` + `layered-rule-evaluator.ts` | 201 rules evaluated, 19 matched | log Funnel |
| Primary rule chosen | symbolic-reasoner | **RICE_STRESS_CYCLONE_RECOVERY_001** (`category=stress`, `growth_stage=NULL`, `action_type=urgent_action`, Mancozeb 75 % WP @ 400 g/acre) | DB row verified |
| MarketProductLookup | `market-product-lookup.ts:137` | DB error: `operator does not exist: jsonb ~~* unknown` → fallback | log |
| Deterministic builder | `deterministic-response-builder.ts` | rendered 1 008-char `TREAT` response | log |
| Authority | `diagnostic-decision-authority` | stripped `recommendation_allowed=false`, `response_mode=OBSERVATION`, certainty 0.295 — **after** builder serialised the response | log |
| forceTranslate | `regional-translator → LLM` | aborted (`The signal has been aborted`) → English text retained | log |
| Validation gate | `utils/llm-output-validator.ts` | 7 checks passed (structural only, not semantic) | log |
| Farmer | sees `RICE_STRESS_CYCLONE_RECOVERY_001` advice in English | wrong rule + wrong language | log |

Why germination input picked cyclone-recovery rule: the cyclone rule has `growth_stage=NULL` and shares generic observation codes (`leaf_yellowing`, `poor_stand`, `submergence_like`). With only **3 active rules** for `rice/germination` and no `rule_intent` enforcement, the arbiter scored the broader stress rule highest.

---

## 9. Critical bug register (evidence-based)

| ID | Severity | Description | Evidence | Location | Stage | Farmer impact | Future fix |
|----|---------|------------|----------|----------|-------|---------------|------------|
| **B-1** | CRITICAL | Wrong-domain rule selected because `decision_rules.rule_intent` is never enforced and stage-agnostic rules can win germination queries | DB column exists, `rg` returns 0 code refs; trace picks `RICE_STRESS_CYCLONE_RECOVERY_001` | `agents/layered-rule-evaluator.ts:1374` (only `required_observation_category`) | Rule layer | Fungicide for emergence failure | Add intent-category gate using existing `rule_intent` |
| **B-2** | CRITICAL | Stage normalisation drift — two different stages within the same turn (SEEDLING vs TILLERING) | log lines 264 vs 1416 | `utils/stage-normalizer.ts` vs `decision/intent-resolver.ts:99` vs OBS_SURVIVAL emitter | Stage | Stage-specific rules silently mis-filtered | Make `crop_stage_master` + `crop_stage_knowledge.aliases` joint SSOT |
| **B-3** | HIGH | `crop_stage_knowledge` (newly created, 79 rows) is never queried — hardcoded advice still used | `rg` returns only doc comment | `agents/crop-stage-advisor.ts:13` | Crop knowledge | Stale agronomy | Wire advisor to DB; add `action_codes` col |
| **B-4** | HIGH | Sparse germination rule coverage: only 3 active rules for `rice/germination`; 134 rules have NULL `growth_stage` | `SELECT … FROM decision_rules WHERE crop_code='rice'` | DB | Rule data | Forces wide fallback | Backfill stage on stress rules; add germination rules |
| **B-5** | HIGH | MarketProductLookup uses `.ilike('active_ingredients::text', …)` — PostgREST rejects jsonb cast | log `operator does not exist: jsonb ~~* unknown` | `agents/market-product-lookup.ts:137` | Product lookup | Brand names lost | Use `.contains` or RPC with `jsonb_path_exists` |
| **B-6** | CRITICAL | DiagnosticDecisionAuthority runs AFTER DeterministicBuilder; nulls state flags but does not strip payload | trace: builder logs at 1782368296101, authority overrides at 1782368296942 | `index.ts` ordering, `decision/diagnostic-decision-authority.ts` | Authority | Wrong recommendation reaches farmer | Move authority before builder, or have builder consult authority |
| **B-7** | HIGH | forceTranslate aborts on timeout with no Marathi fallback — English template delivered verbatim | log `forceTranslate LLM translation failed: The signal has been aborted` | `services/regional-translator.ts` | Translation | Marathi UX broken | Larger abort budget + deterministic fallback dictionary |
| **B-8** | HIGH | 2 mappings still point to inactive rules (`SC_DIAG_ESB_001`, `SC_NUTRITION_NITROGEN_025`) | join `hypothesis_rule_mapping × decision_rules WHERE is_active=false` → 2 | DB | Hypothesis layer | Sugarcane hypotheses silently unbacked | Reactivate or delete mappings |
| **B-9** | MEDIUM | Twelve authoritative tables not exercised at runtime → graph 38 % dead | §6 utilization scores | DB + code | Knowledge graph | Investment without consumer | Wire each one in or drop |
| **B-10** | MEDIUM | 8 tables (`crop_stage_knowledge`, `intent_assertion_pattern`, `intent_semantic_class_allowlist`, …) have `last_analyze IS NULL` | `pg_stat_get_last_analyze_time` | DB | Planner | Wrong index plans | `ANALYZE` |
| **B-11** | MEDIUM | None of the symbolic tables are in `supabase_realtime` publication | `pg_publication_tables` query returned empty | DB | Cache invalidation | Edge cache cannot refresh on agronomist edits | Add to publication |
| **B-12** | MEDIUM | `crop_baseline_guidelines_v2` loaded into cache but never gates the recommendation | only `baseline-guidelines-cache.ts:70`, no consumer | Code | Scientific Validation | Unscientific advice leaks (cyclone fungicide on 17-day seedling) | Add pre-builder gate |
| **B-13** | MEDIUM | `rule_product_mapping` has 0 rows AND is not referenced | DB count 0, `rg` 0 hits | DB+code | Product layer | Forces ILIKE fallback (B-5) | Populate or remove |
| **B-14** | LOW | Schema column drift: code references `decision_action` and `observation_label`, neither exists | `information_schema.columns` | code | Builder/Diag generators | Silent `undefined` → generic narration | Rename or drop refs |
| **B-15** | LOW | Crop-code casing drift (`rice` vs `RICE` vs `Rice`) | logs | several sites | All layers | Missed `.eq()` matches | Canonicalise at boundaries |

---

## 10. Pipeline-order validation

| Function | Should run | Actually runs | Verdict |
|---|---|---|---|
| `crop_baseline_guidelines_v2` gate | between Rule and Builder | never | **missing** |
| `intent_semantic_class_allowlist` filter | between Observation and Hypothesis | never | **missing** |
| `DiagnosticDecisionAuthority` | before Builder | after Builder | **out-of-order** |
| `forceTranslate` | after final string composition | after composition (correct) but no fallback path | order ok / robustness broken |
| `crop_stage_knowledge` advisor | between Stage and Hypothesis | never | **missing** |

---

## 11. Architecture scorecard (1-10)

| Dimension | Score | Notes |
|-----------|------:|-------|
| Database design | 8 | Snake_case complete; rich columns; some empty side tables |
| Knowledge graph completeness (data) | 8 | 13 k+ mappings; multilingual coverage |
| Knowledge graph activation (runtime) | **4** | 12/32 tables dead at runtime |
| Intent layer | 7 | Whitelist + mapping live |
| Observation layer | 7 | Aliases + master live, semantic_class dark |
| Semantic layer | **2** | allowlist + semantic_class unused |
| Hypothesis layer | 7 | Engine wired, but inactive-rule mappings linger |
| Rule layer | 6 | `rule_intent` & `triggers_rule_ids` unused → wrong-domain matches possible |
| Scientific validation | **2** | Loaded cache, never gated |
| Safety / Authority | **3** | Runs out-of-order; payload not stripped |
| Translation | 5 | Works on cache hit; abort path silent |
| Traceability | 7 | `[BRAIN_TRACE]`, `OBS_SURVIVAL`, AuthorityTrace are good |
| Maintainability | 6 | Many "MIGRATION TARGET" comments still |
| Production readiness | **4.5** | One mis-prescription per trace is a stop-ship class defect |

**Composite production-readiness: 5.0 / 10.**

---

## 12. Implementation gap matrix (no implementation done here)

| Current | Target | Gap | Priority | Complexity | Risk | Blocking deps |
|---|---|---|---|---|---|---|
| `rule_intent` ignored | Intent ↔ rule gate | Add filter in `layered-rule-evaluator` | P0 | Low | Low | none |
| Authority after builder | Authority before builder | Reorder in `index.ts` | P0 | Medium | Medium | Builder must accept authority hints |
| `crop_baseline_guidelines_v2` cache-only | Pre-builder scientific gate | Add gate function | P0 | Medium | Medium | Accept/reject schema |
| `crop_stage_knowledge` dark | Advisor uses DB | Wire `crop-stage-advisor` to DB; add `action_codes` col | P1 | Low | Low | Agronomist sign-off |
| MarketProductLookup ILIKE broken | jsonb-safe lookup | RPC or `.contains` | P1 | Low | Low | none |
| forceTranslate abort silent | Deterministic Marathi fallback | Dictionary table or longer abort | P1 | Medium | Low | observation_translations coverage |
| 2 inactive-rule mappings | Cleanup | Delete or reactivate | P2 | Trivial | None | Agronomist sign-off |
| Stage casing drift | Canonical lower() boundary | Code touch in 4 sites | P2 | Low | Low | none |
| 12 dark tables | Either wire in or drop | Per-table review | P3 | High overall | Low | per-table |
| Realtime publication empty | Add symbolic tables | Migration | P3 | Trivial | Low | none |

---

## 13. Executive summary

The live trace `trace_mqt41o60_ezkjqa` (Marathi farmer: *"rice has not germinated yet"*) proves the brain currently:
1. Understands the intent correctly (`EMERGENCE_FAILURE` @ 0.82).
2. Pulls 201 candidate rules but, lacking an intent gate, lets a stage-agnostic cyclone-recovery rule win (Bug B-1).
3. Produces a Mancozeb fungicide prescription that the Authority later tries to demote — too late, because the builder ran first (Bug B-6).
4. Fails the Marathi translation silently (Bug B-7), shipping wrong advice in English.

The previous "all-green" audit reflected **column-name** correctness, not **runtime utilisation**. This audit shows 12 of the 32 authoritative tables (notably `intent_semantic_class_allowlist`, `crop_baseline_guidelines_v2` as a gate, `crop_stage_knowledge`, `intent_assertion_pattern`, `emergency_observation_codes`, `rule_product_mapping`) are inert. The DB recently grew (24 migrations in 12 days, including the new `crop_stage_knowledge`) but the orchestrator has not been wired to the new surfaces.

Current production readiness: **5.0 / 10** — safe to keep online for non-prescriptive turns, but unsafe for chemical-recommendation turns until B-1, B-6, B-7 are remediated.

> No code, SQL or schema was modified to produce this report.
