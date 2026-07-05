# GraphTruth Repair Report

**Scope:** `supabase/functions/ai-agriculture-chat/`
**Method:** Two parallel forensic explorers traced the runtime end-to-end and enumerated every mutation site, fallback generator, and hardcoded agronomy map. Every claim below carries a `file:line` citation.
**Status:** Audit only. No code, database, or ontology changes were made in this pass.

---

## 0. Executive Verdict

GraphTruth is **built and frozen** (`agents/orchestrator.ts:4720–4722`, `runtime/graph-truth.ts:181`), and four integrity checkpoints (`PRE_HYPOTHESIS_ENGINE`, `PRE_IOM_GATE`, `PRE_LAYERED_RULE_EVALUATOR`, `PRE_RESPONSE_BUILDER`) verify its hash. But three classes of post-lock leaks still break the "GraphTruth is the only truth" invariant:

1. **Post-lock writes into `CanonicalState`** — 6 assignment sites reset `crop_type` / `crop_stage` / `growth_stage` *after* the projection from GraphTruth (orchestrator.ts lines 6249, 6257, 6260, 6267, 6268, 6273, 6385–6393).
2. **Two parallel NLU brains still fire** — `language-induction-layer.ts` (MARATHI/HINDI/ENGLISH symptom maps + CROP_MAP), `cross-crop-symptom-mapper.ts` (30+ trilingual regex `SYMPTOM_PATTERNS`), `observation-code-mapper.ts` (VISUAL_CHANGE / PEST_BEHAVIOR / AFFECTED_PART mappings), and `observation-key-mapper.ts` (AFFECTED_PART_MAP). All of these operate on raw farmer text, in parallel to the DB-driven observation graph.
3. **Symbolic bypass still ships fake decisions** — `generateDefaultDecision` (rule-engine-executor.ts:469), `generateFallbackDecision` (:540), `createMonitoringDecision` (conflict-resolver.ts:563), and 4 more sites emit `MONITOR` / `CONTINUE_MONITORING` when no rule matches, instead of returning a `GRAPH_NEEDS_MORE_EVIDENCE` sentinel and loading clarification from `observation_differential_questions` (which — verified — is **never read anywhere in the function codebase**).

Full evidence for each follows.

---

## TASK 1 — GraphTruth Lifecycle Trace

### 1.1 Ordered call chain (post-freeze)

| # | File | Line | Function | Input | Output |
|---|------|------|----------|-------|--------|
| 1 | `index.ts` | 353 | HTTP `serve` handler | `{ messages, landId, sessionId, imageUrl, language, metadata }` | `OrchestratorResponse` |
| 2 | `agents/orchestrator.ts` | ~800 | `AIAgentOrchestrator.processMessage` | request context | full response |
| 3 | `agents/orchestrator.ts` | 2833 | `extractSemanticMeaning` (LLM NLU — primary) | `(processedFarmerMessage, detectedLanguage, intentLandContext)` | `SemanticExtraction` |
| 4 | `agents/orchestrator.ts` | 2841 | `mapToObservationCodes` | `SemanticExtraction` | `MappedObservationCodes` |
| 5 | `agents/orchestrator.ts` | 2848 | `expandObservationVocabularyViaAliases` | `(codes, supabase)` | expanded `string[]` (DB call to `observation_aliases`) |
| 6 | `agents/orchestrator.ts` | 3091 | `induceCanonicalSymbols` (LEGACY FALLBACK) | `(processedFarmerMessage, { current_crop })` | `LanguageInductionResult` |
| 7 | `agents/orchestrator.ts` | 3788, 3792 | `mapToCrossCropSymptoms` | `string[]` raw text | `CrossCropSymptomResult` |
| 8 | `agents/orchestrator.ts` | 4682–4721 | `resolveCropCanonicalObservations` + `Object.freeze` | codes → frozen `canonical_observation_codes` | frozen arrays |
| 9 | `agents/orchestrator.ts` | 4738–4761 | `buildGraphTruth` (`runtime/graph-truth.ts:116–188`) | `{ land_id, crop_code, variety_id, biological_stage, stage_uuid, DAS, GDD, canonical_observations }` | `Object.freeze(GraphTruth)` — logs `[GRAPH_TRUTH_BUILT]` |
| 10 | `agents/orchestrator.ts` | 4785 | `assertGraphTruthIntegrity('PRE_HYPOTHESIS_ENGINE')` | GraphTruth | throws on hash drift |
| 11 | `decision/hypothesis-evaluator.ts` | 649 (`n`) | `evaluateCandidateHypotheses` | `HypothesisEvaluationInput` (11 fields incl. `crop_code`, `growth_stage`, `days_since_sowing`, `known_observations`) | `HypothesisEvaluationOutput` |
| 12 | `agents/orchestrator.ts` | 6223 | `assertGraphTruthIntegrity('PRE_CANONICAL_STATE')` | GraphTruth | throws on drift |
| 13 | `agents/canonical-state-builder.ts` | 768 | `buildCanonicalState` | `BuildCanonicalStateInput` | `CanonicalState` (STILL performs stage inference chain — see 2.1) |
| 14 | `agents/canonical-state-builder.ts` | 1360 | `projectCanonicalStateFromGraphTruth` | `(state, graphTruth)` | mutates `state.crop_type`, `state.crop_stage` from GraphTruth |
| 15 | `agents/orchestrator.ts` | 6254–6277 | **Post-projection mutation block** — writes crop/stage from `inductionCrop`, `cropContextAuthority` | — | **VIOLATION** |
| 16 | `decision/causal-hypothesis-engine.ts` | 824 (`n`) | `runCausalHypothesisArbitration` | `{ crop_group, canonical_state, observations, supabase_client, trace_id }` | `ArbitrationResult` |
| 17 | `agents/orchestrator.ts` | 6629 | `assertGraphTruthIntegrity('PRE_LAYERED_RULE_EVALUATOR')` | GraphTruth | throws |
| 18 | `agents/layered-rule-evaluator.ts` | 409 | `evaluateRulesLayered` | `(rules, canonicalStateWithQuery, opts)` | `RuleEvaluationResult` |
| 19 | `agents/orchestrator.ts` | 6887 | `evaluateBundledKeywordRules` (KEYWORD FALLBACK) | `(farmerMessage, canonicalState)` | overwrites `rules_applied` (line 6894–6895) |
| 20 | `agents/deterministic-response-builder.ts` | 570 | `buildDeterministicResponse` | `(RichRuleData, cropCtx?, weatherCtx?)` | advisory JSON |
| 21 | `agents/llm-response-generator.ts` | 738 | `generateLLMResponse` (direct path, bypasses rules — orchestrator.ts:5947) | `LLMResponseInput` | `{ response_text, source, confidence? }` |

### 1.2 Post-lock mutation sites — `[GRAPH_MUTATION_BLOCKED]` targets

Lock line: `agents/orchestrator.ts:4722`.

#### `crop_code`

| Line | Op | Evidence |
|------|-----|----------|
| 6249 | **WRITE** | `projectCanonicalStateFromGraphTruth` — `state.crop_type = graphTruth.crop_code` (`canonical-state-builder.ts:1390`) — legitimate projection |
| 6257 | **WRITE** | `canonicalState.crop_type = canonicalContext.crop_code` — redundant, projection already ran |
| 6260 | **WRITE** | `canonicalState.crop_type = inductionCrop` — **VIOLATION** (induction can differ from GraphTruth) |
| 6267 | **WRITE** | `canonicalState.crop_type = cropContextAuthority.crop_name` — **VIOLATION** (v7.7 fallback) |
| 4806, 4843, 5485, 6232, 6485, 6523 | READ | acceptable if consistently read from `_gtForHyp` / `canonicalContext` |

#### `biological_stage` / `growth_stage` / `crop_stage`

| Line | Op | Evidence |
|------|-----|----------|
| 6249 | **WRITE** | Projection — `state.crop_stage = graphTruth.biological_stage` (`canonical-state-builder.ts:1391`) |
| 6268, 6273 | **WRITE** (guarded by `blockStageWriteIfLocked`) | `canonicalState.growth_stage = cropContextAuthority.growth_stage` — **VIOLATION when guard bypassed** |
| 6385–6393 | **WRITE** (guarded) | `landContext.growth_stage = contextValidation.reconciled_stage` — **VIOLATION** (mutates upstream landContext post-lock) |

#### `DAS` / `days_since_sowing`
No post-lock writes found. All sites (4774–4778, 4808, 4843, 6200–6232) are READs. ✅

#### `canonical_observations` / `currentObservations`

| Line | Op | Evidence |
|------|-----|----------|
| 4846 | **WRITE** | `hypothesisResult.candidates = kept` — this mutates the *hypothesis output*, not GraphTruth, but the IOM filter re-derives candidate lists from a mutable source ⚠️ |
| 3885–3887 | **WRITE** (pre-lock in most flows) | `mappedCodes.observation_codes.push(code)` — photo-code injection; verify ordering vs lock line 4722 |
| All others (4724, 4793–4795, 4804, 5946, 6223, 6229, 6249, 6600–6603, 6629) | READ | ✅ |

#### `intent` / `intentCode`
No post-lock writes. ✅

#### `hypothesis_id` / `hypothesisRuleScope`

| Line | Op |
|------|-----|
| 4846 | **WRITE** — candidate list re-assignment |
| 6505, 6511 | **WRITE** — `hypothesisRuleScope = hypothesisResult.best_hypothesis.mapped_rule_ids` |

Legitimate downstream derivations, but must be re-read from a **frozen** hypothesis-result object.

#### `rule_ids` / `rules_applied`

| Line | Op | Evidence |
|------|-----|----------|
| 6631 | **WRITE** | Initial layered-rule result — legitimate |
| 6894–6895 | **WRITE** | `layeredRuleResult.rules_matched = keywordMatches.length; layeredRuleResult.rules_applied = keywordMatches.map(m => m.ruleId)` — **VIOLATION** (keyword fallback rewrites the symbolic rule set) |
| 6707 | **WRITE** | `graph.hypothesis_graph.push(cand)` — mutates the graph render structure post-lock ⚠️ |

---

## TASK 2 — `canonical-state-builder.ts` Must Become a Projection

**File:** `agents/canonical-state-builder.ts` — **1 407 LOC**.

### 2.1 Second-brain logic that must be deleted

| Section | Lines | Behavior |
|---------|-------|----------|
| Stage inference priority chain | **820–843** | Chooses stage from 6 sources: locked canonicalContext → bioState → landContext → GDD → flat input → `'UNKNOWN'`. **Must** be replaced with `graphTruth.biological_stage` only. |
| `mapObservationsToSymptom` | **563–589** | Regex-normalizes any input string; returns `VisualSymptom.UNKNOWN` on failure. Silently discards non-canonical codes. |
| `mapVisualSymptomToEnum` | **597–606** | Single-symptom UPPER_SNAKE passthrough. |
| `mapCropNameToEnum` | **529–537** | Delegates to `unifiedNormalizeCropCode` + `getFullCropName`; still returns `CropType.UNKNOWN` as fallback (masks GraphTruth). |
| `mapStageToEnum` | **547–554** | Same UPPER_SNAKE passthrough with `CropStage.UNKNOWN` fallback. |
| `mapDaysToSowingBucket` / `mapNDVIToLevel` / `mapNDVITrendToEnum` / soil mappers / `mapRainfallToEnum` / `mapTemperatureToStress` / `mapHumidityToEnum` | **394–520** | Environmental bucketing — belongs in DB-driven `etl_standards` per prior audit. |
| Canonical-authority throw | **1008–1018** | Correct guard, but only fires *after* mutation is attempted; the mutation site itself must not exist. |

### 2.2 What remains (projection only)

The **only** function required after refactor:

```
canonicalState = {
  crop_type: graphTruth.crop_code,
  crop_stage: graphTruth.biological_stage,
  days_after_sowing: graphTruth.DAS,
  canonical_observations: graphTruth.canonical_observations,
  visual_symptom: graphTruth.canonical_observations[0] ?? null,
  land_id: graphTruth.land_id,
  variety_id: graphTruth.variety_id,
  data_confidence: calculateDataConfidence(...)   // stays — pure metadata
}
```

Everything else in the file is **inference** and must be moved to DB tables or deleted.

---

## TASK 3 — Legacy Ontology Engines to Disconnect

| File | LOC | Hardcoded maps (line) | DB replacement |
|------|-----|-----------------------|----------------|
| `agents/language-induction-layer.ts` | 635 | `MARATHI_SYMPTOM_MAP` (41), `HINDI_SYMPTOM_MAP` (134), `ENGLISH_SYMPTOM_MAP` (181), `CROP_MAP` (228), `AFFECTED_PART_MAP` (287), `SEVERITY_MAP` (320), `DISTRIBUTION_MAP` (347). File header at line 6 says `@deprecated` but all maps still fire from `induceCanonicalSymbols` (line 407). | `crop_synonyms`, `observation_aliases`, `crop_stage_aliases`, `observation_master.semantic_class` |
| `agents/cross-crop-symptom-mapper.ts` | 453 | `SYMPTOM_PATTERNS` (36–345) — 30+ trilingual regex entries incl. STUNTED_GROWTH at line 225 | `observation_aliases` (2 540 rows in `observation_master`) |
| `decision/observation-code-mapper.ts` | 631 | `INTENT_TO_OBSERVATION_MAPPINGS` (58), `VISUAL_CHANGE_MAPPINGS` (160), `PEST_BEHAVIOR_MAPPINGS` (231), `AFFECTED_PART_MAPPINGS` (245), `DISTRIBUTION_MAPPINGS` (270), `SEVERITY_MAPPINGS` (295) | `intent_observation_mapping`, `observation_master.category`, `observation_master.affected_plant_part`, `observation_master.semantic_class` |
| `agents/observation-key-mapper.ts` | — | `AFFECTED_PART_MAP` (31) | `observation_master.affected_plant_part` |
| `agents/intent-router.ts` | 559 | `INFORMATION_SHARING_PATTERNS` (64), `PROGRESS_UPDATE_PATTERNS` (133), `PROBLEM_REPORTING_PATTERNS` (171), `FOLLOW_UP_PATTERNS` (223), `QUESTION_PATTERNS` (259), inline stage names (325–328) | `intent_observation_mapping.assertion_strength` (already the DB router per Core memory) |
| `agents/gdd-phenology-engine.ts` | — | `CROP_GDD_CONFIG` (84), `WHEAT_PHENOLOGY` (106), `RICE_PHENOLOGY` (223) | `crop_stage_master` + `variety_phenology_profile` |
| `runtime/contradiction-engine.ts` | — | `STAGE_FAMILIES` (80) | `crop_stage_graph` (11 columns) |
| `runtime/navigator-adapter.ts` | — | `STAGE_FAMILIES` (32) | `crop_stage_graph` |
| `decision/intent-resolver.ts` | — | `STAGE_SYNONYMS` (130) | `crop_stage_aliases` (9 columns) |
| `decision/iom-gate.ts` | — | `STAGE_SYNONYMS` (52) | `crop_stage_aliases` |
| `agents/phi-enforcement-guardian.ts` | — | `PHI_DATABASE` (67) | `chemical_regulatory_status` (8 cols; extension planned) |
| `agents/safety-guardian-types.ts` | — | `PHI_DATABASE` (264 — **second independent copy**), `WHO_TOXICITY_CLASSES` (288) | `chemical_regulatory_status` |
| `agents/decision-graph-bridge.ts` | — | `BANNED_CHEMICALS` (74) | `chemical_regulatory_status.status` |
| `agents/response-validation-gate.ts` | — | `BANNED_CHEMICALS` (45 — **second independent copy**) | `chemical_regulatory_status.status` |
| `decision/fact-extractor.ts` | — | `PEST_INDICATORS` (26) | `observation_master.category = 'PEST_BEHAVIOR'` |
| `decision/hypothesis-evaluator.ts` | — | `DB_CROP_MAP` (602) — inline crop normalizer | `crop_synonyms` |
| `agents/layered-rule-evaluator.ts` | — | `STAGE_FAMILIES` (1356), `CATEGORY_PATTERNS` (1467), `PLANT_PART_PATTERNS` (1468) — **all already stubbed to `{}`** | Delete constants + call sites |

**Stub-but-still-declared** items are safe to delete outright.

---

## TASK 4 — Hypothesis Input Contract

### 4.1 Current signatures (both name-obfuscated to `n`)

**`evaluateCandidateHypotheses` — `decision/hypothesis-evaluator.ts:649`**
```ts
export async function n(input: HypothesisEvaluationInput): Promise<HypothesisEvaluationOutput>
```
`HypothesisEvaluationInput` (lines 47–65) accepts **11 mutable fields**: `crop_code`, `growth_stage`, `days_since_sowing`, `ndvi_level?`, `ndvi_trend?`, `weather?`, `known_observations`, `user_query`, `supabaseClient`, `trace_id?`, `variety_id?`.

**`runCausalHypothesisArbitration` — `decision/causal-hypothesis-engine.ts:824`**
```ts
export async function n(input: CausalHypothesisInput): Promise<ArbitrationResult>
```
`CausalHypothesisInput` (lines 816–822) accepts `{ crop_group, canonical_state, observations, supabase_client, trace_id? }`.

### 4.2 Call sites (all pass mutable pipeline locals + fall back to `_gtForHyp`)

| Site | File:Line | Argument shape |
|------|-----------|----------------|
| Primary hypothesis | `agents/orchestrator.ts:4804` | `crop_code: _gtForHyp?.crop_code ?? cropCode` — **`?? cropCode` fallback is the leak** |
| Causal arbitration | `agents/orchestrator.ts:6491` | Passes `canonical_state` (mutable) + `[...allObservationsForPreAuth]` (mutable) |
| Clarification path | `agents/clarification-strategy.ts` | Passes `crop_code`, `stage`, `current_symptoms` from clarification input (no GraphTruth ref) |

### 4.3 Required contract

```ts
export async function evaluateCandidateHypotheses(
  graphTruth: GraphTruth,        // frozen
  supabase: SupabaseClient,      // infra dependency
  traceId: string                // observability
): Promise<HypothesisEvaluationOutput>
```

Delete `crop_code`, `growth_stage`, `days_since_sowing`, `known_observations`, `variety_id` from the input type. All are already present on `GraphTruth`. Same for `runCausalHypothesisArbitration`.

---

## TASK 5 — Remove Symbolic Bypass

### 5.1 Fallback generators (delete)

| Function | File | Line | Emits |
|----------|------|------|-------|
| `generateDefaultDecision` | `agents/rule-engine-executor.ts` | **469** | `action_type: 'MONITOR_ONLY'`, `specific_action: 'Monitor field and reassess...'`, `status: 'FALLBACK_MODE'` — called at line 217 |
| `generateFallbackDecision` | `agents/rule-engine-executor.ts` | **540** | `action_type: 'MONITOR_ONLY'`, `specific_action: 'Temporary fallback: monitor and retry'` — called at line 259 |
| `createMonitoringDecision` | `agents/conflict-resolver.ts` | **563** | `action_type: 'MONITOR_ONLY'`, `specific_action: 'CONTINUE_MONITORING'` — called at lines 111, 132, 163 |
| Hardcoded `CONTINUE_MONITORING` | `index.ts` | **1347** | inline literal |
| `getStageSpecificFallback` | `agents/orchestrator.ts` | **1063–1110** | returns `['CONTINUE_MONITORING', 'TAKE_PHOTO']` (1071), `['MONITOR', 'OBSERVE']` (1080), `['MONITOR', 'TAKE_PHOTO', 'DESCRIBE_SYMPTOMS']` (1105) |
| Default `'MONITOR'` action | `agents/canonical-advisory-schema.ts` | **201, 336** | `action_type: d.action_type \|\| 'MONITOR'` |
| Default `'MONITOR'` action | `agents/deterministic-response-builder.ts` | **1275** | `action_type: primaryDecision.action_type \|\| 'MONITOR'` |
| Late catch fallback | `agents/orchestrator.ts` | **10986** | `action_type: 'MONITOR'` in a terminal catch |

### 5.2 Replacement contract

When zero rules match after the layered evaluator:

```ts
return {
  status: 'GRAPH_NEEDS_MORE_EVIDENCE',
  reason: 'NO_RULE_MATCHED',
  graph_truth_hash: graphTruth.hash,
  clarification: await loadDifferentialQuestions(
    supabase,
    graphTruth.crop_code,
    graphTruth.biological_stage,
    graphTruth.canonical_observations,
  ),
}
```

**Blocker (must-do before Task 5 can ship):** `observation_differential_questions` table (7 columns per schema inventory) is **NEVER read anywhere** in `supabase/functions/`. Zero rg hits for `observation_differential_questions`, `GRAPH_NEEDS_MORE_EVIDENCE`, or `NEEDS_MORE_EVIDENCE`. Reader implementation is a prerequisite.

---

## TASK 6 — Regression Test (spec, not implementation)

**Test file (to create):** `supabase/functions/ai-agriculture-chat/scripts/graph-truth.regression.test.ts`

**Setup:** Rice land, DAS=27 (matches the observed drift case), variety_id null.

**Queries:**
1. `भात अजून उगवले नाही` (Marathi — direct crop name)
2. `या शेतातील पिक अजून उगवले नाही` (Marathi — generic subject; must resolve via `landContext.current_crop`)
3. `धान अभी तक नहीं निकला` (Hindi — direct crop name)

**Assertions (all three must be identical):**
- `graphTruth.hash`
- `graphTruth.crop_code === 'rice'`
- `graphTruth.stage_uuid` (non-null)
- `graphTruth.biological_stage` (non-`UNKNOWN`)
- `graphTruth.canonical_observations` (sorted deep-equal)
- primary `hypothesis.id`
- final `rules_applied[0]`

**Fail conditions:**
- Any of: `stage === 'UNKNOWN'`, `crop === 'UNKNOWN'`, `visual_symptom === 'STUNTED_GROWTH'` when input was `POOR_GERMINATION`, `status === 'FALLBACK_MODE'`, `action_type === 'MONITOR_ONLY'` when no rule matched, proactive rule appearing in `rules_applied`.

---

## Before / After Flow

### Before (current)

```
Farmer Query
   │
   ├─► extractSemanticMeaning (LLM NLU) ──► mapToObservationCodes ──► expandObservationVocabularyViaAliases
   │
   ├─► induceCanonicalSymbols (LEGACY: MARATHI/HINDI/ENGLISH MAPS + CROP_MAP)   ← parallel brain #2
   │
   ├─► mapToCrossCropSymptoms (SYMPTOM_PATTERNS regex)                          ← parallel brain #3
   │
   ▼
TURN_EVIDENCE_LOCK ──► buildGraphTruth ──► Object.freeze
   │
   ▼
buildCanonicalState (STAGE INFERENCE CHAIN — line 820)                          ← inference after lock
   │
   ▼
projectCanonicalStateFromGraphTruth (correct projection)
   │
   ▼
POST-PROJECTION MUTATION BLOCK (lines 6254–6277)                                ← writes crop/stage AFTER projection
   │
   ▼
runCausalHypothesisArbitration (accepts mutable canonical_state)
   │
   ▼
evaluateRulesLayered
   │
   ├── if rules_matched === 0 ──► evaluateBundledKeywordRules
   │                                 └─► rewrites rules_applied (line 6894–6895)
   │
   └── if still 0 ──► generateDefaultDecision → 'MONITOR_ONLY' FALLBACK_MODE
```

### After (target)

```
Farmer Query
   │
   ▼
extractSemanticMeaning (LLM = translation only)
   │
   ▼
DB resolution: crop_synonyms + observation_aliases + intent_observation_mapping
   │
   ▼
buildGraphTruth ──► Object.freeze ──► [GRAPH_TRUTH_BUILT]
   │
   ▼
projectCanonicalStateFromGraphTruth (PURE PROJECTION — 20 LOC total)
   │
   ▼
evaluateCandidateHypotheses(graphTruth)     ← contract: GraphTruth only
   │
   ▼
evaluateRulesLayered(graphTruth, hypothesis)
   │
   ├── rule matched ──► buildDeterministicResponse
   │
   └── no match ──► GRAPH_NEEDS_MORE_EVIDENCE
                     └─► loadDifferentialQuestions(observation_differential_questions)
```

---

## Files Slated for Deletion (post-migration)

- `agents/cross-crop-symptom-mapper.ts` (453 LOC — duplicates `observation_aliases`)
- `agents/observation-key-mapper.ts` (AFFECTED_PART_MAP duplicated in DB)
- `agents/gdd-phenology-engine.ts` (moves to `crop_stage_master` + `variety_phenology_profile` reader)
- All *_SYMPTOM_MAP and CROP_MAP constants inside `agents/language-induction-layer.ts` (file may remain as a thin `landAuthority` passthrough, or delete entirely once `induceCanonicalSymbols` has zero callers)
- `agents/layered-rule-evaluator.ts`: constants at lines 1356, 1467, 1468 (already stubbed)
- Second-copy `PHI_DATABASE` in `agents/safety-guardian-types.ts:264`
- Second-copy `BANNED_CHEMICALS` in `agents/response-validation-gate.ts:45`
- All fallback generators listed in §5.1

---

## Constants Slated for Removal (post-migration)

`MARATHI_SYMPTOM_MAP`, `HINDI_SYMPTOM_MAP`, `ENGLISH_SYMPTOM_MAP`, `CROP_MAP`, `AFFECTED_PART_MAP` (x2), `SEVERITY_MAP`, `DISTRIBUTION_MAP`, `SYMPTOM_PATTERNS`, `INTENT_TO_OBSERVATION_MAPPINGS`, `VISUAL_CHANGE_MAPPINGS`, `PEST_BEHAVIOR_MAPPINGS`, `AFFECTED_PART_MAPPINGS`, `DISTRIBUTION_MAPPINGS`, `SEVERITY_MAPPINGS`, `CROP_GDD_CONFIG`, `WHEAT_PHENOLOGY`, `RICE_PHENOLOGY`, `STAGE_FAMILIES` (x3), `STAGE_SYNONYMS` (x2), `CATEGORY_PATTERNS`, `PLANT_PART_PATTERNS`, `PHI_DATABASE` (x2), `WHO_TOXICITY_CLASSES`, `BANNED_CHEMICALS` (x2), `PEST_INDICATORS`, `DB_CROP_MAP`, `INFORMATION_SHARING_PATTERNS`, `PROGRESS_UPDATE_PATTERNS`, `PROBLEM_REPORTING_PATTERNS`, `FOLLOW_UP_PATTERNS`, `QUESTION_PATTERNS`.

---

## Ordered Repair Sequence (recommended, minimizes regression risk)

1. **Add missing DB reader** for `observation_differential_questions` + implement `GRAPH_NEEDS_MORE_EVIDENCE` sentinel type. (Unblocks Task 5.)
2. **Collapse post-projection mutation block** (orchestrator.ts:6254–6277) — projection is the only allowed writer.
3. **Tighten hypothesis contract** — remove `?? cropCode` / `?? growthStage` fallbacks at orchestrator.ts:4804; make both hypothesis entrypoints accept `GraphTruth` only.
4. **Delete keyword fallback** at orchestrator.ts:6887–6895 (`evaluateBundledKeywordRules`).
5. **Delete fallback generators** (§5.1) — replace all call sites with `GRAPH_NEEDS_MORE_EVIDENCE`.
6. **Turn `canonical-state-builder.ts` into a projection** (§2.2) — remove 1 387 LOC.
7. **Migrate legacy engines to DB** (§Task 3 table) — one file per PR to keep blast radius small.
8. **Wire the regression test** (§Task 6).

---

## Verification Log Signals (to appear after repair)

```
[GRAPH_TRUTH_BUILT] hash=<h> crop=rice stage=SEEDLING das=27 obs=[POOR_GERMINATION]
[CANONICAL_PROJECTION_ONLY] state.crop=rice state.stage=SEEDLING state.obs=[POOR_GERMINATION]
[GRAPH_MUTATION_BLOCKED] site=<file:line> field=<name> — WOULD_HAVE_WRITTEN=<val>
[GRAPH_VALIDATED] site=PRE_HYPOTHESIS_ENGINE hash_match=true
[GRAPH_VALIDATED] site=PRE_LAYERED_RULE_EVALUATOR hash_match=true
[HYPOTHESIS_TRACE] PASS id=<h_id> rules=[<r_id>...]
[GRAPH_VALIDATED] site=PRE_RESPONSE_BUILDER hash_match=true
```

Any `[GRAPH_MUTATION_BLOCKED]` line in production is a real bug and must be fixed at the emitting site.

---

**End of report. No code, database, or ontology changes have been made in this pass — this is the plan-of-record for the repair.**
