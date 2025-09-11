-- Add farmer_name column to farmers table
ALTER TABLE public.farmers
ADD COLUMN IF NOT EXISTS farmer_name TEXT;

-- Update existing farmers to have a default name if needed
UPDATE public.farmers
SET farmer_name = COALESCE(farmer_name, 'Farmer ' || LEFT(id::TEXT, 8))
WHERE farmer_name IS NULL;