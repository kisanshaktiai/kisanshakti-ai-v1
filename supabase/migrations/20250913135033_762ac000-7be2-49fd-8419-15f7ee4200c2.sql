-- Create helper function to set session variables for RLS
CREATE OR REPLACE FUNCTION public.set_app_session(p_tenant uuid, p_farmer uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('myapp.tenant_id', p_tenant::text, TRUE);
  PERFORM set_config('myapp.farmer_id', p_farmer::text, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper functions to get session variables
CREATE OR REPLACE FUNCTION public.get_session_tenant_id()
RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('myapp.tenant_id', TRUE), '')::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.get_session_farmer_id()
RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('myapp.farmer_id', TRUE), '')::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable RLS on lands table
ALTER TABLE public.lands ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on lands table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.lands;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.lands;
DROP POLICY IF EXISTS "Enable update for all users" ON public.lands;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.lands;
DROP POLICY IF EXISTS "Farmers can view their own lands" ON public.lands;
DROP POLICY IF EXISTS "Farmers can insert their own lands" ON public.lands;
DROP POLICY IF EXISTS "Farmers can update their own lands" ON public.lands;
DROP POLICY IF EXISTS "Farmers can delete their own lands" ON public.lands;

-- Create new RLS policies using session variables
-- SELECT: Farmers can only see their own active lands
CREATE POLICY "farmers_select_own_lands" ON public.lands
FOR SELECT USING (
  tenant_id = get_session_tenant_id() 
  AND farmer_id = get_session_farmer_id()
  AND deleted_at IS NULL
);

-- INSERT: Farmers can only insert lands for themselves
CREATE POLICY "farmers_insert_own_lands" ON public.lands
FOR INSERT WITH CHECK (
  tenant_id = get_session_tenant_id() 
  AND farmer_id = get_session_farmer_id()
);

-- UPDATE: Farmers can only update their own active lands
CREATE POLICY "farmers_update_own_lands" ON public.lands
FOR UPDATE USING (
  tenant_id = get_session_tenant_id() 
  AND farmer_id = get_session_farmer_id()
  AND deleted_at IS NULL
) WITH CHECK (
  tenant_id = get_session_tenant_id() 
  AND farmer_id = get_session_farmer_id()
);

-- No DELETE policy - we only allow soft deletes via UPDATE