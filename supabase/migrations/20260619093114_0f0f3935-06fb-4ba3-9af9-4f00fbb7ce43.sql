
-- 1. direct_advisory_routes — route codes that bypass clarification
CREATE TABLE IF NOT EXISTS public.direct_advisory_routes (
  route_code text PRIMARY KEY,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.direct_advisory_routes TO anon, authenticated;
GRANT ALL ON public.direct_advisory_routes TO service_role;

ALTER TABLE public.direct_advisory_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "direct_advisory_routes_read_all"
  ON public.direct_advisory_routes FOR SELECT
  USING (true);

CREATE POLICY "direct_advisory_routes_service_write"
  ON public.direct_advisory_routes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.direct_advisory_routes (route_code, notes) VALUES
  ('FERTILIZER_NUTRITION', 'Advisory: fertilizer/nutrient questions skip clarification'),
  ('IRRIGATION_SCHEDULING', 'Advisory: irrigation timing skips clarification'),
  ('WEATHER_SPRAY_TIMING', 'Advisory: spray timing skips clarification'),
  ('CROP_HEALTH', 'Advisory: general crop health skips clarification')
ON CONFLICT (route_code) DO NOTHING;


-- 2. emergency_observation_codes — codes that trigger emergency path
CREATE TABLE IF NOT EXISTS public.emergency_observation_codes (
  observation_code text PRIMARY KEY,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.emergency_observation_codes TO anon, authenticated;
GRANT ALL ON public.emergency_observation_codes TO service_role;

ALTER TABLE public.emergency_observation_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emergency_observation_codes_read_all"
  ON public.emergency_observation_codes FOR SELECT
  USING (true);

CREATE POLICY "emergency_observation_codes_service_write"
  ON public.emergency_observation_codes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Seed: original 12 hardcoded codes
INSERT INTO public.emergency_observation_codes (observation_code, source, notes) VALUES
  ('DEAD_HEART_PRESENT', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('STEM_BORING_MARKS', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('BORER_DAMAGE', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('BORE_HOLES_AT_BASE', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('FRASS_VISIBLE', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('MUD_TUBES', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('LARVAE_PRESENT', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('PLANT_DEATH_PATCHES', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('STEM_ROT_PRESENT', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('CROWN_ROT', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('WILTING_SEVERE', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES'),
  ('SEVERITY_HIGH', 'phase3_seed_legacy', 'Legacy hardcoded EMERGENCY_OBS_CODES')
ON CONFLICT (observation_code) DO NOTHING;

-- Seed: high-severity biotic observations from observation_master
INSERT INTO public.emergency_observation_codes (observation_code, source, notes)
SELECT observation_code, 'phase3_seed_high_severity',
       'Auto-seeded from observation_master severity_level=HIGH semantic_class IN (pest,disease)'
FROM public.observation_master
WHERE severity_level = 'HIGH' AND semantic_class IN ('pest','disease')
ON CONFLICT (observation_code) DO NOTHING;


-- 3. cultural_strategies — per-crop cultural farming tips
CREATE TABLE IF NOT EXISTS public.cultural_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code text NOT NULL,
  strategy text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crop_code, strategy)
);

CREATE INDEX IF NOT EXISTS idx_cultural_strategies_crop ON public.cultural_strategies (crop_code, priority);

GRANT SELECT ON public.cultural_strategies TO anon, authenticated;
GRANT ALL ON public.cultural_strategies TO service_role;

ALTER TABLE public.cultural_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cultural_strategies_read_all"
  ON public.cultural_strategies FOR SELECT
  USING (true);

CREATE POLICY "cultural_strategies_service_write"
  ON public.cultural_strategies FOR ALL
  TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.cultural_strategies (crop_code, strategy, priority) VALUES
  ('SUGARCANE', 'Remove and destroy dead hearts immediately', 10),
  ('SUGARCANE', 'Do NOT harvest young crop for pest control', 20),
  ('SUGARCANE', 'Earthing up to cover root zone', 30),
  ('SUGARCANE', 'Detrashing lower dried leaves', 40),
  ('SUGARCANE', 'Install pheromone traps @ 5/acre', 50),
  ('COTTON', 'Install yellow sticky traps @ 12/acre', 10),
  ('COTTON', 'Remove alternate hosts like parthenium', 20),
  ('COTTON', 'Install pheromone traps @ 5/acre', 30),
  ('COTTON', 'Destroy crop residue after harvest', 40),
  ('RICE', 'Alternate wetting and drying irrigation', 10),
  ('RICE', 'Avoid excess nitrogen application', 20),
  ('RICE', 'Use resistant varieties', 30),
  ('RICE', 'Clip leaf tips before transplanting', 40),
  ('VEGETABLES', 'Install pheromone traps @ 5/acre', 10),
  ('VEGETABLES', 'Use bird perches @ 20/acre', 20),
  ('VEGETABLES', 'Collect and destroy affected fruits', 30),
  ('GENERAL', 'Deep summer ploughing', 10),
  ('GENERAL', 'Regular crop monitoring', 20),
  ('GENERAL', 'Balanced fertilization', 30),
  ('GENERAL', 'Protect beneficial insects', 40)
ON CONFLICT (crop_code, strategy) DO NOTHING;
