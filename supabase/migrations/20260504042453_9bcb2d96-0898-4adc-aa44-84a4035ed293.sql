CREATE OR REPLACE FUNCTION public.validate_farmer_pin(
  p_farmer_id uuid, p_pin text, p_tenant_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_hash text;
BEGIN
  SELECT pin_hash INTO v_hash
  FROM public.farmers
  WHERE id = p_farmer_id AND tenant_id = p_tenant_id;
  IF NOT FOUND OR v_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN v_hash = encode(
    extensions.digest((p_pin || 'kisan_shakti_2024')::bytea, 'sha256'),
    'hex'
  );
END $$;