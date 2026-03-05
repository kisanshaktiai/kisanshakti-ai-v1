

# Deep Audit Report: AI Chat Symbolic Decision Brain — Table Usage & Data Integrity

---

## 1. `intent_observation_mapping` vs `intent_observation_mapping_v2` — Definitive Finding

### Which Table is Actually Used in Code?

**`intent_observation_mapping` (v1) — THE ONLY TABLE USED IN PRODUCTION CODE**

| File | Line | Usage |
|------|------|-------|
| `decision/intent-resolver.ts` | 142, 266 | Core intent→observation resolution (mandatory gate) |
| `decision/db-observation-validator.ts` | 139, 176, 250 | Observation validation + stage-valid lookups |
| `utils/llm-output-validator.ts` | 179 | Crop-applicability checks |

**`intent_observation_mapping_v2` — ZERO references in any code file.** It exists only in the auto-generated `types.ts` (reflecting the DB schema). No edge function, no agent, no loader ever queries it.

### Data Comparison

| Attribute | `intent_observation_mapping` (v1) | `intent_observation_mapping_v2` |
|-----------|-----------------------------------|----------------------------------|
| **Row count** | **147** | 90 |
| **Intent codes** | **22** (incl. FERTILIZER_SCHEDULE, LEAF_MARKS_OR_SPOTS, POST_HARVEST_HANDLING, YIELD_OR_OUTPUT_ISSUE, UNEVEN_FIELD_PATTERN, ROOT_OR_BASE_PROBLEM) | 16 (missing 6 intents) |
| **Has `crop_code`** | YES — SUGARCANE + ALL | NO |
| **Has `growth_stage`** | YES | NO |
| **Has `das_min`/`das_max`** | YES — biologically scoped | NO |
| **Used in code** | YES — 3 files, 6 query sites | NO — zero references |

### Verdict

**`intent_observation_mapping` (v1) is the authoritative, production table.** It has:
- Crop-scoped mappings (the code filters by `crop_code`)
- DAS-range biological validity (the code filters by `das_min`/`das_max`)
- 6 additional intents that v2 lacks
- 57 more rows of coverage

**`intent_observation_mapping_v2` is an orphaned legacy table.** It lacks crop/stage columns that the code requires. It should be either deleted or marked deprecated.

---

## 2. Critical Data Integrity Findings

### CRITICAL: 78 of 147 observation codes in `intent_observation_mapping` have ZERO matching `decision_rules`

The mapping table maps intents to observation codes like `DEAD_HEART_PRESENT`, `INTERNODE_BORER`, `LEAF_YELLOWING`, etc. But **522 of 524 active rules use `condition_code = 'STAGE_GENERAL'`** — meaning rules match via `observable_characteristics` JSONB arrays, NOT via direct `condition_code` joins.

This means the `intent_observation_mapping` → `decision_rules` bridge works through a **secondary matching path**: the symbolic reasoner matches farmer observations against `observable_characteristics[]` arrays, not `condition_code`.

**This is architecturally sound** — but 78 observation codes from the mapping table (e.g., `APHID_INFESTATION`, `LEAF_BROWNING`, `STUNTED_GROWTH`) appear in rules' `observable_characteristics` arrays rather than as `condition_code` values. The bridge works, but only through the symbolic reasoner's containment/root-word matching logic.

### Rule Distribution

| Crop | Active Rules |
|------|-------------|
| SUGARCANE | 461 |
| ALL | 36 |
| CTN (Cotton) | 27 |

Only 3 crops have rules. Multi-crop coverage is a major gap.

---

## 3. Complete Table Inventory — AI Chat Pipeline

| Table | Rows | Queried By | Role | Data Quality |
|-------|------|-----------|------|-------------|
| `observation_master` | 802 | hypothesis-evaluator, llm-output-validator, loader | Symptom registry (SSOT) | STRONG — all mapping codes validated |
| `observation_translations` | 1,082 | observation-label-loader, diagnostic-options-i18n | i18n labels | GOOD — covers major codes |
| `observation_aliases` | 187 | loader.ts, observation-code-mapper | Vocabulary bridge | GOOD |
| `observation_intent_master` | 30 | llm-output-validator | Intent code registry | ADEQUATE |
| `intent_observation_mapping` | 147 | intent-resolver, db-observation-validator, llm-output-validator | **Core intent→observation bridge** | **STRONG — crop/stage scoped** |
| `intent_observation_mapping_v2` | 90 | **NONE** | **ORPHANED — not used** | WEAK — no crop/stage columns |
| `decision_rules` | 524 | hypothesis-evaluator, loader, llm-output-validator | Treatment rules (SSOT) | GOOD for sugarcane, GAPS for other crops |
| `crop_stage_master` | 44 | db-observation-validator, intent-resolver | DAS→stage mapping | ADEQUATE |
| `hypothesis_master` | 31 | hypothesis-evaluator | Causal hypotheses | ADEQUATE |
| `hypothesis_conditions` | 19 | hypothesis-evaluator | Evidence weights | LOW — only 19 conditions for 31 hypotheses |
| `chemical_regulatory_status` | 30 | decision-graph-bridge | Banned chemicals | GOOD |
| `crop_vocabulary` | ? | crop-vocabulary-cache | Phrase patterns | UNKNOWN |

---

## 4. Recommended Actions

### Phase 1: Data Cleanup
1. **Delete or deprecate `intent_observation_mapping_v2`** — it is unused, has fewer intents, and lacks required columns
2. **Expand `hypothesis_conditions`** — only 19 rows for 31 hypotheses means many hypotheses have no evaluation criteria

### Phase 2: Coverage Gaps
3. **Add `decision_rules` for Cotton, Soybean, Rice, Wheat** — currently only Sugarcane (461) and Cotton (27) have rules
4. **Add `condition_code` values beyond `STAGE_GENERAL`** to enable direct condition→rule matching instead of relying entirely on `observable_characteristics` secondary path

### Phase 3: Optimization
5. **The `STAGE_GENERAL` condition_code bottleneck** — 522/524 rules share this code, meaning the symbolic reasoner loads ALL rules for a crop and filters in-memory. Adding specific condition codes (e.g., `STEM_DAMAGE`, `LEAF_YELLOWING`) would enable DB-level pre-filtering and reduce rule loading from ~460 to ~20-30 per query.

