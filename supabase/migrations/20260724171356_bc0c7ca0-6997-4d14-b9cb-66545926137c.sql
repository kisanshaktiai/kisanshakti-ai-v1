-- Tier 0: additive schema prep for DB-SSOT cutover (no behavioural change until code cutover)

-- 1) Extend chemical_regulatory_status with class + WHO tox class (nullable, additive)
ALTER TABLE public.chemical_regulatory_status
  ADD COLUMN IF NOT EXISTS chemical_class text,
  ADD COLUMN IF NOT EXISTS who_toxicity_class text;

-- 2) Extend master_products with dose-cap fields (nullable, additive)
ALTER TABLE public.master_products
  ADD COLUMN IF NOT EXISTS max_dose_per_ha_g numeric,
  ADD COLUMN IF NOT EXISTS dose_unit text;

-- 3) chemical_rotation_group reference table (IRAC/FRAC rotation families)
CREATE TABLE IF NOT EXISTS public.chemical_rotation_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chemical_name text NOT NULL,
  rotation_family text NOT NULL,
  moa_code text,
  moa_system text NOT NULL CHECK (moa_system IN ('IRAC','FRAC')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chemical_name, moa_system)
);

CREATE INDEX IF NOT EXISTS idx_chemical_rotation_group_chemical
  ON public.chemical_rotation_group (lower(chemical_name));
CREATE INDEX IF NOT EXISTS idx_chemical_rotation_group_family
  ON public.chemical_rotation_group (rotation_family);

GRANT SELECT ON public.chemical_rotation_group TO anon;
GRANT SELECT ON public.chemical_rotation_group TO authenticated;
GRANT ALL ON public.chemical_rotation_group TO service_role;

ALTER TABLE public.chemical_rotation_group ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chemical_rotation_group_read_all"
  ON public.chemical_rotation_group
  FOR SELECT
  USING (true);

-- updated_at trigger (reuse standard helper if present, otherwise create one)
CREATE OR REPLACE FUNCTION public.set_updated_at_chemical_rotation_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chemical_rotation_group_updated_at ON public.chemical_rotation_group;
CREATE TRIGGER trg_chemical_rotation_group_updated_at
  BEFORE UPDATE ON public.chemical_rotation_group
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_chemical_rotation_group();