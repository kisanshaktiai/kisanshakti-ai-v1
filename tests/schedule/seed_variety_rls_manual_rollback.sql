-- MANUAL ROLLBACK ONLY — NOT a forward migration.
-- This restores the exact 3 master_products SELECT policy expressions from
-- before the 20261110110542 repair. It also restores the original 42501
-- failure for anon variety catalogue queries; use only when necessary.
-- In production first capture policy definitions, verify counts and test.
BEGIN;

ALTER POLICY "Public can view active and AI recommendable products"
ON public.master_products TO PUBLIC
USING ((status = 'active' AND ai_recommendable = true));

ALTER POLICY "Authenticated users can read products"
ON public.master_products TO PUBLIC
USING ((auth.role() = 'authenticated'::text));

ALTER POLICY "seed_varieties_visible_by_scope"
ON public.master_products TO PUBLIC
USING (
  product_type <> 'seed'
  OR visibility = 'global'
  OR (
    visibility = 'tenant' AND tenant_scope_id IS NOT NULL
    AND public.has_tenant_access(tenant_scope_id)
  )
  OR public.is_admin_user(auth.uid())
);

COMMIT;
