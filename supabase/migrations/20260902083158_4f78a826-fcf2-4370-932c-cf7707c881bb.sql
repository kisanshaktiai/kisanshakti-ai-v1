CREATE TABLE public.pin_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL,
  tenant_id uuid,
  mobile_number text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pin_reset_codes TO service_role;

ALTER TABLE public.pin_reset_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_pin_reset_codes_farmer ON public.pin_reset_codes (farmer_id, created_at DESC);
CREATE INDEX idx_pin_reset_codes_expiry ON public.pin_reset_codes (expires_at);