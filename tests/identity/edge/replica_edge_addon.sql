-- ═══════════════════════════════════════════════════════════════════════════
-- tests/identity/edge/replica_edge_addon.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Added on top of tests/identity/replica_bootstrap.sql for the edge-function test
-- (run_edge.sh): the two extra live tables the auth core reads or writes, and the
-- login role PostgREST connects with. Shapes read from project qfklkkzxemsbeniyugiz
-- on 2026-11-24. Local replica only: it creates a role with a password.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity_it_authenticator') THEN
    CREATE ROLE identity_it_authenticator LOGIN NOINHERIT PASSWORD 'identity_it_local_only';
  END IF;
END $$;
GRANT anon, authenticated, service_role TO identity_it_authenticator;

CREATE TABLE public.feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  flag_name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 0,
  target_tenants uuid[] DEFAULT '{}'::uuid[],
  target_users uuid[] DEFAULT '{}'::uuid[],
  conditions jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  environment_id uuid,
  flag_type text DEFAULT 'release'::text,
  flag_status text DEFAULT 'active'::text,
  tags jsonb DEFAULT '[]'::jsonb,
  dependencies jsonb DEFAULT '[]'::jsonb,
  scheduling jsonb DEFAULT '{}'::jsonb,
  variation_config jsonb DEFAULT '{}'::jsonb,
  default_value jsonb DEFAULT 'false'::jsonb,
  metrics jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT feature_flags_pkey PRIMARY KEY (id),
  CONSTRAINT feature_flags_flag_name_key UNIQUE (flag_name),
  CONSTRAINT feature_flags_flag_status_check CHECK ((flag_status = ANY (ARRAY['active'::text, 'archived'::text, 'deprecated'::text]))),
  CONSTRAINT feature_flags_flag_type_check CHECK ((flag_type = ANY (ARRAY['release'::text, 'experiment'::text, 'operational'::text, 'permission'::text]))),
  CONSTRAINT feature_flags_rollout_percentage_check CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)))
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;   -- live: admin-only policies, so farmers read nothing

CREATE TABLE public.rate_limit_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  endpoint text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL,
  window_end timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rate_limit_tracking_pkey PRIMARY KEY (id),
  CONSTRAINT rate_limit_tracking_identifier_endpoint_window_start_key UNIQUE (identifier, endpoint, window_start)
);
ALTER TABLE public.rate_limit_tracking ENABLE ROW LEVEL SECURITY;
