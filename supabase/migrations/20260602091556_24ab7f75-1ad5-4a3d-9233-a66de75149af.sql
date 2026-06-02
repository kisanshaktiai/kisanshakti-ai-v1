
-- 4.1 Extend master_products with variety fields
ALTER TABLE public.master_products
  ADD COLUMN IF NOT EXISTS crop_id uuid REFERENCES public.crops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variety_code text,
  ADD COLUMN IF NOT EXISTS maturity_days_min integer,
  ADD COLUMN IF NOT EXISTS maturity_days_max integer,
  ADD COLUMN IF NOT EXISTS yield_potential_qtl_per_acre numeric,
  ADD COLUMN IF NOT EXISTS disease_resistance jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pest_tolerance jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_regions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS season text,
  ADD COLUMN IF NOT EXISTS seed_rate_kg_per_acre numeric,
  ADD COLUMN IF NOT EXISTS spacing jsonb,
  ADD COLUMN IF NOT EXISTS parentage text,
  ADD COLUMN IF NOT EXISTS release_year integer,
  ADD COLUMN IF NOT EXISTS released_by text,
  ADD COLUMN IF NOT EXISTS label_hi text,
  ADD COLUMN IF NOT EXISTS label_mr text,
  ADD COLUMN IF NOT EXISTS tenant_scope_id uuid,
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'global';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_visibility_check') THEN
    ALTER TABLE public.master_products
      ADD CONSTRAINT master_products_visibility_check CHECK (visibility IN ('global','tenant'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_products_seed_variety_code
  ON public.master_products (company_id, variety_code)
  WHERE product_type = 'seed' AND variety_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_products_seed_crop
  ON public.master_products (product_type, crop_id, status)
  WHERE product_type = 'seed';

CREATE INDEX IF NOT EXISTS idx_master_products_recommended_regions
  ON public.master_products USING GIN (recommended_regions);

CREATE INDEX IF NOT EXISTS idx_master_products_tenant_scope
  ON public.master_products (tenant_scope_id)
  WHERE tenant_scope_id IS NOT NULL;

-- 4.2 Variety <-> crops join table
CREATE TABLE IF NOT EXISTS public.master_product_variety_crops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.master_products(id) ON DELETE CASCADE,
  crop_id uuid NOT NULL REFERENCES public.crops(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, crop_id)
);

GRANT SELECT ON public.master_product_variety_crops TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_product_variety_crops TO authenticated;
GRANT ALL ON public.master_product_variety_crops TO service_role;

ALTER TABLE public.master_product_variety_crops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "variety_crops_public_read" ON public.master_product_variety_crops;
CREATE POLICY "variety_crops_public_read"
  ON public.master_product_variety_crops FOR SELECT USING (true);

DROP POLICY IF EXISTS "variety_crops_admin_write" ON public.master_product_variety_crops;
CREATE POLICY "variety_crops_admin_write"
  ON public.master_product_variety_crops FOR ALL
  TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_variety_crops_crop ON public.master_product_variety_crops(crop_id);
CREATE INDEX IF NOT EXISTS idx_variety_crops_product ON public.master_product_variety_crops(product_id);

-- 4.3 Seed category tree (idempotent)
INSERT INTO public.master_product_categories (name, slug, description, is_active)
SELECT 'Seeds', 'seeds', 'Seed varieties grouped by crop family', true
WHERE NOT EXISTS (SELECT 1 FROM public.master_product_categories WHERE slug = 'seeds');

WITH parent AS (SELECT id FROM public.master_product_categories WHERE slug = 'seeds' LIMIT 1)
INSERT INTO public.master_product_categories (name, slug, parent_id, is_active)
SELECT v.name, v.slug, parent.id, true
FROM parent,
  (VALUES
    ('Cereal Seeds','seeds-cereals'),
    ('Pulse Seeds','seeds-pulses'),
    ('Oilseed Seeds','seeds-oilseeds'),
    ('Vegetable Seeds','seeds-vegetables'),
    ('Fruit Saplings','seeds-fruits'),
    ('Cash Crop Seeds','seeds-cash-crops'),
    ('Fodder Seeds','seeds-fodder')
  ) AS v(name, slug)
WHERE NOT EXISTS (SELECT 1 FROM public.master_product_categories c WHERE c.slug = v.slug);

-- 4.4 Downstream FKs
ALTER TABLE public.land_crops
  ADD COLUMN IF NOT EXISTS variety_id uuid REFERENCES public.master_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_land_crops_variety ON public.land_crops(variety_id);

ALTER TABLE public.crop_history
  ADD COLUMN IF NOT EXISTS variety_id uuid REFERENCES public.master_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crop_history_variety ON public.crop_history(variety_id);

ALTER TABLE public.crop_baseline_guidelines_v2
  ADD COLUMN IF NOT EXISTS variety_id uuid REFERENCES public.master_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_baseline_v2_variety ON public.crop_baseline_guidelines_v2(variety_id);

ALTER TABLE public.crop_schedules
  ADD COLUMN IF NOT EXISTS variety_id uuid REFERENCES public.master_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crop_schedules_variety ON public.crop_schedules(variety_id);

ALTER TABLE public.market_prices
  ADD COLUMN IF NOT EXISTS variety_id uuid REFERENCES public.master_products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_market_prices_variety ON public.market_prices(variety_id);

-- 4.5 Tenant-scoped visibility for seed varieties
DROP POLICY IF EXISTS "seed_varieties_visible_by_scope" ON public.master_products;
CREATE POLICY "seed_varieties_visible_by_scope"
  ON public.master_products FOR SELECT
  USING (
    product_type <> 'seed'
    OR visibility = 'global'
    OR (visibility = 'tenant' AND tenant_scope_id IS NOT NULL
        AND public.has_tenant_access(tenant_scope_id))
    OR public.is_admin_user(auth.uid())
  );

-- 4.6 Helper view
CREATE OR REPLACE VIEW public.v_crop_varieties AS
SELECT
  mp.id              AS variety_id,
  mp.name,
  mp.label_hi,
  mp.label_mr,
  mp.variety_code,
  mp.maturity_days_min,
  mp.maturity_days_max,
  mp.yield_potential_qtl_per_acre,
  mp.season,
  mp.seed_rate_kg_per_acre,
  mp.spacing,
  mp.disease_resistance,
  mp.pest_tolerance,
  mp.recommended_regions,
  mp.images,
  mp.parentage,
  mp.release_year,
  mp.released_by,
  mp.visibility,
  mp.tenant_scope_id,
  c.id    AS crop_id,
  c.value AS crop_code,
  c.label AS crop_label,
  c.label_hi AS crop_label_hi,
  c.label_mr AS crop_label_mr,
  mc.id   AS company_id,
  mc.name AS company_name,
  mc.logo_url AS company_logo_url,
  mp.status,
  mp.is_featured,
  mp.popularity_score
FROM public.master_products mp
JOIN public.master_product_variety_crops mpvc ON mpvc.product_id = mp.id
JOIN public.crops c ON c.id = mpvc.crop_id
LEFT JOIN public.master_companies mc ON mc.id = mp.company_id
WHERE mp.product_type = 'seed';

GRANT SELECT ON public.v_crop_varieties TO anon, authenticated;
