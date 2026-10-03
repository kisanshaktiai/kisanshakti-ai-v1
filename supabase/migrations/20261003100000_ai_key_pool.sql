-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20261003100000_ai_key_pool.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
-- DEPENDS ON: 20260925120000_ai_model_registry.sql (applied live),
--             20260927100000_ai_registry_call_site_routes.sql (Phase 0) and
--             20261001100000_ai_registry_features_and_ledger.sql (Phase 1) — both must be applied
--             first; the preflight checks for ai_feature.
-- APPLY ORDER: after Phase 1, BEFORE deploying the key-pool router (_shared/aiConfig.ts 2026-10-03)
--             and the admin panel's "AI Control → API Keys" screen. The router tolerates the tables
--             being absent (it then behaves exactly as before: one key per provider), so the order
--             only matters for the admin screen.
--
-- PURPOSE — AI model control plane, Phase 2a ("key pool"): several API keys per provider, each with
-- its own daily complimentary-token pool, rotated by the router and monitored by the super admin.
--
--   ai_model_group     NEW  which api_model_ids share one daily complimentary-token pool. Seeded from
--                           OpenAI's help article "Sharing feedback, evaluation and fine-tuning data,
--                           and API inputs and outputs with OpenAI" as fetched on 2026-10-02 (two
--                           groups: 1M/day — 250K for tiers 1-2; 10M/day — 2.5M for tiers 1-2).
--                           Members are stored WITHOUT the date suffix OpenAI prints
--                           (gpt-5-mini-2025-08-07 → gpt-5-mini) and matched the same way, so the
--                           catalog alias and the dated snapshot both resolve to the group.
--   ai_key_slot        NEW  one row per API key of a provider: which secret holds it (env_var name
--                           only — the key itself is never stored), enabled flag, daily pool per
--                           group and a reserve. Seeded: openai slots 1-3 (OPENAI_API_KEY,
--                           OPENAI_API_KEY_2, OPENAI_API_KEY_3 — slots 2 and 3 DISABLED until the
--                           admin adds the secret and enables them), gemini slot 1, lovable slot 1.
--   ai_key_pool_usage_today()  NEW  function the router calls (service role) for today's UTC token
--                           use per provider × key slot × group — sargable on the ledger's timestamp
--                           index. OpenAI sends no signal when a free pool is spent (it just bills),
--                           so the router counts from our own ledger and switches keys BEFORE the pool
--                           is spent. Keys must therefore be used by the router only.
--   ai_key_usage_daily NEW  view (security_invoker) per UTC day × provider × key slot × group ×
--                           pool (free | paid | none | unknown): calls, tokens, cost, last call,
--                           last error — the admin "API Keys" screen reads it.
--
-- Ledger rows written before this phase have no key slot in metadata; they are counted as slot 1
-- (the only key that existed) with pool 'unknown'.
--
-- NO model or route behaviour changes. Nothing is deleted. SQL runner: no session state between
-- statements; re-runnable (every statement is guarded).
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regclass('public.ai_model_catalog') IS NULL OR to_regclass('public.ai_model_metrics') IS NULL
     OR to_regclass('public.ai_registry_audit_log') IS NULL THEN
    RAISE EXCEPTION 'ai_key_pool preflight failed: registry tables missing — apply 20260925120000_ai_model_registry.sql first';
  END IF;
  IF to_regclass('public.ai_feature') IS NULL THEN
    RAISE EXCEPTION 'ai_key_pool preflight failed: ai_feature missing — apply 20261001100000_ai_registry_features_and_ledger.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname IN ('is_super_admin', 'handle_updated_at',
                       'ai_registry_prevent_delete', 'log_ai_registry_changes')
                 GROUP BY n.nspname HAVING count(DISTINCT p.proname) = 4) THEN
    RAISE EXCEPTION 'ai_key_pool preflight failed: a registry helper function is missing';
  END IF;
END
$preflight$;


-- §1 ai_model_group ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_model_group (
  group_key     text PRIMARY KEY CHECK (group_key ~ '^[a-z][a-z0-9_]*$'),
  provider      text NOT NULL CHECK (provider IN ('openai', 'gemini', 'lovable')),
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  description   text NOT NULL CHECK (length(btrim(description)) > 0),
  -- api_model_ids without a trailing -YYYY-MM-DD snapshot date (see ai_model_group_key()).
  api_model_ids text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  change_reason text NOT NULL CHECK (length(btrim(change_reason)) > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_model_group IS
  'AI control plane: models that share one daily complimentary-token pool at the provider. Members are api_model_ids without the dated snapshot suffix. Rows are never deleted — set is_active.';

-- Members must be plain model ids (no provider prefix, no whitespace) and must not carry a date suffix.
CREATE OR REPLACE FUNCTION public.ai_model_group_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_id text;
BEGIN
  FOREACH v_id IN ARRAY NEW.api_model_ids LOOP
    IF v_id !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$' THEN
      RAISE EXCEPTION 'ai_model_group.api_model_ids: invalid model id "%"', v_id;
    END IF;
    IF v_id ~ '-\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'ai_model_group.api_model_ids: store "%" without its date suffix', v_id;
    END IF;
  END LOOP;
  RETURN NEW;
END
$fn$;


-- §2 ai_key_slot ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_key_slot (
  provider       text NOT NULL CHECK (provider IN ('openai', 'gemini', 'lovable')),
  slot_no        smallint NOT NULL CHECK (slot_no BETWEEN 1 AND 9),
  label          text NOT NULL CHECK (length(btrim(label)) > 0),
  -- Name of the Supabase secret that holds the key. The key itself is NEVER stored. The pattern keeps
  -- the admin from pointing a slot at any other secret (e.g. the service-role key).
  env_var        text NOT NULL UNIQUE CHECK (env_var ~ '^[A-Z][A-Z0-9]*_API_KEY(_[2-9])?$'),
  is_enabled     boolean NOT NULL DEFAULT false,
  -- {"<group_key>": <tokens per UTC day>} — the complimentary pool this key's organisation gets per group.
  daily_pool     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Tokens kept back so a request that crosses the pool is not sent on this key (OpenAI bills such a
  -- request in full). Must cover the largest single call the routes make.
  reserve_tokens integer NOT NULL DEFAULT 20000 CHECK (reserve_tokens >= 0),
  notes          text,
  change_reason  text NOT NULL CHECK (length(btrim(change_reason)) > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, slot_no)
);

COMMENT ON TABLE public.ai_key_slot IS
  'AI control plane: one row per API key of a provider (secret name only, never the key). The router uses enabled slots in slot_no order: first the slots with free-pool room for the model''s group, then slot 1 for paid traffic. Rows are never deleted — set is_enabled = false.';

-- daily_pool keys must be active groups of the same provider; values non-negative integers.
CREATE OR REPLACE FUNCTION public.ai_key_slot_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_key text;
  v_val jsonb;
BEGIN
  IF jsonb_typeof(NEW.daily_pool) <> 'object' THEN
    RAISE EXCEPTION 'ai_key_slot.daily_pool must be a JSON object {group_key: tokens}';
  END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each(NEW.daily_pool) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.ai_model_group g WHERE g.group_key = v_key AND g.provider = NEW.provider) THEN
      RAISE EXCEPTION 'ai_key_slot.daily_pool: "%" is not a model group of provider %', v_key, NEW.provider;
    END IF;
    IF jsonb_typeof(v_val) <> 'number' OR (v_val::text) !~ '^\d+$' THEN
      RAISE EXCEPTION 'ai_key_slot.daily_pool."%" must be a non-negative integer token count', v_key;
    END IF;
  END LOOP;
  RETURN NEW;
END
$fn$;

-- Audit rows key by group_key / provider#slot_no (same function as before plus the two new cases).
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
             WHEN 'ai_feature'         THEN v_row->>'feature_key'
             WHEN 'ai_model_group'     THEN v_row->>'group_key'
             WHEN 'ai_key_slot'        THEN (v_row->>'provider') || '#' || (v_row->>'slot_no')
             ELSE v_row->>'id'
           END;
  INSERT INTO public.ai_registry_audit_log (table_name, row_key, action, changed_by, change_reason, old_value, new_value)
  VALUES (TG_TABLE_NAME, v_key, lower(TG_OP), auth.uid(),
          coalesce(v_new->>'change_reason', v_new->>'notes'), v_old, v_new);
  RETURN coalesce(NEW, OLD);
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.log_ai_registry_changes() FROM PUBLIC, anon, authenticated;

DO $trg$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('trg_ai_model_group_validate',   'ai_model_group', 'BEFORE INSERT OR UPDATE',           'ai_model_group_validate'),
    ('trg_ai_model_group_updated_at', 'ai_model_group', 'BEFORE UPDATE',                     'handle_updated_at'),
    ('trg_ai_model_group_no_delete',  'ai_model_group', 'BEFORE DELETE',                     'ai_registry_prevent_delete'),
    ('trg_ai_model_group_audit',      'ai_model_group', 'AFTER INSERT OR UPDATE OR DELETE',  'log_ai_registry_changes'),
    ('trg_ai_key_slot_validate',      'ai_key_slot',    'BEFORE INSERT OR UPDATE',           'ai_key_slot_validate'),
    ('trg_ai_key_slot_updated_at',    'ai_key_slot',    'BEFORE UPDATE',                     'handle_updated_at'),
    ('trg_ai_key_slot_no_delete',     'ai_key_slot',    'BEFORE DELETE',                     'ai_registry_prevent_delete'),
    ('trg_ai_key_slot_audit',         'ai_key_slot',    'AFTER INSERT OR UPDATE OR DELETE',  'log_ai_registry_changes')
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

-- RLS + grants: same shape as ai_feature (super admin reads/edits, service role reads, no deletes).
ALTER TABLE public.ai_model_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_key_slot    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_model_group FROM anon;
REVOKE ALL ON public.ai_key_slot    FROM anon;
REVOKE DELETE, TRUNCATE ON public.ai_model_group FROM authenticated;
REVOKE DELETE, TRUNCATE ON public.ai_key_slot    FROM authenticated;

DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_model_group', 'ai_key_slot'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING ((auth.role() = ''service_role'') OR public.is_super_admin())', t || '_select_admin', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_super_admin())', t || '_insert_admin', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())', t || '_update_admin', t);
    END IF;
  END LOOP;
END
$rls$;


-- §3 SEED ────────────────────────────────────────────────────────────────────
-- OpenAI complimentary-token groups (help article as fetched 2026-10-02; dates stripped).
-- VERIFY THESE LISTS AGAINST THE OPENAI DASHBOARD before enabling pools: the admin can edit them.
INSERT INTO public.ai_model_group (group_key, provider, name, description, api_model_ids, change_reason)
VALUES
  ('openai_big',  'openai', 'OpenAI large-model pool',
   'Models sharing the 1M tokens/day (250K for tiers 1-2) complimentary pool of an organisation that shares API traffic with OpenAI.',
   ARRAY['gpt-6-astra','gpt-6-sol','gpt-6-luna','gpt-5.6-sol','gpt-5.5','gpt-5.4','gpt-5.2','gpt-5.1','gpt-5.1-codex','gpt-5-codex','gpt-5','gpt-5-chat-latest','gpt-4.5-preview','gpt-4.1','gpt-4o','o3','o1-preview','o1'],
   'AI control plane Phase 2a (2026-10-03): key pool'),
  ('openai_mini', 'openai', 'OpenAI small-model pool',
   'Models sharing the 10M tokens/day (2.5M for tiers 1-2) complimentary pool of an organisation that shares API traffic with OpenAI.',
   ARRAY['gpt-5.6-terra','gpt-5.6-luna','gpt-5.4-mini','gpt-5.4-nano','gpt-5.1-codex-mini','gpt-5-mini','gpt-5-nano','gpt-4.1-mini','gpt-4.1-nano','gpt-4o-mini','o4-mini','o1-mini','codex-mini-latest'],
   'AI control plane Phase 2a (2026-10-03): key pool')
ON CONFLICT (group_key) DO NOTHING;

-- Key slots. Slot 1 of each provider is the secret the functions use today (enabled). OpenAI slots 2
-- and 3 are created DISABLED: the admin adds the secret OPENAI_API_KEY_2 / _3 in Supabase, confirms
-- data sharing is on in that organisation, sets the pool (tier 1-2 defaults below) and enables the slot.
INSERT INTO public.ai_key_slot (provider, slot_no, label, env_var, is_enabled, daily_pool, reserve_tokens, change_reason)
VALUES
  ('openai',  1, 'OpenAI key 1 (primary — paid traffic)', 'OPENAI_API_KEY',   true,  '{"openai_big": 250000, "openai_mini": 2500000}'::jsonb, 20000, 'AI control plane Phase 2a (2026-10-03): key pool'),
  ('openai',  2, 'OpenAI key 2',                          'OPENAI_API_KEY_2', false, '{"openai_big": 250000, "openai_mini": 2500000}'::jsonb, 20000, 'AI control plane Phase 2a (2026-10-03): key pool'),
  ('openai',  3, 'OpenAI key 3',                          'OPENAI_API_KEY_3', false, '{"openai_big": 250000, "openai_mini": 2500000}'::jsonb, 20000, 'AI control plane Phase 2a (2026-10-03): key pool'),
  ('gemini',  1, 'Gemini key 1',                          'GEMINI_API_KEY',   true,  '{}'::jsonb, 0, 'AI control plane Phase 2a (2026-10-03): key pool'),
  ('lovable', 1, 'Lovable AI Gateway key',                'LOVABLE_API_KEY',  true,  '{}'::jsonb, 0, 'AI control plane Phase 2a (2026-10-03): key pool')
ON CONFLICT (provider, slot_no) DO NOTHING;


-- §4 Helpers + usage function + view ─────────────────────────────────────────
-- group of a model: provider + api_model_id with any -YYYY-MM-DD suffix removed, exact member match.
-- SECURITY DEFINER so the view works for every reader of the ledger (ai_model_group is super-admin only).
CREATE OR REPLACE FUNCTION public.ai_model_group_key(p_provider text, p_api_model_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT g.group_key
    FROM public.ai_model_group g
   WHERE g.provider = p_provider
     AND g.is_active
     AND regexp_replace(p_api_model_id, '-\d{4}-\d{2}-\d{2}$', '') = ANY (g.api_model_ids)
   ORDER BY g.group_key
   LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.ai_model_group_key(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_model_group_key(text, text) TO authenticated, service_role;

-- Today's (UTC) tokens per provider × key slot × group. Called by the router every 60 s with the
-- service role; sargable on idx_ai_model_metrics_timestamp. Rows without metadata.key_slot (written
-- before Phase 2a) count as slot 1. Tokens = input + output (output includes reasoning), the way
-- OpenAI counts the complimentary pool.
CREATE OR REPLACE FUNCTION public.ai_key_pool_usage_today()
RETURNS TABLE (provider text, key_slot smallint, group_key text, tokens bigint, calls integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT split_part(m.model_name, ':', 1)                                                  AS provider,
         coalesce(nullif(m.metadata->>'key_slot', '')::smallint, 1)                        AS key_slot,
         public.ai_model_group_key(split_part(m.model_name, ':', 1), split_part(m.model_name, ':', 2)) AS group_key,
         coalesce(sum(coalesce((m.resource_usage->>'input_tokens')::bigint, 0)
                    + coalesce((m.resource_usage->>'output_tokens')::bigint, 0)), 0)::bigint AS tokens,
         count(*)::integer                                                                  AS calls
    FROM public.ai_model_metrics m
   WHERE m."timestamp" >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
     AND m.error_class = 'ok'
   GROUP BY 1, 2, 3;
$fn$;

REVOKE EXECUTE ON FUNCTION public.ai_key_pool_usage_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_key_pool_usage_today() TO authenticated, service_role;

-- Admin screen: per UTC day × provider × key slot × group × pool.
CREATE OR REPLACE VIEW public.ai_key_usage_daily
WITH (security_invoker = true)
AS
SELECT (m."timestamp" AT TIME ZONE 'UTC')::date                                            AS day,
       split_part(m.model_name, ':', 1)                                                    AS provider,
       coalesce(nullif(m.metadata->>'key_slot', '')::smallint, 1)                          AS key_slot,
       public.ai_model_group_key(split_part(m.model_name, ':', 1), split_part(m.model_name, ':', 2)) AS group_key,
       coalesce(nullif(m.metadata->>'pool', ''), 'unknown')                                AS pool,
       count(*)::integer                                                                   AS calls,
       count(*) FILTER (WHERE m.error_class = 'ok')::integer                               AS ok_calls,
       count(*) FILTER (WHERE m.error_class IS DISTINCT FROM 'ok')::integer                AS failed_calls,
       count(*) FILTER (WHERE m.error_class IN ('rate_limited', 'quota_exhausted'))::integer AS limited_calls,
       coalesce(sum((m.resource_usage->>'input_tokens')::bigint), 0)::bigint                 AS input_tokens,
       coalesce(sum((m.resource_usage->>'output_tokens')::bigint), 0)::bigint                AS output_tokens,
       coalesce(sum(coalesce((m.resource_usage->>'input_tokens')::bigint, 0)
                  + coalesce((m.resource_usage->>'output_tokens')::bigint, 0)), 0)::bigint   AS tokens,
       coalesce(sum(m.cost_usd), 0)::numeric                                               AS cost_usd,
       max(m."timestamp")                                                                  AS last_call_at,
       max(m."timestamp") FILTER (WHERE m.error_class IS DISTINCT FROM 'ok')               AS last_error_at
  FROM public.ai_model_metrics m
 GROUP BY 1, 2, 3, 4, 5;

COMMENT ON VIEW public.ai_key_usage_daily IS
  'AI usage ledger per UTC day × provider × API key slot × complimentary-token group × pool (free | paid | none | unknown). Rows written before the key pool existed count as slot 1 / unknown.';

REVOKE ALL ON public.ai_key_usage_daily FROM anon;
GRANT SELECT ON public.ai_key_usage_daily TO authenticated, service_role;


-- VERIFY (read-only) ────────────────────────────────────────────────────────
SELECT 'ai_model_group rows' AS check_name, (SELECT count(*)::text FROM public.ai_model_group) AS got, '2' AS expected
UNION ALL
SELECT 'ai_key_slot rows', (SELECT count(*)::text FROM public.ai_key_slot), '5'
UNION ALL
SELECT 'enabled slots', (SELECT string_agg(provider || '#' || slot_no, ' ' ORDER BY provider, slot_no) FROM public.ai_key_slot WHERE is_enabled), 'gemini#1 lovable#1 openai#1'
UNION ALL
SELECT 'gpt-5.6-luna group', public.ai_model_group_key('openai', 'gpt-5.6-luna'), 'openai_mini'
UNION ALL
SELECT 'gpt-6-luna group', public.ai_model_group_key('openai', 'gpt-6-luna'), 'openai_big'
UNION ALL
SELECT 'dated snapshot resolves', public.ai_model_group_key('openai', 'gpt-5-mini-2025-08-07'), 'openai_mini'
UNION ALL
SELECT 'gemini has no group', coalesce(public.ai_model_group_key('gemini', 'gemini-3.5-flash-lite'), 'null'), 'null'
UNION ALL
SELECT 'usage function runs', (SELECT count(*)::text FROM public.ai_key_pool_usage_today()) || ' row(s)', 'n row(s)'
UNION ALL
SELECT 'ai_key_usage_daily exists', (SELECT (to_regclass('public.ai_key_usage_daily') IS NOT NULL)::text), 'true'
UNION ALL
SELECT 'audit rows (groups + slots)', (SELECT count(*)::text FROM public.ai_registry_audit_log WHERE table_name IN ('ai_model_group', 'ai_key_slot') AND action = 'insert'), '7'
UNION ALL
SELECT 'routes / steps unchanged', (SELECT count(*)::text FROM public.ai_task_route) || ' / ' || (SELECT count(*)::text FROM public.ai_task_route_step), '21 / 31';
