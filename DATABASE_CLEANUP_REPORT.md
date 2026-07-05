# DATABASE_CLEANUP_REPORT

**Date:** 2026-07-05  
**Legend:** **KEEP** · **MERGE** (fold into another table) · **DEPRECATE** (mark unused, remove after N releases) · **REMOVE** (drop next migration cycle after user sign-off).

Only tables suspicious per Phase 0 inventory are listed. All ontology tables from Domains 1–6 are implicit KEEP unless flagged below.

---

## MERGE / DEPRECATE

| Table | Class | Reason | Action |
|---|---|---|---|
| `crop_baseline_guidelines` (v1, 20 cols) | MERGE → `crop_baseline_guidelines_v2` | v2 is the canonical target; both hold overlapping crop-level agronomic baselines. | Migrate any unique rows to v2; DEPRECATE v1 next release. |
| `decision_rules_translations_archive` | DEPRECATE | Archive-only, no runtime reads. | Keep read-only 1 release; then REMOVE. |
| `dropped_tables_archive` | DEPRECATE | Historical audit trail of removed tables. | Keep read-only. |
| `archived_data` | DEPRECATE | Generic archive dump. | Keep read-only; enforce retention. |
| `_audit_manual_review` | DEPRECATE | Prefix `_` and RLS off signals internal one-off audit table. | REMOVE after copying findings to `advisory_audit_log`. |

---

## REMOVE (post-migration scratch)

All of the following are one-off ID/mapping tables used during past ontology migrations. They have **RLS off** and are never referenced by any edge function per repo scan.

- `decision_rules_rule_id_mapping_complete_v2`
- `decision_rules_rule_id_mapping_final`
- `decision_rules_rule_id_mapping_hierarchy`
- `decision_rules_rule_id_mapping_ultimate`
- `rule_id_fix_mapping_safe`
- `canonical_group_fix_mapping_safe`
- `canonical_group_mapping`
- `canonical_group_parse_audit`
- `canonical_hint_mapping`
- `cause_fix_mapping`
- `crop_code_fix_mapping`
- `scientific_names_enhancement_mapping`
- `district_zone_mapping`
- `rule_product_mapping` (RLS off; verify no edge-function use before removal)
- `rule_quality_metrics` (RLS off; likely superseded by `rule_performance`)

**Action:** Confirm no edge-function reference (`rg "table_name" supabase/functions/`), export CSV backups to `/mnt/documents/deprecated_tables_2026-07-05/`, then `DROP TABLE` in a dedicated cleanup migration.

---

## REMOVE (import staging)

- `staging_mgrs_tiles`
- `staging_mgrs_tiles_wkb`
- `staging_mgrs_tiles_wkt`
- `staging_states`

**Action:** MGRS tile import completed (verified `mgrs_tiles` populated). Safe to drop after final backup.

---

## VERIFY-BEFORE-DECIDING

| Table | Question |
|---|---|
| `variety_review_queue` | Still driven by a UI? |
| `crop_stage_knowledge` (RLS off) | Is any agent reading this? If yes, ENABLE RLS + KEEP. If no, MERGE into `crop_stage_master.stage_description` (already present). |
| `agri_market_sources`, `scraper_execution_log`, `scraper_plugins`, `ingest_runs` (all RLS off) | Related to price scraper; if scraper still runs, KEEP + ENABLE RLS. Else DEPRECATE. |
| `crop_stage_graph` (146 rows) vs `crop_stage_master.parent_stage_id/prev/next` | Are both actively used? Prefer master; DEPRECATE graph if adjacency lives on master. |
| `emergency_observation_codes` (38 rows) | Keep as join table OR fold into `observation_master.is_emergency` column. Pick one; do not maintain both. |

---

## KEEP (explicit — ontology core)

`crops`, `crop_groups`, `crop_synonyms`, `crop_vocabulary`, `crop_stage_master`, `crop_stage_aliases`, `variety_phenology_profile`, `observation_master`, `observation_aliases`, `observation_translations`, `observation_intent_master`, `observation_differential_questions`, `intent_observation_mapping`, `intent_assertion_pattern`, `intent_semantic_class_allowlist`, `hypothesis_master`, `hypothesis_conditions`, `hypothesis_contradictions`, `hypothesis_rule_mapping`, `decision_rules`, `decision_rules_history`, `rule_versions`, `etl_standards`, `disease_risk_model`, `chemical_regulatory_status`, `master_products`, `crop_baseline_guidelines_v2`, `system_config`, `irrigation_types`, `soil_types`, `water_sources`, `variety_resistance`, `variety_source_references`, `variety_translations`, `variety_submissions`, `stage_transition_conditions`, `stage_validation_rules`, `stage_transition_log`.
