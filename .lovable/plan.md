
# Forensic Audit — AI Chat & Symbolic Decision Brain (All Crops)

Scope: `supabase/functions/ai-agriculture-chat/**` (orchestrator, loader, decision/, agents/, safety-gates), plus DB tables `decision_rules`, `hypothesis_master/_conditions/_contradictions`, `observation_master`, `intent_observation_mapping`, `crop_stage_master`.

Audited as senior agronomist + senior decision-graph engineer. **No code/data has been changed — this is the report. Approve specific items and I will fix them one-by-one.**

---

## A. Coverage map (DB ground truth)

| Crop      | decision_rules (active) | hypotheses | hypothesis conditions / discriminators | contradictions | obs in `observation_master` | intent_obs mappings |
|-----------|------------------------:|-----------:|---------------------------------------:|---------------:|----------------------------:|--------------------:|
| SUGARCANE | 523                     | 54 (61)    | 179 / 136                              | 60             | 47                          | 1,269               |
| RICE      | 133                     | 25         | 65 / 28                                | 28             | 70 (CEREALS shared)         | 1,186               |
| BRINJAL   | 134                     | 26         | 51 / 28                                | 29             | 60                          | 1,119               |
| POTATO    | 132                     | 31         | 46 / 42                                | 30             | 62                          | 1,362               |
| TOMATO    | 130                     | 30         | 42 / 39                                | 30             | 62                          | 1,547               |
| ONION     | 128                     | 29         | 40 / 39                                | 29             | 60                          | 1,414               |
| COTTON    | 121                     | 25         | 68 / 33                                | 33             | 49                          | 982                 |
| MAIZE     | 120                     | 29         | 40 / 36                                | 25             | 53                          | 900                 |
| SOYBEAN   | 120                     | 30         | 38 / 36                                | 25             | 52                          | 1,125               |
| CHILI     | 120                     | 30         | 50 / 36                                | 25             | 50                          | 1,044               |
| WHEAT     | 117                     | 26         | 81 / 39                                | 35             | 56                          | 1,223               |
| ALL       | 40                      | —          | —                                      | —              | 2                           | 23                  |

Schema-level coverage is present for every crop. The defects below are **integrity / wiring** problems that silently degrade non-sugarcane crops.

---

## B. Critical findings (P0 — block correct firing for some/all non-sugarcane crops)

### P0-1. `crop_stage_master` case mismatch silently disables stage validation for 8 crops
`decision/db-observation-validator.ts:75,86,142,178,252` and `decision/intent-resolver.ts:101` query with `cropCode.toUpperCase()`. DB rows are stored **lowercase** for brinjal, chili, maize, onion, potato, soybean, tomato, wheat (only COTTON / RICE / SUGARCANE are upper-case). Result: `getGrowthStageFromDB` returns `'UNKNOWN'` → validator early-returns `valid: true` → **no stage validation** and `getValidObservationCodes` returns nothing for those 8 crops.

Fix path: normalize comparison case-insensitively (`.ilike` or a `LOWER(crop_code)=LOWER($1)` filter), or run a one-time data migration to upper-case the 8 lowercase rows.

### P0-2. DB rules use 3 `action_type` values the loader silently collapses
DB enums in active rules: `RECOMMEND, MONITOR, BLOCK, NO_ACTION_REQUIRED, URGENT_ACTION, APPLY_TREATMENT, IMMEDIATE_ACTION, RELEASE_BIOCONTROL`. `bundled-rules/loader.ts:129-142` maps `APPLY_TREATMENT → RECOMMEND` but **`IMMEDIATE_ACTION` and `RELEASE_BIOCONTROL` fall through to default `RECOMMEND`**. Counts of rows downgraded:
- `APPLY_TREATMENT` rows: 337 across BRINJAL/CHILI/COTTON/MAIZE/ONION/POTATO/RICE/SOYBEAN/TOMATO/WHEAT
- `IMMEDIATE_ACTION` rows: 28 (BRINJAL 19, ONION 1, POTATO 8)
- `RELEASE_BIOCONTROL` rows: 38

Meanwhile `decision/unified-decision-gate.ts:267,276` *does* recognise `URGENT_ACTION` and `IMMEDIATE_ACTION` as treatment actions. So the loader pre-normalization **discards semantics the gate is ready to use** — urgency and biocontrol routing collapse to generic "recommend" for every non-sugarcane crop.

Fix path: extend `normalizeActionType` to preserve `URGENT_ACTION`, `IMMEDIATE_ACTION`, `RELEASE_BIOCONTROL`, `APPLY_TREATMENT` as first-class types and update the gate's `TREATMENT_ACTIONS` set accordingly. Or stamp DB to the 5-enum canonical and re-migrate.

### P0-3. SUGARCANE is the only crop with temporal constraints
`crop_age_days_min/max` is populated for 369/523 SUGARCANE rules but **0** for every other crop. `safety-gates.ts` `STAGE_GATE` (lines 122-144) uses only `crop_age_days_max`. Therefore the STAGE_GATE is effectively a no-op for RICE, WHEAT, COTTON, etc., letting "young crop" pest rules fire on harvest-stage crops.

Fix path: agronomy backfill into `decision_rules.crop_age_days_min/max` per crop, OR fall back to `stage_applicable` intersection with current stage when DAS bounds are missing.

### P0-4. Sugarcane-only normalizations applied globally
`bundled-rules/loader.ts:183-196` `normalizeStages` rewrites stage names with sugarcane biology baked in:
```
PLANTING→GERMINATION, RATOON→POST_HARVEST,
CANE_FORMATION→GRAND_GROWTH, EARLY_GROWTH→SEEDLING
```
These remappings are applied to **every** rule for every crop. `PLANTING → GERMINATION` is wrong for transplanted crops (RICE, TOMATO, BRINJAL, CHILI, ONION) where the field stage is `TRANSPLANT` and `PLANTING` actually means nursery-out. Risk: cross-crop stage misalignment causing rules to either match the wrong stage or never match.

Fix path: scope the remap to `crop_code === 'SUGARCANE'` (or move stage synonyms into a per-crop table).

---

## C. High findings (P1)

### P1-1. Hypothesis engine crop-group normalization gaps
`decision/causal-hypothesis-engine.ts:136-207` filters `hypothesis_master` by an internal `normalizeCropGroup` mapping. The mapping coverage was not re-verified after BRINJAL/CHILI/MAIZE/ONION/POTATO/SOYBEAN/TOMATO/WHEAT rule-set growth. If a short code (e.g. `CHL`) or alternate (`POMEGRANATE` later) is sent, hypotheses for that crop return `📭 No hypothesis model` and the engine silently falls back to "full rule scope" — a critical correctness regression hidden in a log line.

Fix path: replace hand-coded map with a `crop_synonyms` DB lookup (already exists as a table) and emit `SYMBOLIC_CONTRACT_VIOLATION` when fallback fires.

### P1-2. Hypothesis evaluator headroom hardcoded to sugarcane
`decision/hypothesis-evaluator.ts:564` uses `.limit(800)` justified as "514+ SUGARCANE rules + multi-crop variants". This is fine today but bound to break when any other crop crosses 800 active rules. Should be `count(*)` + headroom or unbounded with server-side filter.

### P1-3. Loader cache is process-wide, not crop-scoped
`bundled-rules/loader.ts:60-62` caches all 1.9k rules for 1 hour in a single `cachedRules`. A bug in any one crop's rule poisons every other crop's evaluation for an hour. Recommended: keyed by `(crop_code, stage)` shard.

### P1-4. `safety-gates.ts` foliar safety blocks legitimate fertigation
`UNSAFE_FOLIAR_INGREDIENTS` lists MOP/KCl. The gate rejects any `FOLIAR/SPRAY` method without `water_volume_per_acre`. For non-sugarcane crops, 218–62 RECOMMEND rules have missing `dosage_per_acre`/`active_ingredient` (see B-table below); they'll trip the foliar gate when `application_method` is set generically. Result: clarifications instead of treatment for crops we have rules for.

| Crop      | RECOMMEND rules missing product/dosage |
|-----------|----------------------------------------:|
| SUGARCANE | 218                                     |
| RICE      | 62                                      |
| MAIZE     | 61                                      |
| SOYBEAN   | 58                                      |
| TOMATO    | 55                                      |
| BRINJAL   | 52                                      |
| COTTON    | 51                                      |
| CHILI     | 49                                      |
| ONION     | 46                                      |
| WHEAT     | 42                                      |
| POTATO    | 39                                      |

Fix path: (a) DB backfill, (b) treat missing product as "advisory-only" and skip foliar gate when `action_type ∈ {MONITOR, BLOCK, NO_ACTION_REQUIRED}`.

### P1-5. Sugarcane K-deficiency clarification is the only differential question
`safety-gates.ts:88-102` `diffQuestionForSymptom` hardcodes the `LEAF_TIP_BURN_YOUNG` differential text. Every other low-discriminator symptom across every crop falls to the generic English template — a regression of the multilingual canonical narration contract for non-sugarcane crops.

Fix path: load differential text from `observation_master.description` or a new `observation_differential_questions` table keyed by `(observation_code, language)`.

---

## D. Medium findings (P2)

### P2-1. Missing `scientific_basis` on 322 active rules
| Crop      | Rules with empty `scientific_basis` |
|-----------|------------------------------------:|
| RICE      | 133 (100%)                          |
| SUGARCANE | 106                                 |
| COTTON    | 80                                  |
| WHEAT     | 78                                  |
| ALL       | 5                                   |

These rules cannot satisfy the deterministic-response-builder's "Reason/Knowledge" sections. The narrator either fabricates basis text (contract violation) or returns shallow output.

### P2-2. Orphan `ALL` rules without hypothesis backing
40 active `crop_code='ALL'` rules exist; the hypothesis_master has no `ALL`/`UNIVERSAL` row, so `causal-hypothesis-engine` returns empty for these and the rules fire **without** hypothesis arbitration — bypassing the deterministic confidence model.

### P2-3. `intent_observation_mapping` thinness for MAIZE
MAIZE has only 49 intents mapped vs 78 for every other crop. Symptom-to-intent routing for MAIZE will silently drop ~37% of farmer intents to clarification/general-info.

### P2-4. `crop_stage_master` SUGARCANE has 22 stages; other crops 6–11
22 sugarcane stages vs e.g. BRINJAL=6 is fine agronomically, but several rules reference stages (e.g. `CANE_FORMATION`, `RATOON_INIT`) that exist only in sugarcane's stage taxonomy yet `normalizeStages` rewrites them globally (see P0-4).

### P2-5. Snapshot triggers removed but no replacement audit trail
Per prior memory, snapshot triggers on `decision_rules/hypothesis_master/observation_master` were dropped to fix write failures. There is currently **no row-level change history** for any crop. Rebuild as an `AFTER INSERT/UPDATE` trigger writing to `*_versions` tables using `NEW.rule_id` (text PK) not `NEW.id`.

---

## E. Low findings (P3)

- `decision-graph-bridge.ts` still references `'GENERAL'` cultural advice fallback — fine but should log when triggered for non-sugarcane crops to detect gaps in `decision-graph-bridge-data.ts`.
- `loader.ts:149-156` regex `sc_pest_*` / `ct_pest_*` is sugarcane+cotton only. RC_/RICE, WH_/WHEAT, etc. fall to default `'12_monitoring'` canonical group, hiding the real category in analytics.
- `index.ts:2502` hardcodes per-crop "max DAS" (`SUGARCANE 270`, `COTTON 150`, `RICE 120`, `WHEAT 120`) — missing BRINJAL/CHILI/MAIZE/ONION/POTATO/SOYBEAN/TOMATO entirely.
- `orchestrator.ts:3219, 7609, 9158` Marathi/Hindi crop-mention regex enumerates only SUGARCANE; other crops rely on entity-normalizer alone.
- Backup tables (`decision_rules_backup_20260316`, `observation_master_backup_*` ×3, `intent_observation_mapping_backup_2026_03`) should be archived to a cold schema; they currently inflate the project's row budget.

---

## F. Proposed fix waves (order matters; each wave is independently shippable)

Implementation will **not** start until you approve each wave. The decision-graph logic is not changed — only wiring/data integrity.

**Wave 1 — Make non-sugarcane crops actually fire (P0)**
1. Patch `db-observation-validator.ts` + `intent-resolver.ts` to do case-insensitive `crop_code` lookup (or upper-case the 8 lowercase rows in `crop_stage_master` via migration).
2. Extend `loader.ts normalizeActionType` to preserve `URGENT_ACTION`, `IMMEDIATE_ACTION`, `RELEASE_BIOCONTROL`, `APPLY_TREATMENT`; update `unified-decision-gate.ts TREATMENT_ACTIONS` to match.
3. Scope sugarcane stage synonyms in `loader.ts normalizeStages` to `crop_code === 'SUGARCANE'` only.

**Wave 2 — Restore safety-gate equivalence for all crops (P0/P1)**
4. Backfill `crop_age_days_min/max` for non-sugarcane rules from `crop_stage_master` ranges (one migration per crop) so `STAGE_GATE` becomes active.
5. Skip `FOLIAR_SAFETY_GATE` for non-treatment actions; only run it when `action_type ∈ {RECOMMEND, APPLY_TREATMENT, URGENT_ACTION, IMMEDIATE_ACTION}` and `dosage_per_acre` is present.
6. Move `diffQuestionForSymptom` to a DB-backed lookup so every crop/language gets a differential question.

**Wave 3 — Hypothesis & analytics integrity (P1/P2)**
7. Replace hand-coded `normalizeCropGroup` with `crop_synonyms` lookup; emit `SYMBOLIC_CONTRACT_VIOLATION` on fallback.
8. Make `hypothesis-evaluator.ts limit` dynamic (`count(*)+50` or chunked).
9. Add `canonical_group` regex patterns for `RC_/RICE_/WH_/WHEAT_/TM_/TOMATO_/...` in `loader.ts normalizeCanonicalGroup`.

**Wave 4 — Data quality (P2)**
10. Migration to populate `scientific_basis` (sources from `icar_package_ref` where available) for RICE/SUGARCANE/COTTON/WHEAT rules.
11. Add `hypothesis_master` UNIVERSAL row + conditions, or quarantine the 40 `ALL` rules until they have hypothesis backing.
12. Add 29 missing MAIZE `intent_observation_mapping` rows.
13. Restore snapshot triggers correctly keyed on `NEW.rule_id` / `NEW.hypothesis_id` / `NEW.observation_code` (text PKs).

**Wave 5 — Cleanup (P3)**
14. Move backup_* tables to an `archive` schema.
15. Replace hardcoded max-DAS dict in `index.ts:2502` with `crop_stage_master` MAX(das_max) lookup.

---

## G. What I will NOT change without explicit go-ahead

- The arbitration logic, confidence weighting, safety-gate ordering, NDVI thresholds, and chemical safety policy stay identical.
- No deletions of existing rules — only metadata backfills and normalizer scoping.
- No LLM prompt changes.

Reply with `wave 1`, `wave 2`, … (or individual fix numbers, e.g. `do 1, 3, 5`) and I will create the migrations / code patches one at a time for review.
