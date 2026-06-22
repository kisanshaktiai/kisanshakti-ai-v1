
CREATE OR REPLACE FUNCTION public.resolve_farmer_entitlements(p_farmer uuid, p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _farmer record;
  _tenant_sub_id uuid;
  _tenant_sub_status text;
  _tenant_sub_period_end timestamptz;
  _tenant_sub_grace timestamptz;
  _tenant_sub_plan_name text;
  _farmer_sub_id uuid;
  _farmer_sub_plan_id uuid;
  _farmer_sub_status text;
  _farmer_sub_end_date timestamptz;
  _farmer_sub_grace timestamptz;
  _free_plan_id uuid;
  _plan_name text;
  _plan_type text;
  _tenant_features jsonb := '{}'::jsonb;
  _features jsonb := '{}'::jsonb;
  _limits jsonb := '{}'::jsonb;
  _tz text;
  _today date;
  _month date;
  _tenant_blocked boolean := false;
  _tenant_in_grace boolean := false;
  _land_count int := 0;
  _downgraded boolean := false;
  _r record;
BEGIN
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

  SELECT id INTO _free_plan_id
  FROM public.subscription_plans
  WHERE name = 'Free' AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT ts.id, ts.status, ts.current_period_end, ts.grace_period_ends_at, sp.name
    INTO _tenant_sub_id, _tenant_sub_status, _tenant_sub_period_end, _tenant_sub_grace, _tenant_sub_plan_name
  FROM public.tenant_subscriptions ts
  LEFT JOIN public.subscription_plans sp ON sp.id = ts.plan_id
  WHERE ts.tenant_id = p_tenant
  ORDER BY ts.created_at DESC
  LIMIT 1;

  IF _tenant_sub_id IS NOT NULL THEN
    _tenant_in_grace := _tenant_sub_status IN ('past_due','expired')
      AND _tenant_sub_grace IS NOT NULL AND now() < _tenant_sub_grace;
    _tenant_blocked := _tenant_sub_status NOT IN ('active','trial','trialing')
      AND NOT _tenant_in_grace;
  END IF;

  SELECT COALESCE(to_jsonb(tf.*) - 'id' - 'tenant_id' - 'created_at' - 'updated_at', '{}'::jsonb)
    INTO _tenant_features
  FROM public.tenant_features tf
  WHERE tf.tenant_id = p_tenant;
  _tenant_features := COALESCE(_tenant_features, '{}'::jsonb);

  SELECT fs.id, fs.plan_id, fs.status, fs.end_date, fs.grace_period_ends_at
    INTO _farmer_sub_id, _farmer_sub_plan_id, _farmer_sub_status, _farmer_sub_end_date, _farmer_sub_grace
  FROM public.farmer_subscriptions fs
  WHERE fs.farmer_id = p_farmer AND fs.tenant_id = p_tenant
    AND (
      (fs.status IN ('active','trial','trialing') AND (fs.end_date IS NULL OR fs.end_date > now()))
      OR (fs.status = 'expired' AND fs.grace_period_ends_at IS NOT NULL AND now() < fs.grace_period_ends_at)
    )
  ORDER BY fs.created_at DESC
  LIMIT 1;

  IF _farmer_sub_plan_id IS NULL THEN
    _farmer_sub_plan_id := _free_plan_id;
    _farmer_sub_status := 'expired_downgraded';
    _downgraded := true;
  END IF;

  IF _farmer_sub_plan_id IS NOT NULL THEN
    SELECT name, plan_type, COALESCE(features,'{}'::jsonb), COALESCE(limits,'{}'::jsonb)
      INTO _plan_name, _plan_type, _features, _limits
    FROM public.subscription_plans WHERE id = _farmer_sub_plan_id;
  END IF;

  FOR _r IN
    SELECT custom_features, custom_limits
    FROM public.tenant_farmer_pricing
    WHERE tenant_id = p_tenant AND base_plan_id = _farmer_sub_plan_id AND is_active = true
    LIMIT 1
  LOOP
    IF _r.custom_features IS NOT NULL THEN _features := _features || _r.custom_features; END IF;
    IF _r.custom_limits   IS NOT NULL THEN _limits   := _limits   || _r.custom_limits;   END IF;
  END LOOP;

  -- Per-feature entitlement map.
  -- Tenant master features act as a HARD GATE (must not be explicitly false).
  -- The actual grant must come from the plan (tfpf) or a tenant grant (tfg).
  -- Default is denied (false) when no explicit grant exists.
  SELECT COALESCE(jsonb_object_agg(code, entry), '{}'::jsonb) INTO _features
  FROM (
    SELECT
      f.code,
      jsonb_build_object(
        'enabled',
          (NOT _tenant_blocked)
          AND (
            NOT (_tenant_features ? f.code)
            OR jsonb_typeof(_tenant_features->f.code) <> 'boolean'
            OR (_tenant_features->>f.code)::boolean = true
          )
          AND COALESCE(tfpf.enabled, tfg.enabled, false),
        'quota', COALESCE(tfpf.quota, tfg.quota),
        'unit', f.quota_unit,
        'used_today', COALESCE(uday.count, 0),
        'used_month', COALESCE(umon.count, 0),
        'tokens_today', COALESCE(uday.tokens, 0),
        'resets_at', CASE
          WHEN f.quota_unit IN ('per_day','tokens_per_day')
            THEN ((_today + INTERVAL '1 day')::timestamp AT TIME ZONE _tz)
          WHEN f.quota_unit = 'per_month'
            THEN ((_month + INTERVAL '1 month')::timestamp AT TIME ZONE _tz)
          ELSE NULL
        END,
        'source', CASE
          WHEN tfpf.feature_code IS NOT NULL THEN 'tenant_plan_override'
          WHEN tfg.feature_code IS NOT NULL THEN 'tenant_grant'
          WHEN _tenant_features ? f.code THEN 'tenant_master'
          ELSE 'plan_base'
        END
      ) AS entry
    FROM public.features f
    LEFT JOIN public.tenant_farmer_plan_features tfpf
      ON tfpf.feature_code = f.code
     AND tfpf.tenant_id = p_tenant
     AND tfpf.plan_id   = _farmer_sub_plan_id
    LEFT JOIN public.tenant_feature_grants tfg
      ON tfg.feature_code = f.code
     AND tfg.tenant_id = p_tenant
     AND (tfg.expires_at IS NULL OR tfg.expires_at > now())
    LEFT JOIN public.farmer_feature_usage uday
      ON uday.farmer_id = p_farmer AND uday.feature_code = f.code AND uday.period = _today
    LEFT JOIN public.farmer_feature_usage umon
      ON umon.farmer_id = p_farmer AND umon.feature_code = f.code AND umon.period = _month
    WHERE f.is_active
  ) sub;

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
      'subscription_id', _tenant_sub_id,
      'status', COALESCE(_tenant_sub_status, 'unknown'),
      'plan_name', _tenant_sub_plan_name,
      'period_end', _tenant_sub_period_end,
      'in_grace', _tenant_in_grace,
      'suspended', _tenant_blocked,
      'master_features', _tenant_features
    ),
    'farmer', jsonb_build_object(
      'id', p_farmer,
      'timezone', _tz,
      'subscription_id', _farmer_sub_id,
      'plan_id', _farmer_sub_plan_id,
      'plan_name', _plan_name,
      'plan_type', _plan_type,
      'status', _farmer_sub_status,
      'end_date', _farmer_sub_end_date,
      'downgraded', _downgraded,
      'in_grace', (_farmer_sub_status = 'expired'
                   AND _farmer_sub_grace IS NOT NULL
                   AND now() < _farmer_sub_grace),
      'days_remaining', GREATEST(0, COALESCE(EXTRACT(DAY FROM (_farmer_sub_end_date - now()))::int, 0))
    ),
    'features', _features,
    'limits', _limits,
    'lands', jsonb_build_object('used', _land_count),
    'now', now(),
    'today', _today
  );
END;
$$;
