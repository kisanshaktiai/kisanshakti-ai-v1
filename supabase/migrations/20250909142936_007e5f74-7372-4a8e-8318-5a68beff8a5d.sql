-- Drop the newly created tables to use existing ones only
DROP TABLE IF EXISTS public.weather_cache CASCADE;
DROP TABLE IF EXISTS public.weather_preferences CASCADE;

-- Revert the column rename in weather_alerts to keep original structure
ALTER TABLE public.weather_alerts 
  RENAME COLUMN user_id TO alert_id;

-- Update weather_alerts table with additional columns if needed (keeping existing structure)
ALTER TABLE public.weather_alerts 
  ADD COLUMN IF NOT EXISTS cache_data JSONB,
  ADD COLUMN IF NOT EXISTS last_fetched TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS location_data JSONB,
  ADD COLUMN IF NOT EXISTS units TEXT DEFAULT 'metric',
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"enabled": true}'::jsonb;

-- Add RLS policies if not exists for weather_alerts
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'weather_alerts' 
    AND policyname = 'Users can manage their own weather alerts'
  ) THEN
    CREATE POLICY "Users can manage their own weather alerts" 
    ON public.weather_alerts 
    FOR ALL 
    USING (auth.uid() = alert_id);
  END IF;
END $$;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_weather_alerts_location 
ON public.weather_alerts((location_data->>'location'));