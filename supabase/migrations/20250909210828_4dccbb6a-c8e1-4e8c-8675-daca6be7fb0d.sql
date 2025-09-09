-- Add RLS policies for weather_alerts table to allow public access for caching
-- Since weather data is public information and doesn't require authentication

-- Allow public to read weather cache data
CREATE POLICY "Public can read weather cache" 
ON public.weather_alerts 
FOR SELECT 
USING (true);

-- Allow public to insert new weather cache entries
CREATE POLICY "Public can insert weather cache" 
ON public.weather_alerts 
FOR INSERT 
WITH CHECK (true);

-- Allow public to update weather cache entries
CREATE POLICY "Public can update weather cache" 
ON public.weather_alerts 
FOR UPDATE 
USING (true);

-- Allow public to delete old weather cache entries
CREATE POLICY "Public can delete weather cache" 
ON public.weather_alerts 
FOR DELETE 
USING (true);