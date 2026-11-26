-- Test replica of the live objects the activation migration touches.
-- Column names, types, constraints, FK actions, grants and policies are copied
-- from the live project (read 2026-11-24). Everything else is left out.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE SCHEMA auth; CREATE SCHEMA vault;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Stand-in for Supabase Vault (same names and signature as the live extension).
CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, description text, secret text NOT NULL);
CREATE VIEW vault.decrypted_secrets AS SELECT id, name, description, secret, secret AS decrypted_secret FROM vault.secrets;
CREATE FUNCTION vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '', new_key_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.secrets(secret, name, description) VALUES (new_secret, new_name, new_description) RETURNING id $$;

-- Stand-in for pg_cron (same names and signatures as the live extension).
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS
$$ INSERT INTO cron.job(jobname, schedule, command) VALUES (job_name, schedule, command) RETURNING jobid $$;
CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean LANGUAGE sql AS
$$ WITH d AS (DELETE FROM cron.job WHERE jobname = job_name RETURNING 1) SELECT EXISTS (SELECT 1 FROM d) $$;

CREATE TYPE public.tenant_status AS ENUM ('trial','active','suspended','cancelled','archived','pending_approval');
CREATE TYPE public.user_role AS ENUM ('super_admin','tenant_owner','tenant_admin','tenant_manager','dealer','agent','farmer','tenant_viewer');
CREATE TYPE public.billing_interval AS ENUM ('monthly','quarterly','annually','biannual','lifetime');

CREATE TABLE public.tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug varchar NOT NULL UNIQUE, name varchar NOT NULL,
  status public.tenant_status, subscription_end_date timestamptz, max_farmers int DEFAULT 1000, deleted_at timestamptz,
  is_default bool DEFAULT false, suspended_at timestamptz, archived bool DEFAULT false);
CREATE TABLE public.plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.subscription_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, plan_category text, is_active bool DEFAULT true, tenant_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.tenant_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, plan_id uuid,
  billing_interval public.billing_interval NOT NULL, status text DEFAULT 'active', current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz, grace_period_ends_at timestamptz, auto_renew bool DEFAULT true, metadata jsonb DEFAULT '{}',
  cancellation_reason text, created_at timestamptz DEFAULT now());
CREATE TABLE public.feature_flags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flag_name text NOT NULL UNIQUE, description text,
  is_enabled bool NOT NULL DEFAULT false, rollout_percentage int NOT NULL DEFAULT 0, expires_at timestamptz,
  flag_type text DEFAULT 'release', flag_status text DEFAULT 'active', default_value jsonb DEFAULT 'false',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.admin_users (id uuid PRIMARY KEY, email text NOT NULL, role text NOT NULL DEFAULT 'admin', is_active bool NOT NULL DEFAULT true);
CREATE TABLE public.user_tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, tenant_id uuid NOT NULL,
  role public.user_role NOT NULL, is_primary bool DEFAULT false, is_active bool DEFAULT true, created_at timestamptz DEFAULT now());

CREATE TABLE public.farmers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farmer_code varchar UNIQUE, tenant_id uuid,
  mobile_number varchar, pin_hash varchar, metadata jsonb, is_active bool DEFAULT true, archived bool DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata', farming_preference text NOT NULL DEFAULT 'conventional', created_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX farmers_mobile_tenant_unique ON public.farmers (mobile_number, tenant_id) WHERE tenant_id IS NOT NULL;
CREATE TABLE public.accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, mobile_number text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE');
CREATE UNIQUE INDEX accounts_id_tenant_key ON public.accounts (id, tenant_id);
CREATE UNIQUE INDEX accounts_tenant_mobile_open_uidx ON public.accounts (tenant_id, mobile_number) WHERE status <> 'CLOSED';
CREATE TABLE public.account_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, tenant_id uuid NOT NULL,
  role text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE', source text NOT NULL,
  CONSTRAINT account_roles_account_tenant_fkey FOREIGN KEY (account_id, tenant_id) REFERENCES public.accounts(id, tenant_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT account_roles_account_role_key UNIQUE (account_id, role), CONSTRAINT account_roles_account_role_tenant_key UNIQUE (account_id, role, tenant_id));
CREATE TABLE public.account_reach_settings (account_id uuid, role text, tenant_id uuid, radius int,
  CONSTRAINT account_reach_settings_membership_fkey FOREIGN KEY (account_id, role, tenant_id) REFERENCES public.account_roles(account_id, role, tenant_id) ON UPDATE CASCADE ON DELETE CASCADE);
CREATE TABLE public.user_profiles (id uuid PRIMARY KEY, tenant_id uuid, farmer_id uuid NOT NULL, mobile_number text UNIQUE);
CREATE TABLE public.farmer_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farmer_id uuid NOT NULL UNIQUE, tenant_id uuid NOT NULL,
  tenant_subscription_id uuid, plan_id uuid NOT NULL, billing_interval public.billing_interval NOT NULL DEFAULT 'monthly', status text NOT NULL DEFAULT 'trial',
  start_date timestamptz NOT NULL DEFAULT now(), end_date timestamptz, auto_renew bool NOT NULL DEFAULT true, metadata jsonb DEFAULT '{}',
  paid_by_tenant bool DEFAULT false, paying_tenant_id uuid, next_billing_date timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
-- two tables of the kind a farmer fills once the app is unlocked
CREATE TABLE public.lands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farmer_id uuid, tenant_id uuid, name text);
CREATE TABLE public.ai_chat_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farmer_id uuid, tenant_id uuid);

-- an append-only table of the kind the live project has five of (it refuses UPDATE)
CREATE TABLE public.account_reach_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid, tenant_id uuid, note text);
CREATE FUNCTION public.account_reach_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'account_reach_history is append-only'; END $$;
CREATE TRIGGER trg_account_reach_history_append_only BEFORE UPDATE OR DELETE ON public.account_reach_history FOR EACH ROW EXECUTE FUNCTION public.account_reach_history_append_only();
-- legacy activation tables, as they are live today
CREATE TABLE public.activation_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar NOT NULL, tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_active bool DEFAULT true, max_uses int, used_count int DEFAULT 0, created_at timestamptz DEFAULT now(), expires_at timestamptz, last_used_at timestamptz,
  created_by uuid, metadata jsonb DEFAULT '{}', plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  redeemed_by uuid REFERENCES public.farmers(id) ON DELETE SET NULL, redeemed_at timestamptz, status varchar DEFAULT 'active', archived bool DEFAULT false,
  CONSTRAINT activation_codes_code_key UNIQUE (code),
  CONSTRAINT activation_codes_status_check CHECK (status::text = ANY (ARRAY['active','used','expired','cancelled'])));
CREATE TABLE public.activation_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activation_code_id uuid NOT NULL REFERENCES public.activation_codes(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE, ip_address text, user_agent text, success bool DEFAULT true,
  error_message text, metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());

CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
$$ SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND is_active = true AND role IN ('super_admin','platform_admin')) $$;
CREATE FUNCTION public.is_authenticated_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND is_active = true AND role IN ('super_admin','platform_admin','admin')) $$;
CREATE FUNCTION public.is_tenant_admin(_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS
$$ SELECT EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = _tenant_id
                   AND ut.role IN ('tenant_admin'::user_role,'tenant_owner'::user_role) AND ut.is_active = true) $$;

-- live farmer-side triggers that matter here, reduced to their effect
CREATE FUNCTION public.t_link_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.accounts(id, tenant_id, mobile_number) VALUES (NEW.id, NEW.tenant_id, NEW.mobile_number);
  INSERT INTO public.account_roles(account_id, tenant_id, role, source) VALUES (NEW.id, NEW.tenant_id, 'FARMER', 'FARMER_TRIGGER');
  RETURN NULL;
END $$;
CREATE TRIGGER on_farmer_account_created AFTER INSERT ON public.farmers FOR EACH ROW EXECUTE FUNCTION public.t_link_account();
CREATE FUNCTION public.set_farmer_tenant_id() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN IF NEW.tenant_id IS NULL THEN SELECT tenant_id INTO NEW.tenant_id FROM public.user_tenants WHERE user_id = NEW.id AND is_active LIMIT 1; END IF; RETURN NEW; END $$;
CREATE TRIGGER set_farmer_tenant_id_trigger BEFORE INSERT OR UPDATE ON public.farmers FOR EACH ROW EXECUTE FUNCTION public.set_farmer_tenant_id();
-- copied from the live function body: farmer plans are biannual/annually and end_date is derived
CREATE FUNCTION public.fn_farmer_subscription_normalize() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_category text; v_interval_changed boolean := false;
BEGIN
  SELECT plan_category INTO v_category FROM public.subscription_plans WHERE id = NEW.plan_id;
  IF TG_OP = 'UPDATE' THEN v_interval_changed := NEW.billing_interval IS DISTINCT FROM OLD.billing_interval; END IF;
  IF v_category = 'farmer' AND (TG_OP = 'INSERT' OR v_interval_changed) AND NEW.billing_interval::text NOT IN ('biannual','annually') THEN
    RAISE EXCEPTION 'Invalid billing_interval % for farmer plan. Only half-yearly (biannual) or annually allowed.', NEW.billing_interval; END IF;
  IF NEW.start_date IS NULL THEN NEW.start_date := now(); END IF;
  IF NEW.status NOT IN ('canceled','expired') THEN
    IF NEW.billing_interval::text = 'biannual' THEN NEW.end_date := NEW.start_date + INTERVAL '6 months';
    ELSIF NEW.billing_interval::text = 'annually' THEN NEW.end_date := NEW.start_date + INTERVAL '1 year';
    ELSIF NEW.billing_interval::text = 'monthly' THEN NEW.end_date := NEW.start_date + INTERVAL '1 month';
    ELSIF NEW.billing_interval::text = 'quarterly' THEN NEW.end_date := NEW.start_date + INTERVAL '3 months'; END IF;
    IF NEW.auto_renew THEN NEW.next_billing_date := NEW.end_date; END IF;
  END IF;
  NEW.updated_at := now(); RETURN NEW;
END $$;
CREATE TRIGGER trg_farmer_subscription_normalize BEFORE INSERT OR UPDATE ON public.farmer_subscriptions FOR EACH ROW EXECUTE FUNCTION public.fn_farmer_subscription_normalize();

-- live RLS + grants on the tables under test
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role has full access to farmers" ON public.farmers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Tenant admins manage farmers" ON public.farmers FOR ALL USING (tenant_id IN (SELECT ut.tenant_id FROM public.user_tenants ut
  WHERE ut.user_id = auth.uid() AND ut.role = ANY (ARRAY['tenant_admin'::user_role,'tenant_owner'::user_role]) AND ut.is_active));
GRANT INSERT, UPDATE, DELETE ON public.farmers TO authenticated; GRANT SELECT ON public.farmers TO authenticated;
GRANT ALL ON public.farmers TO service_role;
-- live RLS + grants on the two tables that hold the licence (as read from the live project 2026-11-25)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select_via_user_tenants ON public.tenants FOR SELECT USING (public.is_super_admin() OR EXISTS (
  SELECT 1 FROM public.user_tenants ut WHERE ut.tenant_id = tenants.id AND ut.user_id = auth.uid() AND ut.is_active = true));
CREATE POLICY tenant_admins_can_update_tenant ON public.tenants FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenants.id AND ut.is_active = true
                 AND ut.role = ANY (ARRAY['tenant_owner'::user_role, 'tenant_admin'::user_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenants.id AND ut.is_active = true
                 AND ut.role = ANY (ARRAY['tenant_owner'::user_role, 'tenant_admin'::user_role])));
GRANT UPDATE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_subscriptions_owner_manage ON public.tenant_subscriptions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_subscriptions.tenant_id
                 AND ut.role = ANY (ARRAY['tenant_owner'::user_role, 'tenant_admin'::user_role]) AND ut.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_subscriptions.tenant_id
                 AND ut.role = ANY (ARRAY['tenant_owner'::user_role, 'tenant_admin'::user_role]) AND ut.is_active = true));
CREATE POLICY tenant_subscriptions_super_admin_all ON public.tenant_subscriptions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.role = 'super_admin'::user_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.role = 'super_admin'::user_role));
CREATE POLICY tenant_subscriptions_tenant_view ON public.tenant_subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_subscriptions.tenant_id AND ut.is_active = true));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_subscriptions TO authenticated;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all activation logs" ON public.activation_logs FOR ALL USING (public.is_authenticated_admin());
CREATE POLICY "System can insert activation logs" ON public.activation_logs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Tenant admins can view activation logs" ON public.activation_logs FOR SELECT USING (tenant_id IN (SELECT ut.tenant_id FROM public.user_tenants ut
  WHERE ut.user_id = auth.uid() AND ut.is_active = true AND ut.role = ANY (ARRAY['tenant_admin'::user_role,'tenant_owner'::user_role])));
GRANT ALL ON public.activation_codes, public.activation_logs TO authenticated, service_role;
GRANT SELECT ON public.tenants, public.user_tenants, public.admin_users, public.subscription_plans TO authenticated, service_role;
GRANT ALL ON public.accounts, public.account_roles, public.user_profiles, public.farmer_subscriptions, public.tenant_subscriptions, public.lands, public.account_reach_history TO service_role;
-- Supabase gives new public functions to all three API roles by default
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- seed: default (holding) tenant D, tenants A and B, one farmer plan, people
INSERT INTO public.tenants(id, slug, name, status, is_default, max_farmers) VALUES
 ('d0000000-0000-0000-0000-000000000000','holding','Default tenant','active',true,1000),
 ('a0000000-0000-0000-0000-000000000000','tenant-a','Tenant A','active',false,1000),
 ('b0000000-0000-0000-0000-000000000000','tenant-b','Tenant B','active',false,1000),
 ('c0000000-0000-0000-0000-000000000000','tenant-c','Tenant C','active',false,1000);
INSERT INTO public.subscription_plans(id, name, plan_category) VALUES
 ('f1000000-0000-0000-0000-000000000000','Kisan','farmer'), ('f2000000-0000-0000-0000-000000000000','Starter','tenant');
INSERT INTO public.tenant_subscriptions(tenant_id, billing_interval, status, current_period_end) VALUES
 ('a0000000-0000-0000-0000-000000000000','annually','active', now() + interval '300 days'),
 ('b0000000-0000-0000-0000-000000000000','annually','active', now() + interval '300 days');
INSERT INTO public.admin_users(id, email, role) VALUES ('50000000-0000-0000-0000-000000000001','super@test','super_admin'),
 ('50000000-0000-0000-0000-000000000002','plain@test','admin');
INSERT INTO public.user_tenants(user_id, tenant_id, role) VALUES
 ('aa000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000000','tenant_admin'),
 ('bb000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000000','tenant_owner'),
 ('aa000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000000','tenant_viewer'),
 ('cc000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000000','tenant_admin'),
 ('50000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000000','super_admin');
-- 3 farmers that exist before the feature, like today's 28
INSERT INTO public.farmers(tenant_id, mobile_number) SELECT 'd0000000-0000-0000-0000-000000000000', '90000000' || lpad(g::text,2,'0') FROM generate_series(1,3) g;

-- ── app gate (20261125230000): the farmer session machinery ─────────────────
-- user_sessions reduced to the columns the two context functions read. The two
-- functions are the live bodies as audited on 2026-11-25, byte for byte: the
-- migration's pre-flight compares their md5, and run.sh proves it passes here.
CREATE TABLE public.user_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, session_id text NOT NULL DEFAULT gen_random_uuid()::text,
  access_token_hash text, expires_at timestamptz NOT NULL, is_active bool DEFAULT true, active_role text);
GRANT ALL ON public.user_sessions TO service_role;
REVOKE ALL ON public.user_sessions FROM anon, authenticated;
CREATE FUNCTION public.hash_session_token(_token text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT CASE WHEN _token IS NULL OR _token = '' THEN NULL
              ELSE encode(sha256(convert_to(_token, 'UTF8')), 'hex') END
$function$;
CREATE FUNCTION public.verified_session_context()
 RETURNS TABLE(session_id uuid, farmer_id uuid, tenant_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.id, f.id, f.tenant_id
  FROM public.user_sessions s
  JOIN public.farmers f ON f.id = s.user_id
  JOIN public.accounts a
    ON a.id = f.id
   AND a.status = 'ACTIVE'
  JOIN public.account_roles r
    ON r.account_id = a.id
   AND r.role = 'FARMER'
   AND r.status = 'ACTIVE'
  WHERE s.access_token_hash = public.hash_session_token(
          current_setting('request.headers', true)::json ->> 'x-session-token')
    AND s.is_active = true
    AND s.expires_at > now()
    AND f.is_active = true
    AND (s.active_role IS NULL OR s.active_role = 'FARMER')
  LIMIT 1
$function$;
CREATE FUNCTION public.verified_account_context()
 RETURNS TABLE(session_id uuid, account_id uuid, tenant_id uuid, active_role text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.id, a.id, a.tenant_id, r.role
  FROM public.user_sessions s
  JOIN public.accounts a
    ON a.id = s.user_id
   AND a.status = 'ACTIVE'
  JOIN public.account_roles r
    ON r.account_id = a.id
   AND r.tenant_id = a.tenant_id
   AND r.role = COALESCE(s.active_role, 'FARMER')
   AND r.status = 'ACTIVE'
  WHERE s.access_token_hash = public.hash_session_token(
          current_setting('request.headers', true)::json ->> 'x-session-token')
    AND s.is_active = true
    AND s.expires_at > now()
    AND (r.role <> 'FARMER'
         OR EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = a.id AND f.is_active = true))
  LIMIT 1
$function$;
CREATE FUNCTION public.get_current_farmer_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT farmer_id FROM public.verified_session_context()
$function$;
CREATE FUNCTION public.get_current_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT tenant_id FROM public.verified_session_context()
$function$;
-- a farmer-owned table behind the same kind of RLS policy the live app uses
ALTER TABLE public.lands ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lands TO anon, authenticated;
CREATE POLICY lands_farmer_own ON public.lands FOR ALL TO anon, authenticated
  USING (farmer_id = public.get_current_farmer_id() AND tenant_id = public.get_current_tenant_id())
  WITH CHECK (farmer_id = public.get_current_farmer_id() AND tenant_id = public.get_current_tenant_id());
