-- Create soil types table
CREATE TABLE public.soil_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create water sources table
CREATE TABLE public.water_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create crop groups table
CREATE TABLE public.crop_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create crops table
CREATE TABLE public.crops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  label_local TEXT, -- Local language label
  crop_group_id UUID REFERENCES public.crop_groups(id) ON DELETE SET NULL,
  description TEXT,
  season TEXT, -- kharif, rabi, zaid
  duration_days INTEGER, -- Average crop duration
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create irrigation types table
CREATE TABLE public.irrigation_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for all tables
ALTER TABLE public.soil_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irrigation_types ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (these are reference data)
CREATE POLICY "Anyone can read soil types" ON public.soil_types
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read water sources" ON public.water_sources
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read crop groups" ON public.crop_groups
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read crops" ON public.crops
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read irrigation types" ON public.irrigation_types
  FOR SELECT USING (true);

-- Insert initial data for soil types
INSERT INTO public.soil_types (value, label) VALUES
  ('black_cotton', 'Black Cotton Soil'),
  ('red', 'Red Soil'),
  ('alluvial', 'Alluvial Soil'),
  ('laterite', 'Laterite Soil'),
  ('clay', 'Clay Soil'),
  ('sandy', 'Sandy Soil'),
  ('loamy', 'Loamy Soil'),
  ('saline', 'Saline Soil'),
  ('peaty', 'Peaty Soil');

-- Insert initial data for water sources
INSERT INTO public.water_sources (value, label) VALUES
  ('well', 'Well'),
  ('borewell', 'Borewell'),
  ('canal', 'Canal'),
  ('river', 'River'),
  ('pond', 'Pond'),
  ('dam', 'Dam'),
  ('rainwater', 'Rainwater Harvesting'),
  ('municipal', 'Municipal Supply');

-- Insert initial data for crop groups
INSERT INTO public.crop_groups (value, label, display_order) VALUES
  ('kharif', 'Kharif Crops', 1),
  ('rabi', 'Rabi Crops', 2),
  ('vegetables', 'Vegetables', 3),
  ('fruits', 'Fruits', 4),
  ('cash_crops', 'Cash Crops', 5);

-- Insert initial data for crops (Kharif)
INSERT INTO public.crops (value, label, label_local, crop_group_id, season) 
SELECT 
  value,
  label,
  label_local,
  (SELECT id FROM public.crop_groups WHERE value = 'kharif'),
  'kharif'
FROM (VALUES
  ('rice', 'Rice', 'धान'),
  ('cotton', 'Cotton', 'कपास'),
  ('sugarcane', 'Sugarcane', 'गन्ना'),
  ('maize', 'Maize', 'मक्का'),
  ('soybean', 'Soybean', 'सोयाबीन'),
  ('groundnut', 'Groundnut', 'मूंगफली'),
  ('jowar', 'Jowar', 'ज्वार'),
  ('bajra', 'Bajra', 'बाजरा'),
  ('tur', 'Tur/Arhar', 'तूर')
) AS t(value, label, label_local);

-- Insert initial data for crops (Rabi)
INSERT INTO public.crops (value, label, label_local, crop_group_id, season)
SELECT 
  value,
  label,
  label_local,
  (SELECT id FROM public.crop_groups WHERE value = 'rabi'),
  'rabi'
FROM (VALUES
  ('wheat', 'Wheat', 'गेहूं'),
  ('mustard', 'Mustard', 'सरसों'),
  ('gram', 'Gram', 'चना'),
  ('peas', 'Peas', 'मटर'),
  ('barley', 'Barley', 'जौ'),
  ('linseed', 'Linseed', 'अलसी'),
  ('masoor', 'Masoor', 'मसूर')
) AS t(value, label, label_local);

-- Insert initial data for crops (Vegetables)
INSERT INTO public.crops (value, label, label_local, crop_group_id)
SELECT 
  value,
  label,
  label_local,
  (SELECT id FROM public.crop_groups WHERE value = 'vegetables')
FROM (VALUES
  ('tomato', 'Tomato', 'टमाटर'),
  ('onion', 'Onion', 'प्याज'),
  ('potato', 'Potato', 'आलू'),
  ('chili', 'Chili', 'मिर्च'),
  ('brinjal', 'Brinjal', 'बैंगन'),
  ('okra', 'Okra', 'भिंडी'),
  ('cabbage', 'Cabbage', 'पत्तागोभी'),
  ('cauliflower', 'Cauliflower', 'फूलगोभी'),
  ('carrot', 'Carrot', 'गाजर'),
  ('radish', 'Radish', 'मूली'),
  ('spinach', 'Spinach', 'पालक'),
  ('bottle_gourd', 'Bottle Gourd', 'लौकी'),
  ('bitter_gourd', 'Bitter Gourd', 'करेला'),
  ('cucumber', 'Cucumber', 'खीरा')
) AS t(value, label, label_local);

-- Insert initial data for crops (Fruits)
INSERT INTO public.crops (value, label, label_local, crop_group_id)
SELECT 
  value,
  label,
  label_local,
  (SELECT id FROM public.crop_groups WHERE value = 'fruits')
FROM (VALUES
  ('mango', 'Mango', 'आम'),
  ('banana', 'Banana', 'केला'),
  ('papaya', 'Papaya', 'पपीता'),
  ('guava', 'Guava', 'अमरूद'),
  ('pomegranate', 'Pomegranate', 'अनार'),
  ('grapes', 'Grapes', 'अंगूर'),
  ('orange', 'Orange', 'संतरा'),
  ('lemon', 'Lemon', 'नींबू'),
  ('watermelon', 'Watermelon', 'तरबूज'),
  ('muskmelon', 'Muskmelon', 'खरबूजा')
) AS t(value, label, label_local);

-- Insert initial data for crops (Cash Crops)
INSERT INTO public.crops (value, label, label_local, crop_group_id)
SELECT 
  value,
  label,
  label_local,
  (SELECT id FROM public.crop_groups WHERE value = 'cash_crops')
FROM (VALUES
  ('coffee', 'Coffee', 'कॉफी'),
  ('tea', 'Tea', 'चाय'),
  ('rubber', 'Rubber', 'रबर'),
  ('coconut', 'Coconut', 'नारियल'),
  ('arecanut', 'Arecanut', 'सुपारी'),
  ('cashew', 'Cashew', 'काजू'),
  ('spices', 'Spices', 'मसाले')
) AS t(value, label, label_local);

-- Insert initial data for irrigation types
INSERT INTO public.irrigation_types (value, label) VALUES
  ('drip', 'Drip Irrigation'),
  ('sprinkler', 'Sprinkler Irrigation'),
  ('flood', 'Flood Irrigation'),
  ('furrow', 'Furrow Irrigation'),
  ('rainfed', 'Rainfed'),
  ('canal', 'Canal Irrigation'),
  ('tubewell', 'Tubewell'),
  ('mixed', 'Mixed Methods');