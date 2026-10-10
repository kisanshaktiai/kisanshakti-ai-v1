-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20261001100000_ai_registry_features_and_ledger.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
-- DEPENDS ON: 20260925120000_ai_model_registry.sql, 20260926100000_ai_registry_retire_gemini_2_5.sql,
--             20260926140000_ai_route_brain_explain_reasoning.sql (applied live) and
--             20260927100000_ai_registry_call_site_routes.sql (Phase 0 — must be applied first; the
--             preflight below checks for its route brain.format).
-- APPLY ORDER: after the Phase 0 migration, BEFORE deploying the admin panel's AI Control screens
--             (they read ai_feature, ai_task_route.feature_key and ai_usage_daily).
--
-- PURPOSE — AI model control plane, Phase 1 ("admin can see everything"). Additive only:
--   DB1  ai_feature            NEW  one row per admin-facing feature (AI chat, crop schedule, ...).
--        ai_task_route         +feature_key (NOT NULL after back-fill) so the admin panel groups the
--                               technical job keys under the feature they serve.
--   DB6  ai_metrics_fill_identity  the ledger no longer RAISES for an unknown farmer id (which lost
--                               the whole usage row): the row is kept, farmer_id is cleared and the
--                               unverified id is recorded in metadata. tenant_id is still derived
--                               only from a verified farmer — never from the caller.
--        ai_usage_daily        NEW  view (security_invoker) by day × feature × job × function ×
--                               tenant × model: calls, failures, fallbacks, tokens, cost. Reads the
--                               stored cost_usd (price at call time) — no re-estimation.
--
-- NO model or route behaviour changes: the router (_shared/aiConfig.ts) selects named columns and
-- never reads feature_key; chains, params and modalities are untouched.
-- 2026-10-02 review: feature_key in the view comes from a SECURITY DEFINER helper (tenant admins
-- cannot read ai_task_route, so a join gave them NULL features).
-- request_id (one farmer request = one query) is NOT added here: it lands in Phase 2 together with
-- the router change that fills it, so the column and its writer deploy as one unit.
--
-- SQL runner: no session state between statements; re-runnable (every statement is guarded).
-- Nothing is deleted.
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regclass('public.ai_task_route') IS NULL OR to_regclass('public.ai_model_metrics') IS NULL
     OR to_regclass('public.ai_registry_audit_log') IS NULL THEN
    RAISE EXCEPTION 'features_and_ledger preflight failed: registry tables missing — apply 20260925120000_ai_model_registry.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_task_route WHERE task_key = 'brain.format') THEN
    RAISE EXCEPTION 'features_and_ledger preflight failed: route brain.format missing — apply 20260927100000_ai_registry_call_site_routes.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname IN ('is_super_admin', 'handle_updated_at',
                       'ai_registry_prevent_delete', 'log_ai_registry_changes', 'ai_metrics_fill_identity')
                 GROUP BY n.nspname HAVING count(DISTINCT p.proname) = 5) THEN
    RAISE EXCEPTION 'features_and_ledger preflight failed: a registry helper function is missing';
  END IF;
END
$preflight$;


-- §1 ai_feature ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_feature (
  feature_key   text PRIMARY KEY CHECK (feature_key ~ '^[a-z][a-z0-9_]*$'),
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  description   text NOT NULL CHECK (length(btrim(description)) > 0),
  sort_order    smallint NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  change_reason text NOT NULL CHECK (length(btrim(change_reason)) > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_feature IS
  'AI control plane: one row per admin-facing feature. Routes (ai_task_route) hang under a feature via feature_key. Rows are never deleted — set is_active.';

-- The audit trigger derives the audit row key per table; ai_feature keys by feature_key.
-- (Same body as 20260925120000 plus the ai_feature case. SECURITY DEFINER + EXECUTE revoked, as before.)
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
    ('trg_ai_feature_updated_at', 'ai_feature', 'BEFORE UPDATE',                    'handle_updated_at'),
    ('trg_ai_feature_no_delete',  'ai_feature', 'BEFORE DELETE',                    'ai_registry_prevent_delete'),
    ('trg_ai_feature_audit',      'ai_feature', 'AFTER INSERT OR UPDATE OR DELETE', 'log_ai_registry_changes')
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

-- RLS + grants: same shape as ai_task_route (super admin reads/edits, service role reads, no deletes).
ALTER TABLE public.ai_feature ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_feature FROM anon;
REVOKE DELETE, TRUNCATE ON public.ai_feature FROM authenticated;

DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_feature' AND policyname = 'ai_feature_select_admin') THEN
    CREATE POLICY ai_feature_select_admin ON public.ai_feature FOR SELECT USING ((auth.role() = 'service_role') OR public.is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_feature' AND policyname = 'ai_feature_insert_admin') THEN
    CREATE POLICY ai_feature_insert_admin ON public.ai_feature FOR INSERT WITH CHECK (public.is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_feature' AND policyname = 'ai_feature_update_admin') THEN
    CREATE POLICY ai_feature_update_admin ON public.ai_feature FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
  END IF;
END
$rls$;


-- §2 SEED the features (one per admin-facing feature; order = admin screen order) ───────────────
INSERT INTO public.ai_feature (feature_key, name, description, sort_order, change_reason)
VALUES
  ('chat',         'AI chat',           'Farmer chat on the Decision Brain (ai-agriculture-chat): understanding, classification, answer writing, explanation, translation, alert narration', 10, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('schedule',     'Crop schedule',     'Crop schedule planning and farmer-language task text (ai-smart-schedule)', 20, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('general_chat', 'General chat (RAG)','General farmer Q&A answered from the knowledge base (ai-general-chat, rag-eval)', 30, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('photo',        'Photo diagnosis',   'Crop photo perception and diagnosis (ai-agriculture-chat photo engine, ai-crop-scan)', 40, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('voice',        'Voice',             'Voice navigation of the app (voice-navigation-agent); speech-to-text and read-aloud join in Phase 3', 50, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('market',       'Market',            'Market price advice (market-price-intelligence)', 60, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('community',    'Community',         'Community post captions, moderation and post translation (community-caption-suggest, community-moderate, translate-text)', 70, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('proactive',    'Proactive alerts',  'Alert enrichment and proactive question seeding (proactive-evaluator, proactive-question-seed)', 80, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('marketing',    'Tenant marketing',  'Marketing insights for tenants (ai-marketing-insights)', 90, 'AI control plane Phase 1 (2026-10-01): feature grouping'),
  ('admin',        'Admin tools',       'Admin-panel AI jobs: rule builder, narration judge, branding suggestions, NDVI insights — routes arrive in Phase 4', 100, 'AI control plane Phase 1 (2026-10-01): feature grouping')
ON CONFLICT (feature_key) DO NOTHING;


-- §3 ai_task_route.feature_key ────────────────────────────────────────────────
ALTER TABLE public.ai_task_route
  ADD COLUMN IF NOT EXISTS feature_key text REFERENCES public.ai_feature(feature_key) ON DELETE RESTRICT;

-- Back-fill from the call-site inventory (every live route on 2026-10-01 plus brain.format from Phase 0).
-- change_reason is set too, so the audit row written by trg_ai_route_audit carries this reason.
UPDATE public.ai_task_route r
   SET feature_key   = m.feature_key,
       change_reason = 'AI control plane Phase 1 (2026-10-01): grouped under feature ' || m.feature_key
  FROM (VALUES
    ('brain.nlu',           'chat'),
    ('brain.classify',      'chat'),
    ('brain.format',        'chat'),
    ('brain.explain',       'chat'),
    ('brain.translate',     'chat'),
    ('brain.alert_narrate', 'chat'),
    ('schedule.compose',    'schedule'),
    ('rag.answer',          'general_chat'),
    ('rag.normalize',       'general_chat'),
    ('vision.diagnose',     'photo'),
    ('vision.crop_scan',    'photo'),
    ('crop_scan.solution',  'photo'),
    ('vision.photo_chat',   'photo'),
    ('voice.navigate',      'voice'),
    ('market.advice',       'market'),
    ('community.caption',   'community'),
    ('community.moderate',  'community'),
    ('farmer.translate',    'community'),
    ('alert.enrich',        'proactive'),
    ('question.seed',       'proactive'),
    ('marketing.insights',  'marketing')
  ) AS m(task_key, feature_key)
 WHERE r.task_key = m.task_key
   AND r.feature_key IS NULL;

-- Every route must belong to a feature before the column is locked.
DO $fk$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(task_key, ', ' ORDER BY task_key) INTO v_missing
    FROM public.ai_task_route WHERE feature_key IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'features_and_ledger: routes without a feature (add them to the back-fill list): %', v_missing;
  END IF;
END
$fk$;

ALTER TABLE public.ai_task_route ALTER COLUMN feature_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS ai_task_route_feature_key_idx ON public.ai_task_route (feature_key);

COMMENT ON COLUMN public.ai_task_route.feature_key IS
  'Admin-facing feature this job belongs to (ai_feature). Grouping only — the router never reads it.';


-- §4 Ledger: never lose a usage row ──────────────────────────────────────────
-- Before: an unknown farmer id RAISED and the call's usage row was lost (the router swallows ledger
-- errors). Now: the row is kept, farmer_id is cleared, the unverified id goes to metadata.
-- tenant_id is still set ONLY from a verified farmer (unchanged security rule).
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
      NEW.metadata  := coalesce(NEW.metadata, '{}'::jsonb)
                       || jsonb_build_object('identity', 'farmer_not_found',
                                             'unverified_farmer_id', NEW.farmer_id::text);
      NEW.farmer_id := NULL;
      NEW.tenant_id := NULL;
    ELSE
      NEW.tenant_id := v_tenant;
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;


-- §5 ai_usage_daily — the one usage/cost view for the admin panel ────────────
-- security_invoker: the ledger's own RLS applies (super admin: all; tenant admin: own tenant).
-- Token sums use the keys the router writes into resource_usage (readUsage in _shared/aiConfig.ts).
-- The feature of a job is read through a SECURITY DEFINER helper, not a join: ai_task_route is
-- readable by super admins only, so a joined column would be NULL for a tenant admin (review fix
-- 2026-10-02). The helper exposes nothing but task_key → feature_key.
CREATE OR REPLACE FUNCTION public.ai_route_feature_key(p_task_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT r.feature_key FROM public.ai_task_route r WHERE r.task_key = p_task_key;
$fn$;

REVOKE EXECUTE ON FUNCTION public.ai_route_feature_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_route_feature_key(text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.ai_usage_daily
WITH (security_invoker = true)
AS
SELECT (m."timestamp" AT TIME ZONE 'UTC')::date                                   AS day,
       public.ai_route_feature_key(m.task_key)                                    AS feature_key,
       m.task_key,
       m.function_name,
       m.tenant_id,
       m.model_name,
       m.model_requested,
       count(*)::integer                                                          AS calls,
       count(*) FILTER (WHERE m.error_class = 'ok')::integer                      AS ok_calls,
       count(*) FILTER (WHERE m.error_class IS DISTINCT FROM 'ok')::integer       AS failed_calls,
       count(*) FILTER (WHERE m.fallback_used)::integer                           AS fallback_calls,
       count(*) FILTER (WHERE m.error_class = 'ok' AND m.cost_usd IS NULL)::integer AS uncosted_calls,
       coalesce(sum((m.resource_usage->>'input_tokens')::bigint), 0)::bigint        AS input_tokens,
       coalesce(sum((m.resource_usage->>'cached_input_tokens')::bigint), 0)::bigint AS cached_input_tokens,
       coalesce(sum((m.resource_usage->>'output_tokens')::bigint), 0)::bigint       AS output_tokens,
       coalesce(sum(m.cost_usd), 0)::numeric                                      AS cost_usd,
       round(avg(m.avg_response_time_ms))::integer                                AS avg_latency_ms
  FROM public.ai_model_metrics m
 GROUP BY 1, 2, 3, 4, 5, 6, 7;

COMMENT ON VIEW public.ai_usage_daily IS
  'AI usage ledger rolled up per UTC day × feature × job × function × tenant × model. cost_usd is the stored price-at-call-time sum; uncosted_calls counts ok calls with no price row.';

REVOKE ALL ON public.ai_usage_daily FROM anon;
GRANT SELECT ON public.ai_usage_daily TO authenticated, service_role;


-- VERIFY (read-only) ────────────────────────────────────────────────────────
SELECT 'ai_feature rows' AS check_name, (SELECT count(*)::text FROM public.ai_feature) AS got, '10' AS expected
UNION ALL
SELECT 'routes without feature', (SELECT count(*)::text FROM public.ai_task_route WHERE feature_key IS NULL), '0'
UNION ALL
SELECT 'feature_key NOT NULL', (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ai_task_route' AND column_name = 'feature_key'), 'NO'
UNION ALL
SELECT 'routes per feature', (SELECT string_agg(feature_key || '=' || n, ' ' ORDER BY feature_key) FROM (SELECT feature_key, count(*) n FROM public.ai_task_route GROUP BY 1) x), 'chat=6 community=3 general_chat=2 market=1 marketing=1 photo=4 proactive=2 schedule=1 voice=1'
UNION ALL
SELECT 'ai_usage_daily exists', (SELECT (to_regclass('public.ai_usage_daily') IS NOT NULL)::text), 'true'
UNION ALL
SELECT 'ai_feature audit rows', (SELECT count(*)::text FROM public.ai_registry_audit_log WHERE table_name = 'ai_feature' AND action = 'insert'), '10'
UNION ALL
SELECT 'routes / steps unchanged', (SELECT count(*)::text FROM public.ai_task_route) || ' / ' || (SELECT count(*)::text FROM public.ai_task_route_step), '21 / 31';
