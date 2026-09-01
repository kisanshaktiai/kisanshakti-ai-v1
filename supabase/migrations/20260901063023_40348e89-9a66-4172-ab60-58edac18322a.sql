-- NDVI tables had zero Data-API grants, so PostgREST rejected every read with
-- "permission denied" before RLS was evaluated. Row scoping stays enforced by the
-- existing tenant policies (has_tenant_access -> verified session context).

GRANT SELECT ON public.ndvi_data TO anon, authenticated;
GRANT INSERT, UPDATE ON public.ndvi_data TO authenticated;
GRANT ALL ON public.ndvi_data TO service_role;

GRANT SELECT ON public.ndvi_micro_tiles TO anon, authenticated;
GRANT ALL ON public.ndvi_micro_tiles TO service_role;

GRANT SELECT ON public.ndvi_processing_logs TO anon, authenticated;
GRANT ALL ON public.ndvi_processing_logs TO service_role;

GRANT SELECT ON public.ndvi_run_summary TO anon, authenticated;
GRANT ALL ON public.ndvi_run_summary TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.ndvi_request_queue TO anon, authenticated;
GRANT ALL ON public.ndvi_request_queue TO service_role;

GRANT SELECT ON public.ndvi_spatial_analytics TO anon, authenticated;
GRANT ALL ON public.ndvi_spatial_analytics TO service_role;