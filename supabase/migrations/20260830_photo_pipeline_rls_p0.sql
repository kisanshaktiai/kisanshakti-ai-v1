-- ═══════════════════════════════════════════════════════════════════════════
-- 20260830_photo_pipeline_rls_p0.sql
--
-- ⚠️  APPROVAL-GATED. DO NOT RUN WITHOUT EXPLICIT SIGN-OFF.
--     This changes production RLS policies. No table, column or bucket is
--     created, dropped or altered.
--
-- PROBLEM (verified on project qfklkkzxemsbeniyugiz, 2026-08-30)
--   This app authenticates farmers with mobile+PIN custom auth, not Supabase
--   Auth. `supabaseWithAuth()` (src/integrations/supabase/client.ts:144-154)
--   sends the anon key plus `x-farmer-id` / `x-tenant-id` headers and never
--   sets a Supabase JWT, so `auth.uid()` is NULL for every farmer request.
--
--   `crop_growth_uploads` and the `crop-growth-media` storage policies are
--   written against `auth.uid()`. Every farmer INSERT is therefore rejected.
--   Live evidence: crop_growth_uploads = 0 rows, crop_growth_analysis = 0,
--   crop_growth_alerts = 0, storage.objects in crop-growth-media = 0 — while
--   TaskPhotoUploadDialog.tsx has been shipped and calling them.
--
-- FIX
--   Adopt the pattern already proven on `ai_chat_messages` (1,348 live rows):
--   get_current_farmer_id() / get_current_tenant_id() / is_tenant_active().
--   All three exist and are SECURITY DEFINER STABLE; get_current_farmer_id()
--   already falls back to auth.uid(), so Supabase-Auth callers keep working.
--
--   Tenant scoping is TIGHTENED, not loosened: the old policies checked only
--   farmer identity, the new ones check farmer AND tenant AND tenant-active.
--
-- ROLLBACK: at the bottom of this file.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. crop_growth_uploads ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can create uploads"            ON public.crop_growth_uploads;
DROP POLICY IF EXISTS "Users can view their own uploads"    ON public.crop_growth_uploads;
DROP POLICY IF EXISTS "Users can update their own uploads"  ON public.crop_growth_uploads;
DROP POLICY IF EXISTS "Users can delete their own uploads"  ON public.crop_growth_uploads;

CREATE POLICY "farmers_insert_own_uploads"
  ON public.crop_growth_uploads FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      tenant_id = public.get_current_tenant_id()
      AND farmer_id = public.get_current_farmer_id()
      AND public.is_tenant_active(tenant_id)
    )
  );

CREATE POLICY "farmers_select_own_uploads"
  ON public.crop_growth_uploads FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR (
      tenant_id = public.get_current_tenant_id()
      AND farmer_id = public.get_current_farmer_id()
      AND public.is_tenant_active(tenant_id)
    )
  );

CREATE POLICY "farmers_update_own_uploads"
  ON public.crop_growth_uploads FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR (
      tenant_id = public.get_current_tenant_id()
      AND farmer_id = public.get_current_farmer_id()
    )
  );

CREATE POLICY "farmers_delete_own_uploads"
  ON public.crop_growth_uploads FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR (
      tenant_id = public.get_current_tenant_id()
      AND farmer_id = public.get_current_farmer_id()
    )
  );

-- ── 2. crop-growth-media storage policies ─────────────────────────────────
-- Object path convention (src/services/cropPhotoService.ts):
--   {farmer_id}/{land_id}/{timestamp}.jpg
-- so foldername(name)[1] is the farmer id. Identical convention to the
-- policies being replaced; only the identity function changes.

DROP POLICY IF EXISTS "Users can upload crop media"       ON storage.objects;
DROP POLICY IF EXISTS "Users can view their crop media"   ON storage.objects;
DROP POLICY IF EXISTS "Users can delete crop media"       ON storage.objects;

CREATE POLICY "farmers_upload_crop_media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'crop-growth-media'
    AND (
      auth.role() = 'service_role'
      OR (storage.foldername(name))[1] = public.get_current_farmer_id()::text
    )
  );

CREATE POLICY "farmers_select_crop_media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'crop-growth-media'
    AND (
      auth.role() = 'service_role'
      OR (storage.foldername(name))[1] = public.get_current_farmer_id()::text
    )
  );

CREATE POLICY "farmers_delete_crop_media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'crop-growth-media'
    AND (
      auth.role() = 'service_role'
      OR (storage.foldername(name))[1] = public.get_current_farmer_id()::text
    )
  );

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- POST-APPLY VERIFICATION (run manually, expect the new policy names)
-- ═══════════════════════════════════════════════════════════════════════════
-- select policyname, cmd from pg_policies
--  where schemaname='public' and tablename='crop_growth_uploads' order by 1;
--
-- select policyname, cmd from pg_policies
--  where schemaname='storage' and tablename='objects'
--    and coalesce(qual, with_check) like '%crop-growth-media%' order by 1;
--
-- Then, from the farmer app, upload one schedule task photo and confirm:
--   select count(*) from crop_growth_uploads;                 -- expect 1
--   select count(*) from storage.objects
--    where bucket_id='crop-growth-media';                     -- expect 1


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP POLICY IF EXISTS "farmers_insert_own_uploads"  ON public.crop_growth_uploads;
-- DROP POLICY IF EXISTS "farmers_select_own_uploads"  ON public.crop_growth_uploads;
-- DROP POLICY IF EXISTS "farmers_update_own_uploads"  ON public.crop_growth_uploads;
-- DROP POLICY IF EXISTS "farmers_delete_own_uploads"  ON public.crop_growth_uploads;
-- CREATE POLICY "Users can create uploads"           ON public.crop_growth_uploads FOR INSERT WITH CHECK ((auth.uid())::text = (farmer_id)::text);
-- CREATE POLICY "Users can view their own uploads"   ON public.crop_growth_uploads FOR SELECT USING ((auth.uid())::text = (farmer_id)::text);
-- CREATE POLICY "Users can update their own uploads" ON public.crop_growth_uploads FOR UPDATE USING ((auth.uid())::text = (farmer_id)::text);
-- CREATE POLICY "Users can delete their own uploads" ON public.crop_growth_uploads FOR DELETE USING ((auth.uid())::text = (farmer_id)::text);
--
-- DROP POLICY IF EXISTS "farmers_upload_crop_media" ON storage.objects;
-- DROP POLICY IF EXISTS "farmers_select_crop_media" ON storage.objects;
-- DROP POLICY IF EXISTS "farmers_delete_crop_media" ON storage.objects;
-- CREATE POLICY "Users can upload crop media"     ON storage.objects FOR INSERT WITH CHECK (bucket_id='crop-growth-media' AND (auth.uid())::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Users can view their crop media" ON storage.objects FOR SELECT USING (bucket_id='crop-growth-media' AND (auth.uid())::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Users can delete crop media"     ON storage.objects FOR DELETE USING (bucket_id='crop-growth-media' AND (auth.uid())::text = (storage.foldername(name))[1]);
-- COMMIT;
