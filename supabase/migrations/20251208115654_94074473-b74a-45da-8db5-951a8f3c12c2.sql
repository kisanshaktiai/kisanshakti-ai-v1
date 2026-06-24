-- Add missing columns to schedule_tasks table for proper data tracking
ALTER TABLE public.schedule_tasks 
ADD COLUMN IF NOT EXISTS farmer_id uuid,
ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
ADD COLUMN IF NOT EXISTS days_from_sowing integer,
ADD COLUMN IF NOT EXISTS sequence_order integer;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_farmer_id ON public.schedule_tasks(farmer_id);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_tenant_id ON public.schedule_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_sequence ON public.schedule_tasks(schedule_id, sequence_order);

-- Comment on columns
COMMENT ON COLUMN public.schedule_tasks.farmer_id IS 'Farmer who owns this task for tenant isolation';
COMMENT ON COLUMN public.schedule_tasks.tenant_id IS 'Tenant ID for multi-tenant isolation';
COMMENT ON COLUMN public.schedule_tasks.days_from_sowing IS 'Number of days from sowing when this task should be done';
COMMENT ON COLUMN public.schedule_tasks.sequence_order IS 'Order of task execution within the schedule';