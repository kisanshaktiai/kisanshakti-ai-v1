-- Drop existing function first
DROP FUNCTION IF EXISTS public.set_app_session CASCADE;

-- Create the set_app_session function with proper error handling
CREATE FUNCTION public.set_app_session(
  p_tenant_id UUID,
  p_farmer_id UUID,
  p_session_token TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set the session variables for RLS
  PERFORM set_config('app.tenant_id', COALESCE(p_tenant_id::text, '00000000-0000-0000-0000-000000000000'), true);
  PERFORM set_config('app.farmer_id', COALESCE(p_farmer_id::text, '00000000-0000-0000-0000-000000000000'), true);
  
  IF p_session_token IS NOT NULL THEN
    PERFORM set_config('app.session_token', p_session_token, true);
  END IF;
  
  -- Log for debugging
  RAISE NOTICE 'Session set: tenant_id=%, farmer_id=%', p_tenant_id, p_farmer_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_app_session TO anon;
GRANT EXECUTE ON FUNCTION public.set_app_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_session TO service_role;