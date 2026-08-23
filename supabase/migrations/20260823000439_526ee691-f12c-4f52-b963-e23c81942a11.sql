-- FIX I: surface GDD telemetry to tenant admins (read-only).
GRANT SELECT ON public.land_gdd_daily TO authenticated;
GRANT SELECT ON public.system_health_events TO authenticated;
GRANT SELECT ON public.v_gdd_pipeline_health TO authenticated;
GRANT ALL ON public.land_gdd_daily TO service_role;
GRANT ALL ON public.system_health_events TO service_role;
GRANT SELECT ON public.v_gdd_pipeline_health TO service_role;

-- The monitoring view must respect the caller's RLS, not the owner's.
ALTER VIEW public.v_gdd_pipeline_health SET (security_invoker = on);

DROP POLICY IF EXISTS "Tenant admins read GDD for tenant lands" ON public.land_gdd_daily;
CREATE POLICY "Tenant admins read GDD for tenant lands"
ON public.land_gdd_daily FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lands l
    WHERE l.id = land_gdd_daily.land_id
      AND (public.is_super_admin() OR public.is_tenant_admin(l.tenant_id))
  )
);

DROP POLICY IF EXISTS "Tenant admins read health events" ON public.system_health_events;
CREATE POLICY "Tenant admins read health events"
ON public.system_health_events FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id))
);