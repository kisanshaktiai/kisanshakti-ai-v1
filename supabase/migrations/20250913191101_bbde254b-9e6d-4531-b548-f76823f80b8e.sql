-- Create weather_observations table for rainfall tracking
CREATE TABLE IF NOT EXISTS public.weather_observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID REFERENCES public.farmers(id),
  land_id UUID REFERENCES public.lands(id),
  observation_date DATE NOT NULL,
  observation_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  temperature_celsius NUMERIC(5,2),
  humidity_percent NUMERIC(5,2),
  rainfall_mm NUMERIC(8,2) NOT NULL DEFAULT 0,
  wind_speed_kmh NUMERIC(6,2),
  wind_direction VARCHAR(10),
  weather_condition VARCHAR(50),
  pressure_hpa NUMERIC(6,1),
  visibility_km NUMERIC(5,1),
  uv_index NUMERIC(3,1),
  feels_like_celsius NUMERIC(5,2),
  dew_point_celsius NUMERIC(5,2),
  cloud_coverage_percent INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, observation_date, observation_time, land_id)
);

-- Enable RLS
ALTER TABLE public.weather_observations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
CREATE POLICY "Farmers can view their weather observations" 
ON public.weather_observations 
FOR SELECT 
USING (
  farmer_id IN (
    SELECT id FROM public.farmers 
    WHERE tenant_id = (SELECT tenant_id FROM public.farmers WHERE id = auth.uid() LIMIT 1)
  )
);

CREATE POLICY "System can insert weather observations" 
ON public.weather_observations 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update weather observations" 
ON public.weather_observations 
FOR UPDATE 
USING (true);

-- Create weather_aggregates table for daily summaries
CREATE TABLE IF NOT EXISTS public.weather_aggregates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID REFERENCES public.farmers(id),
  land_id UUID REFERENCES public.lands(id),
  aggregate_date DATE NOT NULL,
  rain_mm_total NUMERIC(8,2) NOT NULL DEFAULT 0,
  rain_mm_morning NUMERIC(8,2) DEFAULT 0,
  rain_mm_afternoon NUMERIC(8,2) DEFAULT 0,
  rain_mm_evening NUMERIC(8,2) DEFAULT 0,
  rain_mm_night NUMERIC(8,2) DEFAULT 0,
  temp_min_celsius NUMERIC(5,2),
  temp_max_celsius NUMERIC(5,2),
  temp_avg_celsius NUMERIC(5,2),
  humidity_avg_percent NUMERIC(5,2),
  wind_speed_avg_kmh NUMERIC(6,2),
  wind_speed_max_kmh NUMERIC(6,2),
  sunshine_hours NUMERIC(4,1),
  frost_risk BOOLEAN DEFAULT false,
  heat_stress_risk BOOLEAN DEFAULT false,
  disease_risk_level VARCHAR(20),
  agricultural_alerts JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, aggregate_date, land_id)
);

-- Enable RLS on aggregates
ALTER TABLE public.weather_aggregates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for aggregates
CREATE POLICY "Farmers can view their weather aggregates" 
ON public.weather_aggregates 
FOR SELECT 
USING (
  farmer_id IN (
    SELECT id FROM public.farmers 
    WHERE tenant_id = (SELECT tenant_id FROM public.farmers WHERE id = auth.uid() LIMIT 1)
  )
);

CREATE POLICY "System can manage weather aggregates" 
ON public.weather_aggregates 
FOR ALL 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_weather_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_weather_observations_updated_at
BEFORE UPDATE ON public.weather_observations
FOR EACH ROW
EXECUTE FUNCTION public.update_weather_timestamps();

CREATE TRIGGER update_weather_aggregates_updated_at
BEFORE UPDATE ON public.weather_aggregates
FOR EACH ROW
EXECUTE FUNCTION public.update_weather_timestamps();

-- Create indexes for performance
CREATE INDEX idx_weather_observations_date ON public.weather_observations(observation_date);
CREATE INDEX idx_weather_observations_tenant ON public.weather_observations(tenant_id);
CREATE INDEX idx_weather_observations_farmer ON public.weather_observations(farmer_id);
CREATE INDEX idx_weather_observations_land ON public.weather_observations(land_id);
CREATE INDEX idx_weather_aggregates_date ON public.weather_aggregates(aggregate_date);
CREATE INDEX idx_weather_aggregates_tenant ON public.weather_aggregates(tenant_id);

-- Enable realtime for weather updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.weather_observations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weather_aggregates;