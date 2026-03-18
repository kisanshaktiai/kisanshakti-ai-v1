
-- Phase 1C: Add observation_count to weather_aggregates for proper running average
ALTER TABLE weather_aggregates ADD COLUMN IF NOT EXISTS observation_count INTEGER DEFAULT 1;

-- Phase 2A: Create land_weather_metrics table for per-land derived weather intelligence
CREATE TABLE IF NOT EXISTS land_weather_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land_id UUID NOT NULL REFERENCES lands(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  location_key TEXT,
  temperature_c NUMERIC,
  humidity_percent NUMERIC,
  wind_speed_kmh NUMERIC,
  total_rainfall_mm NUMERIC DEFAULT 0,
  effective_rainfall_mm NUMERIC DEFAULT 0,
  runoff_loss_mm NUMERIC DEFAULT 0,
  water_deficit_mm NUMERIC DEFAULT 0,
  soil_infiltration_rate TEXT,
  irrigation_needed BOOLEAN DEFAULT false,
  irrigation_urgency TEXT DEFAULT 'NONE',
  gdd_daily NUMERIC DEFAULT 0,
  gdd_accumulated NUMERIC DEFAULT 0,
  et0_mm NUMERIC DEFAULT 0,
  disease_risk_score INTEGER DEFAULT 0,
  disease_risk_level TEXT DEFAULT 'LOW',
  crop_stress_level TEXT DEFAULT 'NONE',
  water_balance_status TEXT DEFAULT 'BALANCED',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(land_id, metric_date)
);

-- RLS for land_weather_metrics
ALTER TABLE land_weather_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read land weather metrics for their tenant"
  ON land_weather_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage land weather metrics"
  ON land_weather_metrics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Phase 4A: Drop unused weather tables
DROP TABLE IF EXISTS weather_stations CASCADE;
DROP TABLE IF EXISTS weather_preferences CASCADE;
DROP TABLE IF EXISTS weather_activity_recommendations CASCADE;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_land_weather_metrics_land_date ON land_weather_metrics(land_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_land_weather_metrics_tenant ON land_weather_metrics(tenant_id, metric_date);
