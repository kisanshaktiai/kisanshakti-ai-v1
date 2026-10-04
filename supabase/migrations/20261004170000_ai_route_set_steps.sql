-- ═══════════════════════════════════════════════════════════════════════════
-- REPO : kisanshaktiai/kisanshakti-ai-v1  (farmer-app)
-- PATH : supabase/migrations/20261004170000_ai_route_set_steps.sql
-- STATUS: FOR REVIEW ONLY — NOT APPLIED.
-- DEPENDS ON: 20260925120000_ai_model_registry.sql (ai_task_route, ai_task_route_step,
--             ai_route_model_problem, is_super_admin) — applied live.
--
-- APPLY ORDER: before the admin panel's new "Model chain" editor is used. The editor calls this
--   function; without it the save fails with "Could not find the function
--   public.ai_route_set_steps" and the chain is left exactly as it was. Nothing else in either repo
--   calls it, so applying this migration changes no existing behaviour at all.
--
-- PURPOSE — replace a job's whole model chain in ONE transaction.
--   The admin panel cannot do this safely from the browser. Replacing a chain means deleting the
--   job's ai_task_route_step rows and inserting the new ones, and from the browser that is two
--   separate HTTP calls: if the insert fails after the delete succeeded, the job is left ACTIVE WITH
--   NO MODEL. The router then answers route_missing and the farmer silently gets deterministic
--   template text instead of an answer, with nothing in the logs to say a chain was lost.
--   Inside this function the delete and the inserts are one statement sequence in one transaction, so
--   either the whole new chain is in place or the old one is untouched.
--
--   The function re-applies every rule the registry already enforces, so the error the admin sees
--   names the real problem instead of a constraint code:
--     * caller must be a super admin (the same is_super_admin() the RLS policies use);
--     * a change reason is required, and is written onto the route so the audit trigger records it;
--     * at most 9 steps (ai_task_route_step_step_no_check);
--     * no model twice in one chain (ai_task_route_step_model_once);
--     * every model must exist and must be acceptable for this job — status active or deprecated,
--       input modalities covering the job's, and the job's reasoning_effort accepted — which is
--       exactly public.ai_route_model_problem(), the function the step trigger itself calls;
--     * an ACTIVE job may not be left with an empty chain. Clearing a chain is only allowed on a job
--       that is already switched off, which is the one case where no farmer is affected.
--
--   SECURITY INVOKER (the default) on purpose: the function runs with the caller's own rights, so the
--   registry's row-level security applies to the DELETE and the INSERTs exactly as it would to any
--   other write. It grants no privilege the admin does not already have — it only makes the change
--   atomic and the errors readable. The is_super_admin() check is for the message, not the privilege.
--
-- Nothing is deleted except the job's own step rows, which are replaced in the same transaction;
-- ai_task_route_step is the one registry table with no prevent-delete trigger, because a chain has to
-- be editable. Catalog and route rows are untouched by this migration.
-- SQL runner: no session state between statements; re-runnable (CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════


-- §0 PREFLIGHT ──────────────────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regclass('public.ai_task_route') IS NULL OR to_regclass('public.ai_task_route_step') IS NULL THEN
    RAISE EXCEPTION 'ai_route_set_steps preflight failed: registry tables missing — apply 20260925120000_ai_model_registry.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'ai_route_model_problem') THEN
    RAISE EXCEPTION 'ai_route_set_steps preflight failed: ai_route_model_problem() missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'is_super_admin') THEN
    RAISE EXCEPTION 'ai_route_set_steps preflight failed: is_super_admin() missing';
  END IF;
END
$preflight$;


-- §1 ai_route_set_steps ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_route_set_steps(
  p_task_key      text,
  p_model_keys    text[],
  p_change_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_route   public.ai_task_route;
  v_model   public.ai_model_catalog;
  v_keys    text[] := coalesce(p_model_keys, ARRAY[]::text[]);
  v_count   integer := coalesce(array_length(v_keys, 1), 0);
  v_problem text;
  v_key     text;
  v_step    smallint := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only a super admin may change a model chain' USING errcode = '42501';
  END IF;

  IF p_change_reason IS NULL OR btrim(p_change_reason) = '' THEN
    RAISE EXCEPTION 'a change reason is required — it is written to the audit log' USING errcode = '23514';
  END IF;

  SELECT * INTO v_route FROM public.ai_task_route WHERE task_key = p_task_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no ai_task_route row for %', p_task_key USING errcode = '23503';
  END IF;

  IF v_count = 0 AND v_route.is_active THEN
    RAISE EXCEPTION 'job % is active, so it must keep at least one model — switch the job off first', p_task_key
      USING errcode = '23514';
  END IF;

  IF v_count > 9 THEN
    RAISE EXCEPTION 'a chain holds at most 9 models (got %)', v_count USING errcode = '23514';
  END IF;

  IF (SELECT count(DISTINCT k) FROM unnest(v_keys) AS k) <> v_count THEN
    RAISE EXCEPTION 'a model may appear only once in a chain' USING errcode = '23505';
  END IF;

  -- Validate BEFORE touching anything, so a bad list leaves the chain untouched.
  FOREACH v_key IN ARRAY v_keys LOOP
    SELECT * INTO v_model FROM public.ai_model_catalog WHERE model_key = v_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'model % is not in the catalog', v_key USING errcode = '23503';
    END IF;
    v_problem := public.ai_route_model_problem(v_route, v_model);
    IF v_problem IS NOT NULL THEN
      RAISE EXCEPTION 'job %: %', p_task_key, v_problem USING errcode = '23514';
    END IF;
  END LOOP;

  -- The reason goes on the route first, so the route's audit row carries it and the step rows are
  -- attributable to the same change.
  UPDATE public.ai_task_route
     SET change_reason = p_change_reason
   WHERE task_key = p_task_key;

  DELETE FROM public.ai_task_route_step WHERE task_key = p_task_key;

  FOREACH v_key IN ARRAY v_keys LOOP
    v_step := v_step + 1;
    INSERT INTO public.ai_task_route_step (task_key, step_no, model_key)
    VALUES (p_task_key, v_step, v_key);
  END LOOP;
END
$fn$;

COMMENT ON FUNCTION public.ai_route_set_steps(text, text[], text) IS
  'Replaces a job''s whole model chain in one transaction. p_model_keys is the chain in order: the first entry is the primary model, the rest are its fallbacks. Re-applies the registry''s own rules (super admin, change reason, max 9 steps, no duplicate model, every model acceptable per ai_route_model_problem, an active job keeps at least one model) so the admin panel can report the real reason a chain was refused. Runs with the caller''s rights, so row-level security applies.';

REVOKE EXECUTE ON FUNCTION public.ai_route_set_steps(text, text[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ai_route_set_steps(text, text[], text) TO authenticated, service_role;


-- VERIFY (read-only) ────────────────────────────────────────────────────────
SELECT 'function exists' AS check_name,
       (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'ai_route_set_steps') AS got,
       '1' AS expected
UNION ALL
SELECT 'security mode (invoker expected)',
       (SELECT CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'ai_route_set_steps'), 'invoker'
UNION ALL
SELECT 'execute granted to',
       (SELECT string_agg(DISTINCT grantee, ',' ORDER BY grantee) FROM information_schema.role_routine_grants
         WHERE specific_schema = 'public' AND routine_name = 'ai_route_set_steps' AND privilege_type = 'EXECUTE'
           AND grantee IN ('authenticated', 'service_role', 'anon', 'PUBLIC')), 'authenticated,service_role'
UNION ALL
SELECT 'routes / steps unchanged',
       (SELECT count(*)::text FROM public.ai_task_route) || ' / ' || (SELECT count(*)::text FROM public.ai_task_route_step),
       '21 / 31';
