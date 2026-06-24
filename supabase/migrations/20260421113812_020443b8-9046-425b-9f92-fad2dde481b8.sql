-- 1. RPC for farmer-only catalog (SECURITY DEFINER, deterministic ordering)
CREATE OR REPLACE FUNCTION public.get_farmer_subscription_plans(p_tenant_id uuid DEFAULT NULL)
RETURNS SETOF public.subscription_plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.subscription_plans
  WHERE is_active = true
    AND COALESCE(is_public, true) = true
    AND plan_category = 'farmer'
    AND (tenant_id IS NULL OR tenant_id = p_tenant_id)
  ORDER BY sort_order ASC NULLS LAST, price_monthly ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_farmer_subscription_plans(uuid) TO anon, authenticated;

-- 2. Defense-in-depth additive RLS policy (does NOT drop or alter existing policies)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscription_plans'
      AND policyname = 'farmer_app_read_farmer_plans'
  ) THEN
    CREATE POLICY "farmer_app_read_farmer_plans"
    ON public.subscription_plans
    FOR SELECT
    TO authenticated
    USING (
      is_active = true
      AND COALESCE(is_public, true) = true
      AND plan_category = 'farmer'
    );
  END IF;
END$$;

-- 3. Additive partial index for the farmer-catalog hot path
CREATE INDEX IF NOT EXISTS idx_subscription_plans_farmer_catalog
ON public.subscription_plans (plan_category, is_active, sort_order, price_monthly)
WHERE plan_category = 'farmer';