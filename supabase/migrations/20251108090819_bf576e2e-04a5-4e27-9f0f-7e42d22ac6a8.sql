-- Fix farmers table INSERT policy for anon self-registration
-- The issue: New farmers can't be created because they don't have farmer_id yet (chicken-egg problem)

DROP POLICY IF EXISTS "farmers_anon_insert_for_registration" ON farmers;

-- Allow anon users to register (self-registration) with proper validation
CREATE POLICY "farmers_anon_insert_for_registration"
ON farmers
FOR INSERT
TO anon
WITH CHECK (
  -- Must provide tenant_id and mobile_number (basic validation)
  tenant_id IS NOT NULL 
  AND mobile_number IS NOT NULL
  AND mobile_number ~ '^\d{10}$' -- Valid 10-digit mobile number
  AND pin_hash IS NOT NULL -- Must have a PIN
);

-- Also ensure service_role can create farmers (for edge functions)
DROP POLICY IF EXISTS "farmers_service_role_all" ON farmers;

CREATE POLICY "farmers_service_role_all"
ON farmers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);