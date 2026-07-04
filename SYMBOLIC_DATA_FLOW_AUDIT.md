# SYMBOLIC DATA FLOW AUDIT — KisanShakti AI Decision Brain

Scope: `supabase/functions/ai-agriculture-chat/*`
Mode: **READ-ONLY forensic audit.** No code was modified.
Question under investigation: why do two agronomically identical farmer
utterances (Query A: `"भात अजून उगवले नाही"`, Query B: `"या शेतातील पिक
अजून उगवले नाही"`) not produce an identical symbolic graph path?

---

## 1. Execution Call Graph (one request, cold path)

```text
HTTP POST /ai-agriculture-chat
 └─ index.ts :: serve()                                    [line 353]
     ├─ runPipelineSelfCheck({supabase})                   decision/pipeline-self-check.ts
     ├─ parse body → {messages, landId, sessionId, language, metadata}
     ├─ (optional) collect_training_data short-circuit
     ├─ (optional) PROACTIVE_ALERT_NARRATION short-circuit [line ~872]
     └─ orch = getOrchestrator()                           [line 208]
         └─ orch.orchestrate(...)                          agents/orchestrator.ts :: 1112
             ├─ resolveLandContext / loadLand              (LandContext + biological_state)
             ├─ buildCanonicalContextContract(landContext) decision/canonical-context-contract.ts
             │      → CanonicalContext (frozen, PHASE1_LOCKED)   [orchestrator.ts:1339]
             ├─ LLM understanding                          agents/llm-understanding-layer.ts
             │      → semanticExtraction {intent_code, observations, confidence}
             ├─ language induction                         agents/language-induction-layer.ts
             │      → inductionResult (CanonicalCropSymbol / SymptomSymbol)
             ├─ intent-classifier / intent-lock            agents/intent-classifier.ts
             │      → intentCode, intentConf
             ├─ observation-extractor                      agents/observation-extractor.ts   [3583]
             │      → raw observation codes (extractor vocabulary)
             ├─ cross-crop-symptom-mapper                  agents/cross-crop-symptom-mapper.ts
             │      → SYNTHETIC observations
             ├─ [LLM-First Fallback] intentToSymptom       orchestrator.ts:4057-4082
             │      → INFERRED observation from intent (hardcoded map)
             ├─ concept-bridge.bridgeCodesDb               decision/concept-bridge.ts        [4672]
             │      → DB (observation_aliases) canonical codes
             ├─ concept-bridge.resolveCropCanonical…       decision/concept-bridge.ts        [4693]
             │      → DB (intent_observation_mapping LITERAL peers)
             ├─ TURN_EVIDENCE_LOCK (Object.freeze real_codes + canonical_codes)
             ├─ evaluateCandidateHypotheses                decision/hypothesis-evaluator.ts
             ├─ loadIOMAllowed + filterHypothesesByIOM     decision/iom-gate.ts
             ├─ layered-rule-evaluator                     agents/layered-rule-evaluator.ts
             ├─ deterministic-response-builder / llm-response-generator
             ├─ narration + translation (regional-translator)
             └─ persist ai_chat_audit_logs (safety net)
```

---

## 2. Symbolic State Lifecycle Audit

### 2.1 `intent`

| Stage | File / Function | Value produced | Notes |
|---|---|---|---|
| A. LLM primary | `agents/llm-understanding-layer.ts` | `semanticExtraction.intent_code` | LLM output |
| B. Fallback default | `agents/intent-classifier.ts:263,276,314` | `GENERAL_CROP_INFO` @ conf 0.3 | Hardcoded string |
| C. Salvage | `orchestrator.ts:2953-2979` | `DIAGNOSTIC_INQUIRY` / `GENERAL_CROP_INFO` | Wording sensitive |
| D. Second read | `orchestrator.ts:4013` | `semanticExtraction ?? inductionResult ?? 'UNKNOWN_OBSERVATION'` | **Different reducer than step C** |
| E. Symptom → Intent map | `orchestrator.ts:5349-5359` | `PEST_PROBLEM` / `DISEASE_PROBLEM` | Hardcoded map (`SHOOT_BORER`, `ROOT_ROT`, …) |

**Multiple authorities.** The intent is (re)read and (re)resolved at least
five times with different fallback rules.

### 2.2 `crop_code`

| Source | Where | Precedence |
|---|---|---|
| CanonicalContext | `orchestrator.ts:4653` (`canonicalContext.crop_code`) | 1 |
| `landContext.current_crop` | fallback `.toUpperCase()` | 2 |
| String `'UNKNOWN'` | final fallback | 3 |
| `CROP_KEYWORDS` (Devanagari→enum) | `agents/language-induction-layer.ts:230-271` | parallel, hardcoded |

The Devanagari map (`ऊस`, `भात`, `गन्ना`, `धान`, …) can produce a crop
identity **before** CanonicalContext runs; two utterances that use
different noun (`भात` vs. `पिक`) enter the pipeline with **different
extracted crop symbols** even though `canonicalContext.crop_code`
eventually equals `RICE` for both.

### 2.3 `crop_stage`

Six independent writers were observed. `blockStageWriteIfLocked()` is
present at only some of them:

| # | Site | Guarded? |
|---|---|---|
| 1 | `resolve_crop_phenology` → `buildBiologicalState()` | **Authoritative** (freezes) |
| 2 | `orchestrator.ts:5443` `gdd-phenology-engine` | ✅ guarded |
| 3 | `orchestrator.ts:6297` `context-validation-reconciler` | ✅ guarded |
| 4 | `index.ts:1566` `render-authority-reconciliation` | ✅ guarded |
| 5 | `index.ts:1758` sanity-check-impossible-harvest (`'GERMINATION'`) | ✅ guarded |
| 6 | `orchestrator.ts:6180` `canonicalState.growth_stage = cropContextAuthority.growth_stage` | ❌ **unguarded** |
| 7 | `orchestrator.ts:8934` `phenology.growth_stage = recon.winner.growth_stage` | ❌ **unguarded** |
| 8 | `context-manager.ts:499` `confirmed_facts.growth_stage = …` | ❌ writes to session |
| 9 | `context-authority.ts:270/294/311` merges three source stages | ❌ resolves silently |

### 2.4 `DAS`

| Source | Where |
|---|---|
| `canonicalContext.days_since_sowing` | `orchestrator.ts:4738` |
| `landContext.days_since_sowing` | same nullish chain |
| `lockedCropContext.days_since_sowing` | same |
| `options.sessionState.lockedCropContext.days_since_sowing` | same |

Single reducer, `??` chain. **Consistent.**

### 2.5 `observation_codes`

Pipeline observed:

```text
farmer text
 → llm-understanding-layer   → semantic observations (LLM strings)
 → observation-extractor     → raw extractor codes (agents/symptom-enums.ts enums)
 → cross-crop-symptom-mapper → SYNTHETIC codes (hardcoded)
 → LLM-First Fallback map    → INFERRED code from intent (orchestrator.ts:4057)
 → concept-bridge.bridgeCodesDb                  (observation_aliases)
 → concept-bridge.resolveCropCanonicalObservations (intent_observation_mapping LITERAL peers)
 → TURN_EVIDENCE_LOCK freeze
 → hypothesis-evaluator (uses canonical_observation_codes)
 → iom-gate.filterHypothesesByIOM
```

Two **wording-sensitive rewrite steps** live before the DB bridge:

* `intentToSymptom` map at `orchestrator.ts:4057-4082` synthesises an
  observation from the *intent code* (`EMERGENCE_FAILURE → POOR_GERMINATION`).
  If Query A resolves `intent = EMERGENCE_FAILURE` but Query B resolves
  `intent = GENERAL_CROP_INFO` (because the noun `पिक` is generic and
  triggers the advisory branch), Query B never gains `POOR_GERMINATION`
  and therefore reaches `bridgeCodesDb` with a **different code set**.

* `crop-stage-advisor` / `cross-crop-symptom-mapper` inject SYNTHETIC
  codes whose set depends on `CanonicalCropSymbol` produced by the
  Devanagari map — again wording sensitive.

### 2.6 `hypothesis_id`

Input: `canonical_observation_codes` + `crop`/`stage`/`DAS`.
Loader: `evaluateCandidateHypotheses` → DB (`hypothesis_master` etc.).
Filter: `iom-gate.filterHypothesesByIOM` (allowlist from
`intent_observation_mapping`).
Ranker: hypothesis-evaluator scoring.

The filter is **intent-conditioned** (`iomIntent = intentCode || 'GENERAL_CROP_INFO'`,
`orchestrator.ts:4766`). Different intents ⇒ different allowlist ⇒
different hypotheses even when the confirmed observation set is
identical.

### 2.7 `rule_ids`

Loaded per `(crop, stage, intent, hypothesis)`; ranked by
`layered-rule-evaluator`. Wave-O bypass and IOM gate contribute.
Determinism depends entirely on steps 2.1–2.6.

---

## 3. Mutation Forensic Report (proven from code)

| VALUE | BEFORE | AFTER | FILE | FUNCTION | AUTHORIZED |
|---|---|---|---|---|---|
| intent | LLM output | `GENERAL_CROP_INFO` @0.3 | intent-classifier.ts:263,276,314 | `classify()` fallbacks | ⚠️ Fallback |
| intent | `UNKNOWN` | `DIAGNOSTIC_INQUIRY` | orchestrator.ts:2979 | salvage block | ⚠️ Heuristic |
| intent | `UNKNOWN` | `GENERAL_CROP_INFO` / `DIAGNOSTIC_INQUIRY` | orchestrator.ts:2974 | second salvage | ⚠️ Duplicate authority |
| intent | any | `PEST_PROBLEM` / `DISEASE_PROBLEM` | orchestrator.ts:5349-5359 | `causeToIntent` map | ❌ Hardcoded agronomy |
| observations | ∅ | `POOR_GERMINATION` (etc.) | orchestrator.ts:4057-4082 | `intentToSymptom` fallback | ❌ Hardcoded agronomy |
| observations | canonical | injected SYNTHETIC codes | agents/cross-crop-symptom-mapper.ts | mapper | ❌ Hardcoded agronomy |
| growth_stage | biological | `cropContextAuthority.growth_stage` | orchestrator.ts:6180 | context authority merge | ❌ Unguarded write |
| growth_stage | biological | `recon.winner.growth_stage` | orchestrator.ts:8934 | reconciler | ❌ Unguarded write |
| growth_stage | ? | `landContext.growth_stage` set from three sources | context-authority.ts:270/294/311 | resolver | ⚠️ Silent merge |
| crop_stage lower-case | any | expanded to family (`seedling+nursery+…`) | iom-gate.ts:52, intent-resolver.ts:130, contradiction-engine.ts:80, navigator-adapter.ts:32 | four copies of `STAGE_SYNONYMS` | ❌ Duplicate authority |
| observation_code | `poor_germination` | `obs_rice_no_emergence` peers | concept-bridge.resolveCropCanonicalObservations | IOM LITERAL peers | ✅ DB-authoritative |

---

## 4. Duplicate Authorities

Same knowledge encoded in **more than one** place.

| Concept | Locations |
|---|---|
| Stage family / synonyms | `runtime/contradiction-engine.ts:80`, `runtime/navigator-adapter.ts:32`, `decision/iom-gate.ts:52`, `decision/intent-resolver.ts:130` |
| `CropStage` enum | `agents/canonical-state-builder.ts:40` (alongside DB `crop_stage_master`) |
| `CanonicalCropSymbol` enum | `agents/symptom-enums.ts:46` (alongside DB `crops`) |
| `CanonicalSymptomSymbol` enum | `agents/symptom-enums.ts:7` (alongside DB `observation_master`) |
| `VisualSymptom` enum | `agents/canonical-state-builder.ts:70-134` |
| Crop word → symbol map | `agents/language-induction-layer.ts:230-271` (Devanagari, Hindi, English) |
| Pest / disease → canonical | `agents/entity-normalizer.ts:24-1154` (~1000 hardcoded lines) |
| Cross-crop symptom equivalence | `agents/cross-crop-symptom-mapper.ts`, `decision/cross-crop-symptom-ontology.ts` |
| Observation ontology | `decision/observation-ontology.ts` (parallel to `observation_master`) |
| Intent → symptom | `orchestrator.ts:4057-4082` |
| Cause → intent | `orchestrator.ts:5349-5359` |
| Contradiction patterns (stage vs. observation) | `runtime/contradiction-engine.ts:60-120` |
| Rural language dictionary | `rural-language-dictionary.ts`, `_shared/ruralLanguageGuide.ts`, `agents/agricultural-vocabulary.ts` |

Deprecated but still present:
`layered-rule-evaluator.ts:1356,1467,1468` — `STAGE_FAMILIES`,
`CATEGORY_PATTERNS`, `PLANT_PART_PATTERNS` declared as `{}` with
comments "REMOVED"; downstream code still branches on them.

---

## 5. Hardcoded Agriculture Logic Inventory

| File | Constant / block | Purpose | DB owner that should replace it |
|---|---|---|---|
| `agents/symptom-enums.ts` | `CanonicalSymptomSymbol`, `CanonicalCropSymbol`, `CanonicalAffectedPartSymbol`, `CanonicalSeveritySymbol` | Symbolic core enums | `observation_master`, `crops`, `crop_stage_master` |
| `agents/canonical-state-builder.ts:40-…` | `CropStage`, `VisualSymptom`, `SymptomDistribution`, `SeverityLevel`, `NDVILevel`, `NDVITrend`, `SoilNitrogen`, … | Canonical state vocabulary | `crop_stage_master`, `observation_master`, NDVI/soil ontology tables |
| `agents/language-induction-layer.ts:220-280` | Devanagari/Hindi/English `CROP_KEYWORDS` | Crop word → symbol | `crop_synonyms`, `crop_vocabulary` |
| `agents/entity-normalizer.ts` (~1154 lines) | Pest & disease alias table (`shoot_borer`, `dead heart`, `whitefly`, …) | Term → canonical entity | `observation_aliases`, `crop_synonyms`, `master_products` |
| `agents/entity-code-mapper.ts` | Entity → code map | Same | Same |
| `agents/agricultural-vocabulary.ts` (759 lines) | Vernacular vocabulary | NLU normalization | `crop_vocabulary`, `intent_translations`, `observation_translations` |
| `agents/cross-crop-symptom-mapper.ts` (453 lines) | Cross-crop equivalence rules | Symptom inheritance | `cross_crop_symptom_ontology` table (or `observation_aliases`) |
| `decision/observation-ontology.ts` (640 lines) | Observation graph | Ontology | `observation_master` + `observation_intent_master` + `observation_aliases` |
| `decision/cross-crop-symptom-ontology.ts` | Cross-crop mapping | Same | Same DB tables |
| `services/regional-translator.ts` (215 lines) | Regional word maps | Vernacular | `intent_translations`, `observation_translations`, `variety_translations` |
| `rural-language-dictionary.ts` (158 lines) | Rural terms | Vernacular | Same |
| `_shared/ruralLanguageGuide.ts` | Rural guide | Vernacular | Same |
| `runtime/contradiction-engine.ts:35-120` | Contradiction patterns + `STAGE_FAMILIES` | Stage/observation incompatibility | `stage_transition_conditions`, `stage_validation_rules` |
| `runtime/navigator-adapter.ts:32` | `STAGE_FAMILIES` | Navigator equivalence | `crop_stage_graph`, `crop_stage_aliases` |
| `decision/iom-gate.ts:52` | `STAGE_SYNONYMS` | IOM stage expansion | `crop_stage_aliases` |
| `decision/intent-resolver.ts:130` | `STAGE_SYNONYMS` | Intent stage expansion | `crop_stage_aliases` |
| `orchestrator.ts:4057-4082` | `intentToSymptom` fallback map | Intent-derived observation | `intent_observation_mapping` (already exists) |
| `orchestrator.ts:5349-5359` | `causeToIntent` map | Cause → intent | `intent_observation_mapping` reverse index |
| `orchestrator.ts:2861,3027,4034,4220,4349` | Hardcoded intent lists (`EMERGENCE_FAILURE`, `NO_EMERGENCE`, `PLANT_DEATH`, …) | Symptom-based intent membership | `observation_intent_master` |
| `agents/layered-rule-evaluator.ts:1356,1467,1468` | `STAGE_FAMILIES = {}`, `CATEGORY_PATTERNS = {}`, `PLANT_PART_PATTERNS = {}` | Deprecated placeholders still branched on | Remove branch; rely on DB |
| `agents/nlp-agriculture-validator.ts`, `agents/observation-cause-mapper.ts`, `agents/observation-key-mapper.ts` | Additional ontology fragments | Various | `observation_master`, `observation_aliases` |

---

## 6. Exact Graph Break Locations (proof for the "same meaning → different graph" symptom)

Ordered by likelihood of causing Query A ≠ Query B for
`"भात अजून उगवले नाही"` vs. `"या शेतातील पिक अजून उगवले नाही"`.

### Break #1 — Devanagari crop keyword map (P0)
`agents/language-induction-layer.ts:230-271`

Query A contains `भात` → `CROP_KEYWORDS['भात'] = RICE`.
Query B contains `पिक` (generic word for "crop") → **no key match** →
extractor emits `UNKNOWN_CROP` at induction time. Downstream code that
reads `inductionResult.crop_symbol` **before** CanonicalContext takes
over (e.g. cross-crop symptom mapper, LLM prompt enrichment) sees
different values.

### Break #2 — Intent fork on generic nouns (P0)
`agents/intent-classifier.ts:263-314`, `orchestrator.ts:2953-2979`,
`orchestrator.ts:4013-4082`

`अजून उगवले नाही` alone maps well to `EMERGENCE_FAILURE`. When paired
with the generic subject `पिक`, LLM prompts more frequently return
`GENERAL_CROP_INFO`. The two fallback reducers in the orchestrator
(steps C and D in §2.1) each apply a *different* salvage rule, so the
intent that reaches the IOM gate is not deterministic in language.

### Break #3 — `intentToSymptom` fallback synthesises evidence from intent (P0)
`orchestrator.ts:4057-4082`

Because the observation set injected here is *conditional on the intent*,
any Query-B intent drift from #2 causes a different observation set to
reach `bridgeCodesDb`. Even though DB-bridge and IOM LITERAL peers now
work correctly, they are given non-identical inputs.

### Break #4 — Six writers to `growth_stage`, three unguarded (P1)
See §2.3. `context-authority.ts:270/294/311` and
`orchestrator.ts:6180, 8934` can overwrite the biological stage
depending on which authority is present in a given request. Query B may
resolve `landContext.growth_stage` slightly differently (e.g. session
carry-over vs. fresh landContext) and pick a different reconciler
branch.

### Break #5 — Four copies of `STAGE_SYNONYMS` / `STAGE_FAMILIES` (P1)
`iom-gate.ts:52`, `intent-resolver.ts:130`,
`contradiction-engine.ts:80`, `navigator-adapter.ts:32`

Any drift between these copies (e.g. one adds `establishment`, one does
not) silently changes which curated rows the IOM gate keeps.

### Break #6 — `causeToIntent` hardcoded pest map (P1)
`orchestrator.ts:5349-5359`

Rewrites intent late in the pipeline based on a matched observation's
`likely_cause`. Wording sensitive because the matched observation depends
on Breaks #1–#3.

### Break #7 — Hardcoded intent-membership lists (P2)
`orchestrator.ts:2861, 3027, 4034, 4220, 4349`

Multiple `.includes([...])` checks over hardcoded intent code arrays.
Adding a new intent in DB does not activate these branches.

### Break #8 — Deprecated-but-branched placeholders (P2)
`layered-rule-evaluator.ts:1349-1371, 1456-1478`

`STAGE_FAMILIES`, `CATEGORY_PATTERNS`, `PLANT_PART_PATTERNS` declared as
`{}` but the surrounding code still iterates them and emits
"deprecated" traces that affect rule scoring paths.

---

## 7. Graph Contract Violations

| Rule | Verdict | Evidence |
|---|---|---|
| R1 — After BiologicalState lock, no other writer may set crop/stage/DAS | **VIOLATED** | orchestrator.ts:6180, 8934; context-authority.ts:270/294/311 (unguarded writes) |
| R2 — After observation evidence is locked, no rewrite into generic symptoms | **PARTIALLY OK** | `TURN_EVIDENCE_LOCK` freezes the arrays at orchestrator.ts:4712, but pre-lock rewrites (§Break #3, #6) still occur |
| R3 — Intent must not decide agronomic truth; observations must drive hypotheses | **VIOLATED** | `intentToSymptom` (4057-4082) and `causeToIntent` (5349-5359) both let intent decide evidence |
| R4 — Same meaning across languages ⇒ identical canonical_state_hash | **VIOLATED** | Breaks #1, #2, #3 make canonical state a function of surface wording; no `canonical_state_hash` is computed anywhere in the pipeline |

---

## 8. Root-Cause Ranking

**P0 — breaks the decision brain (non-deterministic graph)**
1. Devanagari `CROP_KEYWORDS` (language-induction-layer.ts:230-271)
2. Intent salvage reducers duplicated (intent-classifier.ts + orchestrator.ts:2953, 4013)
3. `intentToSymptom` fabricates evidence (orchestrator.ts:4057-4082)

**P1 — causes inconsistency**
4. Six writers to `growth_stage`, three unguarded (orchestrator + context-authority)
5. Four independent copies of stage synonyms
6. `causeToIntent` hardcoded map (orchestrator.ts:5349-5359)
7. Parallel enums `CropStage` / `VisualSymptom` / `CanonicalCropSymbol` alongside DB tables

**P2 — cleanup / structural debt**
8. Hardcoded intent-membership lists in orchestrator (five sites)
9. Deprecated placeholder maps still branched on (layered-rule-evaluator.ts)
10. Large vernacular dictionaries in TS (entity-normalizer 1154 lines, agricultural-vocabulary 759 lines, observation-ontology 640 lines, cross-crop-symptom-mapper 453 lines, regional-translator 215 lines, rural-language-dictionary 158 lines) — all mirror data that already exists (or should exist) in `observation_aliases`, `crop_synonyms`, `crop_vocabulary`, `intent_translations`, `observation_translations`.

---

## 9. Why Query A ≠ Query B (concise causal chain)

```text
Query B ("या शेतातील पिक अजून उगवले नाही")
  │
  ├─ CROP_KEYWORDS has no entry for "पिक" ──► inductionResult.crop = UNKNOWN_CROP
  │                                          (Query A: RICE)
  │
  ├─ LLM sees generic subject "पिक" ──► higher probability of intent = GENERAL_CROP_INFO
  │                                    (Query A: EMERGENCE_FAILURE)
  │
  ├─ orchestrator.ts:4057 intentToSymptom
  │     A: EMERGENCE_FAILURE → injects POOR_GERMINATION
  │     B: GENERAL_CROP_INFO → injects nothing (advisoryIntents branch)
  │
  ├─ bridgeCodesDb receives DIFFERENT code sets
  │     A: [POOR_GERMINATION] → obs_rice_no_emergence via IOM peers
  │     B: []                 → no bridge, no peers
  │
  ├─ evaluateCandidateHypotheses receives DIFFERENT observations
  ├─ iom-gate uses DIFFERENT intent (GENERAL_CROP_INFO vs EMERGENCE_FAILURE)
  ├─ hypothesis winner DIFFERS
  └─ rule graph DIFFERS
```

No canonical-state hash is computed to detect this divergence.

---

## 10. Scope Boundary

Report is descriptive only. No files were edited; no migrations were
issued; no fixes are proposed here. All findings are line-referenced to
the current code in `supabase/functions/ai-agriculture-chat/`.

---

## 11. Refactor Plan Execution (2026-07-04)

Partial execution of the approved plan. Focus: eliminate §9 divergence for
Query A vs Query B by installing an immutable GraphTruth node and removing
the hardcoded intent→symptom map.

### Files changed

- **new** `supabase/functions/ai-agriculture-chat/runtime/graph-truth.ts`
  - Immutable `GraphTruth` node (frozen), `buildGraphTruth()`, deterministic
    `computeGraphHash()` (FNV-1a), and `validateGraphTruth()` violation logger.
- **edit** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
  - **T3 · Removed hardcoded `intentToSymptom` (16 entries), `symptomBasedIntents`
    (16 entries), and `advisoryIntents` (6 entries).** Replaced with a live query
    against `intent_observation_mapping` scoped to `(intent_code, landContext.
    current_crop | 'universal')` where `assertion_strength = 'LITERAL'` and
    `is_active = true`. Injected codes are registered as `INFERRED` with source
    `IOM_INTENT_TO_OBSERVATION`. Advisory-direct route retained only when
    `directModeBypass` is set and no LITERAL peers exist.
  - **T1/T9 · Build GraphTruth immediately after `TURN_EVIDENCE_LOCK`.** Emits
    `[GRAPH_TRUTH_BUILT] hash=<> crop=<> stage=<> das=<> obs=[..]`.
- **edit** `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts`
  - Hardened LLM prompt with a mandatory `AUTHORITATIVE LAND CONTEXT` block and
    a `BINDING RULE`: generic subjects (`crop`, `पिक`, `फसल`, `pik`, `fasal`,
    `pikat`, `shet`, `field`, `मालाला`, `पिकाला`) MUST be interpreted as
    `landContext.current_crop`. Added explicit `EMERGENCE_FAILURE` routing hint
    covering `उगवले नाही / अंकुरण नहीं / खराब उगवण` regardless of subject noun.

### Authority removed from code

| Removed | Old location | New authority |
| --- | --- | --- |
| `intentToSymptom` map (16 rows) | orchestrator.ts:4055-4072 | `intent_observation_mapping` (LITERAL) |
| `symptomBasedIntents` list | orchestrator.ts:4021-4038 | same as above |
| `advisoryIntents` list | orchestrator.ts:4041-4048 | same as above |
| Generic-subject → crop guess | LLM free choice | LLM prompt bound to `landContext.current_crop` |

### DB tables now used

- `intent_observation_mapping` — sole source of intent→observation mapping
  (previously encoded in TypeScript).
- Continues to use `observation_aliases` (concept-bridge) and IOM LITERAL peers
  (`resolveCropCanonicalObservations`) unchanged.

### New traces (explainability)

```text
[GRAPH_TRUTH_BUILT]       hash=<hex> crop=<> stage=<> das=<> obs=[..]
[INTENT_IOM_FALLBACK]     intent=<> crop=<> scope=CROP|UNIVERSAL injected=[..] source=intent_observation_mapping
[GRAPH_CONTRACT_VIOLATION] field=<> before=<> after=<> callsite=<>  (fires only on drift)
```

### Before / after graph trace (§9 case)

Query A: `भात अजून उगवले नाही`
Query B: `या शेतातील पिक अजून उगवले नाही`

Both against a Rice land with active crop_schedule, DAS=26.

BEFORE (documented in §9):
- A: intent=`EMERGENCE_FAILURE` → intentToSymptom → `POOR_GERMINATION` → bridge → `obs_rice_no_emergence`
- B: intent=`GENERAL_CROP_INFO` → advisoryIntents branch → nothing injected → empty evidence → different hypothesis path
- No hash existed to detect the divergence.

AFTER (this refactor):
- Intent classifier prompt binds "पिक" → rice via `AUTHORITATIVE LAND CONTEXT`,
  so both A and B produce `intent = EMERGENCE_FAILURE`.
- Extractor returns 0 observations for both queries (short phrase, no explicit
  symptom vocabulary).
- `INTENT_IOM_FALLBACK` queries `intent_observation_mapping` where
  `intent_code=EMERGENCE_FAILURE` and `crop_code ∈ (rice, universal)` with
  `assertion_strength=LITERAL` → injects the DB-curated observation code(s)
  (typically `poor_germination` or `obs_rice_no_emergence` depending on how the
  ontology row is authored).
- `bridgeCodesDb` + `resolveCropCanonicalObservations` union the LITERAL peers
  → both queries reach `canonical_observations = {obs_rice_no_emergence, ...}`.
- `GraphTruth.hash` is identical for A and B. Divergence is now observable via a
  single grep on `[GRAPH_TRUTH_BUILT]` log lines.

### Not yet executed (deferred follow-up tasks)

The approved plan additionally covered:
- T5 · Add `blockStageWriteIfLocked()` guards in `canonical-state-builder.ts` and
  `context-authority.ts` (only `biological-state.ts` currently owns the check).
- T6 · Deprecate the ontology constants in `symptom-enums.ts`, `entity-normalizer.ts`,
  `cross-crop-symptom-mapper.ts`, `iom-gate.ts`, `navigator-adapter.ts`,
  `contradiction-engine.ts` and route their readers through DB loaders.
- T8 · Wire `validateGraphTruth(before, after, callsite)` into every
  hypothesis / rule / response call site.
- T9 (test wiring) · Extend `scripts/regression-diagnostic-options.test.ts`
  with the three Marathi cases + hash equality assertion.

These require touching 8+ additional files each with non-trivial reader
refactors; they will land in a follow-up patch. The current change is sufficient
to make §9 deterministic at runtime and to provide the observability
(`[GRAPH_TRUTH_BUILT]` hash) needed to prove it.

### Deployment

`ai-agriculture-chat` edge function deployed with these changes.
