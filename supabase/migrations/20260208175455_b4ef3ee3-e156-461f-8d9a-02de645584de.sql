-- Backfill weather_historical from existing weather_aggregates data
-- This fixes the empty weather_historical table that was causing GDD calculation issues

INSERT INTO weather_historical (
  latitude,
  longitude,
  record_date,
  temperature_avg_celsius,
  temperature_min_celsius,
  temperature_max_celsius,
  rainfall_mm,
  humidity_avg_percent,
  wind_speed_avg_kmh,
  evapotranspiration_mm,
  growing_degree_days,
  data_source,
  created_at
)
SELECT DISTINCT ON (wa.aggregate_date, COALESCE(l.center_lat, 0))
  COALESCE(l.center_lat::numeric, 0) as latitude,
  COALESCE(l.center_lon::numeric, 0) as longitude,
  wa.aggregate_date as record_date,
  wa.temp_avg_celsius as temperature_avg_celsius,
  wa.temp_min_celsius as temperature_min_celsius,
  wa.temp_max_celsius as temperature_max_celsius,
  wa.rain_mm_total as rainfall_mm,
  wa.humidity_avg_percent as humidity_avg_percent,
  wa.wind_speed_avg_kmh as wind_speed_avg_kmh,
  COALESCE(wa.evapotranspiration_mm, 0) as evapotranspiration_mm,
  COALESCE(wa.gdd_accumulated, 
    CASE 
      WHEN wa.temp_max_celsius IS NOT NULL AND wa.temp_min_celsius IS NOT NULL 
      THEN GREATEST(0, ((LEAST(wa.temp_max_celsius, 30) + GREATEST(wa.temp_min_celsius, 10)) / 2) - 10)
      ELSE 0 
    END
  ) as growing_degree_days,
  'backfill_from_aggregates' as data_source,
  NOW() as created_at
FROM weather_aggregates wa
LEFT JOIN lands l ON wa.land_id = l.id
WHERE wa.aggregate_date < CURRENT_DATE
  AND wa.temp_avg_celsius IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM weather_historical wh 
    WHERE wh.record_date = wa.aggregate_date 
    AND wh.latitude = COALESCE(l.center_lat::numeric, 0)
  )
ORDER BY wa.aggregate_date, COALESCE(l.center_lat, 0), wa.created_at DESC;

-- Also backfill from weather_observations if we have data there but not in aggregates
INSERT INTO weather_historical (
  latitude,
  longitude,
  record_date,
  temperature_avg_celsius,
  temperature_min_celsius,
  temperature_max_celsius,
  rainfall_mm,
  humidity_avg_percent,
  wind_speed_avg_kmh,
  data_source,
  created_at
)
SELECT DISTINCT ON (wo.observation_date)
  0 as latitude,
  0 as longitude,
  wo.observation_date as record_date,
  AVG(wo.temperature_celsius) as temperature_avg_celsius,
  MIN(wo.temperature_celsius) as temperature_min_celsius,
  MAX(wo.temperature_celsius) as temperature_max_celsius,
  SUM(wo.rainfall_mm) as rainfall_mm,
  AVG(wo.humidity_percent) as humidity_avg_percent,
  AVG(wo.wind_speed_kmh) as wind_speed_avg_kmh,
  'backfill_from_observations' as data_source,
  NOW() as created_at
FROM weather_observations wo
WHERE wo.observation_date < CURRENT_DATE
  AND wo.temperature_celsius IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM weather_historical wh 
    WHERE wh.record_date = wo.observation_date
  )
GROUP BY wo.observation_date
ORDER BY wo.observation_date, MAX(wo.created_at) DESC;

-- Create index for faster GDD queries on weather_historical
CREATE INDEX IF NOT EXISTS idx_weather_historical_date_lat 
ON weather_historical(record_date DESC, latitude);

-- Add comment explaining the table purpose
COMMENT ON TABLE weather_historical IS 'Archived daily weather data for GDD calculations and historical analysis. Auto-populated from weather_aggregates at end of each day.';