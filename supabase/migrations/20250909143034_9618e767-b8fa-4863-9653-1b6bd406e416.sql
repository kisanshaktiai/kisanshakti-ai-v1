-- Add columns to weather_alerts table for caching and user preferences
ALTER TABLE public.weather_alerts 
  ADD COLUMN IF NOT EXISTS cache_data JSONB,
  ADD COLUMN IF NOT EXISTS last_fetched TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{"units": "metric", "notifications": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS user_location JSONB,
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Add index for better performance on location-based queries
CREATE INDEX IF NOT EXISTS idx_weather_alerts_area_name 
ON public.weather_alerts(area_name);

CREATE INDEX IF NOT EXISTS idx_weather_alerts_tenant 
ON public.weather_alerts(tenant_id);

-- Add updated_at column and trigger
ALTER TABLE public.weather_alerts 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION public.handle_weather_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS update_weather_alerts_updated_at ON public.weather_alerts;
CREATE TRIGGER update_weather_alerts_updated_at
BEFORE UPDATE ON public.weather_alerts
FOR EACH ROW
EXECUTE FUNCTION public.handle_weather_alerts_updated_at();