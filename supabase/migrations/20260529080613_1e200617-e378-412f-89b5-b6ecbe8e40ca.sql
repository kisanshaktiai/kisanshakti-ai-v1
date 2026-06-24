CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_tracking()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.rate_limit_tracking
  WHERE window_end < (now() - interval '5 minutes');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_rate_limit_tracking() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_tracking() TO service_role;