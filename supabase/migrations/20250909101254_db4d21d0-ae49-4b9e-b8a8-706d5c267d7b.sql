-- Drop existing function with different signature if exists
DROP FUNCTION IF EXISTS validate_farmer_pin(UUID, UUID, VARCHAR);
DROP FUNCTION IF EXISTS validate_farmer_pin(UUID, VARCHAR);

-- Add function to validate farmer PIN with tenant isolation
CREATE OR REPLACE FUNCTION validate_farmer_pin(
  p_farmer_id UUID,
  p_tenant_id UUID,
  p_pin VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_pin VARCHAR;
  v_is_valid BOOLEAN := false;
BEGIN
  -- Get the stored PIN for the farmer in the specific tenant
  SELECT pin INTO v_stored_pin
  FROM farmers
  WHERE id = p_farmer_id
    AND tenant_id = p_tenant_id
    AND is_active = true;
  
  -- In production, this should compare hashed values
  IF v_stored_pin IS NOT NULL AND v_stored_pin = p_pin THEN
    v_is_valid := true;
    
    -- Update last login
    UPDATE farmers
    SET 
      last_login_at = NOW(),
      failed_login_attempts = 0,
      total_app_opens = COALESCE(total_app_opens, 0) + 1
    WHERE id = p_farmer_id
      AND tenant_id = p_tenant_id;
  ELSE
    -- Update failed login attempts
    UPDATE farmers
    SET 
      failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
      last_failed_login = NOW()
    WHERE id = p_farmer_id
      AND tenant_id = p_tenant_id;
  END IF;
  
  RETURN v_is_valid;
END;
$$;