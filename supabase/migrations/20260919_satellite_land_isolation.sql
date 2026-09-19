-- =====================================================================
-- Satellite artefacts: tenant + farmer + land isolation       (2026-09-19)
-- Project: qfklkkzxemsbeniyugiz          Repo: kisanshakti-ai-v1
--
-- WHY (security audit, multi-tenant SaaS, skeleton farmer app)
-- ---------------------------------------------------------------
-- Every satellite artefact today is guarded only by
--     has_tenant_access(tenant_id)
-- That is TENANT isolation. It is not FARMER or LAND isolation. In a
-- cooperative tenant with thousands of farmers, any farmer holding a
-- valid session token can read ANY other farmer's field NDVI, water
-- layers and field images in that tenant by land UUID - and, because the
-- INSERT/UPDATE policies on ndvi_data and satellite_water_layers carry
-- the same predicate, can also WRITE satellite rows for any land in the
-- tenant. Satellite data is produced only by the pipeline (service_role);
-- no farmer session should ever be able to insert or update it.
--
-- The field-image buckets have the opposite defect: their read policies
-- are scoped TO authenticated, but this app authenticates by mobile + PIN
-- and runs as role anon, so no farmer can sign an image URL at all
-- (verified: blank field image on the NDVI screen, 17-19 Sept).
--
-- THE MODEL COPIED HERE is the app's own, already live for photos
-- (supabase/migrations/20260830_photo_pipeline_rls_p0.sql):
--     auth.role() = 'service_role'
--     OR (tenant_id = get_current_tenant_id()
--         AND farmer_id = get_current_farmer_id()
--         AND is_tenant_active(tenant_id))
-- Identity resolves ONLY from the hashed, unexpired session token
-- (migration 20260901055622 removed the spoofable x-farmer-id fallback).
-- Satellite rows carry no farmer_id, so ownership goes through
-- public.lands: the land must belong to the calling farmer.
--
-- Admin / dashboard access: a caller with NO farmer session (admin panel,
-- Supabase-JWT user) keeps today's has_tenant_access rule. A caller WITH
-- a farmer session must own the land. See the PRE-CHECK below before
-- applying - it confirms an anonymous caller without a token cannot slip
-- into the admin branch.
--
-- Each statement is independent (SQL runner, no session state). Idempotent.
-- No data is modified or deleted. Nothing here touches the pipeline: it
-- writes with service_role and keeps full access.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PRE-CHECK (run BEFORE applying; must return false / false / false)
-- ---------------------------------------------------------------------
-- SET ROLE anon;
-- SELECT public.get_current_farmer_id() IS NULL      AS no_farmer,     -- expect true
--        public.get_current_tenant_id() IS NULL      AS no_tenant,     -- expect true
--        public.has_tenant_access('a2a59533-b5d2-450c-bd70-7180aa40d82d') AS anon_has_tenant; -- expect false
-- RESET ROLE;
-- If anon_has_tenant is true, STOP: has_tenant_access grants anonymous
-- callers and the admin branch below would too. Report back first.

-- ---------------------------------------------------------------------
-- Ownership predicate used by every policy below (inline, no new function:
-- keeps the migration self-contained and the SQL runner stateless).
--   land_owned_by_caller(land_id, tenant_id) :=
--     EXISTS (SELECT 1 FROM public.lands l
--              WHERE l.id = land_id
--                AND l.tenant_id = tenant_id
--                AND l.farmer_id = public.get_current_farmer_id())
-- ---------------------------------------------------------------------

-- ===================== 1. public.ndvi_data ===========================
DROP POLICY IF EXISTS ndvi_data_select ON public.ndvi_data;
CREATE POLICY ndvi_data_select ON public.ndvi_data
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      -- farmer session: must own the land, tenant must be active
      public.get_current_farmer_id() IS NOT NULL
      AND tenant_id = public.get_current_tenant_id()
      AND public.is_tenant_active(tenant_id)
      AND EXISTS (SELECT 1 FROM public.lands l
                   WHERE l.id = ndvi_data.land_id
                     AND l.tenant_id = ndvi_data.tenant_id
                     AND l.farmer_id = public.get_current_farmer_id())
    )
    OR (
      -- no farmer session (admin panel / JWT user): unchanged tenant rule
      public.get_current_farmer_id() IS NULL
      AND public.has_tenant_access(tenant_id)
    )
  );

-- Farmers never write satellite data. Only the pipeline (service_role).
DROP POLICY IF EXISTS ndvi_data_insert ON public.ndvi_data;
CREATE POLICY ndvi_data_insert ON public.ndvi_data
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS ndvi_data_update ON public.ndvi_data;
CREATE POLICY ndvi_data_update ON public.ndvi_data
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ================= 2. public.satellite_water_layers ==================
DROP POLICY IF EXISTS satellite_water_layers_select ON public.satellite_water_layers;
CREATE POLICY satellite_water_layers_select ON public.satellite_water_layers
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      public.get_current_farmer_id() IS NOT NULL
      AND tenant_id = public.get_current_tenant_id()
      AND public.is_tenant_active(tenant_id)
      AND EXISTS (SELECT 1 FROM public.lands l
                   WHERE l.id = satellite_water_layers.land_id
                     AND l.tenant_id = satellite_water_layers.tenant_id
                     AND l.farmer_id = public.get_current_farmer_id())
    )
    OR (
      public.get_current_farmer_id() IS NULL
      AND public.has_tenant_access(tenant_id)
    )
  );

DROP POLICY IF EXISTS satellite_water_layers_insert ON public.satellite_water_layers;
CREATE POLICY satellite_water_layers_insert ON public.satellite_water_layers
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS satellite_water_layers_update ON public.satellite_water_layers;
CREATE POLICY satellite_water_layers_update ON public.satellite_water_layers
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ==================== 3. public.ndvi_intelligence ====================
-- Empty today and unwritten by any code, but it carries the same tenant-only
-- predicate; align it now so nothing lands in it under the weaker rule.
DROP POLICY IF EXISTS ndvi_intelligence_select ON public.ndvi_intelligence;
CREATE POLICY ndvi_intelligence_select ON public.ndvi_intelligence
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      public.get_current_farmer_id() IS NOT NULL
      AND tenant_id = public.get_current_tenant_id()
      AND public.is_tenant_active(tenant_id)
      AND EXISTS (SELECT 1 FROM public.lands l
                   WHERE l.id = ndvi_intelligence.land_id
                     AND l.tenant_id = ndvi_intelligence.tenant_id
                     AND l.farmer_id = public.get_current_farmer_id())
    )
    OR (
      public.get_current_farmer_id() IS NULL
      AND public.has_tenant_access(tenant_id)
    )
  );

DROP POLICY IF EXISTS ndvi_intelligence_insert ON public.ndvi_intelligence;
CREATE POLICY ndvi_intelligence_insert ON public.ndvi_intelligence
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS ndvi_intelligence_update ON public.ndvi_intelligence;
CREATE POLICY ndvi_intelligence_update ON public.ndvi_intelligence
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============ 4. storage: field images and water-layer images =========
-- Object layout (both writers): {tenant_id}/{land_id}/...  so the second
-- path segment is the land. A farmer may sign only objects of a land that
-- is theirs. Role list includes anon because that is the role this app's
-- PIN-authenticated session runs as; the ownership check, not the role,
-- is what authorises.
DROP POLICY IF EXISTS "Tenant read ndvi-thumbnails" ON storage.objects;
CREATE POLICY "Tenant read ndvi-thumbnails" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'ndvi-thumbnails'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    AND (
      (
        public.get_current_farmer_id() IS NOT NULL
        AND ((storage.foldername(name))[1])::uuid = public.get_current_tenant_id()
        AND public.is_tenant_active(((storage.foldername(name))[1])::uuid)
        AND EXISTS (SELECT 1 FROM public.lands l
                     WHERE l.id = ((storage.foldername(name))[2])::uuid
                       AND l.tenant_id = ((storage.foldername(name))[1])::uuid
                       AND l.farmer_id = public.get_current_farmer_id())
      )
      OR (
        public.get_current_farmer_id() IS NULL
        AND public.has_tenant_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "Tenant read ndvi-rasters" ON storage.objects;
CREATE POLICY "Tenant read ndvi-rasters" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'ndvi-rasters'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    AND (
      (
        public.get_current_farmer_id() IS NOT NULL
        AND ((storage.foldername(name))[1])::uuid = public.get_current_tenant_id()
        AND public.is_tenant_active(((storage.foldername(name))[1])::uuid)
        AND EXISTS (SELECT 1 FROM public.lands l
                     WHERE l.id = ((storage.foldername(name))[2])::uuid
                       AND l.tenant_id = ((storage.foldername(name))[1])::uuid
                       AND l.farmer_id = public.get_current_farmer_id())
      )
      OR (
        public.get_current_farmer_id() IS NULL
        AND public.has_tenant_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );
-- The two "Service role can manage ndvi-*" ALL policies are left untouched:
-- the pipeline keeps writing.

-- =====================================================================
-- VERIFICATION (read-only, after applying)
-- =====================================================================
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
--  WHERE tablename IN ('ndvi_data','satellite_water_layers','ndvi_intelligence')
--     OR (schemaname='storage' AND policyname LIKE 'Tenant read ndvi%')
--  ORDER BY 1,3,2;
--   -- expect: SELECT policies with the ownership predicate; INSERT/UPDATE
--   -- restricted to service_role; storage roles = {anon,authenticated}
--
-- Functional: log in as the owner of land 30197c15 -> NDVI screen shows the
-- 12 Sept image and Min/Mean/Max. Log in as a DIFFERENT farmer of the same
-- tenant and query
--   SELECT count(*) FROM ndvi_data WHERE land_id='30197c15-786e-4aff-acab-2d94b2ff8e59';
-- through the app client -> expect 0. Before this migration it returns 8.
--
-- Pipeline: the next nightly run must still write (service_role) -
-- check ndvi_run_summary.lands_failed = 0 the following morning.
