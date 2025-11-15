-- ============================================
-- AI CROP SCHEDULING AND AGRI MARKETING SYSTEM
-- ============================================

-- 1. Enhanced schedule_tasks table for AI-driven tasks
CREATE TABLE IF NOT EXISTS public.ai_schedule_refinements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL,
  task_id UUID,
  refinement_type TEXT NOT NULL CHECK (refinement_type IN ('weather_adjustment', 'ndvi_adjustment', 'soil_adjustment', 'pest_alert', 'disease_alert', 'irrigation_optimization')),
  trigger_data JSONB NOT NULL,
  ai_reasoning TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  original_date DATE,
  new_date DATE,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  applied_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  land_id UUID NOT NULL
);

-- 2. Farmer alerts table
CREATE TABLE IF NOT EXISTS public.farmer_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  land_id UUID NOT NULL,
  schedule_id UUID,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('irrigation', 'fertilizer', 'pest_control', 'disease', 'harvest', 'weather_warning', 'soil_health')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  ai_reasoning TEXT,
  action_required TEXT,
  data_source JSONB,
  is_read BOOLEAN DEFAULT false,
  is_actioned BOOLEAN DEFAULT false,
  actioned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Marketing insights table for tenant/admin predictions
CREATE TABLE IF NOT EXISTS public.agri_marketing_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('fertilizer_demand', 'seed_demand', 'pesticide_demand', 'equipment_rental', 'harvest_season', 'crop_trend')),
  crop_type TEXT,
  region TEXT,
  predicted_demand_quantity DECIMAL,
  predicted_demand_unit TEXT,
  confidence_score DECIMAL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  time_window_start DATE NOT NULL,
  time_window_end DATE NOT NULL,
  affected_farmers_count INTEGER,
  affected_lands_count INTEGER,
  total_area_hectares DECIMAL,
  supporting_data JSONB NOT NULL,
  ai_reasoning TEXT NOT NULL,
  recommendations TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. AI decision log for model retraining
CREATE TABLE IF NOT EXISTS public.ai_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  farmer_id UUID,
  land_id UUID,
  schedule_id UUID,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('schedule_generation', 'schedule_refinement', 'alert_generation', 'marketing_prediction', 'pest_detection', 'disease_detection')),
  model_version TEXT,
  input_data JSONB NOT NULL,
  output_data JSONB NOT NULL,
  reasoning TEXT NOT NULL,
  confidence_score DECIMAL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  execution_time_ms INTEGER,
  weather_data JSONB,
  ndvi_data JSONB,
  soil_data JSONB,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  feedback_score INTEGER CHECK (feedback_score >= 1 AND feedback_score <= 5),
  feedback_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Schedule monitoring data
CREATE TABLE IF NOT EXISTS public.schedule_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  land_id UUID NOT NULL,
  check_date DATE NOT NULL,
  weather_conditions JSONB,
  ndvi_value DECIMAL,
  soil_moisture DECIMAL,
  soil_ph DECIMAL,
  npk_levels JSONB,
  pest_detected BOOLEAN DEFAULT false,
  disease_detected BOOLEAN DEFAULT false,
  health_score DECIMAL CHECK (health_score >= 0 AND health_score <= 100),
  alerts_generated INTEGER DEFAULT 0,
  refinements_applied INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Baseline crop guidelines (expert knowledge)
CREATE TABLE IF NOT EXISTS public.crop_baseline_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_name TEXT NOT NULL,
  crop_variety TEXT,
  region TEXT,
  soil_type TEXT,
  climate_zone TEXT,
  growth_duration_days INTEGER NOT NULL,
  stages JSONB NOT NULL, -- [{stage, days_from_sowing, tasks, npk_requirements, water_requirements}]
  optimal_temp_min DECIMAL,
  optimal_temp_max DECIMAL,
  water_requirement_mm INTEGER,
  fertilizer_schedule JSONB,
  common_pests JSONB,
  common_diseases JSONB,
  best_practices TEXT,
  source TEXT, -- e.g., 'ICAR', 'State Agriculture Dept', 'Research Paper'
  confidence_level TEXT CHECK (confidence_level IN ('low', 'medium', 'high', 'expert_verified')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS on all tables
ALTER TABLE public.ai_schedule_refinements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agri_marketing_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_baseline_guidelines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_schedule_refinements
CREATE POLICY "Farmers can view their own refinements"
  ON public.ai_schedule_refinements FOR SELECT
  USING (true); -- Public read for now, can be restricted based on auth

CREATE POLICY "System can insert refinements"
  ON public.ai_schedule_refinements FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Farmers can update refinement status"
  ON public.ai_schedule_refinements FOR UPDATE
  USING (true);

-- RLS Policies for farmer_alerts
CREATE POLICY "Farmers can view their alerts"
  ON public.farmer_alerts FOR SELECT
  USING (true);

CREATE POLICY "System can create alerts"
  ON public.farmer_alerts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Farmers can update alert status"
  ON public.farmer_alerts FOR UPDATE
  USING (true);

-- RLS Policies for agri_marketing_insights
CREATE POLICY "Tenant admins can view marketing insights"
  ON public.agri_marketing_insights FOR SELECT
  USING (true);

CREATE POLICY "System can create insights"
  ON public.agri_marketing_insights FOR INSERT
  WITH CHECK (true);

-- RLS Policies for ai_decision_log
CREATE POLICY "System can log decisions"
  ON public.ai_decision_log FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view decision logs"
  ON public.ai_decision_log FOR SELECT
  USING (true);

-- RLS Policies for schedule_monitoring
CREATE POLICY "Farmers can view their monitoring data"
  ON public.schedule_monitoring FOR SELECT
  USING (true);

CREATE POLICY "System can insert monitoring data"
  ON public.schedule_monitoring FOR INSERT
  WITH CHECK (true);

-- RLS Policies for crop_baseline_guidelines
CREATE POLICY "Everyone can view active guidelines"
  ON public.crop_baseline_guidelines FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage guidelines"
  ON public.crop_baseline_guidelines FOR ALL
  USING (true);

-- Indexes for performance
CREATE INDEX idx_refinements_schedule ON public.ai_schedule_refinements(schedule_id);
CREATE INDEX idx_refinements_status ON public.ai_schedule_refinements(status);
CREATE INDEX idx_refinements_created ON public.ai_schedule_refinements(created_at DESC);
CREATE INDEX idx_alerts_farmer ON public.farmer_alerts(farmer_id);
CREATE INDEX idx_alerts_read ON public.farmer_alerts(is_read);
CREATE INDEX idx_alerts_created ON public.farmer_alerts(created_at DESC);
CREATE INDEX idx_insights_tenant ON public.agri_marketing_insights(tenant_id);
CREATE INDEX idx_insights_time ON public.agri_marketing_insights(time_window_start, time_window_end);
CREATE INDEX idx_decision_log_created ON public.ai_decision_log(created_at DESC);
CREATE INDEX idx_monitoring_schedule ON public.schedule_monitoring(schedule_id);
CREATE INDEX idx_monitoring_date ON public.schedule_monitoring(check_date);
CREATE INDEX idx_baseline_crop ON public.crop_baseline_guidelines(crop_name, region);