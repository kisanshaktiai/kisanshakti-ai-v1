-- Enable realtime for key tables
-- This allows automatic UI updates when data changes

-- Set REPLICA IDENTITY FULL to capture complete row data during updates
ALTER TABLE public.lands REPLICA IDENTITY FULL;
ALTER TABLE public.crop_schedules REPLICA IDENTITY FULL;
ALTER TABLE public.schedule_tasks REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.lands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crop_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_tasks;