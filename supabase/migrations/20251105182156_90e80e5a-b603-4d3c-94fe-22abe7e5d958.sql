-- Fix RLS policy for task_completions with proper type casting
DROP POLICY IF EXISTS "Farmers can create completions" ON task_completions;

CREATE POLICY "Farmers can create completions" 
ON task_completions FOR INSERT 
WITH CHECK (
  farmer_id = auth.uid() 
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id::text = (current_setting('request.headers', true)::json->>'x-farmer-id')
);

-- Also fix the SELECT policy
DROP POLICY IF EXISTS "Farmers can view their completions" ON task_completions;

CREATE POLICY "Farmers can view their completions" 
ON task_completions FOR SELECT 
USING (
  farmer_id = auth.uid() 
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id::text = (current_setting('request.headers', true)::json->>'x-farmer-id')
);

-- Create climate monitoring table
CREATE TABLE IF NOT EXISTS public.schedule_climate_monitoring (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES crop_schedules(id) ON DELETE CASCADE,
  
  monitoring_date DATE NOT NULL,
  rainfall_24h DECIMAL(10,2),
  ndvi_value DECIMAL(5,3),
  temperature_avg DECIMAL(5,2),
  
  adjustment_triggered BOOLEAN DEFAULT false,
  adjustment_reason TEXT,
  tasks_rescheduled INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(schedule_id, monitoring_date)
);

CREATE INDEX idx_climate_monitoring_schedule ON schedule_climate_monitoring(schedule_id);
CREATE INDEX idx_climate_monitoring_date ON schedule_climate_monitoring(monitoring_date);

ALTER TABLE schedule_climate_monitoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farmers can view their climate data" 
ON schedule_climate_monitoring FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM crop_schedules 
    WHERE crop_schedules.id = schedule_climate_monitoring.schedule_id 
    AND crop_schedules.farmer_id::text = (current_setting('request.headers', true)::json->>'x-farmer-id')
  )
);

CREATE POLICY "System can insert climate data" 
ON schedule_climate_monitoring FOR INSERT 
WITH CHECK (true);

-- Add climate columns to schedule_tasks
ALTER TABLE schedule_tasks 
ADD COLUMN IF NOT EXISTS climate_adjusted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_date_before_climate_adjust DATE,
ADD COLUMN IF NOT EXISTS climate_adjustment_reason TEXT;