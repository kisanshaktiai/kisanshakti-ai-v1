
-- SCHEMA ONLY: Add columns to observation_master + create observation_aliases table

-- 1. Add new columns to observation_master
ALTER TABLE public.observation_master 
  ADD COLUMN IF NOT EXISTS canonical_group TEXT,
  ADD COLUMN IF NOT EXISTS observation_category TEXT,
  ADD COLUMN IF NOT EXISTS affected_plant_part TEXT;

-- 2. Create observation_aliases table
CREATE TABLE IF NOT EXISTS public.observation_aliases (
  alias_code TEXT PRIMARY KEY,
  canonical_code TEXT NOT NULL REFERENCES public.observation_master(observation_code),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.observation_aliases ENABLE ROW LEVEL SECURITY;

-- Public read policy (reference data)
CREATE POLICY "observation_aliases_read_all" ON public.observation_aliases
  FOR SELECT USING (true);

-- Index for reverse lookups
CREATE INDEX IF NOT EXISTS idx_observation_aliases_canonical 
  ON public.observation_aliases(canonical_code);
