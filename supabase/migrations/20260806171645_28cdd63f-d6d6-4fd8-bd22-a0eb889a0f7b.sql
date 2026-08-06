ALTER TABLE public.weather_observations
  ADD COLUMN IF NOT EXISTS location_key text;

UPDATE public.weather_observations
   SET location_key = metadata->>'location_key'
 WHERE location_key IS NULL
   AND metadata->>'location_key' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_weather_obs_location_date
  ON public.weather_observations (location_key, observation_date);