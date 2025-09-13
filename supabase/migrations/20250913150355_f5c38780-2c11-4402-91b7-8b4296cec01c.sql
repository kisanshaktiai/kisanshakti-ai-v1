-- Create crop schedules table
CREATE TABLE public.crop_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  land_id UUID NOT NULL REFERENCES lands(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  
  -- Crop information
  crop_name TEXT NOT NULL,
  crop_variety TEXT,
  sowing_date DATE NOT NULL,
  expected_harvest_date DATE,
  
  -- Schedule metadata
  schedule_version INTEGER DEFAULT 1,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_weather_update TIMESTAMP WITH TIME ZONE,
  weather_data JSONB,
  
  -- AI generation details
  ai_model TEXT DEFAULT 'gpt-4o-mini',
  generation_params JSONB,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create schedule tasks table
CREATE TABLE public.schedule_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES crop_schedules(id) ON DELETE CASCADE,
  
  -- Task details
  task_date DATE NOT NULL,
  task_type TEXT NOT NULL, -- 'irrigation', 'fertilizer', 'pesticide', 'weeding', 'harvest', etc.
  task_name TEXT NOT NULL,
  task_description TEXT,
  
  -- Task parameters
  duration_hours NUMERIC,
  priority TEXT DEFAULT 'medium', -- 'high', 'medium', 'low'
  weather_dependent BOOLEAN DEFAULT false,
  
  -- Resources needed
  resources JSONB, -- {water_liters: 1000, fertilizer_kg: 50, etc}
  estimated_cost NUMERIC,
  
  -- Instructions
  instructions TEXT[],
  precautions TEXT[],
  
  -- Weather conditions
  ideal_weather JSONB,
  weather_risk_level TEXT, -- 'safe', 'caution', 'risky'
  
  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'skipped', 'rescheduled'
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  completion_notes TEXT,
  
  -- Rescheduling
  original_date DATE,
  reschedule_reason TEXT,
  auto_rescheduled BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create task completions table for tracking farmer actions
CREATE TABLE public.task_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES schedule_tasks(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL,
  
  action TEXT NOT NULL, -- 'completed', 'skipped', 'rescheduled'
  action_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Completion details
  actual_resources JSONB,
  actual_cost NUMERIC,
  notes TEXT,
  photos TEXT[],
  
  -- Weather at completion
  weather_conditions JSONB,
  
  -- Feedback for AI learning
  difficulty_rating INTEGER CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
  effectiveness_rating INTEGER CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create crop templates table for common crop schedules
CREATE TABLE public.crop_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_name TEXT NOT NULL,
  crop_variety TEXT,
  region TEXT,
  season TEXT,
  
  -- Standard schedule template
  lifecycle_days INTEGER,
  schedule_template JSONB NOT NULL,
  
  -- Best practices
  best_practices JSONB,
  common_issues JSONB,
  
  -- Source
  source TEXT, -- 'FAO', 'ICAR', 'Custom'
  reference_url TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_crop_schedules_land_id ON crop_schedules(land_id);
CREATE INDEX idx_crop_schedules_farmer_id ON crop_schedules(farmer_id);
CREATE INDEX idx_crop_schedules_active ON crop_schedules(is_active) WHERE is_active = true;

CREATE INDEX idx_schedule_tasks_schedule_id ON schedule_tasks(schedule_id);
CREATE INDEX idx_schedule_tasks_date ON schedule_tasks(task_date);
CREATE INDEX idx_schedule_tasks_status ON schedule_tasks(status);
CREATE INDEX idx_schedule_tasks_type ON schedule_tasks(task_type);

CREATE INDEX idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX idx_task_completions_farmer_id ON task_completions(farmer_id);

-- Enable RLS
ALTER TABLE crop_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crop_schedules
CREATE POLICY "Farmers can view their own schedules" 
ON crop_schedules FOR SELECT 
USING (farmer_id = auth.uid() OR farmer_id = get_jwt_farmer_id());

CREATE POLICY "Farmers can create their own schedules" 
ON crop_schedules FOR INSERT 
WITH CHECK (farmer_id = auth.uid() OR farmer_id = get_jwt_farmer_id());

CREATE POLICY "Farmers can update their own schedules" 
ON crop_schedules FOR UPDATE 
USING (farmer_id = auth.uid() OR farmer_id = get_jwt_farmer_id());

CREATE POLICY "Farmers can delete their own schedules" 
ON crop_schedules FOR DELETE 
USING (farmer_id = auth.uid() OR farmer_id = get_jwt_farmer_id());

-- RLS Policies for schedule_tasks
CREATE POLICY "Farmers can view tasks for their schedules" 
ON schedule_tasks FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM crop_schedules 
    WHERE crop_schedules.id = schedule_tasks.schedule_id 
    AND (crop_schedules.farmer_id = auth.uid() OR crop_schedules.farmer_id = get_jwt_farmer_id())
  )
);

CREATE POLICY "Farmers can manage tasks for their schedules" 
ON schedule_tasks FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM crop_schedules 
    WHERE crop_schedules.id = schedule_tasks.schedule_id 
    AND (crop_schedules.farmer_id = auth.uid() OR crop_schedules.farmer_id = get_jwt_farmer_id())
  )
);

-- RLS Policies for task_completions
CREATE POLICY "Farmers can view their completions" 
ON task_completions FOR SELECT 
USING (farmer_id = auth.uid() OR farmer_id = get_jwt_farmer_id());

CREATE POLICY "Farmers can create completions" 
ON task_completions FOR INSERT 
WITH CHECK (farmer_id = auth.uid() OR farmer_id = get_jwt_farmer_id());

-- RLS Policies for crop_templates (public read)
CREATE POLICY "Anyone can view active templates" 
ON crop_templates FOR SELECT 
USING (is_active = true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_crop_schedule_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_crop_schedules_updated_at
BEFORE UPDATE ON crop_schedules
FOR EACH ROW
EXECUTE FUNCTION update_crop_schedule_timestamp();

CREATE TRIGGER update_schedule_tasks_updated_at
BEFORE UPDATE ON schedule_tasks
FOR EACH ROW
EXECUTE FUNCTION update_crop_schedule_timestamp();

CREATE TRIGGER update_crop_templates_updated_at
BEFORE UPDATE ON crop_templates
FOR EACH ROW
EXECUTE FUNCTION update_crop_schedule_timestamp();