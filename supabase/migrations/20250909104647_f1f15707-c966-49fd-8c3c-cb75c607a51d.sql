-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.validate_farmer_pin(uuid, text, uuid);

-- Create a simple PIN validation function for the auth flow
CREATE OR REPLACE FUNCTION public.validate_farmer_pin(
  p_farmer_id UUID,
  p_pin TEXT,
  p_tenant_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_pin TEXT;
  stored_hash TEXT;
  input_hash TEXT;
BEGIN
  -- Get the stored PIN and hash for the farmer
  SELECT pin, pin_hash 
  INTO stored_pin, stored_hash
  FROM farmers 
  WHERE id = p_farmer_id 
    AND tenant_id = p_tenant_id;
  
  -- If farmer not found, return false
  IF stored_pin IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Direct PIN comparison (for now, since we're storing plain PINs)
  IF stored_pin = p_pin THEN
    RETURN TRUE;
  END IF;
  
  -- Hash comparison if hash exists
  IF stored_hash IS NOT NULL THEN
    -- Hash the input PIN for comparison
    input_hash := encode(digest(p_pin::bytea, 'sha256'), 'hex');
    RETURN stored_hash = input_hash;
  END IF;
  
  RETURN FALSE;
END;
$$;