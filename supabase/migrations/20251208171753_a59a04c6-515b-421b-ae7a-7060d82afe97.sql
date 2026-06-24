-- Add enhanced fields for detailed task information and regional dialect support

-- Add regional dialect zone and location details to crop_schedules
ALTER TABLE public.crop_schedules 
ADD COLUMN IF NOT EXISTS regional_dialect_zone TEXT,
ADD COLUMN IF NOT EXISTS district_name TEXT,
ADD COLUMN IF NOT EXISTS taluka_name TEXT;

-- Add detailed task fields to schedule_tasks
ALTER TABLE public.schedule_tasks
ADD COLUMN IF NOT EXISTS detailed_steps JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS yield_impact_details JSONB,
ADD COLUMN IF NOT EXISTS skip_penalty_details JSONB,
ADD COLUMN IF NOT EXISTS regional_terms JSONB DEFAULT '{}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN public.crop_schedules.regional_dialect_zone IS 'Regional dialect zone for language variations (e.g., vidarbha, marathwada, western_maha)';
COMMENT ON COLUMN public.crop_schedules.district_name IS 'District name for location-specific advice';
COMMENT ON COLUMN public.crop_schedules.taluka_name IS 'Taluka name for hyper-local advice';

COMMENT ON COLUMN public.schedule_tasks.detailed_steps IS 'Array of detailed step objects with timing, tools, weather conditions';
COMMENT ON COLUMN public.schedule_tasks.yield_impact_details IS 'Detailed yield impact with percentage, scientific reason, farmer benefit';
COMMENT ON COLUMN public.schedule_tasks.skip_penalty_details IS 'Detailed skip penalty with percentage loss, symptoms, recovery info';
COMMENT ON COLUMN public.schedule_tasks.regional_terms IS 'Region-specific terms used in this task (e.g., weeding term variations)';

-- Create index for regional queries
CREATE INDEX IF NOT EXISTS idx_crop_schedules_regional_dialect ON public.crop_schedules(regional_dialect_zone) WHERE regional_dialect_zone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crop_schedules_district ON public.crop_schedules(district_name) WHERE district_name IS NOT NULL;