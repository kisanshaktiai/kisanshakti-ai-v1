
-- Tighten RLS for newly added telemetry table.
-- Service role bypasses RLS; for all other roles, we deny read/write by default.

-- Drop overly permissive policies created in previous migration
DROP POLICY IF EXISTS "semantic_bridge_metrics_insert" ON public.semantic_bridge_metrics;
DROP POLICY IF EXISTS "semantic_bridge_metrics_read" ON public.semantic_bridge_metrics;

-- No replacement policies intentionally.
-- Result: only service_role (edge functions) can read/write; anon/authenticated cannot.
