-- Local replica of the live objects the migration touches (shapes verified via Supabase read-only queries 2026-09-25).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('test.role', true),''),'anon') $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('test.jwt', true),''),'{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.farmers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES public.tenants(id));
CREATE TABLE public.admin_users (id uuid PRIMARY KEY, email text, full_name text, role text, is_active boolean, created_at timestamptz, updated_at timestamptz);
CREATE TABLE public.user_tenants (user_id uuid, tenant_id uuid, role text, is_active boolean);
CREATE TABLE public.system_config (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), config_key text UNIQUE, config_value jsonb, description text, created_at timestamptz, updated_at timestamptz);

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND is_active = true AND role IN ('super_admin','platform_admin')); $$;
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth' AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = _tenant_id
  AND ut.role IN ('tenant_admin','tenant_owner') AND ut.is_active = true); END $$;
CREATE OR REPLACE FUNCTION public.handle_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ai_model_pricing: exact live DDL (admin repo 20260425190019) + its 6 seed rows
CREATE TABLE public.ai_model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_name text NOT NULL,
  input_cost_per_1k numeric(10,6) NOT NULL DEFAULT 0, output_cost_per_1k numeric(10,6) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD', effective_from date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_name, effective_from));
ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage ai pricing" ON public.ai_model_pricing FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
INSERT INTO public.ai_model_pricing (model_name, input_cost_per_1k, output_cost_per_1k, notes, effective_from) VALUES
  ('google/gemini-3-flash-preview',0.000075,0.0003,'Lovable AI Gateway default','2026-04-25'),
  ('google/gemini-2.5-flash',0.000075,0.0003,'Lovable AI Gateway','2026-04-25'),
  ('google/gemini-2.5-pro',0.00125,0.005,'Lovable AI Gateway','2026-04-25'),
  ('openai/gpt-5',0.005,0.015,'Lovable AI Gateway','2026-04-25'),
  ('openai/gpt-5-mini',0.00015,0.0006,'Lovable AI Gateway','2026-04-25'),
  ('openai/gpt-5-nano',0.000075,0.0003,'Lovable AI Gateway','2026-04-25');

-- ai_model_metrics: exact live DDL (admin repo 20250717170403) + indexes + the three live policies
CREATE TABLE public.ai_model_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), model_name TEXT NOT NULL, model_version TEXT,
  tenant_id UUID REFERENCES public.tenants(id), query_count INTEGER DEFAULT 0, avg_response_time_ms NUMERIC,
  accuracy_score NUMERIC, resource_usage JSONB DEFAULT '{}', error_rate NUMERIC DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(), metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX idx_ai_model_metrics_timestamp ON public.ai_model_metrics(timestamp DESC);
CREATE INDEX idx_ai_model_metrics_model ON public.ai_model_metrics(model_name, timestamp DESC);
ALTER TABLE public.ai_model_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can access all AI metrics" ON public.ai_model_metrics FOR ALL USING (auth.jwt() ->> 'email' LIKE '%admin%');
CREATE POLICY super_admin_access ON public.ai_model_metrics FOR ALL USING (current_setting('request.jwt.claims.role', true) = 'super_admin');
CREATE POLICY tenant_admin_access ON public.ai_model_metrics FOR ALL USING (current_setting('request.jwt.claims.role', true) = 'tenant_admin' AND tenant_id::text = current_setting('request.jwt.claims.tenant_id', true));

-- Supabase default privileges (live: anon/authenticated hold ALL incl. TRUNCATE on both tables)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
