# DATABASE_ONTOLOGY_AUDIT

**Date:** 2026-07-05  
**Scope:** Read-only forensic inventory of every ontology-bearing table used by the neuro-symbolic decision brain. Column shapes and row counts verified via live `information_schema` + `SELECT count(*)` reads.  
**No schema changes were made in this cycle.**

---

## Domain 1 — Crop Identity

| Table | Rows | Distinct crops | Purpose | Owns |
|---|---|---|---|---|
| `crops` | — | — | Master crop registry (id, code, botanical name, group). | crop_code SSOT |
| `crop_groups` | — | — | Higher-level taxonomy (kharif/rabi/etc.). | crop_group SSOT |
| `crop_synonyms` | **699** | **14 canonical, 15 languages** | Multi-language aliases per crop. | Aliases (replaces `cropCodeAliases`, `CROP_NAME_TO_CODE`) |
| `crop_vocabulary` | — | — | Farmer-facing vernacular vocabulary. | Free-text farmer terms |
| `crop_templates` | — | — | Onboarding/UI templates. | UI presentation only |

**Verdict:** Full coverage. No hardcoded crop-name maps should remain in TS.

---

## Domain 2 — Stage Ontology

| Table | Rows | Distinct crops | Owns |
|---|---|---|---|
| `crop_stage_master` | **221** | **24** | Canonical stage graph. Columns include `stage_code`, `canonical_stage_id`, `parent_stage_id`, `next_stage_id`, `prev_stage_id`, `das_min/max`, `gdd_min/max` (0 populated), `base_temperature_c`, `expected_ndvi_min/max` (0 populated), `expected_height_cm_min/max`, `expected_leaf_count_min/max`, `phenology_model`, `is_photoperiod_sensitive` (**28 rows true — column EXISTS**), `phenology_index`, `crop_cycle`. |
| `crop_stage_aliases` | 195 | 11 | Human/language stage aliases (replaces `STAGE_SYNONYMS`). |
| `crop_stage_graph` | 146 | 18 | Inter-stage edges w/ duration bands (replaces `STAGE_FAMILIES`). |
| `crop_stage_knowledge` | — | — | Free-text stage notes; RLS off. |
| `stage_transition_conditions` | — | — | Rule-driven stage transitions. |
| `stage_validation_rules` | — | — | Stage assertion rules. |
| `variety_phenology_profile` | 22 | 1 | Variety-level phenology overrides (`gdd_target`, ndvi bands, height/leaf counts, base_temperature_c override). |

**Verdict:** Stage ontology is architected but **under-populated** (only 1 crop has variety phenology; 0 rows carry gdd_min/max on `crop_stage_master`). Every column TS constants would need already exists. **No new stage tables needed.**

---

## Domain 3 — Observation Graph

| Table | Rows | Coverage | Owns |
|---|---|---|---|
| `observation_master` | **2540** | 2195 have `observation_category`, 2215 have `affected_plant_part`, 2195 `is_farmer_observable`. Columns: `canonical_group`, `semantic_class`, `symptom_category`, `symptom_pattern`, `severity_level`, `discriminator_score`, `frequency_score`, `clarity_score`, `polarity`, `applies_to_stages[]`, `applicable_crop_groups[]`. | Full observation SSOT |
| `observation_aliases` | — | — | Concept-code bridge (replaces `CONCEPT_BRIDGE`). |
| `observation_translations` | — | — | Per-language labels. |
| `observation_intent_master` | 90 intents | 25 categories | `intent_code`, `intent_category`, `allowed_observation_groups[]`, `requires_crop_context`, `requires_stage_context`, `routing_target`, `clarification_mode`, `max_clarification_rounds`. |
| `observation_differential_questions` | — | — | Clarification prompts. |
| `intent_observation_mapping` | **13,672** | 12 crops, all intents | (intent, crop, stage, das) → observation set with `confidence_rank`, `assertion_strength`. |
| `intent_assertion_pattern` | 68 | — | Regex-driven intent → assertion strength mapping. |
| `intent_semantic_class_allowlist` | — | — | Allowed semantic classes per intent. |
| `intent_translations` | — | — | Intent i18n. |
| `emergency_observation_codes` | **38** | — | Standalone emergency flag list. |
| `observation_vocabulary_gaps` | — | — | Unknown-term telemetry. |

**Verdict:** Observation graph is the strongest area. No new tables. **`observation_master.is_emergency` column not present** — but `emergency_observation_codes` table already fulfils that role; question is whether to promote to column or keep as join.

---

## Domain 4 — Hypothesis Graph

| Table | Rows | Owns |
|---|---|---|
| `hypothesis_master` | **346** (337 active) | `hypothesis_id`, `crop_group`, `canonical_group`, `hypothesis_type`, `cause_name_en/mr/hi`, `biological_basis`, `severity_model`, `version_hash`. |
| `hypothesis_conditions` | — | `condition_type`, `condition_key`, `operator`, `value_json`, `is_required`, `is_discriminator`, `weight`, `is_quarantined`. |
| `hypothesis_contradictions` | — | Contradicting evidence graph. |
| `hypothesis_rule_mapping` | — | Hypothesis → rule bridge. |
| `hypothesis_versions` | — | Snapshot history. |
| `hypothesis_integrity_alerts` | — | Drift alerts. |
| `hypothesis_metrics` | — | Runtime metrics. |

**Verdict:** `hypothesis_master.cause_name_*` fully replaces the hardcoded `CAUSE_NAMES` / `EXPLANATIONS` dicts in `diagnostic-escalation-generator.ts`. `biological_basis` replaces "why" text.

---

## Domain 5 — Decision + Safety

| Table | Rows | Owns |
|---|---|---|
| `decision_rules` | **1852** | 163 columns; complete decision packet w/ `action_type`, `ipm_level`, dosage, PHI, product references. |
| `decision_rules_history` | — | Audit ledger. |
| `rule_versions`, `rule_conflict_matrix`, `rule_explainability`, `rule_performance`, `rule_product_mapping` | — | Rule governance. |
| `etl_standards` | **126** | 13 crops | Per-pest per-stage ETL (`etl_value`, `etl_unit`, `sampling_method`, `sampling_unit`, `action_threshold`). **No weather-condition columns.** |
| `disease_risk_model` | **90** | 11 crops | Weather-driven disease risk: `temp_min/max`, `humidity_min/max`, `leaf_wetness_hours_min`, `rain_mm_min/max`, `wind_speed_max`, per stage/season with pre-translated alert copy in en/mr/hi. |
| `chemical_regulatory_status` | **59** | Only `chemical_name`, `status`, `regulatory_body`, `ban_date`, `reason`, `alternatives (jsonb)`. **No PHI/MRL/WHO/LD50 columns.** |
| `safety_verifications` | — | Safety check audit. |
| `advisory_audit_log` | — | Advisory audit. |
| `cultural_strategies` | — | Non-chemical strategy registry. |

**Verdict:** `disease_risk_model` already owns weather thresholds for disease. `etl_standards` owns pest thresholds. **Spray-weather thresholds per product type have no owner yet.** `chemical_regulatory_status` is thin — must be extended, not duplicated.

---

## Domain 6 — Product + Agronomy Reference

| Table | Rows | Coverage | Owns |
|---|---|---|---|
| `master_products` | **196** | 67 have PHI, 28 have re-entry hours, 196 have `active_ingredients` (jsonb) | 134 columns including `pre_harvest_interval_days`, `re_entry_interval_hours`, `active_ingredients`, `dosage_instructions`, `spray_volume_per_acre (jsonb)`, `weather_conditions (jsonb)`, `pest_targets`, `disease_targets`, `weed_targets`, `usage_restrictions`, `warnings`, `handling_precautions`, `first_aid_measures`, `disposal_instructions`, `environmental_impact (jsonb)`, `compatibility_info`, `application_timing`, `crop_stages`, `recommended_season`, `ph_range`, `water_solubility`, `mixing_instructions`, `safety_level`. |
| `crop_baseline_guidelines_v2` | **97** | 11 crops, 97 stage-rows | 32 cols: `nitrogen_min/max/optimal`, `phosphorus_*`, `potassium_*`, `sulphur_optimal`, `zinc_optimal`, `iron_optimal`, `irrigation_interval_days`, `water_requirement_mm`, `critical_moisture_percent`, `soil_ph_min/max` — plus more per full schema. |
| `crop_baseline_guidelines` (v1) | — | — | Legacy 20-col table. |
| `irrigation_types` | — | — | Irrigation system reference (target for efficiency factors). |
| `soil_types` | — | — | Soil registry. |
| `water_sources` | — | — | Water source registry. |
| `variety_resistance` | — | — | Variety pest/disease resistance. |
| `disease_risk_model` | 90 | 11 crops | See Domain 5. |

**Verdict:** `master_products` is comprehensive — PHI, re-entry, spray volume, weather-condition JSON, dose, mixing, pest/disease targets all already live here. Chemical-level facts (WHO class, LD50, MRL) belong on `chemical_regulatory_status` (active-ingredient level), NOT `master_products` (product-SKU level).

---

## Domain 7 — Environment (no-touch)

`weather_current`, `weather_forecasts`, `weather_aggregates`, `weather_historical`, `weather_observations`, `weather_alerts`, `land_weather_metrics`, `agro_climatic_zones`, `land_gdd_daily`, `ndvi_data`, `ndvi_micro_tiles`. Read-only for this audit.

---

## Domain 8 — Runtime Config

| Table | Rows | Owns |
|---|---|---|
| `system_config` | **1** | `config_key TEXT`, `config_value JSONB`. Generic key-value store — ready to host hypothesis-engine tuning constants (`DEFAULT_CONFIDENCE_RULES`) without a new table. |

---

## Ontology Duplicates Found in DB (require cleanup)

1. `crop_baseline_guidelines` (v1, 20 cols) vs `crop_baseline_guidelines_v2` (32 cols) — one must be deprecated.
2. `emergency_observation_codes` (standalone) vs a potential `observation_master.is_emergency` column — pick one; do not add both.
3. Migration scratch tables: `decision_rules_rule_id_mapping_complete_v2`, `_final`, `_hierarchy`, `_ultimate`, `canonical_group_fix_mapping_safe`, `cause_fix_mapping`, `crop_code_fix_mapping`, `rule_id_fix_mapping_safe`, `staging_mgrs_tiles*` (×3), `_audit_manual_review`, `canonical_hint_mapping`, `canonical_group_mapping`, `canonical_group_parse_audit`, `scientific_names_enhancement_mapping`, `district_zone_mapping`, `dropped_tables_archive`, `decision_rules_translations_archive` — see `DATABASE_CLEANUP_REPORT.md`.

---

## Population Gaps Discovered

| Table.Column | Gap |
|---|---|
| `crop_stage_master.gdd_min / gdd_max` | 0 of 221 rows populated. |
| `crop_stage_master.expected_ndvi_min / max` | 0 of 221 rows populated. |
| `variety_phenology_profile` | Only 1 crop (22 variety-stage rows). |
| `chemical_regulatory_status` | Missing PHI/MRL/WHO/LD50 columns entirely. |
| `etl_standards` | No weather-condition columns; only pest thresholds. |

These are the true root causes that pushed developers to hardcode in TS. Populating (not restructuring) the ontology is the fix.
