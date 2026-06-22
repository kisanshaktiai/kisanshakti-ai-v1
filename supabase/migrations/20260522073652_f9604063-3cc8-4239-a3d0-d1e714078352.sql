-- Fix: tenant_features is column-per-feature, not jsonb. Remove the broken tenant gate
-- from check_farmer_quota; tenant_farmer_plan_features.enabled is already the effective gate.
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
AS $$
DECLARE
  _tenant uuid;
  _plan uuid;
  _free_plan uuid;
  _tz text;
  _enabled boolean := false;
  _quota int;
  _unit text;
  _period date;
  _used int;
  _tokens_used bigint;
BEGIN
  SELECT id INTO _free_plan
  FROM public.subscription_plans
  WHERE name = 'Free' AND is_active = true
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  SELECT f.tenant_id, COALESCE(f.timezone, 'Asia/Kolkata'), fs.plan_id
    INTO _tenant, _tz, _plan
  FROM public.farmers f
  LEFT JOIN public.farmer_subscriptions fs
    ON fs.farmer_id = f.id
   AND fs.status IN ('active', 'trial', 'trialing')
   AND (fs.end_date IS NULL OR fs.end_date > now() OR (fs.grace_period_ends_at IS NOT NULL AND fs.grace_period_ends_at > now()))
  WHERE f.id = _farmer
    AND COALESCE(f.is_active, true) = true
  ORDER BY fs.created_at DESC NULLS LAST
  LIMIT 1;

  IF _tenant IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'farmer_not_found');
  END IF;

  _plan := COALESCE(_plan, _free_plan);

  SELECT f.quota_unit INTO _unit
  FROM public.features f
  WHERE f.code = _feature AND f.is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_not_found');
  END IF;

  SELECT tfpf.enabled, tfpf.quota
    INTO _enabled, _quota
  FROM public.tenant_farmer_plan_features tfpf
  WHERE tfpf.feature_code = _feature
    AND tfpf.tenant_id = _tenant
    AND tfpf.plan_id = _plan
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT pf.enabled, pf.quota
      INTO _enabled, _quota
    FROM public.plan_features pf
    WHERE pf.feature_code = _feature
      AND pf.plan_id = _plan
    LIMIT 1;
  END IF;

  IF COALESCE(_enabled, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_disabled', 'feature', _feature);
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_farmer_quota(uuid, text, integer, bigint, boolean) TO authenticated, anon;

-- Same fix in the land insert trigger: remove broken tenant gate; tfpf.enabled is authoritative.
CREATE OR REPLACE FUNCTION public.enforce_land_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _plan uuid;
  _free_plan uuid;
  _quota int;
  _enabled boolean := false;
  _count int;
BEGIN
  SELECT id INTO _free_plan
  FROM public.subscription_plans
  WHERE name = 'Free' AND is_active = true
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  SELECT f.tenant_id, fs.plan_id INTO _tenant, _plan
  FROM public.farmers f
  LEFT JOIN public.farmer_subscriptions fs
    ON fs.farmer_id = f.id
   AND fs.status IN ('active', 'trial', 'trialing')
   AND (fs.end_date IS NULL OR fs.end_date > now() OR (fs.grace_period_ends_at IS NOT NULL AND fs.grace_period_ends_at > now()))
  WHERE f.id = NEW.farmer_id
    AND COALESCE(f.is_active, true) = true
  ORDER BY fs.created_at DESC NULLS LAST
  LIMIT 1;

  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'farmer_not_found' USING ERRCODE = 'P0001';
  END IF;

  _plan := COALESCE(_plan, _free_plan);

  SELECT tfpf.enabled, tfpf.quota INTO _enabled, _quota
  FROM public.tenant_farmer_plan_features tfpf
  WHERE tfpf.feature_code = 'my_land'
    AND tfpf.tenant_id = _tenant
    AND tfpf.plan_id = _plan
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT pf.enabled, pf.quota INTO _enabled, _quota
    FROM public.plan_features pf
    WHERE pf.feature_code = 'my_land'
      AND pf.plan_id = _plan
    LIMIT 1;
  END IF;

  IF COALESCE(_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'land_feature_disabled' USING ERRCODE = 'P0001', HINT = 'upgrade_plan';
  END IF;

  SELECT COUNT(*) INTO _count
  FROM public.lands
  WHERE farmer_id = NEW.farmer_id
    AND COALESCE(is_active, true) = true
    AND deleted_at IS NULL;

  IF _quota IS NOT NULL AND _count >= _quota THEN
    RAISE EXCEPTION 'land_quota_exceeded: limit=%, used=%', _quota, _count
      USING ERRCODE = 'P0001', HINT = 'upgrade_plan';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_land_limit ON public.lands;
CREATE TRIGGER trg_enforce_land_limit
  BEFORE INSERT ON public.lands
  FOR EACH ROW EXECUTE FUNCTION public.enforce_land_limit();