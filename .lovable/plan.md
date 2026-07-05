# Database-First Forensic Audit — Update Refactor Plan

**Goal:** Prove every hardcoded agronomy constant has an existing DB owner *before* writing a single migration. No new tables until Phase 0–2 finish. No code changes this cycle. Deliverable = 4 markdown reports + a gap-only SQL patch list.

## Guardrails

- No `CREATE TABLE` until audit proves no existing owner + adding column breaks normalisation + a relationship graph is required.
- No `_v2` tables. Extend `crop_stage_master`, `observation_master`, `hypothesis_master`, `decision_rules`, `crop_baseline_guidelines_v2`, `master_products`, `chemical_regulatory_status`, `etl_standards`.
- One agricultural fact → one DB owner. Kill duplicates in DB, not code.
- All read-only during this cycle (`supabase--read_query`, `supabase--linter`, `supabase--slow_queries`, file reads).

## Phase 0 — Full DB Inventory → `DATABASE_ONTOLOGY_AUDIT.md`

Enumerate every `public` table (~400 present per schema list). For each, record:

- Purpose / primary entity
- Column list (types + nullability)
- FK graph (in + out)
- Row count (`SELECT count(*)`)
- Coverage sample (distinct crops, distinct stages, non-null critical columns)
- "Should not duplicate with" (cross-links to TS constants)

Group tables into ontology domains:

1. Crop identity: `crops`, `crop_groups`, `crop_synonyms`, `crop_vocabulary`, `crop_templates`
2. Stage ontology: `crop_stage_master`, `crop_stage_graph`, `crop_stage_aliases`, `crop_stage_knowledge`, `stage_transition_conditions`, `stage_validation_rules`, `stage_transition_log`, `variety_phenology_profile`, `farming_stages`
3. Observation graph: `observation_master`, `observation_aliases`, `observation_translations`, `observation_intent_master`, `observation_differential_questions`, `observation_versions`, `observation_vocabulary_gaps`, `intent_observation_mapping`, `intent_assertion_pattern`, `intent_semantic_class_allowlist`, `intent_translations`, `emergency_observation_codes`
4. Hypothesis graph: `hypothesis_master`, `hypothesis_conditions`, `hypothesis_contradictions`, `hypothesis_rule_mapping`, `hypothesis_versions`, `hypothesis_metrics`, `hypothesis_integrity_alerts`
5. Decision + safety: `decision_rules`, `decision_rules_history`, `rule_versions`, `rule_conflict_matrix`, `rule_explainability`, `rule_performance`, `rule_product_mapping`, `etl_standards`, `chemical_regulatory_status`, `cultural_strategies`, `safety_verifications`, `advisory_audit_log`
6. Product + agronomy reference: `master_products`, `master_product_categories`, `master_product_variety_crops`, `products`, `crop_baseline_guidelines_v2` (32 cols), `crop_baseline_guidelines`, `irrigation_types`, `soil_types`, `water_sources`, `variety_resistance`, `variety_phenology_profile`, `disease_risk_model`
7. Environment: `weather_current/forecasts/aggregates/historical/observations/alerts`, `land_weather_metrics`, `agro_climatic_zones`, `land_gdd_daily`, `ndvi_data`, `ndvi_micro_tiles`
8. Land + tenant scope: `lands`, `land_crops`, `land_activities`, `farmers`, `tenants`

## Phase 1 — TS Constant → DB Owner Map → `HARDCODE_TO_DB_MAPPING.md`

Take the 27 P1 hardcoded constants from the prior audit and, for each, run targeted `read_query` to prove/disprove ownership:

| TS Constant (file) | Hypothesised existing owner | Verification query |
|---|---|---|
| `CROP_GDD_CONFIG`, `WHEAT/RICE/COTTON/SUGARCANE_PHENOLOGY` | `crop_stage_master.gdd_min/max` + `variety_phenology_profile` | count crops with non-null gdd; missing crops list |
| `STAGE_FAMILIES`, `STAGE_SYNONYMS` | `crop_stage_master` (canonical/parent/prev/next) + `crop_stage_aliases` + `crop_stage_graph` | coverage per crop; missing stage-alias rows |
| `CROP_PHOTOPERIOD_PROFILES` + DAS windows | `crop_stage_master` (needs `photoperiod_sensitive` bool) | column present? |
| `POLLINATOR_DEPENDENT_CROPS` flowering DAS | `crop_stage_master` where growth_stage='FLOWERING' | rows exist for all crops? |
| `YOUNG_CROP_MAX_DAYS` (×2 files) | `crop_stage_master` (needs `chemical_safe_from_das`) | column present? |
| `CROP_IRRIGATION_PROFILES` + efficiency | `crop_baseline_guidelines_v2` (32 cols) + `irrigation_types` | coverage; irrigation columns audit |
| `NITROGEN/PHOSPHORUS/POTASSIUM_REQUIREMENTS_BY_STAGE`, `NDVI_THRESHOLDS_BY_CROP` | `crop_baseline_guidelines_v2` | which of 32 cols already hold these? |
| `PHI_DATABASE`, `NEAR_HARVEST_ALTERNATIVES`, `MAX_SAFE_DOSES`, `WHO_TOXICITY_CLASSES`, `BANNED_CHEMICALS`, `BANNED_SUBSTANCES_INDIA` | `chemical_regulatory_status` (8 cols) + `master_products` (134 cols) + `decision_rules` | which fields already exist? |
| `POLLINATOR_TOXICITY_DB`, neonic/aquatic lists, buffer distances | `chemical_regulatory_status` + `master_products` | coverage of pollinator flags |
| `SPRAY_LIMITS`, `SPRAY_THRESHOLDS`, disease-risk scoring | `etl_standards` (16 cols) + `disease_risk_model` (30 cols) | do these hold weather thresholds? |
| `EMERGENCY_OBS_CODES` | `emergency_observation_codes` + `observation_master.is_emergency` | table already exists — verify coverage |
| `IPM_LABELS`, `IPM_URGENCY_LABELS` | `decision_rules.ipm_level` + `intent_translations` / i18n | pure label lookup |
| `INTENT_SCOPE_MAP` | `observation_intent_master` + `intent_assertion_pattern` | already-present coverage |
| `DEFAULT_CONFIDENCE_RULES` (Bayesian weights) | none; runtime config, not agronomy | candidate for `system_config` row (existing table) |
| `CAUSE_NAMES`, `EXPLANATIONS`, `CATEGORY_PATTERNS`, `PLANT_PART_PATTERNS` | `hypothesis_master` + `observation_master.observation_category / affected_plant_part` | coverage query |
| Cost defaults in `economic-calculator.ts` | `crop_baseline_guidelines_v2.input_costs` | present? |
| `TREATMENT_ACTIONS`, `VAGUE_SYMPTOM_PATTERNS` | `decision_rules.action_type` enum + `observation_master.is_diagnostic` | derive at runtime |

For each row emit verdict: **REUSE (existing column)** / **EXTEND (add column to existing table)** / **NEW TABLE (requires justification)**.

## Phase 2 — Missing Capability Report → `MISSING_DB_CAPABILITY_REPORT.md`

Only concepts that fail all three "new table allowed" checks appear here. Expected candidates after Phase 1 (subject to disproof):

- Columns to add to `observation_master`: `is_emergency`, `observation_category` if not present (schema says 24 cols — verify).
- Columns to add to `crop_stage_master` (30 cols today): `is_critical_stage`, `chemical_safe_from_das`, `photoperiod_sensitive`, `photoperiod_critical_day_length_hours` — verify what's already there.
- Columns to add to `chemical_regulatory_status` (8 cols): `phi_days_domestic`, `phi_days_export_eu`, `phi_days_export_us`, `mrl_fssai_ppm`, `mrl_eu_ppm`, `who_toxicity_class`, `max_dose_g_per_ha`, `pollinator_bee_ld50_contact_ug`, `pollinator_bee_ld50_oral_ug`, `pollinator_residual_toxicity_days`, `pollinator_flowering_banned`, `buffer_distance_aquatic_m`, `buffer_distance_pollinator_m` — verify overlap with `master_products` before deciding location.
- Rows to seed `etl_standards` with per-product-type spray weather thresholds (wind/rain/temp/humidity/dry-hours).
- Rows to seed `system_config` with hypothesis-engine Bayesian weights (no new table).
- Genuinely new: `intent_scope_config` **only if** `observation_intent_master`+`intent_assertion_pattern` cannot express scope.
- Genuinely new: `cost_benchmarks` **only if** `crop_baseline_guidelines_v2` cannot hold per-stage cost.

Every "genuinely new" line requires a written justification block (why extension breaks normalisation, which entities need the graph).

## Phase 3 — DB Cleanup Report → `DATABASE_CLEANUP_REPORT.md`

Classify every table found in Phase 0 as KEEP / MERGE / DEPRECATE / REMOVE. Priority targets from schema scan:

- `crop_baseline_guidelines` vs `crop_baseline_guidelines_v2` → likely MERGE/REMOVE.
- `decision_rules_rule_id_mapping_*` (×4 tables) + `canonical_group_fix_mapping_safe` + `cause_fix_mapping` + `crop_code_fix_mapping` + `rule_id_fix_mapping_safe` → migration scratch tables, candidates for REMOVE.
- `staging_mgrs_tiles*` (×3) → post-import staging, REMOVE.
- `scientific_names_enhancement_mapping`, `district_zone_mapping`, `canonical_group_parse_audit`, `canonical_hint_mapping`, `canonical_group_mapping` → verify usage vs. remove.
- `variety_review_queue`, `rule_quality_metrics`, `rule_product_mapping`, `ingest_runs`, `scraper_*` → verify edge-function references.
- `_audit_manual_review`, `dropped_tables_archive`, `archived_data`, `decision_rules_translations_archive` → archive; DEPRECATE with retention rule.
- Cross-check every "KEEP" table for at least one edge-function reference (`rg` across `supabase/functions/`).

## Phase 4 — Updated Refactor Plan → `UPDATED_REFACTOR_PLAN.md`

Rewrite prior Phase 4 (DB migration phase) using Phase 1 verdicts. Old plan proposed 9 new tables + 5 new columns. New plan will read (expected shape, pending audit):

- 0 new tables where reuse is possible; new tables listed individually with justification.
- N `ALTER TABLE ... ADD COLUMN` statements against existing ontology.
- Seed inserts into `etl_standards`, `chemical_regulatory_status`, `crop_baseline_guidelines_v2`, `system_config`, `emergency_observation_codes`.
- Backward compatibility: additive only; no column renames; no PK changes; no FK removals.
- Deprecation queue: TS constants scheduled for deletion, gated on DB coverage tests (Phase 7 regression).

Then rewrite Phases 5–7 unchanged (kill keyword pipelines, wire audit trail, regression tests), but tie every TS deletion to a specific DB row-count assertion.

## Phase 5 — Graph-Flow Verification

Trace Land → Crop → Variety → Phenology → Observation → Hypothesis → Decision Rule → Product/Safety → Response through the audited schema. Note any node without a canonical table. Append to `UPDATED_REFACTOR_PLAN.md` as an ASCII diagram with table names on each edge.

## Phase 6 — SQL Migration Draft (gaps only, not executed)

Emit a single SQL block per proven gap, grouped by table, all additive, ready for the future build turn. This cycle only *proposes* the SQL inside `UPDATED_REFACTOR_PLAN.md`; no `supabase--migration` call.

## Deliverables at end of this cycle

1. `DATABASE_ONTOLOGY_AUDIT.md`
2. `HARDCODE_TO_DB_MAPPING.md`
3. `MISSING_DB_CAPABILITY_REPORT.md`
4. `DATABASE_CLEANUP_REPORT.md`
5. `UPDATED_REFACTOR_PLAN.md` (supersedes prior Phase 4; carries Phases 5–7 forward with DB-anchored acceptance tests)
6. Draft SQL blocks for gaps only, embedded in doc #5 — not executed.

## Open confirmations before writing docs

- OK to inspect all ~400 public tables via `supabase--read_query` (SELECTs + `information_schema` reads only)?
- OK to write the 5 markdown reports at repo root alongside existing audit docs (`OBSERVATION_GRAPH_AUDIT.md`, `CROP_STAGE_SSOT_PHASE_AUDIT_2026-07-04.md`, etc.)?
- Any tables off-limits from cleanup classification (e.g. billing/subscription/admin — will KEEP by default unless told otherwise)?
