-- Add missing fields to lands table if they don't exist
ALTER TABLE public.lands 
ADD COLUMN IF NOT EXISTS cultivation_date DATE,
ADD COLUMN IF NOT EXISTS notes TEXT;