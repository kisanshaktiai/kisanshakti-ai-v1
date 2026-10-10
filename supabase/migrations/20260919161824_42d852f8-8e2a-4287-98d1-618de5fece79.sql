CREATE OR REPLACE FUNCTION public.current_farmer_owns_land(
  p_land_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lands l
    WHERE l.id = p_land_id
      AND l.tenant_id = p_tenant_id
      AND l.farmer_id = public.get_current_farmer_id()
      AND p_tenant_id = public.get_current_tenant_id()
      AND public.is_tenant_active(p_tenant_id)
  )
$$;

REVOKE ALL ON FUNCTION public.current_farmer_owns_land(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_farmer_owns_land(uuid, uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS ndvi_data_select ON public.ndvi_data;
CREATE POLICY ndvi_data_select
ON public.ndvi_data
FOR SELECT
TO PUBLIC
USING (
  auth.role() = 'service_role'
  OR public.current_farmer_owns_land(land_id, tenant_id)
  OR (public.get_current_farmer_id() IS NULL AND public.has_tenant_access(tenant_id))
);

DROP POLICY IF EXISTS satellite_water_layers_select ON public.satellite_water_layers;
CREATE POLICY satellite_water_layers_select
ON public.satellite_water_layers
FOR SELECT
TO PUBLIC
USING (
  auth.role() = 'service_role'
  OR public.current_farmer_owns_land(land_id, tenant_id)
  OR (public.get_current_farmer_id() IS NULL AND public.has_tenant_access(tenant_id))
);

DROP POLICY IF EXISTS "Tenant read ndvi-thumbnails" ON storage.objects;
CREATE POLICY "Tenant read ndvi-thumbnails"
ON storage.objects
FOR SELECT
TO PUBLIC
USING (
  bucket_id = 'ndvi-thumbnails'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND (
    public.current_farmer_owns_land(
      ((storage.foldername(name))[2])::uuid,
      ((storage.foldername(name))[1])::uuid
    )
    OR (
      public.get_current_farmer_id() IS NULL
      AND public.has_tenant_access(((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "Tenant read ndvi-rasters" ON storage.objects;
CREATE POLICY "Tenant read ndvi-rasters"
ON storage.objects
FOR SELECT
TO PUBLIC
USING (
  bucket_id = 'ndvi-rasters'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND (
    public.current_farmer_owns_land(
      ((storage.foldername(name))[2])::uuid,
      ((storage.foldername(name))[1])::uuid
    )
    OR (
      public.get_current_farmer_id() IS NULL
      AND public.has_tenant_access(((storage.foldername(name))[1])::uuid)
    )
  )
);