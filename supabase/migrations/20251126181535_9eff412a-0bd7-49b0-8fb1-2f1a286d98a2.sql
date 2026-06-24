-- Voice Navigation System Database Schema
-- Comprehensive tables for AI-powered voice navigation with training data storage

-- 1. Voice Navigation Intents Table
-- Stores multilingual intent patterns for voice commands
CREATE TABLE IF NOT EXISTS public.voice_navigation_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  intent_id TEXT NOT NULL,
  language_code TEXT NOT NULL,
  patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  synonyms JSONB DEFAULT '[]'::jsonb,
  action TEXT NOT NULL,
  route TEXT,
  params JSONB DEFAULT '{}'::jsonb,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  is_offline BOOLEAN DEFAULT true,
  response_template JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies for voice_navigation_intents
ALTER TABLE public.voice_navigation_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Intents are viewable by tenant users"
  ON public.voice_navigation_intents FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY "Intents are insertable by tenant users"
  ON public.voice_navigation_intents FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY "Intents are updatable by tenant users"
  ON public.voice_navigation_intents FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Indexes
CREATE INDEX idx_voice_intents_tenant_lang ON public.voice_navigation_intents(tenant_id, language_code);
CREATE INDEX idx_voice_intents_intent_id ON public.voice_navigation_intents(intent_id);
CREATE INDEX idx_voice_intents_active ON public.voice_navigation_intents(is_active) WHERE is_active = true;

-- 2. Voice Suggestions Table
CREATE TABLE IF NOT EXISTS public.voice_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  category TEXT NOT NULL,
  suggestion_text TEXT NOT NULL,
  phonetic_hint TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.voice_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Suggestions are viewable by tenant users"
  ON public.voice_suggestions FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE INDEX idx_voice_suggestions_tenant_lang ON public.voice_suggestions(tenant_id, language_code);
CREATE INDEX idx_voice_suggestions_category ON public.voice_suggestions(category);

-- 3. Voice Training Samples Table
CREATE TABLE IF NOT EXISTS public.voice_training_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  audio_url TEXT NOT NULL,
  transcript TEXT,
  detected_language TEXT,
  intent_matched TEXT,
  confidence_score DECIMAL(3,2),
  was_correct BOOLEAN,
  corrected_intent TEXT,
  duration_ms INTEGER,
  consent_given BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.voice_training_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Training samples are viewable by owner"
  ON public.voice_training_samples FOR SELECT
  USING (
    tenant_id::text = current_setting('app.tenant_id', true) AND
    farmer_id::text = current_setting('app.farmer_id', true)
  );

CREATE POLICY "Training samples are insertable by owner"
  ON public.voice_training_samples FOR INSERT
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true) AND
    farmer_id::text = current_setting('app.farmer_id', true)
  );

CREATE INDEX idx_voice_training_tenant_farmer ON public.voice_training_samples(tenant_id, farmer_id);
CREATE INDEX idx_voice_training_consent ON public.voice_training_samples(consent_given) WHERE consent_given = true;

-- 4. Voice Sessions Table
CREATE TABLE IF NOT EXISTS public.voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  farmer_id UUID REFERENCES public.farmers(id) ON DELETE CASCADE,
  session_start TIMESTAMPTZ DEFAULT now(),
  session_end TIMESTAMPTZ,
  language_code TEXT,
  total_commands INTEGER DEFAULT 0,
  successful_commands INTEGER DEFAULT 0,
  failed_commands INTEGER DEFAULT 0,
  device_info JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sessions are viewable by owner"
  ON public.voice_sessions FOR SELECT
  USING (
    tenant_id::text = current_setting('app.tenant_id', true) AND
    (farmer_id::text = current_setting('app.farmer_id', true) OR farmer_id IS NULL)
  );

CREATE POLICY "Sessions are insertable by owner"
  ON public.voice_sessions FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY "Sessions are updatable by owner"
  ON public.voice_sessions FOR UPDATE
  USING (
    tenant_id::text = current_setting('app.tenant_id', true) AND
    (farmer_id::text = current_setting('app.farmer_id', true) OR farmer_id IS NULL)
  );

CREATE INDEX idx_voice_sessions_tenant_farmer ON public.voice_sessions(tenant_id, farmer_id);

-- 5. Voice Error Corrections Table
CREATE TABLE IF NOT EXISTS public.voice_error_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  farmer_id UUID REFERENCES public.farmers(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.voice_sessions(id) ON DELETE CASCADE,
  original_transcript TEXT NOT NULL,
  intended_action TEXT,
  suggested_phrases JSONB DEFAULT '[]'::jsonb,
  was_helpful BOOLEAN,
  language_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.voice_error_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Error corrections are viewable by owner"
  ON public.voice_error_corrections FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY "Error corrections are insertable by owner"
  ON public.voice_error_corrections FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE INDEX idx_voice_errors_tenant ON public.voice_error_corrections(tenant_id);

-- 6. Update Trigger
CREATE OR REPLACE FUNCTION public.update_voice_navigation_intents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_voice_navigation_intents_updated_at
  BEFORE UPDATE ON public.voice_navigation_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_voice_navigation_intents_updated_at();

-- 7. Storage Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-recordings', 'voice-recordings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload voice recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'voice-recordings' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view voice recordings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'voice-recordings' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );