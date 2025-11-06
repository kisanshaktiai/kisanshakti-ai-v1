-- Create table to track scheduled task notifications
CREATE TABLE IF NOT EXISTS public.task_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.schedule_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('5_days', '1_day', 'same_day')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'opened', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX idx_task_notifications_task ON public.task_notifications(task_id);
CREATE INDEX idx_task_notifications_user ON public.task_notifications(user_id);
CREATE INDEX idx_task_notifications_scheduled ON public.task_notifications(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_task_notifications_status ON public.task_notifications(status);

-- Enable RLS
ALTER TABLE public.task_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications"
  ON public.task_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notifications"
  ON public.task_notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.task_notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_task_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_task_notifications_updated_at
  BEFORE UPDATE ON public.task_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_notifications_updated_at();

-- Add comment
COMMENT ON TABLE public.task_notifications IS 'Tracks scheduled mobile push notifications for farming tasks (5 days, 1 day, same day reminders)';