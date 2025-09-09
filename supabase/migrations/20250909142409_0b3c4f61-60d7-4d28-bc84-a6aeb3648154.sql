-- Fix weather alerts table structure
ALTER TABLE public.weather_alerts 
  RENAME COLUMN alert_id TO user_id;

-- Add missing columns if they don't exist
ALTER TABLE public.weather_alerts 
  ADD COLUMN IF NOT EXISTS alert_type TEXT,
  ADD COLUMN IF NOT EXISTS threshold_value NUMERIC,
  ADD COLUMN IF NOT EXISTS comparison_operator TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create weather cache table for offline support
CREATE TABLE IF NOT EXISTS public.weather_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read weather cache
CREATE POLICY "Anyone can read weather cache" 
ON public.weather_cache 
FOR SELECT 
USING (true);

-- Create weather preferences table
CREATE TABLE IF NOT EXISTS public.weather_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  units TEXT DEFAULT 'metric',
  default_location JSONB,
  notification_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weather_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
CREATE POLICY "Users can manage their own weather preferences" 
ON public.weather_preferences 
FOR ALL 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_weather_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_weather_preferences_updated_at
BEFORE UPDATE ON public.weather_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_weather_preferences_updated_at();