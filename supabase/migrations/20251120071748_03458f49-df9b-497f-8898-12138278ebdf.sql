-- Drop existing function if it exists with wrong signature
DROP FUNCTION IF EXISTS cleanup_old_rate_limits();

-- Create rate limiting table for persistent tracking
CREATE TABLE IF NOT EXISTS public.rate_limit_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  endpoint text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(identifier, endpoint, window_start)
);

-- Enable RLS on rate_limit_tracking
ALTER TABLE public.rate_limit_tracking ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limit_tracking;

-- Create policy for service role to manage rate limits
CREATE POLICY "Service role can manage rate limits"
  ON public.rate_limit_tracking
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_lookup 
  ON public.rate_limit_tracking(identifier, endpoint, window_end);

CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_cleanup 
  ON public.rate_limit_tracking(window_end);

-- Function to clean up old rate limit records
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_tracking
  WHERE window_end < now() - interval '1 hour';
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_rate_limit_tracking_updated_at ON public.rate_limit_tracking;

-- Create trigger function to update updated_at
CREATE OR REPLACE FUNCTION update_rate_limit_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER update_rate_limit_tracking_updated_at
  BEFORE UPDATE ON public.rate_limit_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_rate_limit_updated_at();