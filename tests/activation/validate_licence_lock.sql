-- ============================================================================
-- Validation for 20261125100000_farmer_activation_licence_lock.sql (read-only)
-- ============================================================================
-- Run after the migration. Each row shows what was found next to what is
-- expected. This file is NOT a migration: it changes nothing.
-- ============================================================================
SELECT * FROM (
  SELECT 1 AS n, 'guard on tenants (seat limit, status, default mark) is installed' AS check_name,
         (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.tenants'::regclass AND tgname = 'activation_tenant_licence_guard' AND tgenabled = 'O') AS actual, '1' AS expected
  UNION ALL SELECT 2, 'guard on tenant_subscriptions is installed',
         (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.tenant_subscriptions'::regclass AND tgname = 'activation_tenant_subscription_guard' AND tgenabled = 'O'), '1'
  UNION ALL SELECT 3, 'entitlement function exists',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'activation_admin_set_entitlement'), '1'
  UNION ALL SELECT 4, 'anon cannot execute it',
         (SELECT has_function_privilege('anon', 'public.activation_admin_set_entitlement(uuid, integer, timestamptz, text)', 'EXECUTE')::text), 'false'
  UNION ALL SELECT 5, 'signed-in users can call it (the function itself checks for super admin)',
         (SELECT has_function_privilege('authenticated', 'public.activation_admin_set_entitlement(uuid, integer, timestamptz, text)', 'EXECUTE')::text), 'true'
  UNION ALL SELECT 6, 'code generation now checks licences',
         (SELECT (prosrc LIKE '%exceeds_licences%' AND prosrc LIKE '%subscription_inactive%')::text FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'activation_admin_generate_batch'), 'true'
  UNION ALL SELECT 7, 'anon still cannot execute any activation entry point',
         (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'activation\_%' AND has_function_privilege('anon', p.oid, 'EXECUTE')), '0'
  UNION ALL SELECT 8, 'entry points present (8 from the core + 1)',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'activation\_%'), '9'
  UNION ALL SELECT 9, 'no seat limit or subscription row was changed by the migration (no entitlement logged)',
         (SELECT count(*)::text FROM public.activation_logs WHERE event = 'ENTITLEMENT_SET'), '0'
) v ORDER BY n;
