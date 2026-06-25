# CLARIFICATION_DATA_SOURCE_AUDIT.md
**Scope:** Runtime — `ai-agriculture-chat` clarification engine
**Test request:** `intent_code = EMERGENCE_FAILURE`, `crop = rice`, `DAS = 17`, `stage = SEEDLING`, `language = en`
**Mode:** Read-only forensic trace (no code or DB changes)

---

## 1. Executive Verdict

> **The clarification engine does NOT query `intent_observation_mapping`.**
> Observation options shown to the farmer are constructed from **`decision_rules.observable_characteristics`** (with a hard-coded `STAGE_KEY_PRIORITIES` list as a secondary fallback and an English `BASE_TEMPLATES` object as a tertiary fallback).
>
> The intent→observation mapping table (153 curated rows for `EMERGENCE_FAILURE`, 29 of which match Rice/SEEDLING/DAS 17) is **completely bypassed** by the clarification path. Its only runtime consumers are the downstream **LLM allow-list validators** (`utils/llm-output-validator.ts`, `decision/db-observation-validator.ts`) that gate the model's *output* — not the *options* offered to the user.
>
> The module that *would* query the mapping table — `decision/intent-resolver.ts::resolveIntentToObservations` — is **orphan code**. It is exported from a default-export object but never imported by any caller in the function bundle.

---

## 2. Static Call-Graph Audit

### 2.1 Where clarification options are actually built

Confirmed entry chain (grep + read):

```
orchestrator.ts
  └── clarification-generator.ts::generateClarificationQuestion(...)
        ├── generateDynamicClarification()   ── DEPRECATED stub, returns { options: [] }
        └── clarification-renderer.ts::renderClarificationAsync(...)
              ├── BASE_TEMPLATES / CROP_STAGE_SPECIFIC_TEMPLATES (English in-file dict)
              └── canonical-observation-loader.ts
                    ├── loadObservationKeysFromDB(crop, stage, lang)
                    │     └── SELECT observable_characteristics
                    │       FROM decision_rules
                    │       WHERE crop_code IN (<crop>,'all')
                    │         AND stage_applicable @> ARRAY[<dbStage>]
                    │         AND is_active = true
                    │         AND observable_characteristics IS NOT NULL
                    ├── getStageObservationKeys()  ── STAGE_KEY_PRIORITIES dict (hard-coded codes)
                    └── i18n/observation-label-loader.ts
                          └── SELECT … FROM observation_translations WHERE LOWER(observation_code) = ANY(...)
```

### 2.2 What the runtime never calls

| Symbol | File | Hits outside its own module |
|---|---|---|
| `resolveIntentToObservations` | `decision/intent-resolver.ts:173` | **0** |
| `getValidObservationCodes`    | `decision/intent-resolver.ts:127` | **0** |
| `getCanonicalIntents`         | `decision/intent-resolver.ts:266` | **0** |

The only references to `intent_observation_mapping` in the live code path are:

| File | Line | Purpose |
|---|---|---|
| `utils/llm-output-validator.ts` | 195 | Builds LLM **allow-list** (downstream gate, not clarification) |
| `decision/db-observation-validator.ts` | 139 / 176 / 250 | Validates LLM-emitted codes (downstream gate) |
| `decision/intent-resolver.ts` | 142 / 266 | **Dead code** |

### 2.3 The deprecated stub
`agents/clarification-generator.ts:250` emits `[DEPRECATED] generateDynamicClarification called` and always returns empty options, so control always falls through to `renderClarificationAsync`, which uses `loadObservationKeysFromDB` (`decision_rules`) or `STAGE_KEY_PRIORITIES`.

---

## 3. Runtime Trace — EMERGENCE_FAILURE / Rice / DAS 17 / SEEDLING

### 3.1 What the engine **actually** runs

`canonical-observation-loader.ts:262-330` normalises the stage:

```ts
STAGE_NORMALIZATION_MAP['seedling'] = 'germination'   // line 237
```

Then issues this SQL (two iterations: `'germination'` and `'all'`):

```sql
SELECT observable_characteristics
FROM decision_rules
WHERE crop_code IN ('rice','all')
  AND stage_applicable @> ARRAY['germination']::text[]
  AND is_active = true
  AND observable_characteristics IS NOT NULL;
```

**Result (live DB):** `3 rows`, all with `crop_code = 'all'`:

| rule_id | observable_characteristics |
|---|---|
| `GLOBAL_SAFETY_GENERAL_002` | `{observations: ['crop_stage','multi_stage_condition','general_management'], plant_parts:['whole_plant'], trigger_type:'multi_stage'}` |
| `GLOBAL_SAFETY_GENERAL_003` | (identical) |
| `GLOBAL_SAFETY_GENERAL_004` | (identical) |

### 3.2 Silent parser drop
Loader line 322:
```ts
if (Array.isArray(chars)) { for (const key of chars) uniqueKeys.add(key.toUpperCase()); }
```
But the rows return a **JSONB object** (`{ observations: [...], plant_parts: [...] }`), not an array. `Array.isArray(chars)` is `false` → **0 keys extracted** → fallback path taken.

### 3.3 Fallback path
`getFallbackKeys()` → `getStageObservationKeys('SEEDLING','en',20)` → `STAGE_KEY_PRIORITIES['seedling']` (no such key) → `STAGE_KEY_PRIORITIES['all']` (line 100-103):

```
['INSECTS_VISIBLE','LEAF_YELLOWING','LEAF_WILTING','LEAF_SPOTS_PRESENT',
 'PATCHY_DAMAGE','ENTIRE_FIELD_AFFECTED','DAMAGE_AFTER_RAIN']
```

These seven codes (none of them an emergence symptom) are the candidate set. `clarification-renderer.ts` then trims them with `BASE_TEMPLATES['DIAGNOSIS'].options` (English) and emits the question.

### 3.4 What the user actually receives
Three generic options like:
- 🔍 *Insects visible*
- 🔍 *Leaf yellowing / wilting*
- 🔍 *Patchy damage*

i.e., the management-planning / generic-symptoms catalogue — never the curated Rice-emergence list.

### 3.5 What the curated mapping **would** have returned

```sql
SELECT observation_code, growth_stage, das_min, das_max, confidence_rank, assertion_strength
FROM intent_observation_mapping
WHERE intent_code = 'EMERGENCE_FAILURE' AND is_active = true
  AND LOWER(crop_code) IN ('rice','all')
  AND UPPER(growth_stage) IN ('SEEDLING','GERMINATION','NURSERY','EMERGENCE','ESTABLISHMENT','ALL')
  AND (das_min IS NULL OR das_min <= 17)
  AND (das_max IS NULL OR das_max >= 17)
ORDER BY confidence_rank;
```

### 3.6 Stepwise row counts (live DB)

| Stage | Rows |
|---|---:|
| `intent_code = 'EMERGENCE_FAILURE'` (total in table) | **153** |
| + `is_active = true` (**base set**) | **152** |
| + crop filter (`rice` ∪ `all`) | **33** |
| + stage filter (SEEDLING / GERMINATION / NURSERY / EMERGENCE / ESTABLISHMENT / ALL) | **33** |
| + DAS filter (`das_min ≤ 17 ≤ das_max`) | **29** |

### 3.7 Final clarification candidates (top 9, rank-ordered)

| # | observation_code | crop | growth_stage | DAS range | rank | assertion |
|---|---|---|---|---|---|---|
| 1 | `germination_failure`      | rice | nursery     | 0–30 | 1 | LITERAL |
| 2 | `germination_failure`      | rice | seedling    | 0–45 | 1 | LITERAL |
| 3 | `seed_not_germinated`      | rice | germination | 0–30 | 1 | LITERAL |
| 4 | `seed_not_germinated`      | rice | nursery     | 0–30 | 1 | LITERAL |
| 5 | `seed_not_germinated`      | rice | seedling    | 0–45 | 1 | LITERAL |
| 6 | `obs_rice_no_emergence`    | rice | seedling    | 0–21 | 1 | LITERAL |
| 7 | `obs_rice_no_emergence`    | rice | nursery     | 0–21 | 1 | LITERAL |
| 8 | `poor_germination`         | rice | all         | 0–30 | 1 | LITERAL |
| 9 | `germination_failure`      | rice | germination | 0–30 | 1 | LITERAL |

…continuing with rank-2 (`delayed_germination`, `germination_concern`, `germination_patchy`, `poor_germination_percent`, `obs_rice_patchy_emergence`) and rank-3 (`gap_formation`, `obs_rice_seedling_damping_off`, `uneven_emergence`).

### 3.8 What is actually sent to the farmer

| Layer | Source | Codes sent |
|---|---|---|
| **Should be** | `intent_observation_mapping` rank-1 set (dedup'd) | `germination_failure`, `seed_not_germinated`, `obs_rice_no_emergence`, `poor_germination` |
| **Is** | `STAGE_KEY_PRIORITIES['all']` (fallback) | `INSECTS_VISIBLE`, `LEAF_YELLOWING`, `PATCHY_DAMAGE` |

---

## 4. Root Causes (ranked)

| # | Location | Defect | Impact |
|---|---|---|---|
| **R1** | `agents/clarification-generator.ts` + `agents/clarification-renderer.ts` | Clarification subsystem was never wired to `intent_observation_mapping`. It only knows about `decision_rules.observable_characteristics`. | Curated, intent-specific options are never surfaced. |
| **R2** | `canonical-observation-loader.ts:322` | Parser assumes `observable_characteristics` is `string[]`; live DB stores `{observations,plant_parts,trigger_type}` objects → silent 0-key extraction. | Even the rules that *do* match get dropped. |
| **R3** | `canonical-observation-loader.ts:237` (`STAGE_NORMALIZATION_MAP`) | `SEEDLING → germination`. Mapping table uses `seedling`, `nursery`, `germination`. Forcing one alias hides 2/3 of the curated rows. | Even if R1 were fixed via `decision_rules`, half the matches would be lost. |
| **R4** | `decision/intent-resolver.ts:137-140` | Stale "HOTFIX" comment claims `crop_code / das_min / das_max` columns "do not exist yet" — they do (verified in `information_schema.columns`). The resolver only filters by `intent_code`. | If the resolver were ever wired in, it would still over-fetch and dump unfiltered rows. |
| **R5** | `decision/intent-resolver.ts` exports | `resolveIntentToObservations`, `getValidObservationCodes`, `getCanonicalIntents` have **0 importers**. | Whole module is dead code. |
| **R6** | `agents/clarification-renderer.ts` `BASE_TEMPLATES` | English-only `🔍 …` option labels override DB labels when only key-list arrives. | English leakage even when DB labels exist. |

---

## 5. Evidence Index (reproducible)

```sql
-- column proof
SELECT column_name FROM information_schema.columns
WHERE table_name='intent_observation_mapping';
-- → id, intent_code, crop_code, growth_stage, das_min, das_max,
--   observation_code, confidence_rank, is_active, …, assertion_strength

-- defective runtime query
SELECT COUNT(*) FROM decision_rules
WHERE crop_code IN ('rice','all')
  AND stage_applicable @> ARRAY['germination']
  AND is_active AND observable_characteristics IS NOT NULL;
-- → 3   (all GLOBAL_SAFETY_GENERAL_*, no real symptoms)

-- correct query
SELECT COUNT(*) FROM intent_observation_mapping
WHERE intent_code='EMERGENCE_FAILURE' AND is_active
  AND LOWER(crop_code) IN ('rice','all')
  AND UPPER(growth_stage) IN ('SEEDLING','GERMINATION','NURSERY','EMERGENCE','ESTABLISHMENT','ALL')
  AND (das_min IS NULL OR das_min<=17)
  AND (das_max IS NULL OR das_max>=17);
-- → 29
```

Grep proofs:
```
$ rg -n "resolveIntentToObservations|getValidObservationCodes" supabase/functions/ai-agriculture-chat/
intent-resolver.ts:127   (definition)
intent-resolver.ts:173   (definition)
intent-resolver.ts:189   (self-call)
intent-resolver.ts:349   (default-export listing)
# zero external callers
```

---

## 6. Recommended Fix (no code applied per instruction)

1. **Wire `intent-resolver` into the clarification path.** In `clarification-generator.ts`, replace the deprecated `generateDynamicClarification` stub with a call to `resolveIntentToObservations(intent_code, crop, stage, das)`.
2. **Fix R4** — remove the stale "columns don't exist" guard; add `crop_code / growth_stage / das_min / das_max` predicates.
3. **Fix R2** — in `canonical-observation-loader.ts:322`, accept both `string[]` and `{observations: string[]}` shapes (used only as a secondary/global rule source).
4. **Fix R3** — pass *all* synonymous stages (`seedling`, `nursery`, `germination`) when filtering, not the single normalised alias.
5. **Fix R6** — render labels purely through `observation-label-loader.ts`; drop English `BASE_TEMPLATES.options`.

---

**Conclusion:** The audit conclusively proves the clarification engine ignores `intent_observation_mapping`. The mapping table is healthy (29 well-formed rows for the test request) but unreachable from the question-generation path; the path it *does* take returns three meaningless `GLOBAL_SAFETY_GENERAL_*` rules and silently drops them, ending up at a generic English fallback list.
