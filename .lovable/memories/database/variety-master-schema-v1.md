---
name: Variety Master Schema v1
description: Canonical variety catalog — extended master_products + variety_resistance / variety_translations / variety_source_references child tables. Drives variety-specific schedule generation.
type: feature
---

## Canonical store
`public.master_products WHERE product_type = 'seed'` is the SSOT for crop varieties.

## Phase-1 columns added to master_products (seed rows only)
- `water_demand_mm_per_season numeric`
- `water_demand_category text` — `low|medium|high`
- `irrigation_sensitivity jsonb` — `{ critical_stages:[stage_keys], drought_tolerance:'low|med|high' }`
- `climate_suitability jsonb` — `{ temp_min_c, temp_max_c, optimal_temp_c, rainfall_min_mm, rainfall_max_mm, altitude_max_m, photoperiod:'short|long|neutral' }`
- `state_suitability text[]` — ISO 3166-2 codes (e.g. `IN-MH`)
- `agro_climatic_zones text[]` — ICAR AEZ codes
- `soil_suitability jsonb` — `{ textures:[], ph_min, ph_max, drainage }`
- `yield_irrigated_qtl_per_acre`, `yield_rainfed_qtl_per_acre numeric`
- `variety_class text` — `hybrid|OPV|inbred|GMO|landrace|clonal`
- `notification_number text`, `notification_date date`, `catalog_url text`
- `breeder_institute_id uuid → master_companies(id)`
- `data_completeness_score numeric`

## Child tables
- `variety_resistance(variety_id, threat_type, observation_code, threat_name, resistance_level, trial_score, source, notes)` — CIMMYT scale `HR|R|MR|MS|S|HS|unknown`. `observation_code` joins to `observation_master`.
- `variety_translations(variety_id, language_code, display_name, short_description, local_synonyms[])` — languages: `en,hi,mr,pa,gu,ta,te,kn,ml,bn,or,as,ur,sa`.
- `variety_source_references(variety_id, ref_type, title, url, publication_year, authority)` — `ref_type ∈ gazette|icar_catalog|sau_release|paper|breeder|field_trial|other`.

## Access
All three child tables: public SELECT, admin-only write via `public.is_admin_user()`. RLS enabled. anon/authenticated/service_role GRANTs included.

## Consumer contract (Phase 3 wiring)
1. `lands.variety_id` and `farmer_plans.current_crop_variety_id` are authoritative — edge functions must JOIN to `master_products` + `variety_resistance` + `variety_translations` instead of treating variety as free text.
2. `getMaxDASForCrop()` fallback chain: `master_products.maturity_days_max` (variety) → `crop_baseline_guidelines_v2.das_end` (crop) → `120`.
3. Schedule builder must skip prophylactic chemical tasks when `variety_resistance.resistance_level IN ('R','HR')` for the target observation; substitute a monitoring task.
4. Irrigation interval honors `irrigation_sensitivity.critical_stages` and `water_demand_mm_per_season` before any crop-level default.
5. Hypothesis confidence is downweighted when a matching `variety_resistance` row exists with `R`/`HR`.

## Crop-agnostic invariant
No crop names appear in code or migrations. All branching is keyed off `crop_id`, `observation_code`, and the typed columns above.
