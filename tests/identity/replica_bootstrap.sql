-- ═══════════════════════════════════════════════════════════════════════════
-- tests/identity/replica_bootstrap.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Local replica of the live objects the identity migrations (20261124090000 …
-- 20261124090700) touch or depend on. Every shape below was read from project
-- qfklkkzxemsbeniyugiz with read-only catalog queries on 2026-11-24:
-- columns, constraints, indexes, triggers, function bodies, policies, table and
-- column grants, and the default privileges of the `postgres` role.
--
-- Known differences from the live project (also listed in the M1 report):
--   * PostgreSQL 16 here, 17 live. No PostGIS: user_profiles.coordinates and
--     villages.boundary are text placeholders (no migration statement reads them).
--   * Only the tables below exist. Live has 86 foreign keys pointing at farmers;
--     here only user_profiles and farmer_subscriptions point at it.
--   * farmer_subscriptions carries its normalize trigger (it decides whether the
--     auto-enrol insert succeeds) but not its two audit triggers.
--   * auth.users, subscriptions, talukas, states and districts are key-only stubs.
-- Never run this against a Supabase project: it creates roles.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- Live default privileges of role postgres in schema public (pg_default_acl):
-- tables arwdDxtm, functions X, sequences rwU for anon, authenticated, service_role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ── enums (labels and order as live) ────────────────────────────────────────
CREATE TYPE public.language_code AS ENUM ('en','hi','mr','pa','gu','te','ta','kn','ml','or','bn','ur','ne');
CREATE TYPE public.subscription_plan AS ENUM ('Kisan_Basic','Shakti_Growth','AI_Enterprise','custom');
CREATE TYPE public.tenant_status AS ENUM ('trial','active','suspended','cancelled','archived','pending_approval');
CREATE TYPE public.tenant_type AS ENUM ('agri_company','dealer','ngo','government','university','sugar_factory','cooperative','insurance');
CREATE TYPE public.user_role AS ENUM ('super_admin','tenant_owner','tenant_admin','tenant_manager','dealer','agent','farmer','tenant_viewer');
CREATE TYPE public.billing_interval AS ENUM ('monthly','quarterly','annually','biannual','lifetime');
CREATE TYPE public.subscription_plan_type AS ENUM ('basic','premium','enterprise','custom');

-- ── key-only stubs ──────────────────────────────────────────────────────────
CREATE TABLE public.subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.states    (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.districts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.talukas   (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);

-- ── shared trigger functions (bodies as live) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ── tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  slug character varying(50) NOT NULL,
  name character varying(255) NOT NULL,
  type tenant_type NOT NULL,
  status tenant_status DEFAULT 'trial'::tenant_status,
  owner_name character varying(255),
  owner_email character varying(255),
  owner_phone character varying(20),
  business_registration character varying(100),
  business_address jsonb,
  established_date date,
  subscription_plan subscription_plan DEFAULT 'Kisan_Basic'::subscription_plan,
  subscription_start_date timestamp with time zone DEFAULT now(),
  subscription_end_date timestamp with time zone,
  trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
  max_farmers integer DEFAULT 1000,
  max_dealers integer DEFAULT 50,
  max_products integer DEFAULT 100,
  max_storage_gb integer DEFAULT 10,
  max_api_calls_per_day integer DEFAULT 10000,
  subdomain character varying(100),
  custom_domain character varying(255),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  settings jsonb DEFAULT '{}'::jsonb,
  is_default boolean,
  branding_version integer DEFAULT 1,
  branding_updated_at timestamp with time zone DEFAULT now(),
  suspended_at timestamp with time zone,
  archived_at timestamp with time zone,
  reactivated_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  activated_at timestamp with time zone,
  onboarding_completed boolean DEFAULT false,
  onboarding_completed_at timestamp with time zone,
  stripe_customer_id text,
  billing_email text,
  billing_address jsonb,
  tax_id text,
  payment_terms text DEFAULT 'immediate'::text,
  commission_rate numeric(5,2) DEFAULT 0.00,
  payout_method character varying(50) DEFAULT 'bank_transfer'::character varying,
  bank_details jsonb DEFAULT '{}'::jsonb,
  kyc_status character varying(20) DEFAULT 'pending'::character varying,
  kyc_documents jsonb DEFAULT '[]'::jsonb,
  archived boolean DEFAULT false,
  domain_config jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT tenants_pkey PRIMARY KEY (id)
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ── user_tenants ────────────────────────────────────────────────────────────
CREATE TABLE public.user_tenants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  role user_role NOT NULL,
  permissions jsonb DEFAULT '[]'::jsonb,
  is_primary boolean DEFAULT false,
  is_active boolean DEFAULT true,
  invited_by uuid,
  invited_at timestamp with time zone,
  joined_at timestamp with time zone,
  department character varying(100),
  designation character varying(100),
  employee_id character varying(50),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT user_tenants_pkey PRIMARY KEY (id),
  CONSTRAINT user_tenants_user_id_tenant_id_key UNIQUE (user_id, tenant_id),
  CONSTRAINT user_tenants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT user_tenants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT user_tenants_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id)
);
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_tenants_select_simplified ON public.user_tenants FOR SELECT TO public USING (user_id = auth.uid());
CREATE POLICY user_tenants_update_profile ON public.user_tenants FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── subscription tables (auto-enrol trigger on farmers reads/writes these) ───
CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  plan_type subscription_plan_type NOT NULL,
  price_monthly numeric(10,2),
  price_quarterly numeric(10,2),
  price_annually numeric(10,2),
  features jsonb DEFAULT '[]'::jsonb,
  limits jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  is_custom boolean DEFAULT false,
  tenant_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  stripe_product_id text,
  stripe_price_id_monthly text,
  stripe_price_id_annually text,
  plan_category text DEFAULT 'farmer'::text,
  billing_interval text DEFAULT 'monthly'::text,
  trial_days integer DEFAULT 0,
  is_public boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_by_tenant_id uuid,
  is_custom_plan boolean DEFAULT false,
  parent_plan_id uuid,
  price_half_yearly numeric,
  CONSTRAINT subscription_plans_pkey PRIMARY KEY (id),
  CONSTRAINT subscription_plans_stripe_product_id_key UNIQUE (stripe_product_id),
  CONSTRAINT subscription_plans_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['monthly'::text, 'annually'::text, 'both'::text]))),
  CONSTRAINT subscription_plans_plan_category_check CHECK ((plan_category = ANY (ARRAY['farmer'::text, 'tenant'::text])))
);
CREATE TABLE public.tenant_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid,
  plan_id uuid,
  billing_interval billing_interval NOT NULL,
  status text DEFAULT 'active'::text,
  current_period_start timestamp with time zone DEFAULT now(),
  current_period_end timestamp with time zone,
  auto_renew boolean DEFAULT true,
  payment_method jsonb DEFAULT '{}'::jsonb,
  billing_address jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  stripe_subscription_id text,
  stripe_customer_id text,
  grace_period_ends_at timestamp with time zone,
  next_billing_date timestamp with time zone,
  last_payment_date timestamp with time zone,
  last_payment_amount numeric(10,2),
  payment_method_id text,
  cancellation_reason text,
  cancellation_feedback text,
  trial_days integer DEFAULT 14,
  CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id)
);
CREATE TABLE public.farmer_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  tenant_subscription_id uuid,
  plan_id uuid NOT NULL,
  billing_interval billing_interval NOT NULL DEFAULT 'monthly'::billing_interval,
  status text NOT NULL DEFAULT 'trial'::text,
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  end_date timestamp with time zone,
  trial_end_date timestamp with time zone,
  auto_renew boolean NOT NULL DEFAULT true,
  payment_method jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  stripe_subscription_id text,
  stripe_customer_id text,
  paid_by_tenant boolean DEFAULT false,
  paying_tenant_id uuid,
  grace_period_ends_at timestamp with time zone,
  next_billing_date timestamp with time zone,
  last_payment_date timestamp with time zone,
  last_payment_amount numeric(10,2),
  payment_method_id text,
  cancellation_reason text,
  trial_days integer DEFAULT 7,
  payment_provider text,
  payment_order_id text,
  CONSTRAINT farmer_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT farmer_subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id),
  CONSTRAINT farmer_subscriptions_unique_farmer UNIQUE (farmer_id),
  CONSTRAINT farmer_subscriptions_status_check CHECK ((status = ANY (ARRAY['trial'::text, 'trialing'::text, 'active'::text, 'paused'::text, 'past_due'::text, 'canceled'::text, 'cancelled'::text, 'expired'::text])))
);
CREATE OR REPLACE FUNCTION public.fn_farmer_subscription_normalize() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_category text;
  v_interval_changed boolean := false;
BEGIN
  SELECT plan_category INTO v_category
  FROM public.subscription_plans WHERE id = NEW.plan_id;

  IF TG_OP = 'UPDATE' THEN
    v_interval_changed := NEW.billing_interval IS DISTINCT FROM OLD.billing_interval;
  END IF;

  -- Only block new legacy intervals; allow legacy rows to be canceled/touched
  IF v_category = 'farmer'
     AND (TG_OP = 'INSERT' OR v_interval_changed)
     AND NEW.billing_interval::text NOT IN ('biannual','annually') THEN
    RAISE EXCEPTION 'Invalid billing_interval % for farmer plan. Only half-yearly (biannual) or annually allowed.', NEW.billing_interval;
  END IF;

  IF NEW.start_date IS NULL THEN
    NEW.start_date := now();
  END IF;

  -- Don't recompute end_date for terminal states (preserve history)
  IF NEW.status NOT IN ('canceled','expired') THEN
    IF NEW.billing_interval::text = 'biannual' THEN
      NEW.end_date := NEW.start_date + INTERVAL '6 months';
    ELSIF NEW.billing_interval::text = 'annually' THEN
      NEW.end_date := NEW.start_date + INTERVAL '1 year';
    ELSIF NEW.billing_interval::text = 'monthly' THEN
      NEW.end_date := NEW.start_date + INTERVAL '1 month';
    ELSIF NEW.billing_interval::text = 'quarterly' THEN
      NEW.end_date := NEW.start_date + INTERVAL '3 months';
    END IF;

    IF NEW.auto_renew THEN
      NEW.next_billing_date := NEW.end_date;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_farmer_subscription_normalize BEFORE INSERT OR UPDATE OF plan_id, billing_interval, start_date, auto_renew, status ON public.farmer_subscriptions FOR EACH ROW EXECUTE FUNCTION fn_farmer_subscription_normalize();
CREATE TRIGGER update_farmer_subscriptions_updated_at BEFORE UPDATE ON public.farmer_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE public.farmer_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY farmer_subscriptions_tenant_admin_manage ON public.farmer_subscriptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = farmer_subscriptions.tenant_id AND ut.role = ANY (ARRAY['tenant_owner'::user_role, 'tenant_admin'::user_role, 'tenant_manager'::user_role]) AND ut.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = farmer_subscriptions.tenant_id AND ut.role = ANY (ARRAY['tenant_owner'::user_role, 'tenant_admin'::user_role, 'tenant_manager'::user_role]) AND ut.is_active = true));

-- ── user_profiles (created before farmers: farmers.user_profile_id points here) ─
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  mobile_number character varying(20),
  phone_verified boolean DEFAULT false,
  full_name character varying(255),
  display_name character varying(100),
  date_of_birth date,
  gender character varying(20),
  address_line1 character varying(255),
  address_line2 character varying(255),
  village character varying(100),
  taluka character varying(100),
  district character varying(100),
  state character varying(100),
  pincode character varying(10),
  country character varying(50) DEFAULT 'India'::character varying,
  coordinates text,                                  -- live: geography(Point,4326)
  preferred_language language_code DEFAULT 'hi'::language_code,
  notification_preferences jsonb DEFAULT '{"sms": true, "push": true, "calls": false, "email": false, "whatsapp": true}'::jsonb,
  avatar_url text,
  bio text,
  expertise_areas text[],
  device_tokens jsonb DEFAULT '[]'::jsonb,
  last_active_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  aadhaar_number character varying,
  farmer_code character varying,
  shc_id character varying,
  password_changed_at timestamp with time zone,
  email_verified_at timestamp with time zone,
  is_account_locked boolean DEFAULT false,
  tenant_id uuid,
  is_profile_complete boolean DEFAULT false,
  farming_experience_years integer,
  total_land_acres numeric,
  primary_crops text[],
  has_irrigation boolean DEFAULT false,
  has_tractor boolean DEFAULT false,
  has_storage boolean DEFAULT false,
  annual_income_range text,
  email text,
  farmer_id uuid NOT NULL,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_phone_key UNIQUE (mobile_number),
  CONSTRAINT check_mobile_number_format CHECK (((mobile_number IS NULL) OR ((mobile_number)::text ~ '^[0-9]{10}$'::text)))
);

-- ── farmers (58 columns, as live) ───────────────────────────────────────────
CREATE TABLE public.farmers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  farmer_code character varying(50),
  farming_experience_years integer,
  farm_type character varying(50),
  total_land_acres numeric(10,2),
  primary_crops text[],
  annual_income_range character varying(50),
  has_loan boolean DEFAULT false,
  loan_amount numeric(12,2),
  has_tractor boolean DEFAULT false,
  has_irrigation boolean DEFAULT false,
  irrigation_type character varying(50),
  has_storage boolean DEFAULT false,
  associated_tenants uuid[],
  preferred_dealer_id uuid,
  is_verified boolean DEFAULT false,
  verified_at timestamp with time zone,
  verified_by uuid,
  verification_documents jsonb DEFAULT '[]'::jsonb,
  app_install_date date,
  last_app_open timestamp with time zone,
  total_app_opens integer DEFAULT 0,
  total_queries integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  aadhaar_number character varying,
  shc_id character varying,
  tenant_id uuid,
  mobile_number character varying(15),
  pin_hash character varying(255),
  last_login_at timestamp with time zone,
  login_attempts integer DEFAULT 0,
  language_preference text DEFAULT 'english'::text,
  preferred_contact_method text DEFAULT 'mobile'::text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  failed_login_attempts integer DEFAULT 0,
  last_failed_login timestamp with time zone,
  pin_updated_at timestamp with time zone,
  is_active boolean DEFAULT true,
  seller_profile jsonb DEFAULT '{}'::jsonb,
  seller_rating numeric(3,2) DEFAULT 0.0,
  total_sales integer DEFAULT 0,
  seller_verified boolean DEFAULT false,
  store_name text,
  store_description text,
  farmer_name text,
  location text,
  user_profile_id uuid,
  current_subscription_id uuid,
  subscription_status character varying(20) DEFAULT 'none'::character varying,
  subscription_expires_at timestamp with time zone,
  archived boolean DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata'::text,
  farming_preference text NOT NULL DEFAULT 'unset'::text,
  default_nutrient_policy text,
  default_protection_policy text,
  organic_standard text,
  CONSTRAINT farmers_pkey PRIMARY KEY (id),
  CONSTRAINT farmers_farmer_code_key UNIQUE (farmer_code),
  CONSTRAINT farmers_farmer_code_unique UNIQUE (farmer_code),
  CONSTRAINT farmers_farming_preference_chk CHECK ((farming_preference = ANY (ARRAY['unset'::text, 'conventional'::text, 'organic'::text, 'integrated'::text]))),
  CONSTRAINT farmers_mobile_number_check CHECK (((mobile_number)::text ~ '^[0-9]{10}$'::text)),
  CONSTRAINT farmers_pin_hash_check CHECK ((((mobile_number IS NULL) AND (pin_hash IS NULL)) OR ((mobile_number IS NOT NULL) AND (pin_hash IS NOT NULL)))),
  CONSTRAINT farmers_current_subscription_id_fkey FOREIGN KEY (current_subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  CONSTRAINT farmers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT farmers_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT farmers_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX farmers_mobile_tenant_unique ON public.farmers USING btree (mobile_number, tenant_id) WHERE (tenant_id IS NOT NULL);
CREATE INDEX idx_farmers_tenant_mobile ON public.farmers USING btree (tenant_id, mobile_number);
CREATE INDEX idx_farmers_mobile_number ON public.farmers USING btree (mobile_number);
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_farmer_fkey FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE;

-- ── villages ────────────────────────────────────────────────────────────────
CREATE TABLE public.villages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  taluka_id uuid NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pincode character varying(6),
  center_lat numeric,
  center_lon numeric,
  boundary text,                                     -- live: geography(MultiPolygon,4326)
  lgd_village_code integer,
  census2011_village_code text,
  CONSTRAINT villages_pkey PRIMARY KEY (id),
  CONSTRAINT villages_taluka_id_fkey FOREIGN KEY (taluka_id) REFERENCES talukas(id),
  CONSTRAINT villages_center_lat_range_chk CHECK (((center_lat IS NULL) OR ((center_lat >= ('-90'::integer)::numeric) AND (center_lat <= (90)::numeric)))),
  CONSTRAINT villages_center_lon_range_chk CHECK (((center_lon IS NULL) OR ((center_lon >= ('-180'::integer)::numeric) AND (center_lon <= (180)::numeric)))),
  CONSTRAINT villages_pincode_format_chk CHECK (((pincode IS NULL) OR ((pincode)::text ~ '^[1-9][0-9]{5}$'::text)))
);
ALTER TABLE public.villages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view villages" ON public.villages FOR SELECT TO public USING (is_active = true);

-- ── user_sessions, pin_reset_codes, system_config ───────────────────────────
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  access_token_hash text,
  refresh_token_hash text,
  expires_at timestamp with time zone NOT NULL,
  device_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean DEFAULT true,
  last_activity_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_session_id_key UNIQUE (session_id)
);
CREATE INDEX idx_user_sessions_token_hash ON public.user_sessions USING btree (access_token_hash) WHERE is_active;
CREATE OR REPLACE FUNCTION public.update_session_activity() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at = now();
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER update_session_activity_trigger BEFORE UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION update_session_activity();
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own sessions" ON public.user_sessions FOR ALL TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own sessions" ON public.user_sessions FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY farmer_access ON public.user_sessions FOR ALL TO public
  USING ((current_setting('request.jwt.claims.role'::text, true) = 'farmer'::text) AND ((user_id)::text = current_setting('request.jwt.claims.sub'::text, true)));

CREATE TABLE public.pin_reset_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL,
  tenant_id uuid,
  mobile_number text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pin_reset_codes_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_pin_reset_codes_expiry ON public.pin_reset_codes USING btree (expires_at);
CREATE INDEX idx_pin_reset_codes_farmer ON public.pin_reset_codes USING btree (farmer_id, created_at DESC);
ALTER TABLE public.pin_reset_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.system_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  config_key text NOT NULL,
  config_value jsonb NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT system_config_pkey PRIMARY KEY (id),
  CONSTRAINT system_config_config_key_key UNIQUE (config_key)
);
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can check bootstrap status" ON public.system_config FOR SELECT TO public USING (config_key = 'bootstrap_completed'::text);
CREATE POLICY "Authenticated users can read config" ON public.system_config FOR SELECT TO service_role USING (true);

-- ── session functions (bodies as live) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hash_session_token(_token text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _token IS NULL OR _token = '' THEN NULL
              ELSE encode(sha256(convert_to(_token, 'UTF8')), 'hex') END
$function$;
CREATE OR REPLACE FUNCTION public.verified_session_context()
 RETURNS TABLE(session_id uuid, farmer_id uuid, tenant_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, f.id, f.tenant_id
  FROM public.user_sessions s
  JOIN public.farmers f ON f.id = s.user_id
  WHERE s.access_token_hash = public.hash_session_token(
          current_setting('request.headers', true)::json ->> 'x-session-token')
    AND s.is_active = true
    AND s.expires_at > now()
    AND f.is_active = true
  LIMIT 1
$function$;
CREATE OR REPLACE FUNCTION public.get_current_farmer_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT farmer_id FROM public.verified_session_context()
$function$;
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.verified_session_context()
$function$;

-- ── farmers triggers (bodies as live) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_farmer_tenant_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Set tenant_id to the user's primary tenant if not already set
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.user_tenants 
    WHERE user_id = NEW.id 
      AND is_active = true
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.handle_farmer_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_full_name TEXT;
  v_email TEXT;
  v_dob DATE;
  v_gender TEXT;
  v_village TEXT;
  v_taluka TEXT;
  v_district TEXT;
  v_state TEXT;
  v_pincode TEXT;
  v_lang_pref TEXT;
  v_existing_profile UUID;
BEGIN
  -- Extract data from metadata JSON for easier access
  v_full_name := COALESCE(NEW.metadata->'personal_info'->>'full_name', '');
  v_email := NEW.metadata->'personal_info'->>'email';
  v_dob := (NEW.metadata->'personal_info'->>'date_of_birth')::DATE;
  v_gender := NEW.metadata->'personal_info'->>'gender';
  v_village := NEW.metadata->'address_info'->>'village';
  v_taluka := NEW.metadata->'address_info'->>'taluka';
  v_district := NEW.metadata->'address_info'->>'district';
  v_state := NEW.metadata->'address_info'->>'state';
  v_pincode := NEW.metadata->'address_info'->>'pincode';
  v_lang_pref := COALESCE(NEW.metadata->'personal_info'->>'language_preference', 'en');
  
  -- Check if a profile with this mobile number already exists
  SELECT id INTO v_existing_profile
  FROM public.user_profiles
  WHERE mobile_number = NEW.mobile_number
  LIMIT 1;
  
  IF v_existing_profile IS NOT NULL THEN
    -- Update existing profile to link with this farmer
    UPDATE public.user_profiles
    SET 
      farmer_id = NEW.id,
      full_name = COALESCE(v_full_name, full_name),
      display_name = COALESCE(v_full_name, display_name),
      date_of_birth = COALESCE(v_dob, date_of_birth),
      gender = COALESCE(v_gender, gender),
      address_line1 = COALESCE(v_village, address_line1),
      address_line2 = COALESCE(v_taluka, address_line2),
      village = COALESCE(v_village, village),
      taluka = COALESCE(v_taluka, taluka),
      district = COALESCE(v_district, district),
      state = COALESCE(v_state, state),
      pincode = COALESCE(v_pincode, pincode),
      metadata = metadata || jsonb_build_object(
        'farmer_id', NEW.id,
        'farmer_code', NEW.farmer_code,
        'tenant_id', NEW.tenant_id,
        'source', 'farmer_registration'
      ),
      updated_at = NOW()
    WHERE id = v_existing_profile;
    
    v_user_id := v_existing_profile;
  ELSE
    -- Generate a UUID for the new farmer's user profile
    v_user_id := gen_random_uuid();
    
    -- Create new user_profiles entry
    INSERT INTO public.user_profiles (
      id,
      farmer_id,
      mobile_number,
      phone_verified,
      full_name,
      display_name,
      date_of_birth,
      gender,
      address_line1,
      address_line2,
      village,
      taluka,
      district,
      state,
      pincode,
      country,
      preferred_language,
      notification_preferences,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      NEW.id,
      NEW.mobile_number,
      false,
      v_full_name,
      v_full_name,
      v_dob,
      v_gender,
      v_village,
      v_taluka,
      v_village,
      v_taluka,
      v_district,
      v_state,
      v_pincode,
      'India',
      CASE 
        WHEN v_lang_pref IN ('en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'pa', 'bn')
        THEN v_lang_pref::language_code
        ELSE 'en'::language_code
      END,
      jsonb_build_object(
        'sms', true,
        'email', false,
        'push', true,
        'whatsapp', true
      ),
      jsonb_build_object(
        'farmer_id', NEW.id,
        'farmer_code', NEW.farmer_code,
        'tenant_id', NEW.tenant_id,
        'source', 'farmer_registration'
      ),
      NOW(),
      NOW()
    );
  END IF;
  
  -- PHASE 2: Update the farmer record with farmer_name AND user_profile_id
  UPDATE public.farmers 
  SET 
    farmer_name = v_full_name,
    metadata = metadata || jsonb_build_object('user_profile_id', v_user_id),
    updated_at = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.handle_farmer_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_profile_id UUID;
  v_full_name TEXT;
  v_email TEXT;
  v_dob DATE;
  v_gender TEXT;
  v_village TEXT;
  v_taluka TEXT;
  v_district TEXT;
  v_state TEXT;
  v_pincode TEXT;
BEGIN
  -- Extract updated data from metadata
  v_full_name := COALESCE(NEW.metadata->'personal_info'->>'full_name', '');
  v_email := NEW.metadata->'personal_info'->>'email';
  v_dob := (NEW.metadata->'personal_info'->>'date_of_birth')::DATE;
  v_gender := NEW.metadata->'personal_info'->>'gender';
  v_village := NEW.metadata->'address_info'->>'village';
  v_taluka := NEW.metadata->'address_info'->>'taluka';
  v_district := NEW.metadata->'address_info'->>'district';
  v_state := NEW.metadata->'address_info'->>'state';
  v_pincode := NEW.metadata->'address_info'->>'pincode';
  
  -- Update farmer_name if metadata changed
  IF NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    UPDATE public.farmers
    SET farmer_name = v_full_name
    WHERE id = NEW.id AND farmer_name IS DISTINCT FROM v_full_name;
  END IF;
  
  -- Sync to user_profiles if it exists
  UPDATE public.user_profiles
  SET 
    full_name = v_full_name,
    display_name = v_full_name,
    mobile_number = NEW.mobile_number,
    date_of_birth = v_dob,
    gender = v_gender,
    village = v_village,
    taluka = v_taluka,
    district = v_district,
    state = v_state,
    pincode = v_pincode,
    updated_at = NOW()
  WHERE farmer_id = NEW.id;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.handle_farmer_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete corresponding user_profile (if exists and not shared)
  DELETE FROM public.user_profiles
  WHERE farmer_id = OLD.id;
  
  RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.auto_enroll_farmer_free_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.normalize_location_text_columns() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE r text; uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF NEW.state ~ uuid_re THEN SELECT name INTO r FROM states WHERE id = NEW.state::uuid; NEW.state := r; END IF;
  IF NEW.district ~ uuid_re THEN SELECT name INTO r FROM districts WHERE id = NEW.district::uuid; NEW.district := r; END IF;
  IF NEW.taluka ~ uuid_re THEN SELECT name INTO r FROM talukas WHERE id = NEW.taluka::uuid; NEW.taluka := r; END IF;
  IF NEW.village ~ uuid_re THEN SELECT name INTO r FROM villages WHERE id = NEW.village::uuid; NEW.village := r; END IF;
  IF TG_TABLE_NAME = 'lands' THEN
    IF NEW.state IS NULL AND NEW.state_id IS NOT NULL THEN SELECT name INTO NEW.state FROM states WHERE id = NEW.state_id; END IF;
    IF NEW.district IS NULL AND NEW.district_id IS NOT NULL THEN SELECT name INTO NEW.district FROM districts WHERE id = NEW.district_id; END IF;
    IF NEW.taluka IS NULL AND NEW.taluka_id IS NOT NULL THEN SELECT name INTO NEW.taluka FROM talukas WHERE id = NEW.taluka_id; END IF;
    IF NEW.village IS NULL AND NEW.village_id IS NOT NULL THEN SELECT name INTO NEW.village FROM villages WHERE id = NEW.village_id; END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER on_farmer_created AFTER INSERT ON public.farmers FOR EACH ROW EXECUTE FUNCTION handle_farmer_creation();
CREATE TRIGGER on_farmer_deleted BEFORE DELETE ON public.farmers FOR EACH ROW EXECUTE FUNCTION handle_farmer_delete();
CREATE TRIGGER on_farmer_subscription_autoenroll AFTER INSERT ON public.farmers FOR EACH ROW EXECUTE FUNCTION auto_enroll_farmer_free_plan();
CREATE TRIGGER on_farmer_updated AFTER UPDATE ON public.farmers FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION handle_farmer_update();
CREATE TRIGGER set_farmer_tenant_id_trigger BEFORE INSERT OR UPDATE ON public.farmers FOR EACH ROW EXECUTE FUNCTION set_farmer_tenant_id();
CREATE TRIGGER update_farmers_updated_at BEFORE UPDATE ON public.farmers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_normalize_location_text BEFORE INSERT OR UPDATE OF state, district, taluka, village ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION normalize_location_text_columns();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── farmers / user_profiles policies (as live) ──────────────────────────────
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Farmers can update own data via headers" ON public.farmers FOR UPDATE TO public
  USING ((id = get_current_farmer_id()) AND ((tenant_id = get_current_tenant_id()) OR (tenant_id IS NULL)))
  WITH CHECK ((id = get_current_farmer_id()) AND ((tenant_id = get_current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY "Farmers can view own data via headers" ON public.farmers FOR SELECT TO public
  USING ((id = get_current_farmer_id()) AND ((tenant_id = get_current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY "Service role has full access to farmers" ON public.farmers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Tenant admins manage farmers" ON public.farmers FOR ALL TO public
  USING (tenant_id IN (SELECT user_tenants.tenant_id FROM user_tenants
                       WHERE ((user_tenants.user_id = auth.uid()) AND (user_tenants.role = ANY (ARRAY['tenant_admin'::user_role, 'tenant_owner'::user_role])))));
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users update own profile via headers" ON public.user_profiles FOR UPDATE TO public
  USING ((farmer_id = get_current_farmer_id()) AND ((tenant_id = get_current_tenant_id()) OR (tenant_id IS NULL)))
  WITH CHECK ((farmer_id = get_current_farmer_id()) AND ((tenant_id = get_current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY "Users view own profile via headers" ON public.user_profiles FOR SELECT TO public
  USING ((farmer_id = get_current_farmer_id()) AND ((tenant_id = get_current_tenant_id()) OR (tenant_id IS NULL)));
CREATE POLICY authenticated_users_can_create_own_profile ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- ── table and column grants (as live, read from information_schema) ─────────
-- farmers: anon holds nothing. authenticated holds INSERT/UPDATE/DELETE/REFERENCES/
-- TRIGGER/TRUNCATE on the table and SELECT on every column except pin_hash and
-- pin_updated_at (column-level grant).
REVOKE ALL ON public.farmers FROM anon, authenticated;
GRANT INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.farmers TO authenticated;
DO $$ DECLARE v_cols text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_cols FROM pg_attribute
   WHERE attrelid = 'public.farmers'::regclass AND attnum > 0 AND NOT attisdropped AND attname NOT IN ('pin_hash','pin_updated_at');
  EXECUTE format('GRANT SELECT (%s) ON public.farmers TO authenticated', v_cols);
END $$;
REVOKE ALL ON public.user_sessions, public.pin_reset_codes, public.user_tenants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_tenants FROM authenticated;

-- ── fixtures every test database needs ──────────────────────────────────────
INSERT INTO auth.users (id) VALUES
  ('7a7a7a7a-0000-0000-0000-00000000000a'),   -- tenant admin of tenant A
  ('7a7a7a7a-0000-0000-0000-00000000000b'),   -- tenant admin of tenant B
  ('5a5a5a5a-0000-0000-0000-000000000001');   -- portal user with no tenant membership
INSERT INTO public.tenants (id, slug, name, type, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'test-tenant-a', 'Test Tenant A', 'agri_company', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'test-tenant-b', 'Test Tenant B', 'dealer', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'test-tenant-c', 'Test Tenant C (deleted in the replay)', 'ngo', 'active');
INSERT INTO public.user_tenants (user_id, tenant_id, role, is_primary, is_active) VALUES
  ('7a7a7a7a-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'tenant_admin', true, true),
  ('7a7a7a7a-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'tenant_owner', true, true);
INSERT INTO public.subscription_plans (id, name, plan_type, plan_category, tenant_id, is_active) VALUES
  ('f4ee0000-0000-0000-0000-000000000001', 'Free', 'basic', 'farmer', NULL, true);
INSERT INTO public.talukas (id, name) VALUES ('7a100000-0000-0000-0000-000000000001', 'Test Taluka');
INSERT INTO public.villages (id, name, taluka_id, is_active, center_lat, center_lon) VALUES
  ('71000000-0000-0000-0000-000000000001', 'Test Village One',   '7a100000-0000-0000-0000-000000000001', true,  16.7050, 74.2433),
  ('71000000-0000-0000-0000-000000000002', 'Test Village Two',   '7a100000-0000-0000-0000-000000000001', true,  16.8524, 74.5815),
  ('71000000-0000-0000-0000-000000000003', 'Test Village Three', '7a100000-0000-0000-0000-000000000001', true,  17.2800, 74.1800),
  ('71000000-0000-0000-0000-000000000004', 'Test Village Four',  '7a100000-0000-0000-0000-000000000001', true,  17.6805, 74.0183),
  ('71000000-0000-0000-0000-000000000005', 'Test Village Five',  '7a100000-0000-0000-0000-000000000001', true,  18.5204, 73.8567),
  ('71000000-0000-0000-0000-0000000000a0', 'Test Village No Centre', '7a100000-0000-0000-0000-000000000001', true,  NULL, NULL),
  ('71000000-0000-0000-0000-0000000000b0', 'Test Village Inactive',  '7a100000-0000-0000-0000-000000000001', false, 16.9000, 74.3000);

-- Farmers that exist BEFORE the identity migrations (the backfill must cover them).
-- Inserted as the table owner so every live trigger fires, exactly as in production.
-- PIN hashes are 64-hex strings of fake values; mobiles are in the unassigned 00000xxxxx range.
INSERT INTO public.farmers (id, tenant_id, mobile_number, pin_hash, farmer_code, language_preference, metadata) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000000001', repeat('a1', 32), 'TST-A-0001', 'mr', '{"personal_info":{"full_name":"Test Farmer One","language_preference":"mr"}}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '0000000002', repeat('a2', 32), 'TST-A-0002', 'hi', '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '0000000003', repeat('a3', 32), 'TST-A-0003', 'en', '{}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '0000000101', repeat('b1', 32), 'TST-B-0001', 'hi', '{}'),
  ('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '0000000201', repeat('c1', 32), 'TST-C-0001', 'hi', '{}'),
  ('cccccccc-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', '0000000202', repeat('c2', 32), 'TST-C-0002', 'hi', '{}');
UPDATE public.farmers SET is_active = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
-- Live sessions for two of them (token = 'tok-' || last 12 chars of the id, stored hashed as the auth core does).
INSERT INTO public.user_sessions (user_id, session_id, access_token_hash, expires_at, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sess-a1', public.hash_session_token('tok-a1'), now() + interval '30 days', true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'sess-a3', public.hash_session_token('tok-a3'), now() + interval '30 days', true),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'sess-b1', public.hash_session_token('tok-b1'), now() + interval '30 days', true);
