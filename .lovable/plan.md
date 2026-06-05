
## Audit Findings — Variety Schema Scope

### `master_companies` (50 rows, 7 seed-related)
Comprehensive: identity, sector, ownership, financials, certifications, HQ, subsidiaries, product_categories, multi-tenant flags. **No changes required.** It can fully represent ICAR/SAUs (CCSHAU, ICRISAT, etc.) as the variety source/releaser via `manufacturer_id` / `released_by` on the variety row.

### `master_products` (variety rows where `product_type='seed'`)
Variety-related columns already present:
`crop_id, variety_code, brand, season, maturity_days_min/max, yield_potential_qtl_per_acre, disease_resistance (jsonb), pest_tolerance (jsonb), recommended_regions (jsonb), spacing (jsonb), seed_rate_kg_per_acre, parentage, release_year, released_by, label_hi, label_mr, translations (jsonb), seed_variety_details (jsonb), germination_rate, purity_percentage`.

### Gaps vs. the user's required attribute set

| Requested attribute | Current state | Gap |
|---|---|---|
| Multilingual names | only `label_hi`, `label_mr`, free-form `translations` jsonb | No coverage for the other 8 supported Indian languages as first-class, queryable fields. `translations` is unstructured. |
| Maturity days | `maturity_days_min/max` ✅ | OK |
| Yield | `yield_potential_qtl_per_acre` ✅ | No min/avg/max split, no irrigated vs rainfed split |
| Disease resistance | `disease_resistance` jsonb (free array, all 80 rows empty) | No structured `{ disease_code, level: R/MR/MS/S, source }` schema; not joinable to `observation_master` disease codes |
| Pest resistance | `pest_tolerance` jsonb (all 80 empty) | Same problem — no link to pest observation codes / IPM rules |
| Water demand | **missing** | No column |
| Climate suitability | **missing** | No temperature/rainfall/altitude/photoperiod bounds |
| State suitability | `recommended_regions` (free-text array) | Not normalized to ISO state codes; cannot drive multi-tenant filtering reliably |
| Source references | `released_by` text, `parentage` text | No structured citations (notification number, gazette URL, ICAR catalog ref, year, trial data link) |

### Data-coverage findings
- 80 seed varieties total across 15 crops (out of 112 active crops → 97 crops have zero varieties).
- 80/80 missing `disease_resistance`, `pest_tolerance`, `spacing`, `seed_rate_kg_per_acre`, `release_year`, structured `translations`.
- `lands.variety_id` (FK) and `farmer_plans.current_crop_variety_id` exist but `ai-smart-schedule/index.ts` ingests variety only as a free-text string (`cropVariety`) and never joins back to `master_products` to read maturity/yield/resistance — schedule generation is variety-agnostic today.
- `VarietySelector.tsx` already reads the relevant columns from `master_products` and persists `variety_id` — good UI hook to build on.

### Architectural decision
Keep `master_products` as the **canonical store** for varieties (product_type='seed'), but:
1. Promote frequently-queried attributes to typed columns (water demand, climate bounds, state suitability codes).
2. Introduce **two child tables** for the genuinely relational data (resistance ratings, source citations) so they can be joined to `observation_master` and surfaced in narration.
3. Add a strict JSON schema for `translations` covering all 10 app languages.
4. Wire the variety-id from `lands` / `farmer_plans` into the schedule prompt builder so AI advice is variety-specific (resistance ⇒ skip prophylactic spray; water demand ⇒ adjust irrigation interval; maturity ⇒ override `getMaxDASForCrop` per variety).

---

## Plan

### Phase 1 — Schema extension (one migration, additive, crop-agnostic)

**Add to `public.master_products`** (only used when `product_type='seed'`):

```text
water_demand_mm_per_season  numeric              -- total crop water requirement
water_demand_category       text                 -- 'low'|'medium'|'high' (derived index for fast filter)
irrigation_sensitivity      jsonb                -- { critical_stages: [stage_keys], drought_tolerance: 'low|med|high' }
climate_suitability         jsonb                -- { temp_min_c, temp_max_c, optimal_temp_c, rainfall_min_mm, rainfall_max_mm, altitude_max_m, photoperiod: 'short|long|neutral' }
state_suitability           text[]               -- ISO state codes ('IN-MH','IN-KA',...) — normalised from recommended_regions
agro_climatic_zones         text[]               -- ICAR AEZ codes
soil_suitability            jsonb                -- { textures:[], ph_min, ph_max, drainage:'well|moderate|poor' }
yield_irrigated_qtl_per_acre numeric
yield_rainfed_qtl_per_acre   numeric
variety_class               text                 -- 'hybrid'|'OPV'|'inbred'|'GMO'|'landrace'
notification_number         text                 -- gazette/ICAR notification id
notification_date           date
catalog_url                 text                 -- ICAR/SAU catalog reference
breeder_institute_id        uuid REFERENCES master_companies(id)
```

**New child table `public.variety_resistance`** (replaces the empty `disease_resistance`/`pest_tolerance` jsonb arrays going forward; legacy columns retained for back-compat, deprecated):

```text
id uuid PK
variety_id uuid → master_products(id)
threat_type text  -- 'disease'|'pest'|'abiotic'
observation_code text → observation_master(observation_code)   -- links to symbolic brain
resistance_level text  -- 'R'|'MR'|'MS'|'S'|'HR' (CIMMYT scale)
trial_score numeric
source text  -- 'ICAR'|'SAU'|'breeder'|'field_trial'
notes text
created_at, updated_at
```
+ unique(variety_id, threat_type, observation_code)
+ standard GRANTs + RLS (read-all, write-admin via has_role).

**New child table `public.variety_translations`** (typed multilingual SSOT — replaces ad-hoc `label_hi`/`label_mr` reliance):

```text
id uuid PK
variety_id uuid → master_products(id)
language_code text   -- 'hi','mr','pa','gu','ta','te','kn','ml','bn','or','en'
display_name text
short_description text
local_synonyms text[]
unique(variety_id, language_code)
```
Backfill from existing `label_hi`/`label_mr`/`translations` in the same migration.

**New child table `public.variety_source_references`**:

```text
id uuid PK
variety_id uuid → master_products(id)
ref_type text  -- 'gazette'|'icar_catalog'|'sau_release'|'paper'|'breeder'
title text
url text
publication_year int
authority text
```

All three child tables: GRANTs for anon (SELECT only — varieties are public catalog), authenticated, service_role; RLS enabled; SELECT policy `using (true)`; INSERT/UPDATE/DELETE policy gated by `public.has_role(auth.uid(),'admin')`.

### Phase 2 — Data backfill (separate migration / one-off script)

- Normalise existing `recommended_regions` text into `state_suitability` ISO codes via a deterministic mapping table.
- Seed `variety_translations` rows for the 10 supported languages for all 80 existing varieties (English fallback where unknown).
- Mark all 80 rows with `data_completeness_score` (computed) so the UI can flag low-quality entries.
- No crop-specific logic — the backfill is driven by the existing `crops` master and language list.

### Phase 3 — Codebase wiring (variety-aware schedule generation)

Targets:

1. **`supabase/functions/ai-smart-schedule/index.ts`**
   - Replace the free-text `cropVariety` string flow with a `variety_id` lookup: fetch the full variety row + `variety_resistance` + `variety_translations` from `master_products` joined on `lands.variety_id` / `farmer_plans.current_crop_variety_id`.
   - Pass a `VarietyContext` object into `buildLeanUserPrompt` (new section in the lean prompt) containing: maturity window, water demand, climate bounds, resistant-to / susceptible-to observation codes, state fit flag.
   - Use variety `maturity_days_max` as an override input to `getMaxDASForCrop()` (variety beats crop baseline when present).
   - Use `irrigation_sensitivity.critical_stages` and `water_demand_mm_per_season` to override the generic irrigation interval.
   - When `variety_resistance.resistance_level IN ('R','HR')` for an observation, the schedule builder must **skip** prophylactic chemical tasks for that observation (cost + safety win) and substitute a monitoring task — driven entirely by data, no crop branches.

2. **`supabase/functions/ai-agriculture-chat/...`**
   - Extend `authoritative-state-loader.ts` / `context-authority.ts` to enrich the land context with the resolved variety row (same join).
   - Hypothesis evaluator: when a disease/pest observation matches a variety with `R`/`HR` rating, downweight that hypothesis's confidence (configurable factor in `decision_rules.metadata`).
   - Narration layer: surface the variety display name from `variety_translations` (canonical-language SSOT respected).

3. **`src/components/crops/VarietySelector.tsx`**
   - Add chips for water-demand and state-fit-for-current-tenant.
   - Read display name from `variety_translations` using the active app language instead of falling back to `label_hi`/`label_mr` only.

4. **Types regeneration**: after migration approval, `src/integrations/supabase/types.ts` regenerates automatically — frontend consumers (`VarietySelector`, `useFarmerPlans`, schedule pages) get the new fields without manual edits.

### Phase 4 — Admin/data-onboarding surface (out of scope of this turn, listed for completeness)

- Add a SuperAdmin variety editor that writes to `master_products` + the 3 child tables (no crop-specific UI; pure schema-driven form).
- Bulk CSV import endpoint for variety catalogs from ICAR / state SAUs.

### Crop-agnostic guarantees (per project Core rule)
- Zero crop names in code or migrations — all behavior is keyed off `crop_id`, observation codes, and the new typed columns.
- New filters (`water_demand_category`, `state_suitability`, resistance levels) work identically for any of the 112 active crops once data is onboarded.
- All advice still originates from DB; LLM remains narration-only.

### Deliverables of the implementation turn
1. One additive schema migration (Phase 1).
2. One data-backfill migration (Phase 2).
3. Edited edge functions (`ai-smart-schedule`, `ai-agriculture-chat` context loader + hypothesis evaluator).
4. Updated `VarietySelector` to surface new attributes.
5. Memory entry under `mem://database/variety-master-schema-v1` documenting the new contract.

### Open questions before build
1. Should `lands.variety` (legacy free-text) be deprecated/dropped, or kept as a fallback display label?
2. For resistance ratings, are we standardising on the CIMMYT 5-point scale (`R/MR/MS/S/HR`) or a 0–9 numeric scale? (Recommend CIMMYT — matches ICAR AICRP reports.)
3. For `state_suitability`, are we using ISO 3166-2 codes (`IN-MH`) or the project's internal state-id UUIDs from any existing `states` master? I haven't found a `states` master yet — confirm preference.
