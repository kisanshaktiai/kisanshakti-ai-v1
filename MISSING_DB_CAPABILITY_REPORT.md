# MISSING_DB_CAPABILITY_REPORT

**Date:** 2026-07-05  
**Rule:** A new table is allowed only if (a) no existing table logically owns the concept, (b) adding a column to an existing table breaks normalisation, AND (c) multiple entities require a relationship graph. Every entry below is justified against those criteria.

---

## A. Column Extensions to Existing Tables (no new table)

### A1. `crop_stage_master`
```sql
ALTER TABLE public.crop_stage_master
  ADD COLUMN IF NOT EXISTS chemical_safe_from_das INTEGER,
  ADD COLUMN IF NOT EXISTS is_critical_stage BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS photoperiod_critical_day_length_hours NUMERIC;
```
- `is_photoperiod_sensitive` **already exists** (28 rows true) — do not re-add.
- `gdd_min`, `gdd_max`, `expected_ndvi_min/max`, `base_temperature_c`, `phenology_model` **already exist** — just populate.
- Rationale: All three new columns are single-value facts per (crop_code, growth_stage) — they belong on the row, not on a satellite table.

### A2. `chemical_regulatory_status` (currently 8 cols, 59 rows)
```sql
ALTER TABLE public.chemical_regulatory_status
  ADD COLUMN IF NOT EXISTS active_ingredient TEXT,
  ADD COLUMN IF NOT EXISTS phi_days_domestic INTEGER,
  ADD COLUMN IF NOT EXISTS phi_days_export_eu INTEGER,
  ADD COLUMN IF NOT EXISTS phi_days_export_us INTEGER,
  ADD COLUMN IF NOT EXISTS mrl_fssai_ppm NUMERIC,
  ADD COLUMN IF NOT EXISTS mrl_eu_ppm NUMERIC,
  ADD COLUMN IF NOT EXISTS who_toxicity_class TEXT
    CHECK (who_toxicity_class IN ('Ia','Ib','II','III','U')),
  ADD COLUMN IF NOT EXISTS max_dose_g_per_ha NUMERIC,
  ADD COLUMN IF NOT EXISTS crop_specific_phi JSONB,   -- {crop_code: phi_days}
  ADD COLUMN IF NOT EXISTS pollinator_bee_ld50_contact_ug NUMERIC,
  ADD COLUMN IF NOT EXISTS pollinator_bee_ld50_oral_ug NUMERIC,
  ADD COLUMN IF NOT EXISTS pollinator_residual_toxicity_days INTEGER,
  ADD COLUMN IF NOT EXISTS pollinator_flowering_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pollinator_evening_spray_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS buffer_pollinator_m INTEGER,
  ADD COLUMN IF NOT EXISTS buffer_aquatic_m INTEGER;

CREATE INDEX IF NOT EXISTS idx_chemical_regulatory_status_active_ingredient
  ON public.chemical_regulatory_status (lower(active_ingredient));
```
- Rationale: All facts key on `active_ingredient` (or fall back to `chemical_name`). No parallel table needed — this IS the chemical safety ontology.
- Product-level facts (SKU price, brand, packaging) remain in `master_products`.

### A3. `crop_baseline_guidelines_v2`
```sql
ALTER TABLE public.crop_baseline_guidelines_v2
  ADD COLUMN IF NOT EXISTS input_cost_inr_per_acre_low NUMERIC,
  ADD COLUMN IF NOT EXISTS input_cost_inr_per_acre_mid NUMERIC,
  ADD COLUMN IF NOT EXISTS input_cost_inr_per_acre_high NUMERIC;
```
- Rationale: cost benchmarks are per (crop_code, growth_stage). Fits existing PK. No new table.

### A4. `irrigation_types`
```sql
ALTER TABLE public.irrigation_types
  ADD COLUMN IF NOT EXISTS efficiency_factor NUMERIC
    CHECK (efficiency_factor > 0 AND efficiency_factor <= 1);
```
- Rationale: One number per irrigation system — belongs on the row, not a lookup table.

### A5. `observation_master` — NO change
- Emergency codes already have their own table `emergency_observation_codes` (38 rows). Do NOT add `is_emergency` column — pick one owner and join.

---

## B. Seed Data into Existing Tables (no schema change)

### B1. `system_config`
```sql
INSERT INTO public.system_config (config_key, config_value, description) VALUES
  ('hypothesis_engine_defaults',
   '{"strong_support": 0.20, "moderate_support": 0.12,
     "photo_analysis_multiplier": 1.3, "expert_input_multiplier": 1.5,
     "confirmed_min": 0.80, "eliminated_max": 0.15, "decay_per_hour": 0.02}'::jsonb,
   'Bayesian update weights and thresholds for hypothesis engine; overrides DEFAULT_CONFIDENCE_RULES in code.')
ON CONFLICT (config_key) DO NOTHING;
```

### B2. `crop_stage_master` — populate `gdd_min/max`, `expected_ndvi_min/max` from existing TS constants during migration turn.

### B3. `chemical_regulatory_status` — populate new columns from `PHI_DATABASE`, `POLLINATOR_TOXICITY_DB`, `MAX_SAFE_DOSES` during migration turn.

### B4. `crop_stage_master.chemical_safe_from_das` — populate from `YOUNG_CROP_MAX_DAYS` map (12 crops).

### B5. `crop_stage_master.is_critical_stage` — populate TRUE for stages currently flagged critical in TS (agronomist review recommended).

---

## C. Genuinely New Tables — Only One Approved

### C1. `spray_condition_thresholds` — **APPROVED**
```sql
CREATE TABLE public.spray_condition_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL UNIQUE,      -- CHEMICAL_INSECTICIDE, HERBICIDE, FUNGICIDE, FOLIAR_NUTRIENT, BIOPESTICIDE, GROWTH_REGULATOR, BOTANICAL
  wind_max_kmph NUMERIC NOT NULL,
  rain_prob_max_pct NUMERIC NOT NULL,
  temp_min_c NUMERIC NOT NULL,
  temp_max_c NUMERIC NOT NULL,
  humidity_min_pct NUMERIC,
  humidity_max_pct NUMERIC,
  dry_hours_required_min INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.spray_condition_thresholds TO anon, authenticated;
GRANT ALL ON public.spray_condition_thresholds TO service_role;
ALTER TABLE public.spray_condition_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read spray condition thresholds"
  ON public.spray_condition_thresholds FOR SELECT USING (is_active);
```
**Justification against 3-criteria test:**
- (a) No existing owner: `disease_risk_model` is per-disease; `etl_standards` is per-pest; `master_products.weather_conditions` is per-SKU JSON with no query semantics. None of these hold generic per-product-type spray weather envelopes.
- (b) Extending an existing table breaks normalisation: adding these columns to `master_products` (196 SKUs) would duplicate the same 7 rows of envelope data hundreds of times.
- (c) Multiple entities (every SKU, every spray decision) key into the same envelope by product_type — this is the classic lookup dimension.

### C2. `intent_scope_config` — **REJECTED** — `observation_intent_master` already owns this.

### C3. `cost_benchmarks` — **REJECTED** — added as columns on `crop_baseline_guidelines_v2` (A3).

### C4. `chemical_safety_standards` — **REJECTED** — subsumed by `chemical_regulatory_status` extension (A2).

### C5. `chemical_pollinator_profiles` — **REJECTED** — subsumed by A2.

### C6. `ndvi_health_thresholds` — **REJECTED** — `crop_stage_master.expected_ndvi_min/max` already owns.

### C7. `crop_phenology_gdd_stages` — **REJECTED** — `crop_stage_master.gdd_min/max` + `variety_phenology_profile` already own.

### C8. `irrigation_system_parameters` — **REJECTED** — one column on `irrigation_types` (A4).

### C9. `hypothesis_engine_config` — **REJECTED** — one row in `system_config` (B1).

---

## Score

- **Old plan:** 9 new tables + 5 new columns.
- **This plan:** **1 new table** + **~20 new columns spread across 4 existing tables** + **1 config row** + **backfill work**.

The database brain is largely already built. What was missing was **not tables** — it was **populated columns**.
