# RLS Remaining Report — public schema

Generated: 2026-08-07 (PROMPT 6, step 1). **Report only — nothing here has been changed.**
For human review before any further RLS staging.

## Already remediated in this commit

These five SSOT tables were RLS-disabled and are now `ENABLE ROW LEVEL SECURITY`
with a single `read_all` policy (`FOR SELECT TO authenticated USING (true)`),
no write policies (service_role continues to write by bypassing RLS):

| Table | Frontend (`src/`) readers | Edge-function readers | Verified |
|---|---|---|---|
| `crop_stage_knowledge` | none | `ai-agriculture-chat/utils/stage-knowledge-cache.ts`, `runtime/knowledge-versions.ts`, `decision/crop-calendar-lookup.ts`, `decision/pipeline-self-check.ts` (all **service_role**) | ✅ unaffected |
| `cultivation_method_master` | none | `ai-agriculture-chat/utils/observation-mapping-cache.ts` (**service_role**) | ✅ unaffected |
| `epidemiology_threshold_evidence` | none | none (SQL/registry only) | ✅ unaffected |
| `weather_field_master` | none | none | ✅ unaffected |
| `pest_resurgence_risk` | none | none | ✅ unaffected |

No `src/` screen queries any of the five (the only occurrences are generated
type declarations in `src/integrations/supabase/types.ts`). No pre-login/anon
read path exists for any of them, so **`TO anon` was not required for any
table** and the policies are `TO authenticated` as specified.

## Remaining public tables with `rowsecurity = false`

Row counts are `pg_stat_user_tables.n_live_tup` (approximate).
"src/ readers" = files containing `.from('<table>')` under `src/`.

| Table | Rows | src/ readers | Note |
|---|---:|---|---|
| `_audit_manual_review` | 1 | none | internal audit scratch |
| `accuracy_fix_log` | 58 | none | internal ops log |
| `agri_market_sources` | 4 | none | scraper config |
| `canonical_group_fix_mapping_safe` | 0 | none | migration helper |
| `canonical_group_mapping` | 49 | none | ontology mapping (service_role) |
| `canonical_group_parse_audit` | 0 | none | migration audit |
| `cause_fix_mapping` | 0 | none | migration helper |
| `chemical_variety_requirement` | 4 | none | agronomy SSOT candidate |
| `commodity_master` | 8 | none | reference SSOT candidate |
| `crop_cultivation_methods` | 32 | none | reference SSOT candidate |
| `crop_trait_master` | 7 | none | reference SSOT candidate |
| `district_zone_mapping` | 0 | none | reference SSOT candidate |
| `establishment_implement` | 4 | none | reference SSOT candidate |
| `grain_type_tgw_band` | 6 | none | reference SSOT candidate |
| `hypothesis_conditions_archive` | 7 | none | archive |
| `ingest_runs` | 0 | none | pipeline telemetry |
| `observation_aliases_archive` | 14 | none | archive |
| `observation_master_archive` | 4 | none | archive |
| `pest_insecticide_resistance` | 5 | none | agronomy SSOT candidate |
| `rice_weed_sourcing_queue` | 4 | none | curation queue |
| `rule_category_master` | 69 | none | rule ontology (service_role) |
| `rule_product_mapping` | 0 | none | rule ontology |
| `rule_quality_metrics` | 454 | none | internal metrics |
| `rule_trait_requirement` | 1 | none | rule ontology |
| `scientific_names_enhancement_mapping` | 0 | none | migration helper |
| `scraper_execution_log` | 0 | none | ops log |
| `scraper_plugins` | 3 | none | scraper config |
| `spatial_ref_sys` | 8500 | none | **PostGIS extension table — do NOT enable RLS** |
| `stage_review_queue` | 34 | none | curation queue |
| `variety_cultivation_agronomy` | 66 | none | agronomy SSOT candidate |
| `variety_qtl_profile` | 4 | none | agronomy SSOT candidate |
| `variety_review_queue` | 317 | none | curation queue |
| `zz_weather_aggregates_prefix_backup` | 163 | none | one-off backup, drop candidate |
| `env_observations_202608 / _202609 / _202610 / _202611` | 16 / 0 / 0 / 0 | none | **partitions of `env_observations`; RLS is enforced on the parent — leave as-is** |

### Human-review guidance

1. **Never** enable RLS on `spatial_ref_sys` (PostGIS-managed) or on the
   `env_observations_*` partitions (the parent already enforces it).
2. Archive / `_bak` / `zz_` / migration-helper tables should be *dropped*
   rather than policed — RLS on a dead table is noise.
3. The remaining "SSOT candidate" reference tables can safely take the same
   `read_all` treatment as this commit's five, in a future staged migration.
   None of them is read by the browser today, so the blast radius is zero as
   long as every consumer keeps using service_role.
