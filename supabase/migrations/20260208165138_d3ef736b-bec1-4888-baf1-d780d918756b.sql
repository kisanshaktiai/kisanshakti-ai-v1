-- Add GDD accumulated column to weather_aggregates table for historical tracking
ALTER TABLE weather_aggregates 
ADD COLUMN IF NOT EXISTS gdd_accumulated NUMERIC DEFAULT 0;

-- Add sunshine hours column (was missing from schema)
ALTER TABLE weather_aggregates 
ADD COLUMN IF NOT EXISTS sunshine_hours NUMERIC DEFAULT NULL;

-- Add evapotranspiration tracking
ALTER TABLE weather_aggregates 
ADD COLUMN IF NOT EXISTS evapotranspiration_mm NUMERIC DEFAULT NULL;

-- Add dew point to weather_observations (was NULL)
-- Already exists but ensure index for queries
CREATE INDEX IF NOT EXISTS idx_weather_observations_land_date 
ON weather_observations(land_id, observation_date DESC);

-- Add composite index for efficient GDD history queries
CREATE INDEX IF NOT EXISTS idx_weather_aggregates_land_date 
ON weather_aggregates(land_id, aggregate_date DESC);

-- Add index for disease risk queries
CREATE INDEX IF NOT EXISTS idx_weather_aggregates_disease_risk 
ON weather_aggregates(tenant_id, disease_risk_level, aggregate_date DESC);

-- Comment for documentation
COMMENT ON COLUMN weather_aggregates.gdd_accumulated IS 'Accumulated Growing Degree Days from sowing date';