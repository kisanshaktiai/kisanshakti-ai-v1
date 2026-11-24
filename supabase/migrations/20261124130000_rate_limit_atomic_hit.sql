-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124130000_rate_limit_atomic_hit.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Rate limiter that holds under parallel requests (verifier E23, E24).
--
-- Before: _shared/rateLimiter.ts read the counter row, compared it with the
-- limit in the edge function, and wrote the counter back. Requests arriving at
-- the same moment all read the same value, so all of them were allowed and
-- several counter rows were created for one window.
--
-- Now: the edge helper calls rate_limit_hit(), which takes a transaction-scoped
-- advisory lock for the (identifier, endpoint) pair and then finds, creates or
-- increments the window row. The window rule is unchanged: a window opens with
-- the first request and lasts p_window_ms; while it is open at most p_max
-- requests are allowed.
--
-- Adds one function. The table rate_limit_tracking, its columns, indexes,
-- policies, trigger and grants are not changed.
--
-- Order: apply this file BEFORE pushing the _shared/rateLimiter.ts that calls
-- it. (The helper fails open on any error, as it always has, so a push made too
-- early would switch rate limiting off rather than block requests.)
-- Rollback: deploy the previous _shared/rateLimiter.ts, then
--   DROP FUNCTION public.rate_limit_hit(text, text, integer, integer);
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_identifier text, p_endpoint text, p_max integer, p_window_ms integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_now   timestamptz := clock_timestamp();
  v_id    uuid;
  v_count integer;
  v_end   timestamptz;
BEGIN
  IF p_identifier IS NULL OR p_endpoint IS NULL
     OR p_max IS NULL OR p_max < 1 OR p_window_ms IS NULL OR p_window_ms < 1 THEN
    RAISE EXCEPTION 'RATE_LIMIT_ARGUMENTS_INVALID';
  END IF;

  -- One caller at a time per (identifier, endpoint); released at commit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_identifier || chr(31) || p_endpoint, 0));
  v_now := clock_timestamp();

  SELECT t.id, t.request_count, t.window_end INTO v_id, v_count, v_end
    FROM public.rate_limit_tracking t
   WHERE t.identifier = p_identifier
     AND t.endpoint = p_endpoint
     AND t.window_end >= v_now
   ORDER BY t.window_start DESC
   LIMIT 1;

  IF v_id IS NULL THEN
    v_end := v_now + make_interval(secs => p_window_ms / 1000.0);
    INSERT INTO public.rate_limit_tracking (identifier, endpoint, request_count, window_start, window_end)
    VALUES (p_identifier, p_endpoint, 1, v_now, v_end);
    RETURN jsonb_build_object('allowed', true, 'remaining', p_max - 1, 'reset_at', v_end);
  END IF;

  IF v_count >= p_max THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'reset_at', v_end);
  END IF;

  UPDATE public.rate_limit_tracking SET request_count = v_count + 1 WHERE id = v_id;
  RETURN jsonb_build_object('allowed', true, 'remaining', p_max - v_count - 1, 'reset_at', v_end);
END
$fn$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, text, integer, integer) TO service_role;
