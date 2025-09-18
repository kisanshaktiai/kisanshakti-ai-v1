-- Create chat_feedback table for storing user feedback on AI responses
CREATE TABLE IF NOT EXISTS public.chat_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  land_id UUID,
  chat_message_id UUID NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('like', 'dislike')),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on chat_feedback
ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for chat_feedback
CREATE POLICY "Farmers can manage own feedback" ON public.chat_feedback
  FOR ALL USING (
    tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid) AND
    farmer_id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Add columns to ai_chat_messages if they don't exist
ALTER TABLE public.ai_chat_messages 
ADD COLUMN IF NOT EXISTS land_id UUID,
ADD COLUMN IF NOT EXISTS is_greeting BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS ndvi_score NUMERIC,
ADD COLUMN IF NOT EXISTS land_size NUMERIC,
ADD COLUMN IF NOT EXISTS crop_name TEXT,
ADD COLUMN IF NOT EXISTS crop_stage TEXT,
ADD COLUMN IF NOT EXISTS weather_snapshot JSONB,
ADD COLUMN IF NOT EXISTS question_text TEXT,
ADD COLUMN IF NOT EXISTS ai_answer_text TEXT;

-- Add columns to ai_chat_sessions if they don't exist
ALTER TABLE public.ai_chat_sessions
ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS is_general BOOLEAN DEFAULT true;

-- Add columns to farmers table for regional greetings
ALTER TABLE public.farmers
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS district TEXT,
ADD COLUMN IF NOT EXISTS village TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS language TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS preferred_honorific TEXT;

-- Create function to get farmer greeting based on region
CREATE OR REPLACE FUNCTION public.get_farmer_greeting(
  p_farmer_id UUID,
  p_tenant_id UUID
) RETURNS TABLE (
  name TEXT,
  honorific TEXT,
  greeting TEXT,
  language TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(f.farmer_name, 'किसान मित्र') as name,
    CASE 
      WHEN f.state = 'Maharashtra' AND f.location IN ('Mumbai', 'Thane', 'Raigad', 'Ratnagiri', 'Sindhudurg') THEN 'काका'
      WHEN f.state = 'Maharashtra' AND f.location IN ('Pune', 'Satara', 'Sangli', 'Kolhapur') THEN 'दादा'
      WHEN f.state = 'Maharashtra' AND f.gender = 'female' THEN 'ताई'
      WHEN f.state = 'Punjab' THEN 'ਪਾਜੀ'
      WHEN f.state = 'Tamil Nadu' THEN 'அண்ணா'
      WHEN f.state = 'Gujarat' THEN 'ભાઈ'
      WHEN f.state = 'West Bengal' THEN 'দাদা'
      WHEN f.state = 'Karnataka' THEN 'ಅಣ್ಣ'
      WHEN f.state = 'Andhra Pradesh' OR f.state = 'Telangana' THEN 'గారు'
      WHEN f.state = 'Kerala' THEN 'ചേട്ടാ'
      WHEN f.state = 'Rajasthan' THEN 'भाई साहब'
      WHEN f.state = 'Bihar' OR f.state = 'Uttar Pradesh' THEN 'भैया'
      WHEN f.state = 'Odisha' THEN 'ଭାଇ'
      WHEN f.state = 'Assam' THEN 'দাদা'
      ELSE COALESCE(f.preferred_honorific, 'जी')
    END as honorific,
    CASE 
      WHEN COALESCE(f.language, f.language_preference) = 'mr' THEN 'नमस्कार'
      WHEN COALESCE(f.language, f.language_preference) = 'hi' THEN 'नमस्ते'
      WHEN COALESCE(f.language, f.language_preference) = 'pa' THEN 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ'
      WHEN COALESCE(f.language, f.language_preference) = 'ta' THEN 'வணக்கம்'
      WHEN COALESCE(f.language, f.language_preference) = 'gu' THEN 'નમસ્તે'
      WHEN COALESCE(f.language, f.language_preference) = 'bn' THEN 'নমস্কার'
      WHEN COALESCE(f.language, f.language_preference) = 'kn' THEN 'ನಮಸ್ಕಾರ'
      WHEN COALESCE(f.language, f.language_preference) = 'te' THEN 'నమస్తే'
      WHEN COALESCE(f.language, f.language_preference) = 'ml' THEN 'നമസ്കാരം'
      WHEN COALESCE(f.language, f.language_preference) = 'or' THEN 'ନମସ୍କାର'
      WHEN COALESCE(f.language, f.language_preference) = 'as' THEN 'নমস্কাৰ'
      ELSE 'Welcome'
    END as greeting,
    COALESCE(f.language, f.language_preference, 'en') as language
  FROM public.farmers f
  WHERE f.id = p_farmer_id 
    AND f.tenant_id = p_tenant_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for land agent context using existing weather tables
CREATE OR REPLACE VIEW public.land_agent_context AS
SELECT 
  l.id as land_id,
  l.tenant_id,
  l.farmer_id,
  l.name as land_name,
  l.area_acres,
  l.area_guntas,
  l.soil_type,
  l.water_source,
  l.irrigation_type,
  l.current_crop,
  l.previous_crop,
  l.cultivation_date,
  l.last_harvest_date,
  l.state,
  l.district,
  l.taluka,
  l.village,
  l.survey_number,
  l.boundary_polygon_old,
  l.center_point_old,
  f.farmer_name,
  f.mobile_number as farmer_phone,
  COALESCE(f.language, f.language_preference) as farmer_language,
  f.location as farmer_location,
  -- Current weather data from existing tables
  COALESCE(
    (SELECT jsonb_build_object(
      'current', jsonb_build_object(
        'temperature', wc.temperature,
        'humidity', wc.humidity,
        'condition', wc.weather_condition,
        'wind_speed', wc.wind_speed,
        'rainfall', wc.rainfall,
        'last_updated', wc.last_updated
      ),
      'forecast', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'date', wf.forecast_date,
            'temperature_max', wf.temperature_max,
            'temperature_min', wf.temperature_min,
            'humidity', wf.humidity,
            'rainfall', wf.rainfall_probability,
            'condition', wf.weather_condition
          ) ORDER BY wf.forecast_date ASC
        ) FROM public.weather_forecast wf
        WHERE wf.tenant_id = l.tenant_id 
          AND wf.farmer_id = l.farmer_id
          AND wf.forecast_date >= CURRENT_DATE
          AND wf.forecast_date <= CURRENT_DATE + INTERVAL '7 days'
        LIMIT 7),
        '[]'::jsonb
      ),
      'historical', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'date', wh.date,
            'temperature_max', wh.temperature_max,
            'temperature_min', wh.temperature_min,
            'humidity', wh.humidity,
            'rainfall', wh.rainfall,
            'condition', wh.weather_condition
          ) ORDER BY wh.date DESC
        ) FROM public.weather_historical wh
        WHERE wh.tenant_id = l.tenant_id 
          AND wh.farmer_id = l.farmer_id
          AND wh.date >= CURRENT_DATE - INTERVAL '7 days'
        LIMIT 7),
        '[]'::jsonb
      )
    ) FROM public.weather_current wc
    WHERE wc.tenant_id = l.tenant_id 
      AND wc.farmer_id = l.farmer_id
    LIMIT 1),
    jsonb_build_object(
      'current', '{}',
      'forecast', '[]',
      'historical', '[]'
    )
  ) as weather_data
FROM public.lands l
JOIN public.farmers f ON f.id = l.farmer_id AND f.tenant_id = l.tenant_id
WHERE l.is_active = true;