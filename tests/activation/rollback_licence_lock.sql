-- ============================================================================
-- Rollback for 20261125100000_farmer_activation_licence_lock.sql
-- ============================================================================
-- This file is NOT a migration. Run it by hand only to back the licence lock out.
-- It removes the two guards and the entitlement function. It deletes no data:
-- seat limits and subscription rows already recorded stay as they are.
--
-- After this, a tenant admin can again change the tenant's own seat limit,
-- status and subscription row, as before the lock.
--
-- Left in place on purpose: the newer activation_admin_generate_batch() and
-- activation_usage(). They keep the same names and arguments as in the core
-- migration and only add the licence check and one extra figure.
-- ============================================================================
DROP TRIGGER IF EXISTS activation_tenant_licence_guard ON public.tenants;
DROP TRIGGER IF EXISTS activation_tenant_subscription_guard ON public.tenant_subscriptions;
DROP FUNCTION IF EXISTS activation.tenant_licence_guard();
DROP FUNCTION IF EXISTS activation.tenant_subscription_guard();
DROP FUNCTION IF EXISTS public.activation_admin_set_entitlement(uuid, integer, timestamptz, text);

-- Verification (read-only): expected 0 | 0
SELECT (SELECT count(*) FROM pg_trigger WHERE tgname IN ('activation_tenant_licence_guard', 'activation_tenant_subscription_guard')) AS guards,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'activation_admin_set_entitlement') AS entitlement_fn;
