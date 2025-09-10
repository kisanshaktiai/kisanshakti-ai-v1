-- Add missing fields to lands table
ALTER TABLE public.lands 
ADD COLUMN IF NOT EXISTS last_crop VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_harvest_date DATE,
ADD COLUMN IF NOT EXISTS irrigation_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS expected_harvest_date DATE;