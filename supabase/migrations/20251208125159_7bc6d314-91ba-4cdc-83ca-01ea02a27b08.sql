-- ═══════════════════════════════════════════════════════════════════════
-- AI CROP SCHEDULE ENHANCEMENT - Farming Type, Water & Weather Monitoring
-- ═══════════════════════════════════════════════════════════════════════

-- Add farming_type to crop_schedules (Organic vs Fertilizer-based)
ALTER TABLE public.crop_schedules 
ADD COLUMN IF NOT EXISTS farming_type TEXT DEFAULT 'mixed' 
CHECK (farming_type IN ('organic', 'fertilizer', 'mixed'));

COMMENT ON COLUMN public.crop_schedules.farming_type IS 'organic: only organic inputs, fertilizer: chemical + some organic, mixed: balanced';

-- Add water requirement columns
ALTER TABLE public.crop_schedules 
ADD COLUMN IF NOT EXISTS water_requirement_liters_total NUMERIC,
ADD COLUMN IF NOT EXISTS water_per_irrigation_liters NUMERIC,
ADD COLUMN IF NOT EXISTS irrigation_count_total INTEGER,
ADD COLUMN IF NOT EXISTS weather_auto_update_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_weather_check TIMESTAMP WITH TIME ZONE;

-- Add water and product type to schedule_tasks
ALTER TABLE public.schedule_tasks 
ADD COLUMN IF NOT EXISTS water_required_liters NUMERIC,
ADD COLUMN IF NOT EXISTS product_type TEXT CHECK (product_type IN ('organic', 'growth_promoter', 'fertilizer', 'pesticide', 'none'));

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_crop_schedules_farming_type ON public.crop_schedules(farming_type);
CREATE INDEX IF NOT EXISTS idx_crop_schedules_weather_update ON public.crop_schedules(weather_auto_update_enabled) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_product_type ON public.schedule_tasks(product_type);

-- Add comments
COMMENT ON COLUMN public.crop_schedules.water_requirement_liters_total IS 'Total water needed for entire crop cycle in liters';
COMMENT ON COLUMN public.crop_schedules.water_per_irrigation_liters IS 'Water required per single irrigation event';
COMMENT ON COLUMN public.crop_schedules.irrigation_count_total IS 'Total number of irrigation events for crop cycle';
COMMENT ON COLUMN public.crop_schedules.weather_auto_update_enabled IS 'Enable automatic weather-based schedule updates';
COMMENT ON COLUMN public.crop_schedules.last_weather_check IS 'Last time weather was checked for this schedule';
COMMENT ON COLUMN public.schedule_tasks.water_required_liters IS 'Water needed for this specific task';
COMMENT ON COLUMN public.schedule_tasks.product_type IS 'Type of product: organic, growth_promoter, fertilizer, pesticide, or none';