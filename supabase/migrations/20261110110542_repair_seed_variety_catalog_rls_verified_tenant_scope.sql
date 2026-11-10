-- Applied to production Supabase as migration 20261110110542
-- "repair_seed_variety_catalog_rls_verified_tenant_scope".
-- Seed master-products RLS previously called SECURITY DEFINER routines for
-- anonymous users without EXECUTE rights (Postgres 42501).
-- This fix uses the existing verified_session_context-derived tenant identity
-- and does not grant anon execution to admin or tenant access functions.
--
-- This change is transactional and intentionally preserves non-seed catalogue
-- access while preventing pending or private seeds from being read by the
-- public and authenticated default policies.
BEGIN;

ALTER POLICY "Public can view active and AI recommendable products"
ON public.master_products TO anon, authenticated
USING (
  status = 'active' AND ai_recommendable IS TRUE
  AND (
    product_type IS DISTINCT FROM 'seed'
    OR (visibility = 'global' AND tenant_scope_id IS NULL)
  )
);

ALTER POLICY "Authenticated users can read products"
ON public.master_products TO authenticated
USING (product_type IS DISTINCT FROM 'seed');

ALTER POLICY "seed_varieties_visible_by_scope"
ON public.master_products TO anon, authenticated
USING (
  product_type = 'seed'
  AND status = 'active'
  AND ai_recommendable IS TRUE
  AND (
    (visibility = 'global' AND tenant_scope_id IS NULL)
    OR (
      visibility = 'tenant' AND tenant_scope_id IS NOT NULL
      AND tenant_scope_id = (SELECT public.get_current_tenant_id())
    )
  )
);

COMMIT;
