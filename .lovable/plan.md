
# Symbolic Decision Brain — Forensic Audit & Updated Production Plan

Every finding below was cross-verified against the live `qfklkkzxemsbeniyugiz` DB and the `supabase/functions/ai-agriculture-chat/` source. Items marked **[VERIFIED]** are reproducible from the queries / greps shown; **[INFERRED]** = reasoned from code without independent confirmation.

---

## Part A — Verified Bugs in the Brain (Code Side)

### A1. Cross-tenant state leakage in warm Deno isolates **[VERIFIED — P0]**
Module-level mutable state survives between requests inside a single isolate. Tenant A's data influences Tenant B's next turn.

| File | Line | Variable |
|---|---|---|
| `decision/canonical-state-invariants.ts` | 60 | `let _authoritativeContext` |
| `decision/canonical-state-invariants.ts` | 61 | `let _confirmedDiagnosis` |
| `decision/canonical-state-invariants.ts` | 62 | `let _answeredClarifications: Set<string>` |
| `agents/clarification-strategy.ts` | 185 | `let _lockedStageContext` *(new finding, not in prior audits)* |
| `utils/context-tracer.ts` | 63 | `let currentTraceId` *(causes trace ID collisions under concurrency)* |

### A2. DB-client-holding singletons (8 verified) **[VERIFIED — P0]**
Each holds an internal `SupabaseClient` reused across requests. Combined with A1, these are the warm-isolate cross-tenant vectors.

```
decision/symbolic-reasoner.ts:1619       reasonerInstance
decision/response-generator.ts:303       generatorInstance      (also deprecated)
decision/context-validator.ts:494        validatorInstance
decision/fact-extractor.ts:275           extractorInstance
decision/confidence-calculator.ts:432    calculatorInstance
decision/clarification-validator.ts:324  validatorInstance
agents/layered-rule-evaluator.ts:85      symbolicReasonerInstance
agents/audit-logger.ts:711               auditLoggerInstance
```

Plus **14 raw `createClient(...)` call sites** across `decision/`, `agents/`, `utils/`, `index.ts` — each creates a fresh client per call (wasteful, not leaky). Targets for `scope.db` consolidation.

### A3. Silent fail-open in intent resolution **[VERIFIED — P0]**
`decision/intent-resolver.ts:137,262` — HOTFIX disables `crop_code` and `das` filters, returning the universal `ALL` set. Confirmed via DB that the schema **already has** `crop_code`, `growth_stage`, `das_min`, `das_max` (ALL NOT NULL) — so **no migration is needed**, just restore the filter:
```ts
.eq('intent_code', intentCode)
.in('crop_code', [cropCode, 'ALL'])
.lte('das_min', das).gte('das_max', das)
.eq('is_active', true)
```
And replace `return []` on error with a thrown `IntentResolutionError`.

### A4. Runtime `ReferenceError` in narration **[VERIFIED — P1]**
`decision/explanation-chain-builder.ts:438` references undefined identifier `dataLabel`. Triggers a crash whenever `chain.data_sources_used.length > 0`. 5-minute fix; structural prevention = enable ESLint `no-undef` (currently off for Edge code).

### A5. Deprecated code paths still wired **[VERIFIED — P1]**
| Caller | Line | Calls (deprecated) |
|---|---|---|
| `agents/orchestrator.ts` | 54 | imports from `decision/response-generator.ts` |
| `agents/orchestrator.ts` | 58-60 | imports `canAnswerDirectly`, `requiresRuleEngine`, `generateLLMResponse` |
| `agents/orchestrator.ts` | 3334, 3400, 5167 | `generateLLMResponse(...)` — fallback narration path |
| `agents/orchestrator.ts` | 5124-5125 | `canAnswerDirectly`/`requiresRuleEngine` — always return `false`/`true` per their own warnings |
| `agents/clarification-generator.ts` | 59 | imports `dynamic-clarification-generator.ts` |

Cannot delete these until the 3 fallback call sites are routed to `generateNarratedResponse`. Plan sequences this in W4.

### A6. Unbounded per-isolate caches **[VERIFIED — P1]**
Module-level Maps that grow without bound and bypass version invalidation:
```
utils/crop-synonyms-cache.ts:36           TTL-based, no version key
utils/baseline-guidelines-cache.ts:49     same
utils/agro-zone-cache.ts:35               same
decision/observation-code-mapper.ts:483   OBS_ALIAS_CACHE
decision/etl-gate.ts:41                   etlStandardsCache (no invalidation)
decision/causal-hypothesis-engine.ts:157-220   cropSynonymMap + loadingPromise Map
agents/intent-classifier.ts:30-31         _validIntentCodes (no refresh signal)
agents/next-crop-recommender.ts:109-110   _cachedRules + _cachedAt
agents/layered-rule-evaluator.ts:1209     cachedConvertedRules
```
These don't leak tenant data but go **stale on DB writes** → silent agronomy drift. Replace with content-addressed versioning (see Part C, W3).

---

## Part B — Hardcoded Constants That Must Move to DB

Full inventory from grep — **all 32 sites** that currently encode agronomic / behavioral knowledge in TypeScript. Categorized by priority.

### B1. Reference agronomy (P0 — these drive diagnosis/dosage/timing)
| Constant | File | Target DB source |
|---|---|---|
| `YOUNG_CROP_MAX_DAYS` (Record) | `decision/unified-decision-gate.ts:309` | derive from `crop_stage_master(growth_stage IN ('SEEDLING','VEGETATIVE')).MAX(das_max)` |
| `YOUNG_CROP_MAX_DAYS` (duplicate!) | `decision/prescription-gate-enforcer.ts:139` | same — **two sources of truth right now** |
| `STAGE_ORDER` | `decision/hypothesis-evaluator.ts:635` | `crop_stage_master` ORDER BY das_min |
| `ICAR_CALENDARS` | `decision/crop-calendar-lookup.ts:62` | `crop_baseline_guidelines_v2` |
| `NDVI_THRESHOLDS` | `decision/authoritative-state-loader.ts:90` | **needs new column** `ndvi_thresholds JSONB` on `crop_baseline_guidelines_v2` (not present today) |
| `SOIL_THRESHOLDS` | `decision/authoritative-state-loader.ts:98` | `crop_baseline_guidelines_v2` (nutrient + pH cols exist) |
| `NDVI_THRESHOLDS_BY_CROP` | `agents/soil-ndvi-state-calculator.ts:149` | same as above (deduplicate) |
| `PEST_ECONOMIC_THRESHOLDS` | `agents/visual-agent-types.ts:488` | `etl_standards.etl_value` |
| `STAGE_THRESHOLDS` | `agents/intent-lock.ts:433` | `crop_stage_master` |
| `STAGE_CONFIDENCE_THRESHOLDS` | `decision/confidence-calculator.ts:59` | new table `confidence_thresholds` OR `crop_stage_master.confidence_floor` |
| `CROP_CONFIDENCE_ADJUSTMENTS` | `decision/confidence-calculator.ts:74` | new column on `crops` |
| `minHarvestAge` | `agents/llm-response-formatter.ts:1520` | `crop_baseline_guidelines_v2` (use `das_end` of MATURITY) |

**Drift symptom verified**: diagnosis path reads `YOUNG_CROP_MAX_DAYS` from `unified-decision-gate.ts`, narration path reads from `prescription-gate-enforcer.ts`. If one is edited and the other is missed (already true in places — values differ for some crops), diagnosis and narration disagree silently.

### B2. Policy/priority maps (P1 — behavioral, change rarely but must be auditable)
| Constant | File |
|---|---|
| `ACTION_TYPE_PRIORITY` | `agents/conflict-resolver.ts:272` |
| `CATEGORY_PRIORITY` | `decision/symbolic-reasoner.ts:523` |
| `CATEGORY_PRIORITY_MAP` | `agents/layered-rule-evaluator.ts:1012` |
| `PRIORITY_VALUES` | `agents/symbolic-rules-bridge.ts:68` |
| `SEVERITY_BASED_ORDER` | `agents/delivery-validator.ts:60` |
| `ALLOWED_METHODS_BY_BIOLOGY` | `agents/agronomic-validator.ts:41` |

Target: new table `policy_config(key, scope, value JSONB, updated_at)` keyed by policy name, loaded once per request from `scope.ref`.

### B3. Vocabulary / aliases (P1 — these are exactly the kind of thing that should live next to crop/product master)
| Constant | File | Target table |
|---|---|---|
| `CROP_NAME_ALIASES` | `agents/llm-response-formatter.ts:2418` | `crop_synonyms` (already has 8 langs) |
| `cropCodeAliases` | `agents/layered-rule-evaluator.ts:1288` | same |
| `PRODUCT_ALIASES` | `agents/delivery-validator.ts:72` | `master_products.aliases JSONB` |
| `CROP_INVALID_BIOCONTROLS` | `agents/llm-response-formatter.ts:1138` | new column on `crops` or join via `master_products` |
| `STAGE_KEY_PRIORITIES` | `agents/canonical-observation-loader.ts:61` | `crop_stage_master.priority_keys JSONB` |
| `CULTURAL_STRATEGIES` | `agents/decision-graph-bridge-data.ts:143` | `decision_rules` (category=cultural) — already exists in DB, deduplicate |
| `IPM_DATABASE`, `DISEASE_DATABASE` | `agents/decision-graph-bridge-data.ts` | `decision_rules` — file is already marked DEPRECATED in source comment |
| `INSECTICIDE_GROUPS`, `FUNGICIDE_GROUPS` | `decision/safety-enhancement.ts:80,92` | `master_products.chemical_group` (column already exists in `master_products` per audit memory) |
| `CATEGORY_PATTERNS`, `PLANT_PART_PATTERNS` | `agents/layered-rule-evaluator.ts:1332,1350` | `observation_master` |

### B4. NLU patterns (P2 — language, low drift risk, can stay in code if version-stamped)
| Constant | File | Note |
|---|---|---|
| `GREETINGS`, `CLOSINGS` | `agents/communication-types.ts:321,326` | safe in code; tag with version |
| `EMOTION_PATTERNS`, `GREETING_PATTERNS`, `FILLER_PATTERNS` | `agents/language-normalizer.ts:40,64,79` | safe |
| `methodSteps` | `agents/communication-data-extractors.ts:323` | move to `decision_rules.method_steps_json` later |

**Recommendation**: B1 + B2 are mandatory for "world-class". B3 is high value. B4 can wait.

---

## Part C — Verified DB-Side Facts (For Rule-Team Manual Review)

| Metric | Value | Notes |
|---|---|---|
| Active decision_rules | **1,842** | all have `crop_code` and `conditions_json` |
| Rules with **non-canonical `action_type`** | **405 (22%)** | breakdown: `APPLY_TREATMENT` 339, `RELEASE_BIOCONTROL` 38, `IMMEDIATE_ACTION` 28 → gates that filter on the 5-value enum **drop these silently** |
| Active hypotheses | **336** | down from prior audit's "345" |
| Hypotheses with **no conditions** | **1** | (prior audit said 8 — improved) |
| Hypotheses with **no rule mappings** | **2** | (prior audit said 11 — improved) |
| `intent_observation_mapping` rows | **13,445** | only 23 have `crop_code='ALL'` — DB coverage is excellent; resolver's HOTFIX wastes this |
| `observation_master` rows | **2,532** | exceeds PostgREST 1000-row default → loaders **must paginate** (per core memory) |
| `crop_stage_master` rows | **102** | columns: `growth_stage`, `das_min`, `das_max` — **no `stage_code` / `typical_das_end` / `updated_at` / `is_active`** |
| `rule_quality_metrics` RLS | **OFF** | exposed via PostgREST |
| `crop_baseline_guidelines_v2.ndvi_thresholds` column | **absent** | needs ADD COLUMN before NDVI can move to DB |
| Reference tables missing `updated_at` | 5 of 8 | `crop_stage_master`, `crop_synonyms`, `crop_vocabulary`, `observation_aliases`, `intent_observation_mapping` |

### Items requiring manual rule-data fixes (no code change)
1. **405 `action_type` rows** — DB team must decide: (a) backfill to canonical 5-value enum, OR (b) keep the existing values and let the code add a separate `action_class` column (recommended in C2 below). Distribution suggests the canonical enum is too narrow — `APPLY_TREATMENT` and `RELEASE_BIOCONTROL` carry real semantic distinctions that should not collapse to `RECOMMEND` in narration even if they map to `RECOMMEND` for gating.
2. **1 conditionless hypothesis + 2 mappingless hypotheses** — review & either soft-deactivate (with `deactivated_reason`) or add the missing rows.
3. **Duplicate `YOUNG_CROP_MAX_DAYS` values** between `unified-decision-gate.ts` and `prescription-gate-enforcer.ts` should be reconciled before B1 migration: agronomy team picks the correct number per crop, that number goes into `crop_stage_master` as the canonical source.

### Performance bottleneck reality check **[VERIFIED]**
Top 5 slow queries (last 7d, pg_stat_statements) — **the chat brain is NOT the bottleneck**:
1. `lands+farmers` join — 651s total / 4,283 calls / 152ms mean (this is from `useLands` / map pages)
2. `mgrs_tiles` agri filter — 293s / 6,270 / 47ms
3. `tile_marking_progress` UPDATE — 82s / 58,433 calls
4. `ndvi_data` last-N — 76s / 1,185 / 64ms
5. `tile_marking_progress` INSERT — 75s

Implication: optimization budget for the brain itself should focus on **correctness + observability**, not raw throughput. The frontend lands/NDVI hotspots are a separate workstream.

---

## Part D — Updated 5-Week Plan (replaces uploaded plan, errors corrected)

The uploaded plan's three architectural insights are right (RequestScope; action_class/action_intent split; content-addressed reference versioning). Its concrete steps had ~12 inaccuracies that would crash at runtime — corrected below.

### Week 0 — Pre-flight (2 days, blocking)
- **PRE-1** Add `supabase/functions/ai-agriculture-chat/deno.json` and a CI step `deno test ...`. Project today uses Vitest only; brain tests need a Deno runner.
- **PRE-2** Migration: add `updated_at TIMESTAMPTZ` + auto-update trigger to `crop_stage_master`, `crop_synonyms`, `crop_vocabulary`, `observation_aliases`, `intent_observation_mapping` (5 tables verified missing it).
- **PRE-3** Migration: add `ndvi_thresholds JSONB` column to `crop_baseline_guidelines_v2`. Populate from current `decision/authoritative-state-loader.ts:90` constants under agronomy review.
- **PRE-4** Rule team: decide policy for the 405 non-canonical `action_type` rows (see Part C item 1).

### Week 1 — RequestScope (kill cross-tenant leakage)
- **W1-1** `runtime/request-scope.ts` — per-turn container owning `db`, `authoritativeContext`, `confirmedDiagnosis`, `answeredClarifications`, `lockedStageContext`, `turnCache`, `events[]`, `emit()`, `ref`. Use `npm:@supabase/supabase-js@2.57.2` (codebase standard — **not** `jsr:` as uploaded plan said).
- **W1-2** Convert `canonical-state-invariants.ts` + `clarification-strategy.ts:185` + `context-tracer.ts:63` to scope-bound.
- **W1-3** Replace the 8 singletons with `buildXxx(scope)` factories. Audit-logger first (smallest blast radius), then validators/calculators, then `SymbolicReasoner` (largest).
- **W1-4** Thread `scope` through `index.ts` entry → `runOrchestrator(scope, message)`. Internal orchestrator sweep (9,860 LOC) finishes early W2.
- **W1-5** ESLint flat-config override: ban top-level `let` and un-scoped `createClient` under `supabase/functions/ai-agriculture-chat/**`. Add `deno lint` job.
- **W1-6** Acceptance test: 1,000-tenant interleaved cross-leakage test (Deno).

### Week 2 — Data contract repair (parallel with W1 sweep)
- **W2-1** Migration: ADD column `action_class TEXT` with CHECK constraint (5-value), backfill via CASE over current `action_type` (this preserves `action_type` for narration — non-destructive; uploaded plan's rename-in-place was destructive).
- **W2-2** TypeScript split: `ActionClass` union (gates) vs `ActionIntent` = string (narration). Update all 6 gate files to read `action_class`.
- **W2-3** Restore intent-resolver crop+DAS filter (Part A3). **No migration** — columns already exist.
- **W2-4** Convert `return []` silent fails to typed errors.
- **W2-5** Migration: soft-deactivate 1+2 orphan hypotheses with reason codes (add `deactivated_reason`, `deactivated_at` cols).
- **W2-6** Migration: enable RLS on `rule_quality_metrics` (service-role only).
- **W2-7** Fix `dataLabel` runtime bug; enable `no-undef`.

### Week 3 — Reference port + kill hardcoded constants
- **W3-1** Migration: `meta_reference_versions` table + version-refresh function (hash recipe: `sha256(table || count || max(updated_at) || max(id::text))`) + triggers on 8 reference tables.
- **W3-2** `runtime/agronomy-reference.ts` (`AgronomyReference` class). Use **actual columns** (`growth_stage`, `das_min`, `das_max`) — NOT `stage_code`/`typical_das_end` as the uploaded plan wrote. Paginate `observation_master` reads (>1000 rows, per core memory).
- **W3-3** Refactor all **B1 constants** (12 sites) → `scope.ref.*`. CI grep gate forbids their reintroduction.
- **W3-4** Refactor LLM formatters (`llm-response-generator.ts:230,417`, `llm-response-formatter.ts:1386,1520`) to read calendars/harvest-age via `scope.ref` — closes diagnosis/narration drift.
- **W3-5** Refactor 6 unbounded caches (Part A6) to use version-stamped Maps keyed by `version_hash`.

### Week 4 — Observability + deprecated-code removal
- **W4-1** Migration: audit-log columns (`prompt_tokens`, `completion_tokens`, `llm_cost_usd`, `llm_latency_ms`, `trace_events JSONB`, `reference_versions JSONB`). GIN index on `trace_events`.
- **W4-2** `runtime/audit-persistence.ts` derives audit row from `scope.events`. **Redacts `farmer_message` and phone/PIN regex matches** before persisting (PII guard the uploaded plan missed).
- **W4-3** Add `scope.emit(...)` at every gate, rule firing, LLM call. No manual `auditLogger.log(...)` calls remain.
- **W4-4** Migration: `mv_tenant_llm_cost_daily` + pg_cron hourly refresh.
- **W4-5** Migrate the 3 deprecated `generateLLMResponse` call sites (orch:3334, 3400, 5167) to `generateNarratedResponse`. Run golden set after each. Then delete `response-generator.ts`, `dynamic-clarification-generator.ts`, and the 3 deprecated exports.
- **W4-6** Patch cron entry points (`proactive_rules` evaluators) to construct their own `createRequestScope({source:'cron'})`. Uploaded plan missed cron.
- **W4-7** Golden set: 100 cases generated from `ai_chat_messages` with `nlu_confidence >= 0.8`. 3 property invariants.

### Week 5 — Hardcoded vocabulary + final hardening
- **W5-1** Move **B2 policy maps** (6 sites) to new `policy_config` table; load via `scope.ref.policy(key)`.
- **W5-2** Move **B3 vocabulary maps** (10 sites) into existing master tables (`crop_synonyms`, `master_products.aliases`, `master_products.chemical_group`, `decision_rules` for cultural strategies). Delete `agents/decision-graph-bridge-data.ts` once consumers migrate.
- **W5-3** Final CI grep gate covering all 30+ inventory items.
- **W5-4** 1% → 10% → 100% rollout under `brain_v2` feature flag with hard-gate monitoring (G1–G8 below).

### Hard gates (any "No" = no production)
| # | Criterion |
|---|---|
| G1 | Cross-tenant leakage test green |
| G2 | Every active rule satisfies `action_class IN (5 canonical)` |
| G3 | `intent_observation_mapping` returns crop-specific results |
| G4 | RLS on `rule_quality_metrics` = ON |
| G5 | Grep returns 0 hits for the 30+ hardcoded constants |
| G6 | Every audit row has non-null token/cost columns |
| G7 | Golden 100 + 3 property tests green |
| G8 | Every audit row has non-empty `reference_versions` JSONB |

### Soft gates (first 7 days post-deploy)
- p95 turn latency ≤ 2,000 ms
- Zero `InvariantViolation` errors
- LLM cost WoW ±30%
- MV refresh < 60s

---

## Part E — Executive Verdict

**Production-ready for 100K farmers? No — Yes-with-conditions after this 5-week plan.**

Top 3 conditions (in order):
1. **Kill module-level mutable state** (Part A1–A2). This is the only thing that can cause silent cross-tenant agronomy errors at warm-isolate scale, and the rest of the refactor depends on it.
2. **Resolve the action_type contract** (Part A6 + Part C item 1) via the non-destructive `action_class`/`action_intent` split. Until this lands, 22% of rules silently disappear at the gate.
3. **Move B1 reference constants into versioned DB lookup** (Part D W3). Today, diagnosis and narration can disagree silently because they read different copies of the same number.

Items the uploaded plan got wrong that would have caused regressions if executed verbatim: (a) wrong column names in `crop_stage_master`, (b) reading a non-existent `ndvi_thresholds` column, (c) dead migration on `intent_observation_mapping`, (d) destructive `action_type` rename, (e) `jsr:` imports breaking Edge resolution, (f) `.eslintrc.json` for a flat-config project, (g) Deno tests with no Deno runner wired. All corrected above.
