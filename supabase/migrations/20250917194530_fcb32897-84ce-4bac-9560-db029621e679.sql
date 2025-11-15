-- Drop existing chat tables to rebuild with proper structure
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;

-- Create comprehensive AI chat history table with farmer isolation
CREATE TABLE public.ai_chat_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    farmer_id UUID NOT NULL,
    land_id UUID,
    session_title TEXT,
    session_type TEXT DEFAULT 'general', -- general, land_specific, crop_advisory, weather, disease
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    is_active BOOLEAN DEFAULT true,
    
    -- Performance indexes
    CONSTRAINT ai_chat_sessions_tenant_farmer_key UNIQUE (tenant_id, farmer_id, id)
);

-- Create messages table with comprehensive context
CREATE TABLE public.ai_chat_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    farmer_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- Context for AI training
    land_context JSONB, -- Contains land details at time of message
    crop_context JSONB, -- Contains crop details at time of message
    weather_context JSONB, -- Weather data at time of message
    location_context JSONB, -- GPS, region, zone data
    
    -- ICAR and agricultural zones
    agro_climatic_zone TEXT, -- ICAR defined zones
    soil_zone TEXT, -- Soil classification zone
    rainfall_zone TEXT, -- Rainfall pattern zone
    crop_season TEXT, -- Kharif, Rabi, Zaid
    
    -- Response metadata
    ai_model TEXT, -- Which AI model was used
    response_time_ms INTEGER,
    tokens_used INTEGER,
    feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_text TEXT,
    
    -- Attachments and media
    attachments JSONB DEFAULT '[]',
    image_urls TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Partition key for sharding
    partition_key INTEGER GENERATED ALWAYS AS (hashtext(tenant_id::text) % 100) STORED
);

-- Create agricultural zones reference table
CREATE TABLE public.agricultural_zones (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_code TEXT NOT NULL UNIQUE,
    zone_name TEXT NOT NULL,
    zone_type TEXT NOT NULL, -- 'icar_agro_climatic', 'icar_agro_ecological', 'world_fao', 'state_specific'
    country TEXT DEFAULT 'India',
    state TEXT,
    districts TEXT[],
    characteristics JSONB, -- Climate, soil, rainfall patterns
    recommended_crops TEXT[],
    farming_systems TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create AI training context table for storing enriched data
CREATE TABLE public.ai_training_context (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    context_type TEXT NOT NULL, -- 'crop_calendar', 'pest_disease', 'soil_health', 'market_prices'
    region TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    context_data JSONB NOT NULL,
    source TEXT, -- 'icar', 'state_agriculture', 'research_institute'
    validity_start DATE,
    validity_end DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat analytics table for performance monitoring
CREATE TABLE public.ai_chat_analytics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    farmer_id UUID NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_messages INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    avg_response_time_ms NUMERIC,
    satisfaction_score NUMERIC,
    topics JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    CONSTRAINT ai_chat_analytics_unique UNIQUE (tenant_id, farmer_id, date)
);

-- Create indexes for high performance (10M+ users)
CREATE INDEX idx_ai_chat_sessions_tenant_farmer ON public.ai_chat_sessions(tenant_id, farmer_id);
CREATE INDEX idx_ai_chat_sessions_land ON public.ai_chat_sessions(land_id) WHERE land_id IS NOT NULL;
CREATE INDEX idx_ai_chat_sessions_created ON public.ai_chat_sessions(created_at DESC);

CREATE INDEX idx_ai_chat_messages_session ON public.ai_chat_messages(session_id);
CREATE INDEX idx_ai_chat_messages_tenant_farmer ON public.ai_chat_messages(tenant_id, farmer_id);
CREATE INDEX idx_ai_chat_messages_created ON public.ai_chat_messages(created_at DESC);
CREATE INDEX idx_ai_chat_messages_partition ON public.ai_chat_messages(partition_key);

CREATE INDEX idx_agricultural_zones_code ON public.agricultural_zones(zone_code);
CREATE INDEX idx_agricultural_zones_type ON public.agricultural_zones(zone_type);
CREATE INDEX idx_agricultural_zones_state ON public.agricultural_zones(state) WHERE state IS NOT NULL;

CREATE INDEX idx_ai_training_context_type_region ON public.ai_training_context(context_type, region);
CREATE INDEX idx_ai_training_context_active ON public.ai_training_context(is_active) WHERE is_active = true;

CREATE INDEX idx_ai_chat_analytics_date ON public.ai_chat_analytics(date DESC);

-- Enable Row Level Security
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agricultural_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_training_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for farmer-based isolation (NOT auth.uid())

-- Sessions: Farmers can only access their own sessions
CREATE POLICY "Farmers can view own sessions" ON public.ai_chat_sessions
    FOR SELECT USING (
        tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND farmer_id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE POLICY "Farmers can create own sessions" ON public.ai_chat_sessions
    FOR INSERT WITH CHECK (
        tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND farmer_id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE POLICY "Farmers can update own sessions" ON public.ai_chat_sessions
    FOR UPDATE USING (
        tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND farmer_id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    );

-- Messages: Farmers can only access messages from their sessions
CREATE POLICY "Farmers can view own messages" ON public.ai_chat_messages
    FOR SELECT USING (
        tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND farmer_id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE POLICY "Farmers can create own messages" ON public.ai_chat_messages
    FOR INSERT WITH CHECK (
        tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND farmer_id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE POLICY "Farmers can update own messages" ON public.ai_chat_messages
    FOR UPDATE USING (
        tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND farmer_id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    );

-- Agricultural zones: Everyone can read
CREATE POLICY "Public read access to zones" ON public.agricultural_zones
    FOR SELECT USING (true);

-- Training context: Tenant-isolated read access
CREATE POLICY "Tenant isolated context access" ON public.ai_training_context
    FOR SELECT USING (
        tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND is_active = true
    );

-- Analytics: Farmers can view their own analytics
CREATE POLICY "Farmers can view own analytics" ON public.ai_chat_analytics
    FOR SELECT USING (
        tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND farmer_id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    );

-- Create function to set app context for farmer-based auth
CREATE OR REPLACE FUNCTION public.set_app_session(
    p_tenant_id UUID,
    p_farmer_id UUID,
    p_session_token TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.tenant_id', p_tenant_id::text, false);
    PERFORM set_config('app.farmer_id', p_farmer_id::text, false);
    IF p_session_token IS NOT NULL THEN
        PERFORM set_config('app.session_token', p_session_token, false);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get current farmer context
CREATE OR REPLACE FUNCTION public.get_current_farmer_context()
RETURNS TABLE(
    tenant_id UUID,
    farmer_id UUID,
    farmer_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.tenant_id,
        f.id as farmer_id,
        jsonb_build_object(
            'name', f.name,
            'mobile', f.mobile,
            'language', f.language,
            'location', f.location,
            'district', f.district,
            'state', f.state,
            'total_land_size', f.total_land_size
        ) as farmer_data
    FROM public.farmers f
    WHERE f.tenant_id = COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    AND f.id = COALESCE(current_setting('app.farmer_id', true)::uuid, '00000000-0000-0000-0000-000000000000'::uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_chat_sessions_updated_at BEFORE UPDATE ON public.ai_chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agricultural_zones_updated_at BEFORE UPDATE ON public.agricultural_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_training_context_updated_at BEFORE UPDATE ON public.ai_training_context
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample ICAR agricultural zones for India
INSERT INTO public.agricultural_zones (zone_code, zone_name, zone_type, country, characteristics, recommended_crops) VALUES
('ACZ-1', 'Western Himalayan Region', 'icar_agro_climatic', 'India', 
 '{"rainfall": "150-200cm", "temperature": "5-30°C", "soil": "Alluvial, forest, podzolic"}',
 ARRAY['Rice', 'Maize', 'Wheat', 'Apple', 'Walnut']),
('ACZ-2', 'Eastern Himalayan Region', 'icar_agro_climatic', 'India',
 '{"rainfall": "200-400cm", "temperature": "10-35°C", "soil": "Red sandy, laterite"}',
 ARRAY['Rice', 'Maize', 'Tea', 'Pineapple', 'Orange']),
('ACZ-3', 'Lower Gangetic Plains', 'icar_agro_climatic', 'India',
 '{"rainfall": "100-200cm", "temperature": "20-40°C", "soil": "Alluvial"}',
 ARRAY['Rice', 'Jute', 'Wheat', 'Potato', 'Mustard']),
('ACZ-4', 'Middle Gangetic Plains', 'icar_agro_climatic', 'India',
 '{"rainfall": "100-150cm", "temperature": "15-40°C", "soil": "Alluvial"}',
 ARRAY['Rice', 'Wheat', 'Maize', 'Sugarcane', 'Potato']),
('ACZ-5', 'Upper Gangetic Plains', 'icar_agro_climatic', 'India',
 '{"rainfall": "75-150cm", "temperature": "10-40°C", "soil": "Alluvial"}',
 ARRAY['Rice', 'Wheat', 'Sugarcane', 'Potato', 'Mustard'])
ON CONFLICT (zone_code) DO NOTHING;