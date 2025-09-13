-- Update lands table to ensure proper location storage
-- Add location columns if they don't exist
ALTER TABLE lands 
ADD COLUMN IF NOT EXISTS location_coords JSONB,
ADD COLUMN IF NOT EXISTS center_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS center_lon DECIMAL(11, 8);

-- Update existing center_point data to new columns if needed
UPDATE lands 
SET 
  center_lat = CASE 
    WHEN center_point_old IS NOT NULL 
    THEN (center_point_old->>'lat')::DECIMAL(10, 8)
    ELSE NULL
  END,
  center_lon = CASE 
    WHEN center_point_old IS NOT NULL 
    THEN (center_point_old->>'lng')::DECIMAL(11, 8)
    ELSE NULL
  END,
  location_coords = CASE 
    WHEN center_point_old IS NOT NULL 
    THEN jsonb_build_object(
      'lat', (center_point_old->>'lat')::DECIMAL(10, 8),
      'lon', (center_point_old->>'lng')::DECIMAL(11, 8),
      'accuracy_m', COALESCE(gps_accuracy_meters, 10),
      'source', COALESCE(boundary_method, 'manual')
    )
    ELSE NULL
  END
WHERE location_coords IS NULL AND center_point_old IS NOT NULL;

-- Drop redundant lat/lon columns from weather_observations if they exist
ALTER TABLE weather_observations 
DROP COLUMN IF EXISTS lat,
DROP COLUMN IF EXISTS lon;

-- Ensure weather_observations properly references lands table
ALTER TABLE weather_observations 
ADD CONSTRAINT fk_weather_land 
FOREIGN KEY (land_id) 
REFERENCES lands(id) 
ON DELETE CASCADE;

-- Create index for efficient location queries
CREATE INDEX IF NOT EXISTS idx_lands_location ON lands USING GIN (location_coords);
CREATE INDEX IF NOT EXISTS idx_lands_center_coords ON lands (center_lat, center_lon);

-- Update the aggregate_weather_data function to use lands table location
CREATE OR REPLACE FUNCTION aggregate_weather_data()
RETURNS void AS $$
BEGIN
  -- Daily aggregates
  INSERT INTO weather_aggregates (
    tenant_id, farmer_id, land_id, 
    period_type, period_date,
    total_rainfall_mm, avg_temperature_c, 
    max_temperature_c, min_temperature_c,
    avg_humidity_percent, avg_wind_speed_kmh,
    heat_stress_hours, optimal_spray_hours,
    evapotranspiration_mm, growing_degree_days
  )
  SELECT 
    w.tenant_id,
    w.farmer_id,
    w.land_id,
    'daily' as period_type,
    DATE(w.observed_at) as period_date,
    SUM(w.precipitation_mm) as total_rainfall_mm,
    AVG(w.temperature_c) as avg_temperature_c,
    MAX(w.temperature_c) as max_temperature_c,
    MIN(w.temperature_c) as min_temperature_c,
    AVG(w.humidity_percent) as avg_humidity_percent,
    AVG(w.wind_speed_kmh) as avg_wind_speed_kmh,
    SUM(CASE WHEN w.temperature_c > 35 THEN 1 ELSE 0 END) as heat_stress_hours,
    SUM(CASE WHEN get_spray_suitability(
      w.temperature_c, w.wind_speed_kmh, 
      w.humidity_percent, w.rain_probability_percent
    ) > 70 THEN 1 ELSE 0 END) as optimal_spray_hours,
    SUM(calculate_evapotranspiration(
      w.temperature_c, w.humidity_percent, 
      w.wind_speed_kmh, w.solar_radiation_wm2
    )) as evapotranspiration_mm,
    SUM(calculate_growing_degree_days(
      w.temperature_c, w.temperature_c, 10
    )) as growing_degree_days
  FROM weather_observations w
  WHERE w.observed_at >= CURRENT_DATE - INTERVAL '1 day'
  GROUP BY w.tenant_id, w.farmer_id, w.land_id, DATE(w.observed_at)
  ON CONFLICT (tenant_id, farmer_id, land_id, period_type, period_date) 
  DO UPDATE SET
    total_rainfall_mm = EXCLUDED.total_rainfall_mm,
    avg_temperature_c = EXCLUDED.avg_temperature_c,
    max_temperature_c = EXCLUDED.max_temperature_c,
    min_temperature_c = EXCLUDED.min_temperature_c,
    avg_humidity_percent = EXCLUDED.avg_humidity_percent,
    avg_wind_speed_kmh = EXCLUDED.avg_wind_speed_kmh,
    heat_stress_hours = EXCLUDED.heat_stress_hours,
    optimal_spray_hours = EXCLUDED.optimal_spray_hours,
    evapotranspiration_mm = EXCLUDED.evapotranspiration_mm,
    growing_degree_days = EXCLUDED.growing_degree_days,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a view to join weather data with land locations
CREATE OR REPLACE VIEW weather_with_location AS
SELECT 
  w.*,
  l.location_coords,
  l.center_lat,
  l.center_lon,
  l.name as land_name,
  l.area_acres,
  l.district,
  l.village
FROM weather_observations w
JOIN lands l ON w.land_id = l.id;