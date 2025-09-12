-- Create master tables for location hierarchy
CREATE TABLE IF NOT EXISTS public.countries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  country_id UUID NOT NULL REFERENCES public.countries(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.districts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  state_id UUID NOT NULL REFERENCES public.states(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.talukas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  district_id UUID NOT NULL REFERENCES public.districts(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.villages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  taluka_id UUID NOT NULL REFERENCES public.talukas(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_states_country_id ON public.states(country_id);
CREATE INDEX idx_districts_state_id ON public.districts(state_id);
CREATE INDEX idx_talukas_district_id ON public.talukas(district_id);
CREATE INDEX idx_villages_taluka_id ON public.villages(taluka_id);

-- Enable RLS
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talukas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.villages ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Anyone can view countries" ON public.countries
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view states" ON public.states
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view districts" ON public.districts
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view talukas" ON public.talukas
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view villages" ON public.villages
  FOR SELECT USING (is_active = true);

-- Insert sample data for India
INSERT INTO public.countries (name, code) VALUES ('India', 'IN');

-- Insert sample states (focusing on major agricultural states)
WITH india AS (
  SELECT id FROM public.countries WHERE code = 'IN'
)
INSERT INTO public.states (name, code, country_id) VALUES
  ('Maharashtra', 'MH', (SELECT id FROM india)),
  ('Punjab', 'PB', (SELECT id FROM india)),
  ('Haryana', 'HR', (SELECT id FROM india)),
  ('Uttar Pradesh', 'UP', (SELECT id FROM india)),
  ('Gujarat', 'GJ', (SELECT id FROM india)),
  ('Karnataka', 'KA', (SELECT id FROM india)),
  ('Tamil Nadu', 'TN', (SELECT id FROM india)),
  ('Andhra Pradesh', 'AP', (SELECT id FROM india)),
  ('Telangana', 'TS', (SELECT id FROM india)),
  ('Madhya Pradesh', 'MP', (SELECT id FROM india));

-- Insert sample districts for Maharashtra
WITH mh AS (
  SELECT id FROM public.states WHERE code = 'MH'
)
INSERT INTO public.districts (name, state_id) VALUES
  ('Pune', (SELECT id FROM mh)),
  ('Nashik', (SELECT id FROM mh)),
  ('Ahmednagar', (SELECT id FROM mh)),
  ('Solapur', (SELECT id FROM mh)),
  ('Satara', (SELECT id FROM mh)),
  ('Kolhapur', (SELECT id FROM mh)),
  ('Aurangabad', (SELECT id FROM mh)),
  ('Nagpur', (SELECT id FROM mh));

-- Insert sample talukas for Pune district
WITH pune AS (
  SELECT id FROM public.districts WHERE name = 'Pune'
)
INSERT INTO public.talukas (name, district_id) VALUES
  ('Pune City', (SELECT id FROM pune)),
  ('Haveli', (SELECT id FROM pune)),
  ('Baramati', (SELECT id FROM pune)),
  ('Indapur', (SELECT id FROM pune)),
  ('Daund', (SELECT id FROM pune)),
  ('Shirur', (SELECT id FROM pune)),
  ('Khed', (SELECT id FROM pune)),
  ('Maval', (SELECT id FROM pune));

-- Insert sample villages for Baramati taluka
WITH baramati AS (
  SELECT id FROM public.talukas WHERE name = 'Baramati'
)
INSERT INTO public.villages (name, taluka_id) VALUES
  ('Baramati', (SELECT id FROM baramati)),
  ('Nira', (SELECT id FROM baramati)),
  ('Patas', (SELECT id FROM baramati)),
  ('Undavadi', (SELECT id FROM baramati)),
  ('Rui', (SELECT id FROM baramati)),
  ('Songaon', (SELECT id FROM baramati)),
  ('Malad', (SELECT id FROM baramati)),
  ('Karhati', (SELECT id FROM baramati));