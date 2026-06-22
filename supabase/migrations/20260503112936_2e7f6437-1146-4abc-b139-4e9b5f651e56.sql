-- Rewrite validate_farmer_pin (3-arg) to use the salted hash scheme used by the client
-- (SHA256(pin || 'kisan_shakti_2024')). This removes its dependency on the plaintext column.
CREATE OR REPLACE FUNCTION public.validate_farmer_pin(
  p_farmer_id uuid, p_pin text, p_tenant_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT pin_hash INTO v_hash
  FROM public.farmers
  WHERE id = p_farmer_id AND tenant_id = p_tenant_id;

  IF NOT FOUND OR v_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_hash = encode(digest(p_pin || 'kisan_shakti_2024', 'sha256'), 'hex');
END;
$$;

-- Now safely drop the plaintext PIN column. Pre-flight verified all 24 farmers
-- have populated pin_hash matching the salted scheme above.
ALTER TABLE public.farmers DROP COLUMN IF EXISTS pin;