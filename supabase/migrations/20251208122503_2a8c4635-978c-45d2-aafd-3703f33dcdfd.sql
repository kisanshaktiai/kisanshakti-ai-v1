-- ═══════════════════════════════════════════════════════════════════════
-- AI CROP SCHEDULE ENHANCEMENT - Stage-Based System with Yield Boosting
-- ═══════════════════════════════════════════════════════════════════════

-- Add new columns to schedule_tasks for stage-based tracking
ALTER TABLE public.schedule_tasks 
ADD COLUMN IF NOT EXISTS stage_key TEXT,
ADD COLUMN IF NOT EXISTS stage_order INTEGER,
ADD COLUMN IF NOT EXISTS stage_name TEXT,
ADD COLUMN IF NOT EXISTS yield_impact TEXT,
ADD COLUMN IF NOT EXISTS skip_penalty TEXT,
ADD COLUMN IF NOT EXISTS yield_boost_technique TEXT,
ADD COLUMN IF NOT EXISTS product_recommendations JSONB DEFAULT '[]'::jsonb;

-- Add comments for new columns
COMMENT ON COLUMN public.schedule_tasks.stage_key IS 'Farming stage key from farming_stages table';
COMMENT ON COLUMN public.schedule_tasks.stage_order IS 'Order of farming stage (1-9)';
COMMENT ON COLUMN public.schedule_tasks.stage_name IS 'Display name of farming stage';
COMMENT ON COLUMN public.schedule_tasks.yield_impact IS 'How this task impacts yield (3x-7x boost)';
COMMENT ON COLUMN public.schedule_tasks.skip_penalty IS 'What farmer loses if task is skipped';
COMMENT ON COLUMN public.schedule_tasks.yield_boost_technique IS 'Specific yield boosting technique applied';
COMMENT ON COLUMN public.schedule_tasks.product_recommendations IS 'JSONB array of recommended products with details';

-- Add indexes for stage-based queries
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_stage_key ON public.schedule_tasks(stage_key);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_stage_order ON public.schedule_tasks(stage_order);

-- Add new columns to crop_schedules for enhanced cost tracking
ALTER TABLE public.crop_schedules 
ADD COLUMN IF NOT EXISTS cost_by_stage JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS cost_by_category JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS yield_multiplier_target NUMERIC DEFAULT 3.0,
ADD COLUMN IF NOT EXISTS yield_boosting_techniques JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS stages_covered JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS products_recommended_count INTEGER DEFAULT 0;

-- Add comments for new crop_schedules columns
COMMENT ON COLUMN public.crop_schedules.cost_by_stage IS 'Cost breakdown by each farming stage';
COMMENT ON COLUMN public.crop_schedules.cost_by_category IS 'Cost breakdown by category (seed, organic, fertilizer, labor, etc.)';
COMMENT ON COLUMN public.crop_schedules.yield_multiplier_target IS 'Target yield multiplier (3x-7x)';
COMMENT ON COLUMN public.crop_schedules.yield_boosting_techniques IS 'JSONB array of yield boosting techniques used';
COMMENT ON COLUMN public.crop_schedules.stages_covered IS 'JSONB array of farming stages covered in schedule';
COMMENT ON COLUMN public.crop_schedules.products_recommended_count IS 'Total count of products recommended';