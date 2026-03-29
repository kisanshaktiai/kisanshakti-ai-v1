-- ============================================================================
-- PROACTIVE INTELLIGENCE SYSTEM — Foundation Tables
-- Sprint 1: Core infrastructure for world-class proactive advisory engine
-- ============================================================================

-- 1. Add proactive columns to decision_rules (non-breaking, additive only)
ALTER TABLE decision_rules ADD COLUMN IF NOT EXISTS is_proactive_rule BOOLEAN DEFAULT false;
ALTER TABLE decision_rules ADD COLUMN IF NOT EXISTS prediction_type TEXT;
ALTER TABLE decision_rules ADD COLUMN IF NOT EXISTS forecast_horizon_days INTEGER;
ALTER TABLE decision_rules ADD COLUMN IF NOT EXISTS probability_threshold NUMERIC DEFAULT 0.75;

-- 2. Proactive Events — stores detected environmental/crop events
CREATE TABLE IF NOT EXISTS proactive_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  land_id UUID REFERENCES lands(id) ON DELETE CASCADE,
  farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'WEATHER_CHANGE', 'NDVI_DROP', 'STAGE_TRANSITION', 
    'DISEASE_RISK_WINDOW', 'PEST_EMERGENCE', 'SCHEDULED_CHECK',
    'SOIL_CHANGE', 'IRRIGATION_NEEDED', 'SPRAY_WINDOW'
  )),
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed BOOLEAN DEFAULT false,
  alerts_generated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Proactive Alerts — farmer-facing alerts with full traceability
CREATE TABLE IF NOT EXISTS proactive_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  land_id UUID REFERENCES lands(id) ON DELETE CASCADE,
  farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
  event_id UUID REFERENCES proactive_events(id) ON DELETE SET NULL,
  rule_id TEXT,
  alert_category TEXT NOT NULL CHECK (alert_category IN (
    'IRRIGATION', 'PEST_RISK', 'DISEASE_RISK', 'WEATHER_WARNING',
    'FERTILIZER_WINDOW', 'HARVEST_TIMING', 'SPRAY_WINDOW',
    'STAGE_ADVISORY', 'CROP_STRESS', 'GENERAL'
  )),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  title_mr TEXT,
  title_hi TEXT,
  title_en TEXT NOT NULL,
  message_mr TEXT,
  message_hi TEXT,
  message_en TEXT NOT NULL,
  action_text_mr TEXT,
  action_text_hi TEXT,
  action_text_en TEXT,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  confidence NUMERIC DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  trigger_data JSONB DEFAULT '{}'::jsonb,
  decision_reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'DELIVERED', 'SEEN', 'ACTED', 'DISMISSED', 'EXPIRED'
  )),
  dedup_key TEXT,
  expires_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  seen_at TIMESTAMPTZ,
  acted_at TIMESTAMPTZ,
  push_sent BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Dedup constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_proactive_alerts_dedup 
  ON proactive_alerts (dedup_key) WHERE dedup_key IS NOT NULL;

-- 4. Proactive Evaluation Log
CREATE TABLE IF NOT EXISTS proactive_evaluation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  evaluation_type TEXT NOT NULL,
  lands_evaluated INTEGER DEFAULT 0,
  rules_evaluated INTEGER DEFAULT 0,
  rules_fired INTEGER DEFAULT 0,
  alerts_generated INTEGER DEFAULT 0,
  execution_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Disease Risk Model
CREATE TABLE IF NOT EXISTS disease_risk_model (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code TEXT NOT NULL,
  disease_code TEXT NOT NULL,
  disease_name_en TEXT NOT NULL,
  disease_name_mr TEXT,
  disease_name_hi TEXT,
  temp_min NUMERIC,
  temp_max NUMERIC,
  humidity_min NUMERIC,
  humidity_max NUMERIC,
  leaf_wetness_hours_min NUMERIC,
  rain_mm_min NUMERIC,
  rain_mm_max NUMERIC,
  wind_speed_max NUMERIC,
  stage_applicable TEXT[] DEFAULT '{}',
  season_applicable TEXT[] DEFAULT '{}',
  risk_weight NUMERIC DEFAULT 1.0,
  scientific_source TEXT,
  alert_title_mr TEXT,
  alert_title_hi TEXT,
  alert_title_en TEXT,
  alert_message_mr TEXT,
  alert_message_hi TEXT,
  alert_message_en TEXT,
  alert_action_mr TEXT,
  alert_action_hi TEXT,
  alert_action_en TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Proactive Rules
CREATE TABLE IF NOT EXISTS proactive_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT UNIQUE NOT NULL,
  crop_code TEXT,
  stage_applicable TEXT[] DEFAULT '{}',
  alert_category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  condition_type TEXT NOT NULL CHECK (condition_type IN (
    'WEATHER', 'NDVI', 'SOIL', 'STAGE', 'COMPOUND', 'DISEASE_RISK', 'PEST_RISK'
  )),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  title_mr TEXT,
  title_hi TEXT,
  title_en TEXT NOT NULL,
  message_template_mr TEXT,
  message_template_hi TEXT,
  message_template_en TEXT NOT NULL,
  action_template_mr TEXT,
  action_template_hi TEXT,
  action_template_en TEXT,
  scientific_source TEXT,
  forecast_horizon_days INTEGER DEFAULT 0,
  probability_threshold NUMERIC DEFAULT 0.75,
  cooldown_hours INTEGER DEFAULT 72,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Performance indexes
CREATE INDEX IF NOT EXISTS idx_proactive_events_land ON proactive_events(land_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_events_unprocessed ON proactive_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_proactive_alerts_farmer ON proactive_alerts(farmer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_alerts_land ON proactive_alerts(land_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_alerts_status ON proactive_alerts(status) WHERE status IN ('PENDING', 'DELIVERED');
CREATE INDEX IF NOT EXISTS idx_proactive_rules_crop ON proactive_rules(crop_code, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_disease_risk_crop ON disease_risk_model(crop_code, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_decision_rules_proactive ON decision_rules(is_proactive_rule) WHERE is_proactive_rule = true;

-- 8. RLS Policies
ALTER TABLE proactive_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_evaluation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE disease_risk_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read proactive_rules" ON proactive_rules FOR SELECT USING (true);
CREATE POLICY "Public read disease_risk_model" ON disease_risk_model FOR SELECT USING (true);
CREATE POLICY "Service insert proactive_events" ON proactive_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Service select proactive_events" ON proactive_events FOR SELECT USING (true);
CREATE POLICY "Service update proactive_events" ON proactive_events FOR UPDATE USING (true);
CREATE POLICY "Service insert proactive_alerts" ON proactive_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Service select proactive_alerts" ON proactive_alerts FOR SELECT USING (true);
CREATE POLICY "Service update proactive_alerts" ON proactive_alerts FOR UPDATE USING (true);
CREATE POLICY "Service insert proactive_eval_log" ON proactive_evaluation_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Service select proactive_eval_log" ON proactive_evaluation_log FOR SELECT USING (true);

-- 9. Updated_at trigger
CREATE OR REPLACE FUNCTION update_proactive_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_proactive_alerts_updated_at
  BEFORE UPDATE ON proactive_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_proactive_alerts_updated_at();