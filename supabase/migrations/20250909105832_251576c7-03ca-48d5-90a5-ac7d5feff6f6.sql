-- Drop all existing validate_farmer_pin functions to resolve overloading issue
DROP FUNCTION IF EXISTS public.validate_farmer_pin(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.validate_farmer_pin(uuid, uuid, varchar);
DROP FUNCTION IF EXISTS public.validate_farmer_pin(uuid, varchar, uuid);

-- Create a single clean validate_farmer_pin function with consistent parameter types
CREATE OR REPLACE FUNCTION public.validate_farmer_pin(
  p_farmer_id uuid,
  p_pin text,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stored_pin text;
  v_stored_hash text;
BEGIN
  -- Get the stored PIN and hash for the farmer
  SELECT pin, pin_hash
  INTO v_stored_pin, v_stored_hash
  FROM public.farmers
  WHERE id = p_farmer_id AND tenant_id = p_tenant_id;
  
  -- If no farmer found, return false
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check direct PIN match (for plain text PINs)
  IF v_stored_pin = p_pin THEN
    RETURN true;
  END IF;
  
  -- Check hashed PIN match (for future hashed PINs)
  IF v_stored_hash IS NOT NULL AND v_stored_hash = encode(digest(p_pin, 'sha256'), 'hex') THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;