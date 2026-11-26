-- ═══════════════════════════════════════════════════════════════════════════
-- 20261126110000_provider_listing_go_live.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Why a set-up provider did not show to farmers: farmers see only LISTED
-- providers, and the only move to LISTED was provider_review_listing(), which
-- only the service role can run and which nothing calls (no admin queue was
-- built). A provider who finished every step stayed DRAFT, or PENDING_REVIEW
-- for ever.
--
-- From now on a provider who has a business profile, an active service, a
-- working day and an area goes LISTED as soon as he asks. The platform keeps
-- control afterwards through provider_review_listing(.., 'SUSPEND'), which is
-- unchanged; a suspended provider cannot list himself again.
--
-- One switch in the existing policy row keeps the review step for the day an
-- admin queue exists: provider_workspace_policy.listing_review_required
-- (false now; true sends listings to PENDING_REVIEW as before).
--
-- Changes one config row, replaces one function, and lists providers that are
-- waiting for a review nobody can give. Deletes nothing. Safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. the switch ──────────────────────────────────────────────────────────
UPDATE public.system_config
   SET config_value = config_value || '{"listing_review_required": false}'::jsonb
 WHERE config_key = 'provider_workspace_policy'
   AND jsonb_typeof(config_value) = 'object'
   AND NOT (config_value ? 'listing_review_required');

-- ── 2. asking to be listed ─────────────────────────────────────────────────
-- DRAFT → LISTED (or PENDING_REVIEW while the review switch is on). A listing
-- left waiting while the switch is off is listed too. Listed and suspended
-- providers: nothing to do.
CREATE OR REPLACE FUNCTION public.provider_submit_for_review()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_account uuid := public.provider_session_profile_locked();
  v_review  boolean := (public.provider_workspace_policy() -> 'listing_review_required') = 'true'::jsonb;
  v_status  text;
BEGIN
  SELECT p.listing_status INTO v_status FROM public.service_provider_profiles p WHERE p.account_id = v_account;
  IF NOT (v_status = 'DRAFT' OR (v_status = 'PENDING_REVIEW' AND NOT v_review)) THEN
    RETURN public.provider_workspace_get();        -- waiting for a reviewer, listed or suspended: nothing to do
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_services s WHERE s.account_id = v_account AND s.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'PROVIDER_NO_ACTIVE_SERVICE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.provider_working_hours w WHERE w.account_id = v_account AND w.is_working) THEN
    RAISE EXCEPTION 'PROVIDER_HOURS_NOT_SET';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_reach_settings r
                  WHERE r.account_id = v_account AND r.role = 'SERVICE_PROVIDER') THEN
    RAISE EXCEPTION 'PROVIDER_REACH_NOT_SET';
  END IF;
  UPDATE public.service_provider_profiles
     SET listing_status   = CASE WHEN v_review THEN 'PENDING_REVIEW' ELSE 'LISTED' END,
         submitted_at     = CASE WHEN v_status = 'DRAFT' THEN now() ELSE submitted_at END,
         listed_at        = CASE WHEN v_review THEN listed_at ELSE now() END,
         review_note_code = NULL,
         updated_at       = now()
   WHERE account_id = v_account;
  RETURN public.provider_workspace_get();
END
$fn$;

REVOKE ALL ON FUNCTION public.provider_submit_for_review() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_submit_for_review() TO anon, authenticated, service_role;

-- ── 3. listings waiting for a review nobody can give ───────────────────────
UPDATE public.service_provider_profiles sp
   SET listing_status = 'LISTED', listed_at = now(), updated_at = now()
 WHERE sp.listing_status = 'PENDING_REVIEW'
   AND (SELECT (c.config_value -> 'listing_review_required') = 'false'::jsonb
          FROM public.system_config c WHERE c.config_key = 'provider_workspace_policy');

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'listing review switch in the provider policy' AS check_name,
       coalesce((SELECT c.config_value ->> 'listing_review_required' FROM public.system_config c
                  WHERE c.config_key = 'provider_workspace_policy'), 'missing') AS actual, 'false' AS expected;
SELECT 'listings left waiting for review while the switch is off' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM public.service_provider_profiles sp
 WHERE sp.listing_status = 'PENDING_REVIEW'
   AND (SELECT (c.config_value -> 'listing_review_required') = 'false'::jsonb
          FROM public.system_config c WHERE c.config_key = 'provider_workspace_policy');
SELECT 'browser may ask to be listed, and only the service role may review' AS check_name,
       (SELECT count(*) FROM information_schema.routine_privileges
         WHERE specific_schema = 'public' AND routine_name = 'provider_submit_for_review' AND grantee = 'anon')::text
       || '/' ||
       (SELECT count(*) FROM information_schema.routine_privileges
         WHERE specific_schema = 'public' AND routine_name = 'provider_review_listing' AND grantee IN ('anon', 'authenticated', 'PUBLIC'))::text AS actual,
       '1/0' AS expected;
