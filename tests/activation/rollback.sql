-- ============================================================================
-- Rollback for 20261124160000_farmer_activation_core.sql
-- ============================================================================
-- This file is NOT a migration. It lives in tests/activation/ so that no tool
-- applies it in sequence; run it by hand only to back the feature out.
--
-- Level 1 (seconds, no schema change) is the first statement alone: switching
-- the flag off returns registration, farmer creation and tenant changes to the
-- behaviour before the feature. Try that first.
--
-- Level 2 is the rest: it removes every hook this feature put on the existing
-- system (the two farmers triggers, the global mobile index, the entry-point
-- functions, the hourly job).
--
-- What stays, on purpose, because nothing here deletes data:
--   * activation_codes / activation_code_batches / activation_logs rows, and
--     the guards that keep them permanent;
--   * the three farmers columns (activation_pending, activated_at,
--     activation_code_id) and the columns added to the activation tables;
--   * farmers already moved to a tenant by a code stay in that tenant;
--   * the two Vault secrets (without them stored hashes can never be checked
--     again, so they are never dropped);
--   * the tightened grants on activation_codes and activation_logs (the old
--     grants gave every signed-in user full write access).
-- Self-contained: no TEMP tables, no session state between statements.
-- ============================================================================

-- ── Level 1: switch the feature off ─────────────────────────────────────────
UPDATE public.feature_flags
   SET is_enabled = false, updated_at = now()
 WHERE flag_name = 'farmer_activation_required';

-- ── Level 2: remove the hooks ───────────────────────────────────────────────
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'activation-codes-expire-hourly') THEN
    PERFORM cron.unschedule('activation-codes-expire-hourly');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'activation-codes-expire-hourly was not unscheduled: %', SQLERRM;
END
$cron$;

DROP TRIGGER IF EXISTS zz_activation_farmers_guard_ins ON public.farmers;
DROP TRIGGER IF EXISTS zz_activation_farmers_guard_upd ON public.farmers;
DROP INDEX IF EXISTS public.farmers_mobile_global_unique;

DROP FUNCTION IF EXISTS public.activation_redeem(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.activation_enforcement_status();
DROP FUNCTION IF EXISTS public.activation_admin_generate_batch(uuid, integer, timestamptz, text, uuid, text);
DROP FUNCTION IF EXISTS public.activation_admin_release_batch(uuid);
DROP FUNCTION IF EXISTS public.activation_admin_revoke(uuid, uuid[], text);
DROP FUNCTION IF EXISTS public.activation_reveal_codes(uuid);
DROP FUNCTION IF EXISTS public.activation_usage(uuid);
DROP FUNCTION IF EXISTS public.activation_expire_due();

DROP FUNCTION IF EXISTS activation.farmers_guard();
DROP FUNCTION IF EXISTS activation.tenant_gate(uuid);
DROP FUNCTION IF EXISTS activation.new_code();
DROP FUNCTION IF EXISTS activation.hash_code(text, text);
DROP FUNCTION IF EXISTS activation.format_code(text);
DROP FUNCTION IF EXISTS activation.normalize_code(text);
DROP FUNCTION IF EXISTS activation.secret(text);
DROP FUNCTION IF EXISTS activation.log(text, boolean, text, uuid, uuid, uuid, uuid, uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS activation.is_enforced();
-- activation.codes_guard, activation.batches_guard and activation.deny_change
-- stay: they are what keeps the stored codes and the audit trail permanent.

-- Verification (read-only): expected 0 | 0 | 0
SELECT (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.farmers'::regclass AND tgname LIKE 'zz_activation%') AS farmers_hooks,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'activation\_%') AS entry_points,
       (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'farmers_mobile_global_unique') AS global_mobile_index;
