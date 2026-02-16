
-- Add explicit DENY-ALL RLS policies for semantic_bridge_metrics.
-- Purpose: make the table inaccessible to anon/authenticated via PostgREST,
-- while keeping it writable/readable by service_role (which bypasses RLS).

DO $$
BEGIN
  -- Ensure RLS enabled (idempotent)
  EXECUTE 'ALTER TABLE public.semantic_bridge_metrics ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN
  -- ignore
  NULL;
END $$;

DROP POLICY IF EXISTS "sbm_deny_select" ON public.semantic_bridge_metrics;
DROP POLICY IF EXISTS "sbm_deny_insert" ON public.semantic_bridge_metrics;
DROP POLICY IF EXISTS "sbm_deny_update" ON public.semantic_bridge_metrics;
DROP POLICY IF EXISTS "sbm_deny_delete" ON public.semantic_bridge_metrics;

CREATE POLICY "sbm_deny_select" ON public.semantic_bridge_metrics
  FOR SELECT USING (false);

CREATE POLICY "sbm_deny_insert" ON public.semantic_bridge_metrics
  FOR INSERT WITH CHECK (false);

CREATE POLICY "sbm_deny_update" ON public.semantic_bridge_metrics
  FOR UPDATE USING (false);

CREATE POLICY "sbm_deny_delete" ON public.semantic_bridge_metrics
  FOR DELETE USING (false);
