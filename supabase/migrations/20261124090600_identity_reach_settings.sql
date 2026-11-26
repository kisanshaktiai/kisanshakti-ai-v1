-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124090600_identity_reach_settings.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M1 — file 7 of 8: Reach settings.
--
-- Reach = a viewer's base village plus a radius in km, set separately for the
-- SERVICE_PROVIDER and the CUSTOMER role of an account. The FARMER role has none.
--
--   account_reach_settings  one row per account and role: base village (a row of
--                           the existing villages master, never an address and
--                           never typed coordinates), radius, when it last changed.
--   account_reach_history   append-only log of every set and change.
--   account_reach_policy()  reads and sanity-checks system_config.account_reach_policy
--                           (seeded by 20261124090700). No valid policy → no row →
--                           the functions below refuse to work (fail closed).
--   set_account_reach(role, village, radius)   the ONLY way to write Reach.
--   get_account_reach(role)                    the caller's own Reach, the bounds
--                                              for the slider and the changes left.
--
-- set_account_reach rules, all enforced here in the database:
--   * identity and role come from verified_account_context(), never from the caller;
--     the session's active role must be the role being set;
--   * the village must exist, be active and have a centre point;
--   * the radius must lie inside the configured bounds and on the configured step;
--   * change throttle (D9): at most change_limit_count changes inside
--     change_limit_window_days, counted per ACCOUNT across both roles, as in the
--     starter values ("3 per 7 days per account"). The first time a role's Reach is
--     set is not a change, and re-sending the current values is not a change.
--     A per-account advisory lock makes parallel calls queue, so the limit holds
--     under repeated and concurrent calls.
--
-- Errors are raised as stable codes (the client maps them to i18n keys):
--   NOT_AUTHENTICATED, REACH_ROLE_INVALID, REACH_ROLE_NOT_ACTIVE, REACH_POLICY_MISSING,
--   REACH_RADIUS_OUT_OF_BOUNDS, REACH_RADIUS_OFF_STEP, REACH_VILLAGE_INVALID,
--   REACH_CHANGE_LIMIT_REACHED (DETAIL carries the UTC time the next change opens).
--
-- No client role can read or write the two tables. Both functions take no account
-- argument, so one account can never read or write another account's Reach.
--
-- For review: base_village_id references villages(id) with the default NO ACTION,
-- so a village that is somebody's base cannot be hard-deleted by a village loader
-- (deactivating it with is_active = false still works).
--
-- Safe to run twice. Plain statements, no session state.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.account_reach_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL,
  tenant_id        uuid NOT NULL,
  role             text NOT NULL,
  base_village_id  uuid NOT NULL REFERENCES public.villages(id),
  radius_km        integer NOT NULL,
  changed_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_reach_settings_role_check   CHECK (role IN ('SERVICE_PROVIDER', 'CUSTOMER')),
  CONSTRAINT account_reach_settings_radius_check CHECK (radius_km > 0),
  CONSTRAINT account_reach_settings_account_role_key UNIQUE (account_id, role),
  -- One key proves both that the membership exists and that the row carries the
  -- membership's own tenant.
  CONSTRAINT account_reach_settings_membership_fkey FOREIGN KEY (account_id, role, tenant_id)
    REFERENCES public.account_roles (account_id, role, tenant_id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_reach_settings_village
  ON public.account_reach_settings (base_village_id);

-- No foreign keys on purpose: history must outlive the rows it describes.
CREATE TABLE IF NOT EXISTS public.account_reach_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL,
  tenant_id       uuid NOT NULL,
  role            text NOT NULL,
  change_kind     text NOT NULL,
  old_village_id  uuid,
  old_radius_km   integer,
  new_village_id  uuid NOT NULL,
  new_radius_km   integer NOT NULL,
  session_id      uuid,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_reach_history_kind_check CHECK (change_kind IN ('INITIAL', 'CHANGE'))
);

CREATE INDEX IF NOT EXISTS idx_account_reach_history_account_time
  ON public.account_reach_history (account_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.account_reach_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'account_reach_history is append-only' USING errcode = '42501';
END
$fn$;

CREATE OR REPLACE TRIGGER trg_account_reach_history_append_only
  BEFORE UPDATE OR DELETE ON public.account_reach_history
  FOR EACH ROW EXECUTE FUNCTION public.account_reach_history_append_only();

CREATE OR REPLACE TRIGGER trg_account_reach_history_no_truncate
  BEFORE TRUNCATE ON public.account_reach_history
  FOR EACH STATEMENT EXECUTE FUNCTION public.account_reach_history_append_only();

-- The policy row, as typed columns. Returns no row unless every value is present
-- and the set is coherent.
CREATE OR REPLACE FUNCTION public.account_reach_policy()
RETURNS TABLE(radius_min_km integer, radius_max_km integer, radius_step_km integer,
              radius_default_km integer, change_limit_count integer, change_limit_window_days integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT p.radius_min_km, p.radius_max_km, p.radius_step_km,
         p.radius_default_km, p.change_limit_count, p.change_limit_window_days
  FROM (
    SELECT (c.config_value ->> 'radius_min_km')::integer            AS radius_min_km,
           (c.config_value ->> 'radius_max_km')::integer            AS radius_max_km,
           (c.config_value ->> 'radius_step_km')::integer           AS radius_step_km,
           (c.config_value ->> 'radius_default_km')::integer        AS radius_default_km,
           (c.config_value ->> 'change_limit_count')::integer       AS change_limit_count,
           (c.config_value ->> 'change_limit_window_days')::integer AS change_limit_window_days
    FROM public.system_config c
    WHERE c.config_key = 'account_reach_policy'
      AND jsonb_typeof(c.config_value) = 'object'
  ) p
  WHERE p.radius_min_km > 0
    AND p.radius_max_km >= p.radius_min_km
    AND p.radius_step_km > 0
    AND (p.radius_max_km - p.radius_min_km) % p.radius_step_km = 0
    AND p.radius_default_km BETWEEN p.radius_min_km AND p.radius_max_km
    AND (p.radius_default_km - p.radius_min_km) % p.radius_step_km = 0
    AND p.change_limit_count >= 0
    AND p.change_limit_window_days > 0
$fn$;

CREATE OR REPLACE FUNCTION public.get_account_reach(p_role text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ctx     record;
  v_pol     record;
  v_cur     public.account_reach_settings%ROWTYPE;
  v_has     boolean;
  v_used    integer;
  v_oldest  timestamptz;
BEGIN
  SELECT * INTO v_ctx FROM public.verified_account_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING errcode = '42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('SERVICE_PROVIDER', 'CUSTOMER') THEN
    RAISE EXCEPTION 'REACH_ROLE_INVALID';
  END IF;
  IF v_ctx.active_role <> p_role THEN
    RAISE EXCEPTION 'REACH_ROLE_NOT_ACTIVE' USING errcode = '42501';
  END IF;

  SELECT * INTO v_pol FROM public.account_reach_policy();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REACH_POLICY_MISSING';
  END IF;

  SELECT * INTO v_cur
    FROM public.account_reach_settings
   WHERE account_id = v_ctx.account_id AND role = p_role;
  v_has := FOUND;

  SELECT count(*)::integer, min(h.changed_at) INTO v_used, v_oldest
    FROM public.account_reach_history h
   WHERE h.account_id = v_ctx.account_id
     AND h.change_kind = 'CHANGE'
     AND h.changed_at > now() - make_interval(days => v_pol.change_limit_window_days);

  RETURN jsonb_build_object(
    'role',              p_role,
    'is_set',            v_has,
    'base_village_id',   v_cur.base_village_id,
    'radius_km',         v_cur.radius_km,
    'changed_at',        v_cur.changed_at,
    'policy',            jsonb_build_object(
                           'radius_min_km',            v_pol.radius_min_km,
                           'radius_max_km',            v_pol.radius_max_km,
                           'radius_step_km',           v_pol.radius_step_km,
                           'radius_default_km',        v_pol.radius_default_km,
                           'change_limit_count',       v_pol.change_limit_count,
                           'change_limit_window_days', v_pol.change_limit_window_days),
    'changes_used',      v_used,
    'changes_remaining', GREATEST(v_pol.change_limit_count - v_used, 0),
    'next_change_at',    CASE WHEN v_used >= v_pol.change_limit_count AND v_oldest IS NOT NULL
                              THEN v_oldest + make_interval(days => v_pol.change_limit_window_days) END
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.set_account_reach(p_role text, p_village_id uuid, p_radius_km integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ctx     record;
  v_pol     record;
  v_cur     public.account_reach_settings%ROWTYPE;
  v_has     boolean;
  v_used    integer;
  v_oldest  timestamptz;
BEGIN
  SELECT * INTO v_ctx FROM public.verified_account_context();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING errcode = '42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('SERVICE_PROVIDER', 'CUSTOMER') THEN
    RAISE EXCEPTION 'REACH_ROLE_INVALID';
  END IF;
  IF v_ctx.active_role <> p_role THEN
    RAISE EXCEPTION 'REACH_ROLE_NOT_ACTIVE' USING errcode = '42501';
  END IF;

  SELECT * INTO v_pol FROM public.account_reach_policy();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REACH_POLICY_MISSING';
  END IF;

  IF p_radius_km IS NULL OR p_radius_km < v_pol.radius_min_km OR p_radius_km > v_pol.radius_max_km THEN
    RAISE EXCEPTION 'REACH_RADIUS_OUT_OF_BOUNDS';
  END IF;
  IF (p_radius_km - v_pol.radius_min_km) % v_pol.radius_step_km <> 0 THEN
    RAISE EXCEPTION 'REACH_RADIUS_OFF_STEP';
  END IF;
  IF p_village_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.villages v
        WHERE v.id = p_village_id AND v.is_active = true
          AND v.center_lat IS NOT NULL AND v.center_lon IS NOT NULL) THEN
    RAISE EXCEPTION 'REACH_VILLAGE_INVALID';
  END IF;

  -- One writer per account at a time: the count below and the write that follows
  -- cannot interleave with another call for the same account.
  PERFORM pg_advisory_xact_lock(hashtextextended('account_reach:' || v_ctx.account_id::text, 0));

  SELECT * INTO v_cur
    FROM public.account_reach_settings
   WHERE account_id = v_ctx.account_id AND role = p_role;
  v_has := FOUND;

  IF v_has AND v_cur.base_village_id = p_village_id AND v_cur.radius_km = p_radius_km THEN
    RETURN public.get_account_reach(p_role);            -- nothing to change, nothing counted
  END IF;

  IF NOT v_has THEN
    INSERT INTO public.account_reach_settings (account_id, tenant_id, role, base_village_id, radius_km)
    VALUES (v_ctx.account_id, v_ctx.tenant_id, p_role, p_village_id, p_radius_km);

    INSERT INTO public.account_reach_history
      (account_id, tenant_id, role, change_kind, new_village_id, new_radius_km, session_id)
    VALUES
      (v_ctx.account_id, v_ctx.tenant_id, p_role, 'INITIAL', p_village_id, p_radius_km, v_ctx.session_id);
  ELSE
    SELECT count(*)::integer, min(h.changed_at) INTO v_used, v_oldest
      FROM public.account_reach_history h
     WHERE h.account_id = v_ctx.account_id
       AND h.change_kind = 'CHANGE'
       AND h.changed_at > now() - make_interval(days => v_pol.change_limit_window_days);

    IF v_used >= v_pol.change_limit_count THEN
      RAISE EXCEPTION 'REACH_CHANGE_LIMIT_REACHED'
        USING DETAIL = to_char(
          (COALESCE(v_oldest, now()) + make_interval(days => v_pol.change_limit_window_days)) AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    END IF;

    UPDATE public.account_reach_settings
       SET base_village_id = p_village_id, radius_km = p_radius_km, changed_at = now()
     WHERE id = v_cur.id;

    INSERT INTO public.account_reach_history
      (account_id, tenant_id, role, change_kind, old_village_id, old_radius_km, new_village_id, new_radius_km, session_id)
    VALUES
      (v_ctx.account_id, v_ctx.tenant_id, p_role, 'CHANGE', v_cur.base_village_id, v_cur.radius_km,
       p_village_id, p_radius_km, v_ctx.session_id);
  END IF;

  RETURN public.get_account_reach(p_role);
END
$fn$;

-- Lock-down ─────────────────────────────────────────────────────────────────
ALTER TABLE public.account_reach_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_reach_history  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.account_reach_settings, public.account_reach_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_reach_settings TO service_role;
GRANT SELECT, INSERT ON public.account_reach_history TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.account_reach_history FROM service_role;

REVOKE EXECUTE ON FUNCTION public.account_reach_history_append_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_reach_policy()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_account_reach(text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_account_reach(text)                FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_account_reach(text, uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_account_reach(text)                TO anon, authenticated, service_role;

COMMENT ON TABLE public.account_reach_settings IS
  'Reach of an account for its SERVICE_PROVIDER or CUSTOMER role: base village and radius. Written only by set_account_reach().';
COMMENT ON TABLE public.account_reach_history IS
  'Append-only log of every Reach set and change. Feeds the change throttle.';

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'client privileges left on reach tables' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('account_reach_settings', 'account_reach_history')
   AND grantee IN ('anon', 'authenticated', 'PUBLIC');
