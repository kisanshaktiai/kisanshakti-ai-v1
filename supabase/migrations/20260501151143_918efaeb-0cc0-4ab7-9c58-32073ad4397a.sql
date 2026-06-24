ALTER TABLE public.lands
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'IN';

CREATE INDEX IF NOT EXISTS idx_lands_country_code ON public.lands(country_code);