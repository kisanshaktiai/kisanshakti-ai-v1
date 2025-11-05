
-- Create functions to read custom headers from requests
-- These will be used by RLS policies to identify users in custom auth systems

-- Function to get farmer_id from custom headers
CREATE OR REPLACE FUNCTION public.get_header_farmer_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  header_value text;
BEGIN
  -- Try to get the x-farmer-id header
  BEGIN
    header_value := current_setting('request.headers', true)::json->>'x-farmer-id';
  EXCEPTION WHEN OTHERS THEN
    header_value := NULL;
  END;
  
  -- Return as UUID or NULL if not valid
  IF header_value IS NOT NULL AND header_value != '' THEN
    BEGIN
      RETURN header_value::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Function to get tenant_id from custom headers
CREATE OR REPLACE FUNCTION public.get_header_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  header_value text;
BEGIN
  -- Try to get the x-tenant-id header
  BEGIN
    header_value := current_setting('request.headers', true)::json->>'x-tenant-id';
  EXCEPTION WHEN OTHERS THEN
    header_value := NULL;
  END;
  
  -- Return as UUID or NULL if not valid
  IF header_value IS NOT NULL AND header_value != '' THEN
    BEGIN
      RETURN header_value::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Drop existing RLS policies for crop_schedules
DROP POLICY IF EXISTS "Farmers can view their own schedules" ON public.crop_schedules;
DROP POLICY IF EXISTS "Farmers can create their own schedules" ON public.crop_schedules;
DROP POLICY IF EXISTS "Farmers can update their own schedules" ON public.crop_schedules;
DROP POLICY IF EXISTS "Farmers can delete their own schedules" ON public.crop_schedules;

-- Create updated RLS policies for crop_schedules with custom header support
CREATE POLICY "Farmers can view their own schedules"
ON public.crop_schedules
FOR SELECT
USING (
  farmer_id = auth.uid() 
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = get_header_farmer_id()
);

CREATE POLICY "Farmers can create their own schedules"
ON public.crop_schedules
FOR INSERT
WITH CHECK (
  farmer_id = auth.uid() 
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = get_header_farmer_id()
);

CREATE POLICY "Farmers can update their own schedules"
ON public.crop_schedules
FOR UPDATE
USING (
  farmer_id = auth.uid() 
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = get_header_farmer_id()
);

CREATE POLICY "Farmers can delete their own schedules"
ON public.crop_schedules
FOR DELETE
USING (
  farmer_id = auth.uid() 
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = get_header_farmer_id()
);

-- Drop existing RLS policies for schedule_tasks
DROP POLICY IF EXISTS "Farmers can view tasks for their schedules" ON public.schedule_tasks;
DROP POLICY IF EXISTS "Farmers can manage tasks for their schedules" ON public.schedule_tasks;

-- Create updated RLS policies for schedule_tasks with custom header support
CREATE POLICY "Farmers can view tasks for their schedules"
ON public.schedule_tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.crop_schedules
    WHERE crop_schedules.id = schedule_tasks.schedule_id
    AND (
      crop_schedules.farmer_id = auth.uid()
      OR crop_schedules.farmer_id = get_jwt_farmer_id()
      OR crop_schedules.farmer_id = get_header_farmer_id()
    )
  )
);

CREATE POLICY "Farmers can manage tasks for their schedules"
ON public.schedule_tasks
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.crop_schedules
    WHERE crop_schedules.id = schedule_tasks.schedule_id
    AND (
      crop_schedules.farmer_id = auth.uid()
      OR crop_schedules.farmer_id = get_jwt_farmer_id()
      OR crop_schedules.farmer_id = get_header_farmer_id()
    )
  )
);

-- Grant execute permissions on the new functions
GRANT EXECUTE ON FUNCTION public.get_header_farmer_id() TO public;
GRANT EXECUTE ON FUNCTION public.get_header_tenant_id() TO public;

-- Add helpful comment
COMMENT ON FUNCTION public.get_header_farmer_id() IS 'Extracts farmer_id from x-farmer-id request header for custom auth support';
COMMENT ON FUNCTION public.get_header_tenant_id() IS 'Extracts tenant_id from x-tenant-id request header for custom auth support';
