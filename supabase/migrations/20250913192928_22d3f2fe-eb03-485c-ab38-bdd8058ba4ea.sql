-- Enhanced weather observations table with strict tenant/farmer/land isolation
CREATE TABLE IF NOT EXISTS public.weather_observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  land_id UUID,
  
  -- Location data
  lat DECIMAL(10, 7) NOT NULL,
  lon DECIMAL(10, 7) NOT NULL,
  radius_m INTEGER DEFAULT 1000,
  location_name TEXT,
  
  -- Weather data
  precipitation_mm DECIMAL(8, 2) DEFAULT 0,
  temperature_celsius DECIMAL(5, 2),
  humidity_percent INTEGER,
  wind_speed_kmh DECIMAL(5, 2),
  wind_direction_deg INTEGER,
  pressure_hpa DECIMAL(6, 1),
  visibility_km DECIMAL(5, 2),
  uv_index DECIMAL(3, 1),
  cloud_cover_percent INTEGER,
  dew_point_celsius DECIMAL(5, 2),
  
  -- Rainfall specific
  rainfall_intensity TEXT, -- light, moderate, heavy, very_heavy, extreme
  rainfall_type TEXT, -- drizzle, rain, thunderstorm, snow, sleet
  
  -- Source tracking
  source TEXT NOT NULL CHECK (source IN ('api', 'satellite', 'manual', 'sensor')),
  source_name TEXT, -- e.g., 'openweather', 'tomorrow.io', 'nasa_gpm', 'chirps'
  
  -- Weather condition
  weather_condition TEXT,
  weather_description TEXT,
  weather_icon TEXT,
  
  -- Timestamps
  observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Metadata
  raw_data JSONB,
  confidence_score DECIMAL(3, 2) DEFAULT 1.0,
  
  CONSTRAINT unique_weather_observation UNIQUE(tenant_id, farmer_id, lat, lon, source, observed_at)
);

-- Weather aggregates table for daily, weekly, monthly, seasonal totals
CREATE TABLE IF NOT EXISTS public.weather_aggregates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  land_id UUID,
  
  -- Location
  lat DECIMAL(10, 7) NOT NULL,
  lon DECIMAL(10, 7) NOT NULL,
  
  -- Aggregation period
  period_type TEXT NOT NULL CHECK (period_type IN ('hourly', 'daily', 'weekly', 'monthly', 'seasonal', 'yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Rainfall aggregates
  total_rainfall_mm DECIMAL(10, 2) DEFAULT 0,
  max_rainfall_mm DECIMAL(8, 2),
  min_rainfall_mm DECIMAL(8, 2),
  avg_rainfall_mm DECIMAL(8, 2),
  rainfall_days INTEGER DEFAULT 0,
  heavy_rainfall_days INTEGER DEFAULT 0,
  
  -- Temperature aggregates
  max_temp_celsius DECIMAL(5, 2),
  min_temp_celsius DECIMAL(5, 2),
  avg_temp_celsius DECIMAL(5, 2),
  
  -- Other aggregates
  avg_humidity_percent DECIMAL(5, 2),
  avg_wind_speed_kmh DECIMAL(5, 2),
  max_wind_speed_kmh DECIMAL(5, 2),
  
  -- Agricultural metrics
  evapotranspiration_mm DECIMAL(8, 2),
  water_balance_mm DECIMAL(10, 2),
  growing_degree_days DECIMAL(8, 2),
  
  -- Risk indicators
  drought_risk_score DECIMAL(3, 2),
  flood_risk_score DECIMAL(3, 2),
  heat_stress_score DECIMAL(3, 2),
  frost_risk_score DECIMAL(3, 2),
  
  -- Metadata
  observation_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_weather_aggregate UNIQUE(tenant_id, farmer_id, lat, lon, period_type, period_start)
);

-- Agricultural alerts based on weather
CREATE TABLE IF NOT EXISTS public.weather_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  land_id UUID,
  
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'heavy_rain', 'drought', 'frost', 'heat_stress', 'hail', 
    'strong_wind', 'pest_risk', 'disease_risk', 'irrigation_needed'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  
  -- Trigger conditions
  trigger_value DECIMAL(10, 2),
  threshold_value DECIMAL(10, 2),
  
  -- Timing
  alert_start TIMESTAMP WITH TIME ZONE NOT NULL,
  alert_end TIMESTAMP WITH TIME ZONE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  metadata JSONB
);

-- Create indexes for performance
CREATE INDEX idx_weather_obs_tenant_farmer ON weather_observations(tenant_id, farmer_id);
CREATE INDEX idx_weather_obs_location ON weather_observations(lat, lon);
CREATE INDEX idx_weather_obs_observed_at ON weather_observations(observed_at DESC);
CREATE INDEX idx_weather_obs_land ON weather_observations(land_id);

CREATE INDEX idx_weather_agg_tenant_farmer ON weather_aggregates(tenant_id, farmer_id);
CREATE INDEX idx_weather_agg_location ON weather_aggregates(lat, lon);
CREATE INDEX idx_weather_agg_period ON weather_aggregates(period_type, period_start);

CREATE INDEX idx_weather_alerts_tenant_farmer ON weather_alerts(tenant_id, farmer_id);
CREATE INDEX idx_weather_alerts_type ON weather_alerts(alert_type, severity);

-- Enable RLS
ALTER TABLE weather_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for weather_observations
CREATE POLICY "Farmers can view their weather observations"
  ON weather_observations FOR SELECT
  USING (auth.uid() = farmer_id);

CREATE POLICY "Farmers can insert their weather observations"
  ON weather_observations FOR INSERT
  WITH CHECK (auth.uid() = farmer_id);

CREATE POLICY "System can insert weather observations"
  ON weather_observations FOR INSERT
  WITH CHECK (true);

-- RLS Policies for weather_aggregates
CREATE POLICY "Farmers can view their weather aggregates"
  ON weather_aggregates FOR SELECT
  USING (auth.uid() = farmer_id);

CREATE POLICY "System can manage weather aggregates"
  ON weather_aggregates FOR ALL
  USING (true);

-- RLS Policies for weather_alerts
CREATE POLICY "Farmers can view their weather alerts"
  ON weather_alerts FOR SELECT
  USING (auth.uid() = farmer_id);

CREATE POLICY "Farmers can acknowledge their alerts"
  ON weather_alerts FOR UPDATE
  USING (auth.uid() = farmer_id);

CREATE POLICY "System can manage weather alerts"
  ON weather_alerts FOR ALL
  USING (true);

-- Function to calculate agricultural metrics
CREATE OR REPLACE FUNCTION calculate_agricultural_metrics(
  p_temp_celsius DECIMAL,
  p_humidity_percent INTEGER,
  p_rainfall_mm DECIMAL,
  p_wind_speed_kmh DECIMAL
) RETURNS JSONB AS $$
DECLARE
  metrics JSONB;
  evapotranspiration DECIMAL;
  spray_suitability INTEGER;
  disease_risk DECIMAL;
BEGIN
  -- Calculate evapotranspiration (simplified Penman-Monteith)
  evapotranspiration := ROUND(
    (0.0023 * (p_temp_celsius + 17.8) * SQRT(ABS(p_humidity_percent - 50)) * 
     (15 / 2.45) * (1 + p_wind_speed_kmh / 67))::DECIMAL, 2
  );
  
  -- Calculate spray suitability score
  spray_suitability := 100;
  IF p_temp_celsius < 10 OR p_temp_celsius > 35 THEN
    spray_suitability := spray_suitability - 30;
  END IF;
  IF p_wind_speed_kmh > 15 THEN
    spray_suitability := spray_suitability - 25;
  END IF;
  IF p_humidity_percent > 85 THEN
    spray_suitability := spray_suitability - 20;
  END IF;
  
  -- Calculate disease risk based on humidity and temperature
  disease_risk := 0;
  IF p_humidity_percent > 70 AND p_temp_celsius BETWEEN 20 AND 30 THEN
    disease_risk := 0.7;
  ELSIF p_humidity_percent > 60 AND p_temp_celsius BETWEEN 15 AND 35 THEN
    disease_risk := 0.5;
  ELSIF p_humidity_percent > 50 THEN
    disease_risk := 0.3;
  END IF;
  
  metrics := jsonb_build_object(
    'evapotranspiration_mm', evapotranspiration,
    'spray_suitability_score', GREATEST(0, spray_suitability),
    'disease_risk_score', disease_risk,
    'irrigation_needed', evapotranspiration > p_rainfall_mm
  );
  
  RETURN metrics;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate weather data
CREATE OR REPLACE FUNCTION aggregate_weather_data(
  p_tenant_id UUID,
  p_farmer_id UUID,
  p_period_type TEXT,
  p_period_start DATE
) RETURNS VOID AS $$
DECLARE
  v_period_end DATE;
  v_aggregate RECORD;
BEGIN
  -- Calculate period end based on type
  CASE p_period_type
    WHEN 'daily' THEN v_period_end := p_period_start;
    WHEN 'weekly' THEN v_period_end := p_period_start + INTERVAL '6 days';
    WHEN 'monthly' THEN v_period_end := p_period_start + INTERVAL '1 month' - INTERVAL '1 day';
    WHEN 'seasonal' THEN v_period_end := p_period_start + INTERVAL '3 months' - INTERVAL '1 day';
    WHEN 'yearly' THEN v_period_end := p_period_start + INTERVAL '1 year' - INTERVAL '1 day';
  END CASE;
  
  -- Calculate aggregates
  SELECT
    COUNT(*) as obs_count,
    COALESCE(SUM(precipitation_mm), 0) as total_rain,
    COALESCE(MAX(precipitation_mm), 0) as max_rain,
    COALESCE(MIN(precipitation_mm), 0) as min_rain,
    COALESCE(AVG(precipitation_mm), 0) as avg_rain,
    COUNT(CASE WHEN precipitation_mm > 0 THEN 1 END) as rain_days,
    COUNT(CASE WHEN precipitation_mm > 10 THEN 1 END) as heavy_rain_days,
    MAX(temperature_celsius) as max_temp,
    MIN(temperature_celsius) as min_temp,
    AVG(temperature_celsius) as avg_temp,
    AVG(humidity_percent) as avg_humidity,
    AVG(wind_speed_kmh) as avg_wind,
    MAX(wind_speed_kmh) as max_wind,
    MIN(lat) as lat,
    MIN(lon) as lon,
    MIN(land_id) as land_id
  INTO v_aggregate
  FROM weather_observations
  WHERE tenant_id = p_tenant_id
    AND farmer_id = p_farmer_id
    AND DATE(observed_at) BETWEEN p_period_start AND v_period_end;
  
  -- Insert or update aggregate
  INSERT INTO weather_aggregates (
    tenant_id, farmer_id, land_id, lat, lon,
    period_type, period_start, period_end,
    total_rainfall_mm, max_rainfall_mm, min_rainfall_mm, avg_rainfall_mm,
    rainfall_days, heavy_rainfall_days,
    max_temp_celsius, min_temp_celsius, avg_temp_celsius,
    avg_humidity_percent, avg_wind_speed_kmh, max_wind_speed_kmh,
    observation_count, last_updated
  ) VALUES (
    p_tenant_id, p_farmer_id, v_aggregate.land_id, v_aggregate.lat, v_aggregate.lon,
    p_period_type, p_period_start, v_period_end,
    v_aggregate.total_rain, v_aggregate.max_rain, v_aggregate.min_rain, v_aggregate.avg_rain,
    v_aggregate.rain_days, v_aggregate.heavy_rain_days,
    v_aggregate.max_temp, v_aggregate.min_temp, v_aggregate.avg_temp,
    v_aggregate.avg_humidity, v_aggregate.avg_wind, v_aggregate.max_wind,
    v_aggregate.obs_count, NOW()
  )
  ON CONFLICT (tenant_id, farmer_id, lat, lon, period_type, period_start)
  DO UPDATE SET
    total_rainfall_mm = EXCLUDED.total_rainfall_mm,
    max_rainfall_mm = EXCLUDED.max_rainfall_mm,
    min_rainfall_mm = EXCLUDED.min_rainfall_mm,
    avg_rainfall_mm = EXCLUDED.avg_rainfall_mm,
    rainfall_days = EXCLUDED.rainfall_days,
    heavy_rainfall_days = EXCLUDED.heavy_rainfall_days,
    max_temp_celsius = EXCLUDED.max_temp_celsius,
    min_temp_celsius = EXCLUDED.min_temp_celsius,
    avg_temp_celsius = EXCLUDED.avg_temp_celsius,
    avg_humidity_percent = EXCLUDED.avg_humidity_percent,
    avg_wind_speed_kmh = EXCLUDED.avg_wind_speed_kmh,
    max_wind_speed_kmh = EXCLUDED.max_wind_speed_kmh,
    observation_count = EXCLUDED.observation_count,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update aggregates on new observations
CREATE OR REPLACE FUNCTION trigger_update_weather_aggregates() 
RETURNS TRIGGER AS $$
BEGIN
  -- Update daily aggregate
  PERFORM aggregate_weather_data(
    NEW.tenant_id,
    NEW.farmer_id,
    'daily',
    DATE(NEW.observed_at)
  );
  
  -- Update weekly aggregate (start of week)
  PERFORM aggregate_weather_data(
    NEW.tenant_id,
    NEW.farmer_id,
    'weekly',
    DATE_TRUNC('week', NEW.observed_at)::DATE
  );
  
  -- Update monthly aggregate
  PERFORM aggregate_weather_data(
    NEW.tenant_id,
    NEW.farmer_id,
    'monthly',
    DATE_TRUNC('month', NEW.observed_at)::DATE
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_weather_aggregates_trigger
AFTER INSERT OR UPDATE ON weather_observations
FOR EACH ROW
EXECUTE FUNCTION trigger_update_weather_aggregates();

-- Enable Realtime for weather tables
ALTER TABLE weather_observations REPLICA IDENTITY FULL;
ALTER TABLE weather_aggregates REPLICA IDENTITY FULL;
ALTER TABLE weather_alerts REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE weather_observations;
ALTER PUBLICATION supabase_realtime ADD TABLE weather_aggregates;
ALTER PUBLICATION supabase_realtime ADD TABLE weather_alerts;