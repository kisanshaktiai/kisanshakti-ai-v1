ALTER TABLE public.weather_aggregates
  ADD COLUMN IF NOT EXISTS location_key text;

CREATE TABLE IF NOT EXISTS public.zz_weather_aggregates_prefix_backup AS
  SELECT * FROM public.weather_aggregates;

DELETE FROM public.weather_aggregates;

ALTER TABLE public.weather_aggregates
  DROP CONSTRAINT IF EXISTS weather_aggregates_unique_day;

INSERT INTO public.weather_aggregates (
  tenant_id, farmer_id, land_id, location_key, aggregate_date,
  temp_min_celsius, temp_max_celsius, temp_avg_celsius,
  humidity_avg_percent, wind_speed_avg_kmh, wind_speed_max_kmh,
  rain_mm_total, observation_count, frost_risk, heat_stress_risk,
  created_at, updated_at
)
SELECT o.tenant_id, NULL, o.land_id, o.location_key, o.observation_date,
  min(o.temperature_celsius), max(o.temperature_celsius),
  round(avg(o.temperature_celsius)::numeric, 2),
  round(avg(o.humidity_percent)::numeric, 2),
  round(avg(o.wind_speed_kmh)::numeric, 2), max(o.wind_speed_kmh),
  sum(COALESCE(o.rainfall_mm, 0)), count(*),
  min(o.temperature_celsius) < 4, max(o.temperature_celsius) > 38,
  now(), now()
FROM public.weather_observations o
WHERE o.location_key IS NOT NULL
  AND o.observation_date IS NOT NULL
  AND o.temperature_celsius IS NOT NULL
GROUP BY o.tenant_id, o.land_id, o.location_key, o.observation_date;

ALTER TABLE public.weather_aggregates
  ADD CONSTRAINT weather_aggregates_unique_cell_day
  UNIQUE NULLS NOT DISTINCT (tenant_id, location_key, aggregate_date, land_id);

CREATE INDEX IF NOT EXISTS idx_weather_agg_cell_date
  ON public.weather_aggregates (location_key, aggregate_date DESC);