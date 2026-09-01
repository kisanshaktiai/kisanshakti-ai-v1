-- Identity is now derived exclusively from a server-issued session token.
-- The previous x-farmer-id / x-tenant-id header fallbacks were spoofable by
-- any anonymous caller and are removed.

CREATE OR REPLACE FUNCTION public.get_current_farmer_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT farmer_id FROM public.verified_session_context()
$function$;

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.verified_session_context()
$function$;