-- Create push_subscriptions table for storing user push notification subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(farmer_id, endpoint)
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for push_subscriptions
CREATE POLICY "Users can view their own push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  USING (auth.uid() = farmer_id);

CREATE POLICY "Users can create their own push subscriptions"
  ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = farmer_id);

CREATE POLICY "Users can update their own push subscriptions"
  ON public.push_subscriptions
  FOR UPDATE
  USING (auth.uid() = farmer_id);

CREATE POLICY "Users can delete their own push subscriptions"
  ON public.push_subscriptions
  FOR DELETE
  USING (auth.uid() = farmer_id);

-- Create indexes for better query performance
CREATE INDEX idx_push_subscriptions_farmer ON public.push_subscriptions(farmer_id);
CREATE INDEX idx_push_subscriptions_active ON public.push_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX idx_push_subscriptions_tenant ON public.push_subscriptions(tenant_id);

-- Create alert_notifications table for tracking sent notifications
CREATE TABLE IF NOT EXISTS public.alert_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  farmer_id UUID NOT NULL,
  alert_type TEXT NOT NULL, -- 'weather', 'pest', 'critical_recommendation', 'task_reminder'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  data JSONB,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  land_id UUID REFERENCES public.lands(id) ON DELETE CASCADE,
  chat_message_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for alert_notifications
CREATE POLICY "Users can view their own notifications"
  ON public.alert_notifications
  FOR SELECT
  USING (auth.uid() = farmer_id);

CREATE POLICY "Users can update their own notifications"
  ON public.alert_notifications
  FOR UPDATE
  USING (auth.uid() = farmer_id);

-- Create indexes
CREATE INDEX idx_alert_notifications_farmer ON public.alert_notifications(farmer_id);
CREATE INDEX idx_alert_notifications_type ON public.alert_notifications(alert_type);
CREATE INDEX idx_alert_notifications_sent ON public.alert_notifications(sent_at DESC);
CREATE INDEX idx_alert_notifications_unread ON public.alert_notifications(farmer_id, read_at) WHERE read_at IS NULL;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_push_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for push_subscriptions
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_push_subscription_updated_at();