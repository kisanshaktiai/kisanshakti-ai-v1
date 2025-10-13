-- Enable RLS on soil_health table
ALTER TABLE public.soil_health ENABLE ROW LEVEL SECURITY;

-- Policy: Farmers can view their own soil health data
CREATE POLICY "Farmers can view own soil health"
ON public.soil_health
FOR SELECT
USING (
  tenant_id = COALESCE(
    (current_setting('app.tenant_id', true))::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  )
  AND farmer_id = COALESCE(
    (current_setting('app.farmer_id', true))::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  )
);

-- Policy: Tenant admins can view all soil health data for their tenant
CREATE POLICY "Tenant users can view tenant soil health"
ON public.soil_health
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM user_tenants 
    WHERE user_id = auth.uid() 
    AND is_active = true
  )
);

-- Policy: Service role can manage all soil health data
CREATE POLICY "Service role can manage soil health"
ON public.soil_health
FOR ALL
USING (true)
WITH CHECK (true);

-- Allow farmers to insert their own soil health data
CREATE POLICY "Farmers can insert own soil health"
ON public.soil_health
FOR INSERT
WITH CHECK (
  tenant_id = COALESCE(
    (current_setting('app.tenant_id', true))::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  )
  AND farmer_id = COALESCE(
    (current_setting('app.farmer_id', true))::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  )
);