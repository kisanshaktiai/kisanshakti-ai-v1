-- Fix location_key for existing weather_current records
-- Handle duplicates by keeping only the most recent record per location

-- First, delete older duplicate records based on rounded coordinates
DELETE FROM weather_current a
USING weather_current b
WHERE a.id < b.id 
  AND ROUND(a.latitude::numeric, 2) = ROUND(b.latitude::numeric, 2)
  AND ROUND(a.longitude::numeric, 2) = ROUND(b.longitude::numeric, 2);

-- Now update remaining records with location_key
UPDATE weather_current 
SET location_key = ROUND(latitude::numeric, 2)::text || ',' || ROUND(longitude::numeric, 2)::text,
    expires_at = COALESCE(expires_at, NOW() - INTERVAL '1 hour')
WHERE location_key IS NULL;

-- Add indexes for faster cache lookups
CREATE INDEX IF NOT EXISTS idx_weather_current_location_key ON weather_current(location_key);
CREATE INDEX IF NOT EXISTS idx_weather_current_expires_at ON weather_current(expires_at);

-- Add comment for documentation
COMMENT ON COLUMN weather_current.location_key IS 'Rounded coordinates (2 decimal places) in format "lat,lon" for cache lookup';