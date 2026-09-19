DROP POLICY IF EXISTS "Tenant read ndvi-thumbnails" ON storage.objects;
CREATE POLICY "Tenant read ndvi-thumbnails"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'ndvi-thumbnails'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND (
    (
      get_current_farmer_id() IS NOT NULL
      AND ((storage.foldername(name))[1])::uuid = get_current_tenant_id()
      AND is_tenant_active(((storage.foldername(name))[1])::uuid)
      AND EXISTS (
        SELECT 1 FROM public.lands l
        WHERE l.id = ((storage.foldername(name))[2])::uuid
          AND l.tenant_id = ((storage.foldername(name))[1])::uuid
          AND l.farmer_id = get_current_farmer_id()
      )
    )
    OR (
      get_current_farmer_id() IS NULL
      AND has_tenant_access(((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "Tenant read ndvi-rasters" ON storage.objects;
CREATE POLICY "Tenant read ndvi-rasters"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'ndvi-rasters'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND (
    (
      get_current_farmer_id() IS NOT NULL
      AND ((storage.foldername(name))[1])::uuid = get_current_tenant_id()
      AND is_tenant_active(((storage.foldername(name))[1])::uuid)
      AND EXISTS (
        SELECT 1 FROM public.lands l
        WHERE l.id = ((storage.foldername(name))[2])::uuid
          AND l.tenant_id = ((storage.foldername(name))[1])::uuid
          AND l.farmer_id = get_current_farmer_id()
      )
    )
    OR (
      get_current_farmer_id() IS NULL
      AND has_tenant_access(((storage.foldername(name))[1])::uuid)
    )
  )
);