CREATE INDEX IF NOT EXISTS idx_proactive_alerts_farmer_status_created
  ON public.proactive_alerts(farmer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_farmer_subscriptions_farmer_status
  ON public.farmer_subscriptions(farmer_id, status);

CREATE INDEX IF NOT EXISTS idx_subscription_usage_logs_farmer_period
  ON public.subscription_usage_logs(farmer_id, billing_period_start DESC);