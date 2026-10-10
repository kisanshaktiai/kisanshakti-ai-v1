-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20260925120000_ai_model_registry.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
--
-- PURPOSE — AI model SSOT, Phase 1 (storage Option A, dedicated tables).
-- Callers will ask for a TASK, never a model. This migration builds the
-- database side only; no edge function reads it yet, so applying it changes
-- nothing a farmer sees.
--
--   ai_model_catalog       NEW  one row per model: provider, exact API model id,
--                               lifecycle status, input types and the API
--                               contract (token parameter, temperature rule,
--                               allowed reasoning efforts) as DATA, replacing
--                               the model-name regex in _shared/aiConfig.ts.
--   ai_task_route          NEW  one row per task (e.g. brain.explain).
--   ai_task_route_step     NEW  ordered fallback chain per task → catalog model.
--   ai_model_pricing       EXISTING (admin panel, AiCostService) — kept as the
--                               single price-history table; gains a cached-input
--                               price, a source link and a catalog foreign key.
--   ai_model_metrics       EXISTING (admin panel monitoring pages) — becomes the
--                               per-call usage ledger; gains farmer, task, cost,
--                               price provenance and failure-class columns.
--   ai_registry_audit_log  NEW  every change to catalog, routes, steps and prices.
--
-- RULES ENFORCED IN THE DATABASE (not left to application code):
--   * a route step may only point at an 'active' or 'deprecated' model — never
--     a 'candidate' (not yet evaluated) or 'retired' one;
--   * a model cannot be moved to 'candidate' or 'retired' while a route uses it;
--   * a route's required input types (e.g. image for vision tasks) must be
--     supported by every model in its chain;
--   * a route's reasoning_effort must be one the model accepts (catches, for
--     example, sending 'none' to gpt-5-mini, which only accepts 'minimal'+);
--   * a model's identity (key, provider, API id) never changes after insert;
--   * catalog and route rows are never deleted — use status / is_active;
--   * ledger rows are append-only; tenant is derived from the farmer server-side;
--   * every catalog/route row carries a non-empty change_reason, and every
--     change is written to ai_registry_audit_log with the admin's user id.
--
-- SECURITY FIXES ON THE TWO EXISTING TABLES (verified live 2026-09-25):
--   * ai_model_metrics had a policy granting ALL to any login whose JWT email
--     contains the text 'admin' — dropped, with two JWT-claim policies that the
--     app's auth never sets. Replaced by: super admin reads all; a tenant admin
--     reads only their own tenant; only the service role writes.
--   * anon and authenticated held INSERT/UPDATE/DELETE/TRUNCATE on both tables.
--     TRUNCATE is not subject to RLS, so the public anon key could empty them.
--     Revoked.
--
-- SEED — reproduces what each call site does at commit c78e6bb. Routes list
-- only models the code actually calls; prices only where verified 2026-09-25;
-- Lovable-gateway calls get no price row (cost recorded as unknown, not guessed).
-- NOTE: getScheduleProviderChain() lets three secrets override the schedule
-- models (LOVABLE_SCHEDULE_MODEL, OPENAI_SCHEDULE_MODEL,
-- GEMINI_SCHEDULE_FALLBACK_MODEL). Their live values are not visible from the
-- repo or the database; the seed uses the code defaults. Confirm before Phase 2.
--
-- SQL runner: no session state between statements; nothing session-dependent.
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['tenants','farmers','admin_users','ai_model_pricing','ai_model_metrics']) AS t
  LOOP
    IF to_regclass('public.' || r.t) IS NULL THEN v_missing := v_missing || ('table ' || r.t); END IF;
  END LOOP;
  IF to_regprocedure('public.is_super_admin()') IS NULL THEN v_missing := v_missing || 'function is_super_admin()'; END IF;
  IF to_regprocedure('public.is_tenant_admin(uuid)') IS NULL THEN v_missing := v_missing || 'function is_tenant_admin(uuid)'; END IF;
  IF to_regprocedure('public.handle_updated_at()') IS NULL THEN v_missing := v_missing || 'function handle_updated_at()'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'farmers' AND column_name = 'tenant_id') THEN
    v_missing := v_missing || 'column farmers.tenant_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.ai_model_pricing') AND contype = 'u'
                    AND pg_get_constraintdef(oid) = 'UNIQUE (model_name, effective_from)') THEN
    v_missing := v_missing || 'ai_model_pricing UNIQUE (model_name, effective_from)';
  END IF;
  -- The ledger gains append-only rules and new foreign keys; it must be empty.
  IF to_regclass('public.ai_model_metrics') IS NOT NULL
     AND (SELECT count(*) FROM public.ai_model_metrics) <> 0
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'ai_model_metrics' AND column_name = 'task_key') THEN
    v_missing := v_missing || 'ai_model_metrics is not empty — review existing rows against the new foreign keys first';
  END IF;
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'ai_model_registry preflight failed: %', array_to_string(v_missing, '; ');
  END IF;
END
$preflight$;


-- §1 MODEL CATALOG ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_model_catalog (
  model_key             text PRIMARY KEY,
  provider              text NOT NULL CHECK (provider IN ('openai', 'gemini', 'lovable')),
  api_model_id          text NOT NULL CHECK (length(btrim(api_model_id)) > 0),
  status                text NOT NULL CHECK (status IN ('candidate', 'active', 'deprecated', 'retired')),
  input_modalities      text[] NOT NULL DEFAULT ARRAY['text']::text[],
  api_contract          jsonb NOT NULL,
  shutdown_date         date,
  replacement_model_key text REFERENCES public.ai_model_catalog(model_key) ON DELETE RESTRICT,
  source_url            text,
  notes                 text,
  change_reason         text NOT NULL CHECK (length(btrim(change_reason)) > 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_model_catalog_key_format CHECK (model_key = provider || ':' || api_model_id),
  CONSTRAINT ai_model_catalog_provider_model_uniq UNIQUE (provider, api_model_id),
  CONSTRAINT ai_model_catalog_modalities CHECK (
    cardinality(input_modalities) > 0 AND input_modalities <@ ARRAY['text', 'image', 'audio']::text[]),
  CONSTRAINT ai_model_catalog_contract_shape CHECK (
        jsonb_typeof(api_contract) = 'object'
    AND api_contract->>'token_param' IN ('max_tokens', 'max_completion_tokens')
    AND api_contract->>'temperature' IN ('allowed', 'omit')
    AND jsonb_typeof(api_contract->'reasoning_efforts') = 'array'),
  CONSTRAINT ai_model_catalog_replacement_not_self CHECK (replacement_model_key IS DISTINCT FROM model_key)
);

COMMENT ON TABLE public.ai_model_catalog IS
  'AI model SSOT: one row per provider model. api_contract drives request building (token_param, temperature: allowed|omit, reasoning_efforts: accepted values, [] = parameter not supported). Status: candidate (being evaluated, cannot be routed) → active → deprecated (provider announced shutdown, still routable) → retired.';


-- §2 TASK ROUTES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_task_route (
  task_key            text PRIMARY KEY CHECK (task_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  description         text NOT NULL CHECK (length(btrim(description)) > 0),
  required_modalities text[] NOT NULL DEFAULT ARRAY['text']::text[],
  params              jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active           boolean NOT NULL DEFAULT true,
  change_reason       text NOT NULL CHECK (length(btrim(change_reason)) > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_task_route_modalities CHECK (
    cardinality(required_modalities) > 0 AND required_modalities <@ ARRAY['text', 'image', 'audio']::text[]),
  CONSTRAINT ai_task_route_params_shape CHECK (
        jsonb_typeof(params) = 'object'
    AND (params - ARRAY['max_output_tokens', 'temperature', 'reasoning_effort', 'json_mode']) = '{}'::jsonb
    AND (NOT params ? 'max_output_tokens'
         OR (jsonb_typeof(params->'max_output_tokens') = 'number' AND (params->>'max_output_tokens')::numeric > 0))
    AND (NOT params ? 'temperature'
         OR (jsonb_typeof(params->'temperature') = 'number' AND (params->>'temperature')::numeric BETWEEN 0 AND 2))
    AND (NOT params ? 'reasoning_effort' OR jsonb_typeof(params->'reasoning_effort') = 'string')
    AND (NOT params ? 'json_mode' OR jsonb_typeof(params->'json_mode') = 'boolean'))
);

CREATE TABLE IF NOT EXISTS public.ai_task_route_step (
  task_key   text NOT NULL REFERENCES public.ai_task_route(task_key) ON DELETE RESTRICT,
  step_no    smallint NOT NULL CHECK (step_no BETWEEN 1 AND 9),
  model_key  text NOT NULL REFERENCES public.ai_model_catalog(model_key) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_task_route_step_pkey PRIMARY KEY (task_key, step_no),
  CONSTRAINT ai_task_route_step_model_once UNIQUE (task_key, model_key)
);

COMMENT ON TABLE public.ai_task_route IS
  'AI model SSOT: callers name a task_key; the ordered steps in ai_task_route_step are tried in step_no order (a step is skipped when its provider key is not configured). params (optional): max_output_tokens, temperature, reasoning_effort, json_mode.';


-- §3 PRICES — extend the existing time-versioned ai_model_pricing ─────────
ALTER TABLE public.ai_model_pricing
  ADD COLUMN IF NOT EXISTS cached_input_cost_per_1k numeric(10,6),
  ADD COLUMN IF NOT EXISTS source_url text;

DO $pricing$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_pricing_cached_input_nonneg') THEN
    ALTER TABLE public.ai_model_pricing
      ADD CONSTRAINT ai_model_pricing_cached_input_nonneg CHECK (cached_input_cost_per_1k IS NULL OR cached_input_cost_per_1k >= 0);
  END IF;
  -- NOT VALID: the six 2026-04-25 rows use gateway-style names ('openai/gpt-5-mini')
  -- that are not catalog keys. They are left untouched; every new or renamed row
  -- must name a catalog model.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_pricing_model_key_fkey') THEN
    ALTER TABLE public.ai_model_pricing
      ADD CONSTRAINT ai_model_pricing_model_key_fkey FOREIGN KEY (model_name)
      REFERENCES public.ai_model_catalog(model_key) ON DELETE RESTRICT NOT VALID;
  END IF;
END
$pricing$;


-- §4 LEDGER — ai_model_metrics becomes the per-call usage ledger ──────────
-- One row per AI call: query_count = 1, avg_response_time_ms = latency,
-- error_rate = 0 or 1, model_name = catalog key actually used, resource_usage =
-- { input_tokens, cached_input_tokens, output_tokens, reasoning_tokens } (the
-- shape the admin panel's AiCostService already reads).
ALTER TABLE public.ai_model_metrics
  ADD COLUMN IF NOT EXISTS farmer_id       uuid,
  ADD COLUMN IF NOT EXISTS task_key        text,
  ADD COLUMN IF NOT EXISTS function_name   text,
  ADD COLUMN IF NOT EXISTS model_requested text,
  ADD COLUMN IF NOT EXISTS fallback_used   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_class     text,
  ADD COLUMN IF NOT EXISTS http_status     integer,
  ADD COLUMN IF NOT EXISTS cost_usd        numeric(14,8),
  ADD COLUMN IF NOT EXISTS price_id        uuid;

DO $ledger$
BEGIN
  -- Farmer deletion keeps the cost row but removes the personal link.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_metrics_farmer_id_fkey') THEN
    ALTER TABLE public.ai_model_metrics ADD CONSTRAINT ai_model_metrics_farmer_id_fkey
      FOREIGN KEY (farmer_id) REFERENCES public.farmers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_metrics_task_key_fkey') THEN
    ALTER TABLE public.ai_model_metrics ADD CONSTRAINT ai_model_metrics_task_key_fkey
      FOREIGN KEY (task_key) REFERENCES public.ai_task_route(task_key) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_metrics_model_key_fkey') THEN
    ALTER TABLE public.ai_model_metrics ADD CONSTRAINT ai_model_metrics_model_key_fkey
      FOREIGN KEY (model_name) REFERENCES public.ai_model_catalog(model_key) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_metrics_model_requested_fkey') THEN
    ALTER TABLE public.ai_model_metrics ADD CONSTRAINT ai_model_metrics_model_requested_fkey
      FOREIGN KEY (model_requested) REFERENCES public.ai_model_catalog(model_key) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_metrics_price_id_fkey') THEN
    ALTER TABLE public.ai_model_metrics ADD CONSTRAINT ai_model_metrics_price_id_fkey
      FOREIGN KEY (price_id) REFERENCES public.ai_model_pricing(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_metrics_error_class_chk') THEN
    ALTER TABLE public.ai_model_metrics ADD CONSTRAINT ai_model_metrics_error_class_chk CHECK (
      error_class IS NULL OR error_class IN ('ok', 'rate_limited', 'quota_exhausted', 'model_retired',
        'contract_rejected', 'server_error', 'timeout', 'network', 'empty_output', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_metrics_routed_call_chk') THEN
    ALTER TABLE public.ai_model_metrics ADD CONSTRAINT ai_model_metrics_routed_call_chk CHECK (
      task_key IS NULL OR (error_class IS NOT NULL AND function_name IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_metrics_cost_nonneg') THEN
    ALTER TABLE public.ai_model_metrics ADD CONSTRAINT ai_model_metrics_cost_nonneg CHECK (cost_usd IS NULL OR cost_usd >= 0);
  END IF;
END
$ledger$;

CREATE INDEX IF NOT EXISTS idx_ai_model_metrics_tenant_ts ON public.ai_model_metrics (tenant_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_ai_model_metrics_farmer_ts ON public.ai_model_metrics (farmer_id, "timestamp" DESC) WHERE farmer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_model_metrics_task_ts   ON public.ai_model_metrics (task_key, "timestamp" DESC) WHERE task_key IS NOT NULL;


-- §5 GUARD FUNCTIONS ────────────────────────────────────────────────────────
-- Shared check: can this model serve this route? Returns NULL when it can.
CREATE OR REPLACE FUNCTION public.ai_route_model_problem(p_route public.ai_task_route, p_model public.ai_model_catalog)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_efforts jsonb := p_model.api_contract->'reasoning_efforts';
BEGIN
  IF p_model.status NOT IN ('active', 'deprecated') THEN
    RETURN format('model %s is %s; only active or deprecated models can be routed', p_model.model_key, p_model.status);
  END IF;
  IF NOT (p_route.required_modalities <@ p_model.input_modalities) THEN
    RETURN format('model %s accepts %s but task %s needs %s', p_model.model_key,
                  p_model.input_modalities, p_route.task_key, p_route.required_modalities);
  END IF;
  IF p_route.params ? 'reasoning_effort' AND jsonb_array_length(v_efforts) > 0
     AND NOT v_efforts ? (p_route.params->>'reasoning_effort') THEN
    RETURN format('model %s does not accept reasoning_effort %s (accepts %s)', p_model.model_key,
                  p_route.params->>'reasoning_effort', v_efforts);
  END IF;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public.ai_route_step_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_route public.ai_task_route;
  v_model public.ai_model_catalog;
  v_problem text;
BEGIN
  SELECT * INTO v_route FROM public.ai_task_route WHERE task_key = NEW.task_key;
  SELECT * INTO v_model FROM public.ai_model_catalog WHERE model_key = NEW.model_key;
  v_problem := public.ai_route_model_problem(v_route, v_model);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'route % step %: %', NEW.task_key, NEW.step_no, v_problem USING errcode = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

-- A route's params or required input types changed: re-check every model in its chain.
CREATE OR REPLACE FUNCTION public.ai_route_params_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_model public.ai_model_catalog;
  v_problem text;
BEGIN
  IF NEW.task_key IS DISTINCT FROM OLD.task_key THEN
    RAISE EXCEPTION 'task_key of a route never changes (create a new route instead)' USING errcode = '42501';
  END IF;
  FOR v_model IN SELECT c.* FROM public.ai_task_route_step s
                   JOIN public.ai_model_catalog c ON c.model_key = s.model_key
                  WHERE s.task_key = NEW.task_key
  LOOP
    v_problem := public.ai_route_model_problem(NEW, v_model);
    IF v_problem IS NOT NULL THEN
      RAISE EXCEPTION 'route %: %', NEW.task_key, v_problem USING errcode = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END
$fn$;

-- A model's identity is fixed; a status/contract/input change must not break a route that uses it.
CREATE OR REPLACE FUNCTION public.ai_catalog_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_route public.ai_task_route;
  v_problem text;
BEGIN
  IF NEW.model_key IS DISTINCT FROM OLD.model_key
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.api_model_id IS DISTINCT FROM OLD.api_model_id THEN
    RAISE EXCEPTION 'model identity (model_key, provider, api_model_id) never changes — add a new catalog row'
      USING errcode = '42501';
  END IF;
  FOR v_route IN SELECT r.* FROM public.ai_task_route_step s
                   JOIN public.ai_task_route r ON r.task_key = s.task_key
                  WHERE s.model_key = NEW.model_key
  LOOP
    v_problem := public.ai_route_model_problem(v_route, NEW);
    IF v_problem IS NOT NULL THEN
      RAISE EXCEPTION 'cannot change model % while route % uses it: %', NEW.model_key, v_route.task_key, v_problem
        USING errcode = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.ai_registry_prevent_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION '% rows are never deleted — set status (catalog) or is_active (route) instead', TG_TABLE_NAME
    USING errcode = '42501';
END
$fn$;

-- Ledger identity: tenant always comes from the farmer, never from the caller.
CREATE OR REPLACE FUNCTION public.ai_metrics_fill_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid;
BEGIN
  IF NEW.farmer_id IS NOT NULL THEN
    SELECT f.tenant_id INTO v_tenant FROM public.farmers f WHERE f.id = NEW.farmer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'farmer % not found', NEW.farmer_id USING errcode = '23503';
    END IF;
    NEW.tenant_id := v_tenant;
  END IF;
  RETURN NEW;
END
$fn$;

-- Ledger rows are append-only. The single allowed update is the farmer link
-- being cleared by ON DELETE SET NULL when a farmer is deleted.
CREATE OR REPLACE FUNCTION public.ai_metrics_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.farmer_id IS NULL AND OLD.farmer_id IS NOT NULL
     AND (to_jsonb(NEW) - 'farmer_id') = (to_jsonb(OLD) - 'farmer_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ai_model_metrics is an append-only usage ledger' USING errcode = '42501';
END
$fn$;


-- §6 AUDIT ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_registry_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name    text NOT NULL,
  row_key       text NOT NULL,
  action        text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changed_by    uuid,
  change_reason text,
  old_value     jsonb,
  new_value     jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_registry_audit_row ON public.ai_registry_audit_log (table_name, row_key, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_ai_registry_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_new jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_key text;
BEGIN
  IF TG_OP = 'UPDATE' AND (v_new - 'updated_at') = (v_old - 'updated_at') THEN
    RETURN NEW;
  END IF;
  v_key := CASE TG_TABLE_NAME
             WHEN 'ai_model_catalog'   THEN v_row->>'model_key'
             WHEN 'ai_task_route'      THEN v_row->>'task_key'
             WHEN 'ai_task_route_step' THEN (v_row->>'task_key') || '#' || (v_row->>'step_no')
             ELSE v_row->>'id'
           END;
  INSERT INTO public.ai_registry_audit_log (table_name, row_key, action, changed_by, change_reason, old_value, new_value)
  VALUES (TG_TABLE_NAME, v_key, lower(TG_OP), auth.uid(),
          coalesce(v_new->>'change_reason', v_new->>'notes'), v_old, v_new);
  RETURN coalesce(NEW, OLD);
END
$fn$;

CREATE OR REPLACE FUNCTION public.ai_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'ai_registry_audit_log is append-only' USING errcode = '42501';
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.log_ai_registry_changes() FROM PUBLIC, anon, authenticated;


-- §7 TRIGGERS ───────────────────────────────────────────────────────────────
DO $trg$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('trg_ai_catalog_updated_at',   'ai_model_catalog',      'BEFORE UPDATE',                    'handle_updated_at'),
    ('trg_ai_catalog_guard',        'ai_model_catalog',      'BEFORE UPDATE',                    'ai_catalog_update_guard'),
    ('trg_ai_catalog_no_delete',    'ai_model_catalog',      'BEFORE DELETE',                    'ai_registry_prevent_delete'),
    ('trg_ai_catalog_audit',        'ai_model_catalog',      'AFTER INSERT OR UPDATE OR DELETE', 'log_ai_registry_changes'),
    ('trg_ai_route_updated_at',     'ai_task_route',         'BEFORE UPDATE',                    'handle_updated_at'),
    ('trg_ai_route_params',         'ai_task_route',         'BEFORE UPDATE',                    'ai_route_params_validate'),
    ('trg_ai_route_no_delete',      'ai_task_route',         'BEFORE DELETE',                    'ai_registry_prevent_delete'),
    ('trg_ai_route_audit',          'ai_task_route',         'AFTER INSERT OR UPDATE OR DELETE', 'log_ai_registry_changes'),
    ('trg_ai_route_step_validate',  'ai_task_route_step',    'BEFORE INSERT OR UPDATE',          'ai_route_step_validate'),
    ('trg_ai_route_step_audit',     'ai_task_route_step',    'AFTER INSERT OR UPDATE OR DELETE', 'log_ai_registry_changes'),
    ('trg_ai_pricing_audit',        'ai_model_pricing',      'AFTER INSERT OR UPDATE OR DELETE', 'log_ai_registry_changes'),
    ('trg_ai_metrics_identity',     'ai_model_metrics',      'BEFORE INSERT',                    'ai_metrics_fill_identity'),
    ('trg_ai_metrics_append_only',  'ai_model_metrics',      'BEFORE UPDATE OR DELETE',          'ai_metrics_append_only'),
    ('trg_ai_audit_append_only',    'ai_registry_audit_log', 'BEFORE UPDATE OR DELETE',          'ai_audit_append_only')
  ) AS v(tg, tbl, timing, fn)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = t.tg AND tgrelid = ('public.' || t.tbl)::regclass) THEN
      EXECUTE format('CREATE TRIGGER %I %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.%I()',
                     t.tg, t.timing, t.tbl, t.fn);
    END IF;
  END LOOP;
END
$trg$;


-- §8 RLS + GRANTS ───────────────────────────────────────────────────────────
-- Registry: platform super admins read and edit; the service role (edge
-- functions) reads. Farmers and tenants never see or change it.
ALTER TABLE public.ai_model_catalog      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_task_route         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_task_route_step    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_registry_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_model_catalog, public.ai_task_route, public.ai_task_route_step,
              public.ai_registry_audit_log FROM anon;
REVOKE DELETE, TRUNCATE ON public.ai_model_catalog, public.ai_task_route FROM authenticated;
REVOKE TRUNCATE ON public.ai_task_route_step FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_registry_audit_log FROM authenticated;

-- Existing tables: close the anon write/TRUNCATE hole.
REVOKE ALL ON public.ai_model_pricing FROM anon;
REVOKE TRUNCATE ON public.ai_model_pricing FROM authenticated;
REVOKE ALL ON public.ai_model_metrics FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_model_metrics FROM authenticated;

DROP POLICY IF EXISTS "Super admins can access all AI metrics" ON public.ai_model_metrics;
DROP POLICY IF EXISTS super_admin_access  ON public.ai_model_metrics;
DROP POLICY IF EXISTS tenant_admin_access ON public.ai_model_metrics;

DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_model_catalog', 'ai_task_route', 'ai_task_route_step']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING ((auth.role() = ''service_role'') OR public.is_super_admin())',
                     t || '_select_admin', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_super_admin())',
                     t || '_insert_admin', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
                     t || '_update_admin', t);
    END IF;
  END LOOP;
  -- Removing a model from a fallback chain is an audited config edit.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_task_route_step'
                  AND policyname = 'ai_task_route_step_delete_admin') THEN
    CREATE POLICY ai_task_route_step_delete_admin ON public.ai_task_route_step FOR DELETE USING (public.is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_registry_audit_log'
                  AND policyname = 'ai_registry_audit_log_select_admin') THEN
    CREATE POLICY ai_registry_audit_log_select_admin ON public.ai_registry_audit_log FOR SELECT
      USING ((auth.role() = 'service_role') OR public.is_super_admin());
  END IF;
  -- Ledger: super admin reads everything; a tenant admin reads only their tenant.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_model_metrics'
                  AND policyname = 'ai_model_metrics_select_scoped') THEN
    CREATE POLICY ai_model_metrics_select_scoped ON public.ai_model_metrics FOR SELECT
      USING ((auth.role() = 'service_role') OR public.is_super_admin()
             OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id)));
  END IF;
END
$rls$;


-- §9 SEED — reproduces call-site behaviour at c78e6bb ─────────────────────
INSERT INTO public.ai_model_catalog
  (model_key, provider, api_model_id, status, input_modalities, api_contract, shutdown_date, source_url, notes, change_reason)
VALUES
  ('openai:gpt-5.6-luna', 'openai', 'gpt-5.6-luna', 'active', ARRAY['text'],
   '{"token_param":"max_completion_tokens","temperature":"omit","reasoning_efforts":["none","low","medium","high","xhigh","max"]}',
   NULL, 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
   'Current _shared/aiConfig.ts default. temperature=omit reproduces current behaviour (aiConfig rejectsCustomTemperature).',
   'seed: reproduces call-site behaviour at c78e6bb'),
  ('openai:gpt-6-luna', 'openai', 'gpt-6-luna', 'candidate', ARRAY['text', 'image'],
   '{"token_param":"max_completion_tokens","temperature":"omit","reasoning_efforts":["none","low","medium","high","xhigh","max"]}',
   NULL, 'https://developers.openai.com/api/docs/models/gpt-6-luna',
   'Candidate replacement for gpt-5.6-luna (about half the price). Not routable until evaluated. Chat Completions tool calling requires reasoning_effort none.',
   'seed: candidate for evaluation (user request 2026-09-25)'),
  ('openai:gpt-4o', 'openai', 'gpt-4o', 'active', ARRAY['text', 'image'],
   '{"token_param":"max_tokens","temperature":"allowed","reasoning_efforts":[]}',
   NULL, NULL, 'Vision model hardcoded in photo-analyzer.ts:191 and ai-crop-scan/index.ts:157,878.',
   'seed: reproduces call-site behaviour at c78e6bb'),
  ('openai:gpt-4o-mini', 'openai', 'gpt-4o-mini', 'active', ARRAY['text'],
   '{"token_param":"max_tokens","temperature":"allowed","reasoning_efforts":[]}',
   NULL, NULL, 'Hardcoded in translate-text, voice-navigation-agent, market-price-intelligence, ai-marketing-insights, ai-crop-scan (text).',
   'seed: reproduces call-site behaviour at c78e6bb'),
  ('openai:gpt-5-mini', 'openai', 'gpt-5-mini', 'active', ARRAY['text'],
   '{"token_param":"max_completion_tokens","temperature":"omit","reasoning_efforts":["minimal","low","medium","high"]}',
   NULL, NULL, 'proactive-evaluator enrichment default (config.ts:39). Does not accept reasoning_effort none.',
   'seed: reproduces call-site behaviour at c78e6bb'),
  ('gemini:gemini-2.5-flash', 'gemini', 'gemini-2.5-flash', 'deprecated', ARRAY['text', 'image'],
   '{"token_param":"max_tokens","temperature":"allowed","reasoning_efforts":[]}',
   DATE '2026-10-16', 'https://ai.google.dev/gemini-api/docs/deprecations',
   'Google shutdown 2026-10-16; Google-recommended replacement gemini-3.5-flash. Developers reported early 404s from 2026-07-09.',
   'seed: reproduces call-site behaviour at c78e6bb'),
  ('gemini:gemini-2.0-flash', 'gemini', 'gemini-2.0-flash', 'retired', ARRAY['text', 'image'],
   '{"token_param":"max_tokens","temperature":"allowed","reasoning_efforts":[]}',
   DATE '2026-06-01', 'https://ai.google.dev/gemini-api/docs/deprecations',
   'Shut down 2026-06-01, still hardcoded as a fallback in ai-agriculture-chat/agents/nlu-agent.ts:268 and ai-crop-scan/index.ts:208 (every such call 404s). Recorded so code references can be checked against it; never routable.',
   'seed: record of a retired model still referenced in code'),
  ('lovable:google/gemini-2.5-flash', 'lovable', 'google/gemini-2.5-flash', 'deprecated', ARRAY['text', 'image'],
   '{"token_param":"max_tokens","temperature":"allowed","reasoning_efforts":[]}',
   NULL, NULL,
   'Via Lovable AI Gateway. The underlying Google model shuts down 2026-10-16; gateway behaviour after that date is not verified.',
   'seed: reproduces call-site behaviour at c78e6bb'),
  ('lovable:google/gemini-3-flash-preview', 'lovable', 'google/gemini-3-flash-preview', 'active', ARRAY['text', 'image'],
   '{"token_param":"max_tokens","temperature":"allowed","reasoning_efforts":[]}',
   NULL, 'https://ai.google.dev/gemini-api/docs/deprecations',
   'Via Lovable AI Gateway. Preview model; Google lists no shutdown date.',
   'seed: reproduces call-site behaviour at c78e6bb')
ON CONFLICT (model_key) DO NOTHING;

-- Prices per 1K tokens, USD. Verified 2026-09-25. No row for Lovable-gateway models.
INSERT INTO public.ai_model_pricing
  (model_name, input_cost_per_1k, cached_input_cost_per_1k, output_cost_per_1k, currency, effective_from, is_active, source_url, notes)
VALUES
  ('openai:gpt-5.6-luna',     0.000200, 0.000020, 0.001200, 'USD', DATE '2026-09-25', true, 'https://benchlm.ai/openai/api-pricing',
   'Synced from developers.openai.com/api/docs/pricing on 2026-09-23; verified 2026-09-25. Short-context rate (prompts up to 272K).'),
  ('openai:gpt-6-luna',       0.000100, 0.000010, 0.000500, 'USD', DATE '2026-09-25', true, 'https://benchlm.ai/openai/api-pricing',
   'Synced from developers.openai.com/api/docs/pricing on 2026-09-23; verified 2026-09-25. Short-context rate.'),
  ('openai:gpt-4o',           0.002500, NULL,     0.010000, 'USD', DATE '2026-09-25', true, 'https://benchlm.ai/openai/api-pricing',
   'Verified 2026-09-25. No cached-input rate published; cached tokens are priced at the input rate.'),
  ('openai:gpt-4o-mini',      0.000150, NULL,     0.000600, 'USD', DATE '2026-09-25', true, 'https://benchlm.ai/openai/api-pricing',
   'Verified 2026-09-25. No cached-input rate published.'),
  ('openai:gpt-5-mini',       0.000250, NULL,     0.002000, 'USD', DATE '2026-09-25', true, 'https://benchlm.ai/openai/api-pricing',
   'Verified 2026-09-25. No cached-input rate published.'),
  ('gemini:gemini-2.5-flash', 0.000300, NULL,     0.002500, 'USD', DATE '2026-09-25', true, 'https://ai.google.dev/gemini-api/docs/pricing',
   'Google list price as reported 2026-09-12 to 2026-09-19 by two independent trackers; verified 2026-09-25. Text/image input rate.')
ON CONFLICT (model_name, effective_from) DO NOTHING;

INSERT INTO public.ai_task_route (task_key, description, required_modalities, is_active, change_reason)
VALUES
  ('brain.classify',       'Decision Brain intent classification — ai-agriculture-chat agents/intent-classifier.ts', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('brain.nlu',            'Decision Brain perception/NLU — ai-agriculture-chat agents/nlu-agent.ts', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb (its gemini-2.0-flash fallback is shut down and not routed)'),
  ('brain.explain',        'Explain Decision Brain output in farmer language — agents/llm-response-formatter.ts and agents/llm-response-generator.ts', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('brain.alert_narrate',  'Narrate a proactive alert in chat — ai-agriculture-chat/index.ts (proactive narration)', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('brain.translate',      'Render the chat answer in the farmer''s language — ai-agriculture-chat/index.ts (translation)', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('rag.answer',           'General chat RAG answer — ai-general-chat/index.ts', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('rag.normalize',        'Normalise the farmer question for retrieval — _shared/queryNormalizer.ts', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('schedule.compose',     'Crop schedule narration/composition in farmer language — ai-smart-schedule generator/narrate.ts, generator/compose-farmer-text.ts, harness/*', ARRAY['text'], true, 'seed: reproduces getScheduleProviderChain() code defaults at c78e6bb; secret overrides not visible'),
  ('farmer.translate',     'Text translation endpoint — translate-text', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('voice.navigate',       'Voice navigation intent — voice-navigation-agent', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('market.advice',        'Market price advice — market-price-intelligence', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('marketing.insights',   'Marketing insights — ai-marketing-insights', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('community.moderate',   'Community post moderation — community-moderate', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('community.caption',    'Community caption suggestion — community-caption-suggest', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('question.seed',        'Proactive question seeding — proactive-question-seed', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('alert.enrich',         'Rephrase proactive alerts from symbolic data — proactive-evaluator/enrichment.ts', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb (no enrichment_model override rows exist live)'),
  ('vision.photo_chat',    'Photo analysis inside chat — ai-agriculture-chat/photo/photo-analyzer.ts', ARRAY['text', 'image'], true, 'seed: reproduces call-site behaviour at c78e6bb (its first attempt, direct gemini-1.5-flash-latest, is not routed: status not verified)'),
  ('vision.crop_scan',     'Legacy crop scan image analysis — ai-crop-scan (being replaced by the photo-diagnosis engine)', ARRAY['text', 'image'], true, 'seed: reproduces call-site behaviour at c78e6bb (its gemini-2.0-flash fallback is shut down and not routed)'),
  ('crop_scan.solution',   'Legacy crop scan text-only targeted solution — ai-crop-scan', ARRAY['text'], true, 'seed: reproduces call-site behaviour at c78e6bb'),
  ('vision.diagnose',      'Photo perception engine — ai-agriculture-chat/photo/perception-engine.ts', ARRAY['text', 'image'], false, 'seed: inactive with no steps — engine is still gated by system_config.vision_diagnosis_policy (enabled=false, no model) until the field-photo model test')
ON CONFLICT (task_key) DO NOTHING;

INSERT INTO public.ai_task_route_step (task_key, step_no, model_key)
VALUES
  ('brain.classify',      1, 'openai:gpt-5.6-luna'),
  ('brain.classify',      2, 'gemini:gemini-2.5-flash'),
  ('brain.nlu',           1, 'openai:gpt-5.6-luna'),
  ('brain.explain',       1, 'openai:gpt-5.6-luna'),
  ('brain.explain',       2, 'gemini:gemini-2.5-flash'),
  ('brain.explain',       3, 'lovable:google/gemini-2.5-flash'),
  ('brain.alert_narrate', 1, 'lovable:google/gemini-3-flash-preview'),
  ('brain.translate',     1, 'lovable:google/gemini-2.5-flash'),
  ('brain.translate',     2, 'gemini:gemini-2.5-flash'),
  ('brain.translate',     3, 'openai:gpt-5.6-luna'),
  ('rag.answer',          1, 'openai:gpt-5.6-luna'),
  ('rag.answer',          2, 'gemini:gemini-2.5-flash'),
  ('rag.normalize',       1, 'openai:gpt-5.6-luna'),
  ('rag.normalize',       2, 'gemini:gemini-2.5-flash'),
  ('schedule.compose',    1, 'lovable:google/gemini-2.5-flash'),
  ('schedule.compose',    2, 'openai:gpt-5.6-luna'),
  ('schedule.compose',    3, 'gemini:gemini-2.5-flash'),
  ('farmer.translate',    1, 'openai:gpt-4o-mini'),
  ('voice.navigate',      1, 'openai:gpt-4o-mini'),
  ('market.advice',       1, 'openai:gpt-4o-mini'),
  ('marketing.insights',  1, 'openai:gpt-4o-mini'),
  ('community.moderate',  1, 'lovable:google/gemini-3-flash-preview'),
  ('community.caption',   1, 'lovable:google/gemini-3-flash-preview'),
  ('question.seed',       1, 'lovable:google/gemini-3-flash-preview'),
  ('alert.enrich',        1, 'openai:gpt-5-mini'),
  ('vision.photo_chat',   1, 'openai:gpt-4o'),
  ('vision.crop_scan',    1, 'openai:gpt-4o'),
  ('crop_scan.solution',  1, 'openai:gpt-4o-mini')
ON CONFLICT DO NOTHING;


-- §10 VERIFY (read-only) ────────────────────────────────────────────────────
SELECT 'new tables' AS check_name, count(*)::text AS got, '4' AS expected
  FROM information_schema.tables WHERE table_schema = 'public'
   AND table_name IN ('ai_model_catalog', 'ai_task_route', 'ai_task_route_step', 'ai_registry_audit_log')
UNION ALL
SELECT 'catalog models', count(*)::text, '9' FROM public.ai_model_catalog
UNION ALL
SELECT 'routes (active)', count(*)::text || ' (' || count(*) FILTER (WHERE is_active)::text || ')', '20 (19)' FROM public.ai_task_route
UNION ALL
SELECT 'route steps', count(*)::text, '28' FROM public.ai_task_route_step
UNION ALL
SELECT 'active routes with no step',
       coalesce(string_agg(r.task_key, ','), '0'), '0'
  FROM public.ai_task_route r
 WHERE r.is_active AND NOT EXISTS (SELECT 1 FROM public.ai_task_route_step s WHERE s.task_key = r.task_key)
UNION ALL
SELECT 'steps on non-routable models', count(*)::text, '0'
  FROM public.ai_task_route_step s JOIN public.ai_model_catalog c ON c.model_key = s.model_key
 WHERE c.status NOT IN ('active', 'deprecated')
UNION ALL
SELECT 'new price rows (catalog keys)', count(*)::text, '6'
  FROM public.ai_model_pricing p JOIN public.ai_model_catalog c ON c.model_key = p.model_name
UNION ALL
SELECT 'old price rows left untouched', count(*)::text, '6'
  FROM public.ai_model_pricing WHERE effective_from = DATE '2026-04-25'
UNION ALL
SELECT 'insecure metrics policies left', count(*)::text, '0'
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_model_metrics'
   AND policyname IN ('Super admins can access all AI metrics', 'super_admin_access', 'tenant_admin_access')
UNION ALL
SELECT 'anon/auth TRUNCATE left on pricing+metrics', count(*)::text, '0'
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name IN ('ai_model_pricing', 'ai_model_metrics')
   AND grantee IN ('anon', 'authenticated') AND privilege_type = 'TRUNCATE'
UNION ALL
SELECT 'anon grants on registry+pricing+metrics', count(*)::text, '0'
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee = 'anon'
   AND table_name IN ('ai_model_catalog', 'ai_task_route', 'ai_task_route_step', 'ai_registry_audit_log',
                      'ai_model_pricing', 'ai_model_metrics')
UNION ALL
SELECT 'triggers', count(*)::text, '14'
  FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg_ai\_%'
UNION ALL
SELECT 'audit rows from seed', count(*)::text, '>= 63'
  FROM public.ai_registry_audit_log;
