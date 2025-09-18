-- Create chat_feedback table for storing user feedback on AI responses
CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  land_id UUID,
  chat_message_id UUID NOT NULL,
  session_id UUID,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('like', 'dislike', 'helpful', 'not_helpful')),
  feedback_text TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_feedback_tenant_farmer ON public.chat_feedback(tenant_id, farmer_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_message ON public.chat_feedback(chat_message_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_session ON public.chat_feedback(session_id);

-- Enable Row Level Security
ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Farmers can create their own feedback" 
ON public.chat_feedback 
FOR INSERT 
WITH CHECK (farmer_id = COALESCE(current_setting('app.farmer_id'::text, true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE POLICY "Farmers can view their own feedback" 
ON public.chat_feedback 
FOR SELECT 
USING (farmer_id = COALESCE(current_setting('app.farmer_id'::text, true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

-- Add missing columns to ai_chat_messages if they don't exist
ALTER TABLE public.ai_chat_messages 
ADD COLUMN IF NOT EXISTS land_size NUMERIC,
ADD COLUMN IF NOT EXISTS soil_type TEXT,
ADD COLUMN IF NOT EXISTS crop_name TEXT,
ADD COLUMN IF NOT EXISTS crop_stage TEXT,
ADD COLUMN IF NOT EXISTS weather_snapshot JSONB,
ADD COLUMN IF NOT EXISTS ndvi_score NUMERIC,
ADD COLUMN IF NOT EXISTS question_text TEXT,
ADD COLUMN IF NOT EXISTS ai_answer_text TEXT,
ADD COLUMN IF NOT EXISTS farmer_context JSONB;

-- Add columns to ai_chat_sessions for better tracking
ALTER TABLE public.ai_chat_sessions 
ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS agent_context JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create function to get farmer profile with regional honorifics
CREATE OR REPLACE FUNCTION public.get_farmer_greeting(p_farmer_id UUID, p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_honorific TEXT;
  v_greeting TEXT;
BEGIN
  -- Get farmer profile
  SELECT 
    up.full_name,
    up.state,
    up.district,
    up.language_preference,
    up.gender,
    f.farmer_name
  INTO v_profile
  FROM user_profiles up
  LEFT JOIN farmers f ON f.id = p_farmer_id
  WHERE (up.farmer_id = p_farmer_id OR f.id = p_farmer_id)
  LIMIT 1;
  
  -- Determine honorific based on region and gender
  IF v_profile.state ILIKE '%maharashtra%' THEN
    v_honorific := CASE 
      WHEN v_profile.gender = 'female' THEN 'Tai'
      ELSE COALESCE('Dada', 'Bhau')
    END;
  ELSIF v_profile.state ILIKE '%punjab%' THEN
    v_honorific := CASE 
      WHEN v_profile.gender = 'female' THEN 'Bhenji'
      ELSE 'Veerji'
    END;
  ELSIF v_profile.state ILIKE '%tamil%' THEN
    v_honorific := CASE 
      WHEN v_profile.gender = 'female' THEN 'Akka'
      ELSE 'Anna'
    END;
  ELSIF v_profile.state ILIKE '%gujarat%' THEN
    v_honorific := CASE 
      WHEN v_profile.gender = 'female' THEN 'Ben'
      ELSE 'Bhai'
    END;
  ELSIF v_profile.state ILIKE '%karnataka%' THEN
    v_honorific := CASE 
      WHEN v_profile.gender = 'female' THEN 'Akka'
      ELSE 'Anna'
    END;
  ELSE
    v_honorific := 'Ji';
  END IF;
  
  -- Create greeting
  v_greeting := COALESCE(v_profile.full_name, v_profile.farmer_name, 'Farmer');
  
  RETURN jsonb_build_object(
    'name', v_greeting,
    'honorific', v_honorific,
    'full_greeting', v_greeting || ' ' || v_honorific,
    'state', v_profile.state,
    'language', v_profile.language_preference
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for land agents context
CREATE OR REPLACE VIEW public.land_agent_context AS
SELECT 
  l.id as land_id,
  l.tenant_id,
  l.farmer_id,
  l.name as land_name,
  l.area_acres as land_size,
  l.soil_type,
  l.current_crop as crop_name,
  l.cultivation_date,
  l.state,
  l.district,
  l.village,
  l.boundary_coordinates,
  -- Calculate crop stage based on cultivation date
  CASE 
    WHEN l.cultivation_date IS NULL THEN NULL
    WHEN EXTRACT(DAY FROM (NOW() - l.cultivation_date)) < 30 THEN 'seedling'
    WHEN EXTRACT(DAY FROM (NOW() - l.cultivation_date)) < 60 THEN 'vegetative'
    WHEN EXTRACT(DAY FROM (NOW() - l.cultivation_date)) < 90 THEN 'flowering'
    ELSE 'harvest'
  END as crop_stage,
  -- Get latest weather data (placeholder - would connect to weather_data table)
  jsonb_build_object(
    'temperature', 28,
    'humidity', 65,
    'rainfall', 0,
    'wind_speed', 10
  ) as weather_snapshot,
  -- Get NDVI score (placeholder - would connect to ndvi_data table)
  0.75 as ndvi_score,
  -- Farmer profile
  up.full_name as farmer_name,
  up.language_preference,
  up.phone_number,
  -- Additional context
  l.created_at,
  l.updated_at
FROM lands l
LEFT JOIN user_profiles up ON up.farmer_id = l.farmer_id
WHERE l.is_active = true;

-- Grant access to the view
GRANT SELECT ON public.land_agent_context TO authenticated;