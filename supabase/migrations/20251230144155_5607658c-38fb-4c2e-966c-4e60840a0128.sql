
-- Add land_id column to weather_current for per-land weather storage
ALTER TABLE public.weather_current ADD COLUMN IF NOT EXISTS land_id uuid REFERENCES public.lands(id) ON DELETE SET NULL;

-- Add land_id column to weather_forecasts for per-land forecasts
ALTER TABLE public.weather_forecasts ADD COLUMN IF NOT EXISTS land_id uuid REFERENCES public.lands(id) ON DELETE SET NULL;

-- Add tenant_id to weather_current for multi-tenant isolation
ALTER TABLE public.weather_current ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add tenant_id to weather_forecasts for multi-tenant isolation
ALTER TABLE public.weather_forecasts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Create index for faster land-based queries
CREATE INDEX IF NOT EXISTS idx_weather_current_land_id ON public.weather_current(land_id);
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_land_id ON public.weather_forecasts(land_id);
CREATE INDEX IF NOT EXISTS idx_weather_current_location_key ON public.weather_current(location_key);
CREATE INDEX IF NOT EXISTS idx_weather_forecasts_location_key ON public.weather_forecasts(location_key);

-- Create composite index for faster cache lookups
CREATE INDEX IF NOT EXISTS idx_weather_current_location_expires ON public.weather_current(location_key, expires_at);

-- Add snow_1h_mm to weather_observations if missing (for rainfall/snowfall tracking)
ALTER TABLE public.weather_observations ADD COLUMN IF NOT EXISTS snow_1h_mm numeric(8,2) DEFAULT 0;

-- Add rain_3h_mm to weather_current for 3-hour rainfall tracking
ALTER TABLE public.weather_current ADD COLUMN IF NOT EXISTS rain_3h_mm numeric(8,2) DEFAULT 0;

-- Update RLS policies to allow service role writes
DROP POLICY IF EXISTS "Allow service role to manage weather_current" ON public.weather_current;
CREATE POLICY "Allow service role to manage weather_current" 
ON public.weather_current 
FOR ALL 
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role to manage weather_forecasts" ON public.weather_forecasts;
CREATE POLICY "Allow service role to manage weather_forecasts" 
ON public.weather_forecasts 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Enable RLS on weather tables (if not already)
ALTER TABLE public.weather_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_forecasts ENABLE ROW LEVEL SECURITY;
