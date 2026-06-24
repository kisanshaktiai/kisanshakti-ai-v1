-- Add cache columns to existing weather tables for 1M user scalability

-- Update weather_current table with caching columns
ALTER TABLE weather_current 
  ADD COLUMN IF NOT EXISTS location_key VARCHAR(20),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Create unique index for location-based caching (upsert support)
CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_current_location_key 
  ON weather_current(location_key) WHERE location_key IS NOT NULL;

-- Create index for cache expiration cleanup
CREATE INDEX IF NOT EXISTS idx_weather_current_expires 
  ON weather_current(expires_at) WHERE expires_at IS NOT NULL;

-- Update weather_forecasts table with location_key for efficient lookups
ALTER TABLE weather_forecasts
  ADD COLUMN IF NOT EXISTS location_key VARCHAR(20);

-- Create composite index for fast forecast queries
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_location_key 
  ON weather_forecasts(location_key, forecast_type, forecast_time);

-- Create function to cleanup expired cache entries (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_weather_cache()
RETURNS INTEGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired current weather cache
  DELETE FROM weather_current 
  WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup
  RAISE NOTICE 'Cleaned up % expired weather cache entries', deleted_count;
  
  RETURN deleted_count;
END;
$$;

-- Add comment explaining the caching strategy
COMMENT ON COLUMN weather_current.location_key IS 'Rounded coordinates (~1km precision) for efficient caching. Format: "18.52,73.88"';
COMMENT ON COLUMN weather_current.expires_at IS 'Cache expiration timestamp. Current weather expires after 15 minutes, forecasts after 6 hours';
COMMENT ON FUNCTION cleanup_expired_weather_cache() IS 'Cleans up expired weather cache entries. Should be run daily via pg_cron or edge function scheduler';