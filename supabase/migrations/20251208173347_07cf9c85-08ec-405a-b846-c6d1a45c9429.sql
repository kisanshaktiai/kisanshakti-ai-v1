-- Drop the existing constraint first
ALTER TABLE public.crop_schedules DROP CONSTRAINT IF EXISTS crop_schedules_farming_type_check;

-- Update old values to new naming convention
UPDATE public.crop_schedules SET farming_type = 'organic_only' WHERE farming_type = 'organic';
UPDATE public.crop_schedules SET farming_type = 'fertilizer_pesticide' WHERE farming_type = 'conventional';

-- Update any remaining invalid values
UPDATE public.crop_schedules 
SET farming_type = 'organic_fertilizer' 
WHERE farming_type IS NULL OR farming_type NOT IN ('organic_only', 'organic_fertilizer', 'fertilizer_pesticide');

-- Add updated constraint with new 3 farming type values
ALTER TABLE public.crop_schedules 
ADD CONSTRAINT crop_schedules_farming_type_check 
CHECK (farming_type IN ('organic_only', 'organic_fertilizer', 'fertilizer_pesticide'));