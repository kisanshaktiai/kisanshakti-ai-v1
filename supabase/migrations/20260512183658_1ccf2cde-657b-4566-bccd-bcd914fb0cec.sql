
-- Auto-enroll new farmers into the Free plan + backfill existing farmers without a subscription.

CREATE OR REPLACE FUNCTION public.auto_enroll_farmer_free_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_tenant_sub_id UUID;
BEGIN
  -- Skip if farmer already has an active/trial subscription
  IF EXISTS (
    SELECT 1 FROM public.farmer_subscriptions
    WHERE farmer_id = NEW.id AND status IN ('active','trial')
  ) THEN
    RETURN NEW;
  END IF;

  -- Resolve Free plan: tenant-scoped first, then global
  SELECT id INTO v_plan_id
  FROM public.subscription_plans
  WHERE tenant_id = NEW.tenant_id
    AND plan_category = 'farmer'
    AND lower(name) = 'free'
    AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id
    FROM public.subscription_plans
    WHERE tenant_id IS NULL
      AND plan_category = 'farmer'
      AND lower(name) = 'free'
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_plan_id IS NULL THEN
    RAISE WARNING '[auto_enroll_farmer_free_plan] No Free farmer plan found for tenant %; skipping farmer %', NEW.tenant_id, NEW.id;
    RETURN NEW;
  END IF;

  -- Optional link to active tenant_subscriptions row
  SELECT id INTO v_tenant_sub_id
  FROM public.tenant_subscriptions
  WHERE tenant_id = NEW.tenant_id
    AND status IN ('active','trial')
  ORDER BY created_at DESC
  LIMIT 1;

  BEGIN
    INSERT INTO public.farmer_subscriptions (
      farmer_id, tenant_id, tenant_subscription_id, plan_id,
      status, start_date, end_date, auto_renew, billing_interval, metadata
    ) VALUES (
      NEW.id, NEW.tenant_id, v_tenant_sub_id, v_plan_id,
      'active', now(), NULL, false, 'monthly',
      jsonb_build_object('source','auto_enroll_signup','plan_name','Free')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[auto_enroll_farmer_free_plan] Insert failed for farmer %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_farmer_subscription_autoenroll ON public.farmers;
CREATE TRIGGER on_farmer_subscription_autoenroll
AFTER INSERT ON public.farmers
FOR EACH ROW EXECUTE FUNCTION public.auto_enroll_farmer_free_plan();

-- One-shot backfill for existing farmers without an active/trial subscription
INSERT INTO public.farmer_subscriptions (
  farmer_id, tenant_id, plan_id, status, start_date, auto_renew, billing_interval, metadata
)
SELECT
  f.id,
  f.tenant_id,
  COALESCE(
    (SELECT id FROM public.subscription_plans
      WHERE tenant_id = f.tenant_id AND plan_category='farmer'
        AND lower(name)='free' AND is_active=true LIMIT 1),
    (SELECT id FROM public.subscription_plans
      WHERE tenant_id IS NULL AND plan_category='farmer'
        AND lower(name)='free' AND is_active=true LIMIT 1)
  ) AS plan_id,
  'active',
  now(),
  false,
  'monthly',
  jsonb_build_object('source','backfill_free_plan','plan_name','Free')
FROM public.farmers f
WHERE NOT EXISTS (
  SELECT 1 FROM public.farmer_subscriptions s
  WHERE s.farmer_id = f.id AND s.status IN ('active','trial')
)
AND COALESCE(
    (SELECT id FROM public.subscription_plans
      WHERE tenant_id = f.tenant_id AND plan_category='farmer'
        AND lower(name)='free' AND is_active=true LIMIT 1),
    (SELECT id FROM public.subscription_plans
      WHERE tenant_id IS NULL AND plan_category='farmer'
        AND lower(name)='free' AND is_active=true LIMIT 1)
  ) IS NOT NULL;
