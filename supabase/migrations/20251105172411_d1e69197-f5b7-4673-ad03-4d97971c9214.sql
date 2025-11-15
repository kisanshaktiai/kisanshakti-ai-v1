-- Add language and currency support to crop schedules and tasks
ALTER TABLE crop_schedules 
  ADD COLUMN IF NOT EXISTS generation_language VARCHAR(5) DEFAULT 'hi',
  ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'India';

ALTER TABLE schedule_tasks 
  ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'hi',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_crop_schedules_language ON crop_schedules(generation_language);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_language ON schedule_tasks(language);