-- Create master languages table
CREATE TABLE IF NOT EXISTS public.master_languages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  native_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 999,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create white label config table
CREATE TABLE IF NOT EXISTS public.white_label_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  brand_identity JSONB DEFAULT '{}'::jsonb,
  app_customization JSONB DEFAULT '{}'::jsonb,
  color_scheme JSONB DEFAULT '{}'::jsonb,
  logo_url TEXT,
  favicon_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.master_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.white_label_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for master_languages
CREATE POLICY "Anyone can view active languages" 
ON public.master_languages FOR SELECT 
USING (is_active = true);

CREATE POLICY "Only super admins can manage languages" 
ON public.master_languages FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.admin_users 
  WHERE id = auth.uid() 
  AND role = 'super_admin' 
  AND is_active = true
));

-- RLS Policies for white_label_config
CREATE POLICY "Anyone can view white label config" 
ON public.white_label_config FOR SELECT 
USING (true);

CREATE POLICY "Tenant admins can manage their white label config" 
ON public.white_label_config FOR ALL 
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.user_tenants 
    WHERE user_id = auth.uid() 
    AND role IN ('tenant_owner', 'tenant_admin')
    AND is_active = true
  )
);

-- Insert default languages
INSERT INTO public.master_languages (code, name, native_name, display_order) VALUES
  ('hi', 'Hindi', 'हिन्दी', 1),
  ('en', 'English', 'English', 2),
  ('pa', 'Punjabi', 'ਪੰਜਾਬੀ', 3),
  ('mr', 'Marathi', 'मराठी', 4),
  ('ta', 'Tamil', 'தமிழ்', 5),
  ('te', 'Telugu', 'తెలుగు', 6),
  ('bn', 'Bengali', 'বাংলা', 7),
  ('gu', 'Gujarati', 'ગુજરાતી', 8),
  ('kn', 'Kannada', 'ಕನ್ನಡ', 9),
  ('ml', 'Malayalam', 'മലയാളം', 10),
  ('or', 'Odia', 'ଓଡ଼ିଆ', 11),
  ('as', 'Assamese', 'অসমীয়া', 12),
  ('ur', 'Urdu', 'اردو', 13),
  ('sa', 'Sanskrit', 'संस्कृतम्', 14)
ON CONFLICT (code) DO NOTHING;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_master_languages_updated_at 
BEFORE UPDATE ON public.master_languages
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_white_label_config_updated_at 
BEFORE UPDATE ON public.white_label_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();