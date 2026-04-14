
-- Phase 1: Add payment columns to farmer_subscriptions
ALTER TABLE public.farmer_subscriptions 
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_order_id text;

-- Add unique constraint for idempotent payment processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_farmer_subs_payment_order 
  ON public.farmer_subscriptions(payment_provider, payment_order_id) 
  WHERE payment_order_id IS NOT NULL;

-- Add farmer_id to subscription_usage_logs if missing
ALTER TABLE public.subscription_usage_logs 
  ADD COLUMN IF NOT EXISTS farmer_id uuid REFERENCES public.farmers(id);

CREATE INDEX IF NOT EXISTS idx_sub_usage_farmer 
  ON public.subscription_usage_logs(farmer_id, metric_name, billing_period_start);

-- Phase 1: Seed farmer_subscriptions for all active farmers with Shakti plan
INSERT INTO public.farmer_subscriptions (farmer_id, tenant_id, plan_id, billing_interval, status, start_date, end_date, auto_renew, paid_by_tenant, trial_days)
SELECT 
  f.id,
  f.tenant_id,
  '8b8baef3-47a2-4d60-bec5-e1cb45cc342f'::uuid, -- Shakti plan
  'monthly',
  'active',
  now(),
  now() + interval '30 days',
  true,
  true, -- tenant pays initially
  0
FROM public.farmers f
WHERE f.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.farmer_subscriptions fs WHERE fs.farmer_id = f.id
  );

-- Phase 4: Create check_farmer_subscription RPC
CREATE OR REPLACE FUNCTION public.check_farmer_subscription(
  p_farmer_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Cross-tenant safety: verify farmer belongs to tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.farmers 
    WHERE id = p_farmer_id AND tenant_id = p_tenant_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'farmer_not_found_or_wrong_tenant'
    );
  END IF;

  SELECT jsonb_build_object(
    'valid', true,
    'subscription_id', fs.id,
    'plan_id', fs.plan_id,
    'plan_name', sp.name,
    'plan_type', sp.plan_type,
    'status', fs.status,
    'start_date', fs.start_date,
    'end_date', fs.end_date,
    'grace_period_ends_at', fs.grace_period_ends_at,
    'features', sp.features,
    'limits', sp.limits,
    'days_remaining', GREATEST(0, EXTRACT(DAY FROM (fs.end_date - now()))),
    'is_in_grace_period', (
      fs.status = 'expired' 
      AND fs.grace_period_ends_at IS NOT NULL 
      AND now() < fs.grace_period_ends_at
    )
  )
  INTO result
  FROM public.farmer_subscriptions fs
  JOIN public.subscription_plans sp ON sp.id = fs.plan_id
  WHERE fs.farmer_id = p_farmer_id
    AND fs.tenant_id = p_tenant_id
    AND (
      (fs.status = 'active' AND (fs.end_date IS NULL OR fs.end_date > now()))
      OR (fs.status = 'expired' AND fs.grace_period_ends_at IS NOT NULL AND now() < fs.grace_period_ends_at)
      OR fs.status = 'trial'
    )
  ORDER BY fs.created_at DESC
  LIMIT 1;

  IF result IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'no_active_subscription',
      'status', 'expired'
    );
  END IF;

  RETURN result;
END;
$$;

-- Phase 6: Create increment_usage RPC (atomic upsert)
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_farmer_id uuid,
  p_tenant_id uuid,
  p_subscription_id uuid,
  p_metric_name text,
  p_quantity numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_period_start timestamptz;
  current_period_end timestamptz;
  new_total numeric;
  usage_limit text;
  plan_limits jsonb;
BEGIN
  -- Calculate current billing period (monthly)
  current_period_start := date_trunc('month', now());
  current_period_end := (date_trunc('month', now()) + interval '1 month');

  -- Upsert usage record
  INSERT INTO public.subscription_usage_logs (
    tenant_id, subscription_id, farmer_id, metric_name, 
    quantity, unit, usage_date, billing_period_start, billing_period_end
  )
  VALUES (
    p_tenant_id, p_subscription_id, p_farmer_id, p_metric_name,
    p_quantity, 'count', now()::date, current_period_start, current_period_end
  )
  ON CONFLICT (farmer_id, metric_name, billing_period_start) 
  DO UPDATE SET quantity = subscription_usage_logs.quantity + p_quantity
  RETURNING quantity INTO new_total;

  -- Get plan limits
  SELECT sp.limits INTO plan_limits
  FROM farmer_subscriptions fs
  JOIN subscription_plans sp ON sp.id = fs.plan_id
  WHERE fs.id = p_subscription_id;

  usage_limit := plan_limits ->> p_metric_name;

  RETURN jsonb_build_object(
    'current_usage', new_total,
    'limit', COALESCE(usage_limit, 'unlimited'),
    'exceeded', CASE 
      WHEN usage_limit IS NULL OR usage_limit = 'unlimited' THEN false
      ELSE new_total > usage_limit::numeric
    END
  );
END;
$$;

-- Add unique constraint for usage upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_usage_farmer_metric_period
  ON public.subscription_usage_logs(farmer_id, metric_name, billing_period_start);

-- Enable realtime for farmer_subscriptions (Phase 5)
ALTER PUBLICATION supabase_realtime ADD TABLE public.farmer_subscriptions;

-- Enable REPLICA IDENTITY for realtime updates
ALTER TABLE public.farmer_subscriptions REPLICA IDENTITY FULL;
