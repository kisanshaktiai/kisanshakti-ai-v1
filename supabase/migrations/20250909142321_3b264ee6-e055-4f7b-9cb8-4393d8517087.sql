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

-- Create weather alerts table
CREATE TABLE IF NOT EXISTS public.weather_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL,
  comparison_operator TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weather_alerts ENABLE ROW LEVEL SECURITY;

-- Users can manage their own alerts
CREATE POLICY "Users can manage their own weather alerts" 
ON public.weather_alerts 
FOR ALL 
USING (auth.uid() = user_id);

-- Create weather preferences table
CREATE TABLE IF NOT EXISTS public.weather_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
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