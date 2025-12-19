-- Create crop_growth_uploads table for storing farmer photo/video uploads
CREATE TABLE public.crop_growth_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  land_id UUID NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  thumbnail_url TEXT,
  upload_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  capture_location JSONB,
  weather_at_capture JSONB,
  ndvi_at_capture NUMERIC(4,3),
  notes TEXT,
  is_processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create crop_growth_analysis table for AI analysis results
CREATE TABLE public.crop_growth_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID NOT NULL REFERENCES public.crop_growth_uploads(id) ON DELETE CASCADE,
  land_id UUID NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  crop_current_status TEXT NOT NULL,
  detected_growth_stage TEXT,
  expected_growth_stage TEXT,
  growth_stage_deviation TEXT,
  visual_observation_summary TEXT NOT NULL,
  detected_issues JSONB,
  canopy_health_score NUMERIC(3,2),
  uniformity_score NUMERIC(3,2),
  ndvi_weather_correlation TEXT,
  signal_confidence TEXT CHECK (signal_confidence IN ('high', 'medium', 'low', 'needs_observation')),
  conflicting_signals JSONB,
  next_3_day_prediction TEXT,
  next_7_day_prediction TEXT,
  next_14_day_prediction TEXT,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB,
  yield_impact_estimate TEXT,
  recommended_actions JSONB NOT NULL,
  schedule_updates JSONB,
  farmer_message TEXT NOT NULL,
  farmer_message_language TEXT DEFAULT 'en',
  ai_model_used TEXT,
  processing_time_ms INTEGER,
  confidence_score NUMERIC(3,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create crop_growth_alerts table
CREATE TABLE public.crop_growth_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES public.crop_growth_analysis(id) ON DELETE SET NULL,
  land_id UUID NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('observation', 'action_required', 'critical_risk')),
  alert_category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'danger')),
  trigger_conditions JSONB,
  recommended_action TEXT,
  action_deadline TIMESTAMP WITH TIME ZONE,
  is_read BOOLEAN DEFAULT false,
  is_actioned BOOLEAN DEFAULT false,
  actioned_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create crop_growth_history table
CREATE TABLE public.crop_growth_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  land_id UUID NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  growth_stage TEXT,
  health_score NUMERIC(3,2),
  ndvi_value NUMERIC(4,3),
  weather_summary JSONB,
  issues_detected INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(land_id, record_date)
);

-- Enable RLS
ALTER TABLE public.crop_growth_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_growth_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_growth_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_growth_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crop_growth_uploads
CREATE POLICY "Users can view their own uploads" ON public.crop_growth_uploads
  FOR SELECT USING (auth.uid()::text = farmer_id::text);

CREATE POLICY "Users can create uploads" ON public.crop_growth_uploads
  FOR INSERT WITH CHECK (auth.uid()::text = farmer_id::text);

CREATE POLICY "Users can update their own uploads" ON public.crop_growth_uploads
  FOR UPDATE USING (auth.uid()::text = farmer_id::text);

CREATE POLICY "Users can delete their own uploads" ON public.crop_growth_uploads
  FOR DELETE USING (auth.uid()::text = farmer_id::text);

-- RLS Policies for crop_growth_analysis
CREATE POLICY "Users can view their own analysis" ON public.crop_growth_analysis
  FOR SELECT USING (auth.uid()::text = farmer_id::text);

CREATE POLICY "System can create analysis" ON public.crop_growth_analysis
  FOR INSERT WITH CHECK (true);

-- RLS Policies for crop_growth_alerts
CREATE POLICY "Users can view their own alerts" ON public.crop_growth_alerts
  FOR SELECT USING (auth.uid()::text = farmer_id::text);

CREATE POLICY "System can create alerts" ON public.crop_growth_alerts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own alerts" ON public.crop_growth_alerts
  FOR UPDATE USING (auth.uid()::text = farmer_id::text);

-- RLS Policies for crop_growth_history
CREATE POLICY "Users can view their own history" ON public.crop_growth_history
  FOR SELECT USING (auth.uid()::text = farmer_id::text);

CREATE POLICY "System can manage history" ON public.crop_growth_history
  FOR ALL USING (true);

-- Indexes
CREATE INDEX idx_crop_growth_uploads_land ON public.crop_growth_uploads(land_id);
CREATE INDEX idx_crop_growth_uploads_farmer ON public.crop_growth_uploads(farmer_id);
CREATE INDEX idx_crop_growth_uploads_timestamp ON public.crop_growth_uploads(upload_timestamp DESC);
CREATE INDEX idx_crop_growth_analysis_land ON public.crop_growth_analysis(land_id);
CREATE INDEX idx_crop_growth_analysis_created ON public.crop_growth_analysis(created_at DESC);
CREATE INDEX idx_crop_growth_alerts_land ON public.crop_growth_alerts(land_id);
CREATE INDEX idx_crop_growth_alerts_farmer_unread ON public.crop_growth_alerts(farmer_id) WHERE is_read = false;
CREATE INDEX idx_crop_growth_history_land_date ON public.crop_growth_history(land_id, record_date DESC);

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crop-growth-media',
  'crop-growth-media',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can view their crop media" ON storage.objects
  FOR SELECT USING (bucket_id = 'crop-growth-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload crop media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'crop-growth-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete crop media" ON storage.objects
  FOR DELETE USING (bucket_id = 'crop-growth-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trigger for updated_at
CREATE TRIGGER update_crop_growth_uploads_updated_at
  BEFORE UPDATE ON public.crop_growth_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.crop_growth_alerts;