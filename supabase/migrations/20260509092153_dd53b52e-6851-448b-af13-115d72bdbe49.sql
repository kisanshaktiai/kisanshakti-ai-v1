
-- ============================================================
-- Phase 0: Subscription / entitlements foundation
-- ============================================================

-- 1. Farmer timezone (default IST)
ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- 2. Helper: compute period date in farmer's timezone
CREATE OR REPLACE FUNCTION public._period_for_unit(_unit text, _tz text)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _unit IN ('per_day','tokens_per_day') THEN ((now() AT TIME ZONE COALESCE(_tz,'Asia/Kolkata'))::date)
    WHEN _unit = 'per_month' THEN date_trunc('month', (now() AT TIME ZONE COALESCE(_tz,'Asia/Kolkata')))::date
    ELSE '1900-01-01'::date
  END;
$$;

-- 3. Timezone-aware check_farmer_quota
CREATE OR REPLACE FUNCTION public.check_farmer_quota(
  _farmer uuid,
  _feature text,
  _delta integer DEFAULT 1,
  _tokens bigint DEFAULT 0,
  _commit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _tenant uuid;
  _plan uuid;
  _tz text;
  _enabled boolean;
  _quota int;
  _unit text;
  _period date;
  _used int;
  _tokens_used bigint;
BEGIN
  SELECT f.tenant_id, COALESCE(f.timezone,'Asia/Kolkata'), fs.plan_id
    INTO _tenant, _tz, _plan
  FROM public.farmers f
  LEFT JOIN public.farmer_subscriptions fs
    ON fs.farmer_id = f.id AND fs.status IN ('active','trial','trialing')
  WHERE f.id = _farmer
  ORDER BY fs.created_at DESC NULLS LAST
  LIMIT 1;

  IF _tenant IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'farmer_not_found');
  END IF;

  SELECT tfpf.enabled, tfpf.quota, f.quota_unit
    INTO _enabled, _quota, _unit
  FROM public.features f
  LEFT JOIN public.tenant_farmer_plan_features tfpf
    ON tfpf.feature_code = f.code AND tfpf.tenant_id = _tenant AND tfpf.plan_id = _plan
  WHERE f.code = _feature AND f.is_active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_not_found');
  END IF;
  IF NOT COALESCE(_enabled, false) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  END IF;

  _period := public._period_for_unit(_unit, _tz);

  SELECT count, tokens INTO _used, _tokens_used
  FROM public.farmer_feature_usage
  WHERE farmer_id = _farmer AND feature_code = _feature AND period = _period
  FOR UPDATE;

  _used := COALESCE(_used, 0);
  _tokens_used := COALESCE(_tokens_used, 0);

  IF _quota IS NOT NULL AND (_used + _delta) > _quota THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_exceeded',
      'quota', _quota, 'used', _used, 'remaining', GREATEST(_quota - _used, 0),
      'period', _period, 'unit', _unit, 'tz', _tz);
  END IF;

  IF _commit THEN
    INSERT INTO public.farmer_feature_usage(farmer_id, tenant_id, feature_code, period, count, tokens)
    VALUES (_farmer, _tenant, _feature, _period, _delta, _tokens)
    ON CONFLICT (farmer_id, feature_code, period)
    DO UPDATE SET count = farmer_feature_usage.count + EXCLUDED.count,
                  tokens = farmer_feature_usage.tokens + EXCLUDED.tokens,
                  updated_at = now();
    _used := _used + _delta;
    _tokens_used := _tokens_used + _tokens;
  END IF;

  RETURN jsonb_build_object('allowed', true,
    'quota', _quota, 'used', _used, 'tokens', _tokens_used,
    'remaining', CASE WHEN _quota IS NULL THEN NULL ELSE GREATEST(_quota - _used, 0) END,
    'feature', _feature, 'unit', _unit, 'period', _period, 'tz', _tz);
END $function$;

-- 4. Unified entitlements resolver
CREATE OR REPLACE FUNCTION public.resolve_farmer_entitlements(
  p_farmer uuid,
  p_tenant uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _farmer record;
  _tenant_sub record;
  _farmer_sub record;
  _plan record;
  _tenant_features jsonb := '{}'::jsonb;
  _features jsonb := '{}'::jsonb;
  _limits jsonb := '{}'::jsonb;
  _source jsonb := '{}'::jsonb;
  _tz text;
  _today date;
  _month date;
  _tenant_blocked boolean := false;
  _tenant_in_grace boolean := false;
  _land_count int := 0;
  _r record;
BEGIN
  -- Farmer + cross-tenant safety
  SELECT id, tenant_id, COALESCE(timezone,'Asia/Kolkata') AS tz
    INTO _farmer
  FROM public.farmers
  WHERE id = p_farmer AND tenant_id = p_tenant AND is_active = true;

  IF _farmer.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'farmer_not_found_or_wrong_tenant');
  END IF;

  _tz := _farmer.tz;
  _today := (now() AT TIME ZONE _tz)::date;
  _month := date_trunc('month', (now() AT TIME ZONE _tz))::date;

  -- Tenant subscription (the tenant's own platform plan)
  SELECT ts.id, ts.status, ts.current_period_end, ts.grace_period_ends_at, sp.name AS plan_name
    INTO _tenant_sub
  FROM public.tenant_subscriptions ts
  LEFT JOIN public.subscription_plans sp ON sp.id = ts.plan_id
  WHERE ts.tenant_id = p_tenant
  ORDER BY ts.created_at DESC
  LIMIT 1;

  IF _tenant_sub.id IS NOT NULL THEN
    _tenant_in_grace := _tenant_sub.status IN ('past_due','expired')
      AND _tenant_sub.grace_period_ends_at IS NOT NULL
      AND now() < _tenant_sub.grace_period_ends_at;
    _tenant_blocked := _tenant_sub.status NOT IN ('active','trial','trialing')
      AND NOT _tenant_in_grace;
  END IF;

  -- Tenant master feature switches (wide row)
  SELECT to_jsonb(tf.*) - 'id' - 'tenant_id' - 'created_at' - 'updated_at'
    INTO _tenant_features
  FROM public.tenant_features tf
  WHERE tf.tenant_id = p_tenant;
  _tenant_features := COALESCE(_tenant_features, '{}'::jsonb);

  -- Farmer subscription + plan
  SELECT fs.id, fs.plan_id, fs.status, fs.end_date, fs.grace_period_ends_at, fs.tenant_subscription_id
    INTO _farmer_sub
  FROM public.farmer_subscriptions fs
  WHERE fs.farmer_id = p_farmer AND fs.tenant_id = p_tenant
    AND (
      (fs.status IN ('active','trial','trialing') AND (fs.end_date IS NULL OR fs.end_date > now()))
      OR (fs.status = 'expired' AND fs.grace_period_ends_at IS NOT NULL AND now() < fs.grace_period_ends_at)
    )
  ORDER BY fs.created_at DESC
  LIMIT 1;

  IF _farmer_sub.plan_id IS NOT NULL THEN
    SELECT id, name, plan_type, features, limits INTO _plan
    FROM public.subscription_plans WHERE id = _farmer_sub.plan_id;
    _features := COALESCE(_plan.features, '{}'::jsonb);
    _limits := COALESCE(_plan.limits, '{}'::jsonb);
  END IF;

  -- Apply tenant_farmer_pricing override (custom_features / custom_limits)
  FOR _r IN
    SELECT custom_features, custom_limits
    FROM public.tenant_farmer_pricing
    WHERE tenant_id = p_tenant AND base_plan_id = _farmer_sub.plan_id AND is_active = true
    LIMIT 1
  LOOP
    IF _r.custom_features IS NOT NULL THEN
      _features := _features || _r.custom_features;
    END IF;
    IF _r.custom_limits IS NOT NULL THEN
      _limits := _limits || _r.custom_limits;
    END IF;
  END LOOP;

  -- Resolve per-feature entitlements (catalog-driven)
  -- Combines: features catalog + tenant_farmer_plan_features + tenant_feature_grants
  -- + tenant_feature_overrides (time-bound) + tenant_features master switch
  -- + today's/month's usage from farmer_feature_usage.
  SELECT jsonb_object_agg(code, entry) INTO _features
  FROM (
    SELECT
      f.code,
      jsonb_build_object(
        'enabled', COALESCE(
          -- master tenant switch (when key exists in tenant_features)
          CASE WHEN _tenant_features ? f.code THEN (_tenant_features->>f.code)::boolean ELSE NULL END,
          tfpf.enabled,
          tfg.enabled,
          true
        ) AND NOT _tenant_blocked,
        'quota', COALESCE(tfpf.quota, tfg.quota),
        'unit', f.quota_unit,
        'used_today', COALESCE(uday.count, 0),
        'used_month', COALESCE(umon.count, 0),
        'tokens_today', COALESCE(uday.tokens, 0),
        'resets_at', CASE
          WHEN f.quota_unit IN ('per_day','tokens_per_day')
            THEN ((_today + INTERVAL '1 day') AT TIME ZONE _tz)
          WHEN f.quota_unit = 'per_month'
            THEN ((_month + INTERVAL '1 month') AT TIME ZONE _tz)
          ELSE NULL
        END,
        'source', CASE
          WHEN _tenant_features ? f.code THEN 'tenant_master'
          WHEN tfpf.feature_code IS NOT NULL THEN 'tenant_plan_override'
          WHEN tfg.feature_code IS NOT NULL THEN 'tenant_grant'
          ELSE 'plan_base'
        END
      ) AS entry
    FROM public.features f
    LEFT JOIN public.tenant_farmer_plan_features tfpf
      ON tfpf.feature_code = f.code
     AND tfpf.tenant_id = p_tenant
     AND tfpf.plan_id = _farmer_sub.plan_id
    LEFT JOIN public.tenant_feature_grants tfg
      ON tfg.feature_code = f.code
     AND tfg.tenant_id = p_tenant
     AND (tfg.expires_at IS NULL OR tfg.expires_at > now())
    LEFT JOIN public.farmer_feature_usage uday
      ON uday.farmer_id = p_farmer
     AND uday.feature_code = f.code
     AND uday.period = _today
    LEFT JOIN public.farmer_feature_usage umon
      ON umon.farmer_id = p_farmer
     AND umon.feature_code = f.code
     AND umon.period = _month
    WHERE f.is_active
  ) sub;

  -- Live land count for my_land enforcement (lands persist; counter would drift)
  SELECT COUNT(*) INTO _land_count
  FROM public.lands
  WHERE farmer_id = p_farmer AND COALESCE(is_active, true) = true AND deleted_at IS NULL;

  IF _features ? 'my_land' THEN
    _features := jsonb_set(_features, '{my_land,used_today}', to_jsonb(_land_count));
    _features := jsonb_set(_features, '{my_land,used_month}', to_jsonb(_land_count));
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'tenant', jsonb_build_object(
      'id', p_tenant,
      'subscription_id', _tenant_sub.id,
      'status', COALESCE(_tenant_sub.status, 'unknown'),
      'plan_name', _tenant_sub.plan_name,
      'period_end', _tenant_sub.current_period_end,
      'in_grace', _tenant_in_grace,
      'suspended', _tenant_blocked,
      'master_features', _tenant_features
    ),
    'farmer', jsonb_build_object(
      'id', p_farmer,
      'timezone', _tz,
      'subscription_id', _farmer_sub.id,
      'plan_id', _farmer_sub.plan_id,
      'plan_name', _plan.name,
      'plan_type', _plan.plan_type,
      'status', _farmer_sub.status,
      'end_date', _farmer_sub.end_date,
      'in_grace', (_farmer_sub.status = 'expired'
                   AND _farmer_sub.grace_period_ends_at IS NOT NULL
                   AND now() < _farmer_sub.grace_period_ends_at),
      'days_remaining', GREATEST(0, EXTRACT(DAY FROM (_farmer_sub.end_date - now())))::int
    ),
    'features', COALESCE(_features, '{}'::jsonb),
    'limits', _limits,
    'lands', jsonb_build_object('used', _land_count),
    'now', now(),
    'today', _today
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_farmer_entitlements(uuid, uuid) TO authenticated, anon;

-- 5. Backfill plan_features for my_land from subscription_plans.limits.land_limit
INSERT INTO public.plan_features (plan_id, feature_code, enabled, quota)
SELECT sp.id, 'my_land', true,
  CASE
    WHEN sp.limits->>'land_limit' = 'unlimited' THEN NULL
    WHEN (sp.limits->>'land_limit') ~ '^\d+$' THEN (sp.limits->>'land_limit')::int
    ELSE NULL
  END
FROM public.subscription_plans sp
WHERE sp.plan_category = 'farmer'
ON CONFLICT (plan_id, feature_code) DO UPDATE
  SET quota = EXCLUDED.quota, enabled = true, updated_at = now();

-- Mirror to tenant_farmer_plan_features for every existing tenant×farmer-plan pair lacking it
INSERT INTO public.tenant_farmer_plan_features (tenant_id, plan_id, feature_code, enabled, quota)
SELECT DISTINCT fs.tenant_id, sp.id, 'my_land', true,
  CASE
    WHEN sp.limits->>'land_limit' = 'unlimited' THEN NULL
    WHEN (sp.limits->>'land_limit') ~ '^\d+$' THEN (sp.limits->>'land_limit')::int
    ELSE NULL
  END
FROM public.subscription_plans sp
JOIN public.farmer_subscriptions fs ON fs.plan_id = sp.id
WHERE sp.plan_category = 'farmer'
ON CONFLICT (tenant_id, plan_id, feature_code) DO NOTHING;

-- Same for ai_chat (per-day) — backfill from limits.ai_queries_per_month if no per-day; default 20 free
INSERT INTO public.tenant_farmer_plan_features (tenant_id, plan_id, feature_code, enabled, quota)
SELECT DISTINCT fs.tenant_id, sp.id, 'ai_chat', true,
  CASE
    WHEN (sp.limits->>'ai_queries_per_month') = 'unlimited' THEN NULL
    WHEN (sp.limits->>'ai_queries_per_month') ~ '^\d+$' THEN GREATEST(((sp.limits->>'ai_queries_per_month')::int / 30), 1)
    ELSE 20
  END
FROM public.subscription_plans sp
JOIN public.farmer_subscriptions fs ON fs.plan_id = sp.id
WHERE sp.plan_category = 'farmer'
ON CONFLICT (tenant_id, plan_id, feature_code) DO NOTHING;

-- 6. Server-side defense: block lands insert when over plan quota
CREATE OR REPLACE FUNCTION public.enforce_land_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _plan uuid;
  _quota int;
  _enabled boolean;
  _count int;
BEGIN
  SELECT f.tenant_id, fs.plan_id INTO _tenant, _plan
  FROM public.farmers f
  LEFT JOIN public.farmer_subscriptions fs
    ON fs.farmer_id = f.id AND fs.status IN ('active','trial','trialing')
  WHERE f.id = NEW.farmer_id
  ORDER BY fs.created_at DESC NULLS LAST
  LIMIT 1;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'farmer_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT tfpf.enabled, tfpf.quota INTO _enabled, _quota
  FROM public.tenant_farmer_plan_features tfpf
  WHERE tfpf.feature_code = 'my_land'
    AND tfpf.tenant_id = _tenant
    AND tfpf.plan_id = _plan;

  -- If no override row, fall back to plan_features
  IF NOT FOUND THEN
    SELECT pf.enabled, pf.quota INTO _enabled, _quota
    FROM public.plan_features pf
    WHERE pf.feature_code = 'my_land' AND pf.plan_id = _plan;
  END IF;

  -- If still nothing, allow (no quota configured)
  IF _quota IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO _count
  FROM public.lands
  WHERE farmer_id = NEW.farmer_id
    AND COALESCE(is_active, true) = true
    AND deleted_at IS NULL;

  IF _count >= _quota THEN
    RAISE EXCEPTION 'land_quota_exceeded: limit=%, used=%', _quota, _count
      USING ERRCODE = 'P0001', HINT = 'upgrade_plan';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_land_limit ON public.lands;
CREATE TRIGGER trg_enforce_land_limit
  BEFORE INSERT ON public.lands
  FOR EACH ROW EXECUTE FUNCTION public.enforce_land_limit();

-- 7. Hot-path indexes
CREATE INDEX IF NOT EXISTS idx_farmer_feature_usage_lookup
  ON public.farmer_feature_usage (farmer_id, feature_code, period);

CREATE INDEX IF NOT EXISTS idx_farmer_subscriptions_active
  ON public.farmer_subscriptions (farmer_id, tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_lands_farmer_active
  ON public.lands (farmer_id) WHERE COALESCE(is_active, true) = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_farmer_plan_features_lookup
  ON public.tenant_farmer_plan_features (tenant_id, plan_id, feature_code);
