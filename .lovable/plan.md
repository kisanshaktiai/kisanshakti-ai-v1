
# Crop Variety Integration Plan — master_companies × master_products × crops

## 1. Goal

Treat seed varieties as first-class **products** belonging to a **company** in the existing `master_*` catalog, link each variety to one or more crops, and make the whole catalog manageable from both the **admin portal** (global) and the **tenant portal** (curated subset / private varieties). All farmer-facing tables (`land_crops`, `crop_history`, baselines, schedules, market prices) gain a clean FK to the chosen variety — replacing today's free-text `crop_variety` strings.

## 2. Current State (audit summary)

- `master_companies` (24 rows) — already supports seed companies (`company_type`, `sector`, `product_categories[]`, `industry_category`).
- `master_products` (83 rows, 0 of type `seed`) — already has every field needed for a seed variety: `product_type`, `seed_variety_details jsonb`, `germination_rate`, `purity_percentage`, `suitable_crops jsonb`, `suitable_soil_types`, `recommended_season`, `crop_stages`, `translations jsonb`, `images`, `documents`, `status`, `approved_by`, `is_featured`, `popularity_score`, `company_id`, `category_id`.
- `master_product_categories` (65 rows, self-referencing tree) — can host a "Seeds → Cereals → Paddy" hierarchy.
- `crops` (112 rows) — **no variety column**, no FK from anywhere.
- `crop_baseline_guidelines.crop_variety` — CSV text string (not queryable).
- `land_crops.crop_variety`, `crop_history.variety` — free text, no FK.
- `crop_templates` — region+variety schedule table, empty.
- No frontend variety picker exists.

The data model is **already 90% there** — varieties just haven't been seeded as `master_products` of type `seed`, and the downstream tables don't yet reference them.

## 3. Architecture

```text
master_companies (seed co.)
        │ 1
        ▼ N
master_products  ──────────►  master_product_variety_crops  ◄──── crops
 (product_type='seed')         (N:M: one variety can suit         (master)
                                multiple crops; one crop has
                                many varieties)
        ▲
        │ FK variety_id (nullable)
        │
   land_crops, crop_history, crop_baseline_guidelines_v2,
   crop_schedules, market_prices, decision rules
```

- A **variety = master_product where `product_type='seed'`**. No new product table.
- Crop ↔ variety mapping is normalized in a new join table (replaces the `suitable_crops jsonb` for seeds, which stays as a cache).
- `tenant_products` (existing tenant catalog layer) controls which varieties a tenant exposes and lets them add **private** varieties (`company_id = tenant's master_company`, `visibility='tenant'`).

## 4. Database changes

### 4.1 Extend `master_products`
- Add `'seed'` to the allowed `product_type` values (drop/recreate CHECK if present).
- Add columns specific to varieties (nullable, only used when `product_type='seed'`):
  - `crop_id uuid` — primary crop (fast lookups, FK → `crops.id`).
  - `variety_code text` — short code (e.g. `MTU-1010`), UNIQUE per `company_id`.
  - `maturity_days_min int`, `maturity_days_max int`.
  - `yield_potential_qtl_per_acre numeric`.
  - `disease_resistance jsonb` (array of disease codes).
  - `pest_tolerance jsonb`.
  - `recommended_regions jsonb` (states/agro-climatic zones).
  - `season text` (kharif/rabi/zaid/perennial).
  - `seed_rate_kg_per_acre numeric`.
  - `spacing jsonb` (`{row_cm, plant_cm}`).
  - `parentage text`, `release_year int`, `released_by text` (ICAR / SAU / private).
  - `label_hi text`, `label_mr text` (variety name in vernacular; existing `translations jsonb` is the catch-all for other languages).

Index: `(product_type, crop_id, status)` and GIN on `recommended_regions`.

### 4.2 New join table `master_product_variety_crops`
```text
id uuid PK
product_id uuid FK master_products(id) ON DELETE CASCADE
crop_id    uuid FK crops(id)            ON DELETE CASCADE
is_primary boolean default false
notes      text
UNIQUE (product_id, crop_id)
```
GRANT select to anon+authenticated, all to service_role. RLS: public read, admin write.

### 4.3 Seed-category bootstrap
- Insert into `master_product_categories`: top-level `Seeds`, with children `Cereals, Pulses, Oilseeds, Vegetables, Fruits, Cash Crops, Fodder`, each with `slug` aligned to `crop_groups`.

### 4.4 Downstream FKs (all nullable to keep backfill safe)
- `land_crops.variety_id uuid → master_products(id)` (keep `crop_variety text` as legacy until migrated).
- `crop_history.variety_id uuid → master_products(id)`.
- `crop_baseline_guidelines_v2.variety_id uuid → master_products(id)` (per-variety NPK overrides).
- `crop_schedules.variety_id uuid → master_products(id)` (optional schedule overlay).
- `market_prices.variety_id uuid → master_products(id)` (price quality grades).

### 4.5 Tenant exposure
- Reuse existing `tenant_products` table:
  - `is_featured`, `is_visible`, `tenant_price_override`, `tenant_recommendation_priority`.
  - Tenants can `INSERT` a `master_products` row scoped to their own `master_companies.tenant_id`, status `pending_review` until admin approves (or auto-approve if tenant has the `seed_catalog_admin` role).
- RLS: tenant users see global `status='approved'` rows + their own pending rows; admin sees all.

### 4.6 Helper view `v_crop_varieties`
```sql
SELECT mp.id AS variety_id, mp.name, mp.label_hi, mp.label_mr,
       mp.variety_code, mp.maturity_days_min, mp.maturity_days_max,
       mp.yield_potential_qtl_per_acre, mp.season,
       c.id AS crop_id, c.value AS crop_code, c.label AS crop_label,
       mc.id AS company_id, mc.name AS company_name, mc.logo_url,
       mp.status, mp.is_featured, mp.popularity_score
FROM master_products mp
JOIN master_product_variety_crops mpvc ON mpvc.product_id = mp.id
JOIN crops c ON c.id = mpvc.crop_id
LEFT JOIN master_companies mc ON mc.id = mp.company_id
WHERE mp.product_type = 'seed' AND mp.status = 'approved';
```
This single view powers every variety dropdown.

## 5. Backfill / data migration

1. **Seed initial varieties** (separate insert migration after schema lands) — load a curated list (~300 popular Indian varieties from ICAR/SAU) into `master_products` + the join table. Companies for public-domain varieties → ICAR / state SAU rows in `master_companies` (already partly there).
2. **Parse legacy CSVs** in `crop_baseline_guidelines.crop_variety` → for each token, insert a variety if missing, then write `crop_baseline_guidelines_v2.variety_id`.
3. **Backfill `land_crops.variety_id`** by fuzzy-matching existing `crop_variety` text against `master_products.name`/`variety_code` (logged report; unresolved rows stay text).

## 6. Application / portal changes

### Farmer app (`src/`)
- New hook `useCropVarieties(cropId)` → `v_crop_varieties` filtered by crop, ordered by `is_featured DESC, popularity_score DESC`.
- New component `<VarietySelector cropId value onChange>` — searchable, shows company logo, maturity, season; "Other / write-in" fallback for unknown varieties (saves text + leaves `variety_id` null).
- Wire into `EnhancedCropSelector`, `EditLandWizard`, `AddLand`, `CropGrowthTracking`, schedule generation context.
- Display variety badge on land cards, advisory header, market price rows.

### Admin portal
- New page **"Seed Varieties"** under existing master catalog: list / filter by company, crop, status; bulk import CSV; approve/reject pending tenant submissions; merge duplicates.
- Reuse existing `master_products` admin CRUD with a dedicated `product_type='seed'` form variant.

### Tenant portal
- New tab **"My Seed Catalog"**: pick from global varieties (toggle visibility, set local price), or "Add private variety" form (creates `master_products` row tied to tenant's company, status `pending_review`).
- Tenants can also mark recommended varieties per region they operate in.

### Backend / AI
- Advisory + schedule generators read variety attributes (maturity, season, resistance) to tune recommendations (e.g. shorter schedules for early-maturity varieties).
- Decision rules can target by `variety_id` in addition to `crop_code`.

## 7. Rollout phases

1. **Phase 1 — Schema**: 4.1–4.4 migrations + view + RLS + GRANTs. No UI change yet.
2. **Phase 2 — Admin CRUD + seed data**: load curated 300 varieties, admin UI to manage.
3. **Phase 3 — Farmer variety picker**: integrate `<VarietySelector>` into land creation/edit; backfill `land_crops.variety_id`.
4. **Phase 4 — Tenant catalog**: tenant portal pages + approval workflow.
5. **Phase 5 — Downstream consumers**: per-variety baselines, schedules, market prices, advisory targeting; deprecate free-text `crop_variety` columns.

## 8. Open questions (please confirm before Phase 1)

- Should **tenant-private varieties** be visible to that tenant's farmers only, or shared globally after admin approval? (Affects RLS.)
- Do we want a **separate `seed_variety` product_type** or keep using `'seed'` (recommended, simpler)?
- For Phase 2 seed list: do you have an internal CSV/sheet, or should we curate from public ICAR/SAU sources?
- Should farmers be allowed to type a free variety name (stored as text only) when their variety isn't catalogued, with a background job suggesting it for admin review?
