-- Add missing columns and training-data ready fields to crop_schedules
ALTER TABLE public.crop_schedules 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'failed')),
ADD COLUMN IF NOT EXISTS total_duration_days integer,
ADD COLUMN IF NOT EXISTS expected_profit numeric,
ADD COLUMN IF NOT EXISTS total_labor_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_material_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',

-- Training data specific fields
ADD COLUMN IF NOT EXISTS suitability_score numeric,
ADD COLUMN IF NOT EXISTS suitability_warnings jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS recommendation_order text DEFAULT 'organic → growth_promoter → fertilizer → pesticide',
ADD COLUMN IF NOT EXISTS state_region text,
ADD COLUMN IF NOT EXISTS labor_rate_used numeric,

-- Input tracking for training
ADD COLUMN IF NOT EXISTS input_soil_data jsonb,
ADD COLUMN IF NOT EXISTS input_weather_data jsonb,
ADD COLUMN IF NOT EXISTS input_land_coordinates jsonb,
ADD COLUMN IF NOT EXISTS agro_climatic_zone text,

-- Outcome tracking for model feedback
ADD COLUMN IF NOT EXISTS actual_yield_quintals numeric,
ADD COLUMN IF NOT EXISTS actual_total_cost numeric,
ADD COLUMN IF NOT EXISTS actual_profit numeric,
ADD COLUMN IF NOT EXISTS actual_harvest_date date,
ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamp with time zone,

-- Quality metrics for training
ADD COLUMN IF NOT EXISTS farmer_rating integer CHECK (farmer_rating >= 1 AND farmer_rating <= 5),
ADD COLUMN IF NOT EXISTS farmer_feedback text,
ADD COLUMN IF NOT EXISTS schedule_accuracy_score numeric,
ADD COLUMN IF NOT EXISTS tasks_completed_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tasks_total_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tasks_on_time_count integer DEFAULT 0,

-- Training pipeline flags
ADD COLUMN IF NOT EXISTS is_training_candidate boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS training_processed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS training_excluded_reason text,
ADD COLUMN IF NOT EXISTS training_batch_id text,
ADD COLUMN IF NOT EXISTS data_quality_score numeric;

-- Add indexes for training data queries
CREATE INDEX IF NOT EXISTS idx_crop_schedules_training ON public.crop_schedules (is_training_candidate, training_processed) WHERE is_training_candidate = true;
CREATE INDEX IF NOT EXISTS idx_crop_schedules_status ON public.crop_schedules (status);
CREATE INDEX IF NOT EXISTS idx_crop_schedules_region ON public.crop_schedules (state_region, agro_climatic_zone);
CREATE INDEX IF NOT EXISTS idx_crop_schedules_crop ON public.crop_schedules (crop_name, crop_variety);
CREATE INDEX IF NOT EXISTS idx_crop_schedules_outcome ON public.crop_schedules (actual_yield_quintals, farmer_rating) WHERE actual_yield_quintals IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE public.crop_schedules IS 'AI-generated crop schedules with training data fields for model improvement. Tracks predictions vs actuals for feedback loop.';
COMMENT ON COLUMN public.crop_schedules.is_training_candidate IS 'Flag indicating if this record should be used for model training';
COMMENT ON COLUMN public.crop_schedules.data_quality_score IS 'Computed score (0-100) indicating data completeness and reliability for training';
COMMENT ON COLUMN public.crop_schedules.suitability_score IS 'AI-computed crop suitability score (0-100) for the land/region/season';
COMMENT ON COLUMN public.crop_schedules.recommendation_order IS 'Priority order used: organic → growth_promoter → fertilizer → pesticide';