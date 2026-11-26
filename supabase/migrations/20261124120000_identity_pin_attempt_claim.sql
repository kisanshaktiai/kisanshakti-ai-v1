-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124120000_identity_pin_attempt_claim.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- PIN lockout that holds under parallel requests (verifier E25, E27).
--
-- Before: the auth core read failed_login_attempts, compared the PIN, and wrote
-- the counter back. Requests fired at the same moment all read the same counter,
-- so every one of them was evaluated and the 5-attempt lockout never engaged.
--
-- Now: the auth core calls auth_claim_pin_attempt() BEFORE it compares a PIN.
-- One UPDATE takes the row lock, counts the attempt and refuses it when the
-- person is locked out, so at most p_max_attempts PINs are ever compared inside
-- one lockout window, however the requests arrive. A correct PIN resets the
-- counter to 0 exactly as before.
--
-- Adds one function. No table, column, policy, trigger or grant on any existing
-- object is changed. The function writes only the two counters the auth core
-- already writes: failed_login_attempts and last_failed_login, on farmers (for a
-- person who has a farmers row) or on accounts (for a person who has not).
--
-- Order: this file must be live BEFORE the farmer-auth-core.ts that calls it is
-- pushed (a push deploys the edge functions).
-- Rollback: deploy the previous farmer-auth-core.ts, then
--   DROP FUNCTION public.auth_claim_pin_attempt(text, uuid, integer, integer);
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auth_claim_pin_attempt(
  p_subject text, p_id uuid, p_max_attempts integer, p_lock_minutes integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_attempts integer;
  v_last     timestamptz;
BEGIN
  IF p_id IS NULL OR p_max_attempts IS NULL OR p_max_attempts < 1
     OR p_lock_minutes IS NULL OR p_lock_minutes < 1 THEN
    RAISE EXCEPTION 'PIN_ATTEMPT_ARGUMENTS_INVALID';
  END IF;

  -- Locked out = the counter reached the limit and the last failure is inside
  -- the lock window. Otherwise the attempt is counted; a counter that had
  -- reached the limit in an older window starts again at 1.
  IF p_subject = 'FARMER' THEN
    UPDATE public.farmers f
       SET failed_login_attempts = CASE WHEN coalesce(f.failed_login_attempts, 0) >= p_max_attempts
                                        THEN 1 ELSE coalesce(f.failed_login_attempts, 0) + 1 END,
           last_failed_login = now()
     WHERE f.id = p_id
       AND NOT (coalesce(f.failed_login_attempts, 0) >= p_max_attempts
                AND f.last_failed_login IS NOT NULL
                AND f.last_failed_login > now() - make_interval(mins => p_lock_minutes))
    RETURNING f.failed_login_attempts INTO v_attempts;
    IF NOT FOUND THEN
      SELECT f.last_failed_login INTO v_last FROM public.farmers f WHERE f.id = p_id;
    END IF;
  ELSIF p_subject = 'ACCOUNT' THEN
    UPDATE public.accounts a
       SET failed_login_attempts = CASE WHEN a.failed_login_attempts >= p_max_attempts
                                        THEN 1 ELSE a.failed_login_attempts + 1 END,
           last_failed_login = now()
     WHERE a.id = p_id
       AND NOT (a.failed_login_attempts >= p_max_attempts
                AND a.last_failed_login IS NOT NULL
                AND a.last_failed_login > now() - make_interval(mins => p_lock_minutes))
    RETURNING a.failed_login_attempts INTO v_attempts;
    IF NOT FOUND THEN
      SELECT a.last_failed_login INTO v_last FROM public.accounts a WHERE a.id = p_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'PIN_ATTEMPT_SUBJECT_INVALID';
  END IF;

  IF v_attempts IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', true, 'attempts', v_attempts);
  END IF;

  -- Refused: locked out, or no such person (answered the same way; the caller
  -- has already found the row, so this is only a row deleted in between).
  RETURN jsonb_build_object(
    'allowed', false,
    'retry_after_seconds',
    greatest(1, ceil(extract(epoch FROM (coalesce(v_last, now()) + make_interval(mins => p_lock_minutes) - now())))::integer));
END
$fn$;

REVOKE ALL ON FUNCTION public.auth_claim_pin_attempt(text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_claim_pin_attempt(text, uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.auth_claim_pin_attempt(text, uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auth_claim_pin_attempt(text, uuid, integer, integer) TO service_role;
