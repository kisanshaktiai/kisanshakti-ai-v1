-- ============================================================================
-- Validation for 20261125230000_farmer_activation_app_gate.sql (read-only)
-- ============================================================================
-- Run after the migration. Each row shows what was found next to what is
-- expected. This file is NOT a migration: it changes nothing.
-- ============================================================================
SELECT * FROM (
  SELECT 1 AS n, 'farmer session context carries the activation gate' AS check_name,
         (SELECT (prosrc LIKE '%f.activation_pending IS NOT TRUE OR NOT activation.is_enforced()%')::text FROM pg_proc WHERE oid = 'public.verified_session_context()'::regprocedure) AS actual, 'true' AS expected
  UNION ALL SELECT 2, 'account session context carries the activation gate (FARMER role only)',
         (SELECT (prosrc LIKE '%f.activation_pending IS NOT TRUE OR NOT activation.is_enforced()%' AND prosrc LIKE '%r.role <> ''FARMER''%')::text FROM pg_proc WHERE oid = 'public.verified_account_context()'::regprocedure), 'true'
  UNION ALL SELECT 3, 'farmers guard turns app self-registration into an unactivated farmer',
         (SELECT (prosrc LIKE '%NEW.activation_pending := true%')::text FROM pg_proc WHERE oid = 'activation.farmers_guard()'::regprocedure), 'true'
  UNION ALL SELECT 4, 'all three are still SECURITY DEFINER and owned by postgres',
         (SELECT count(*)::text FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
           WHERE p.oid IN ('public.verified_session_context()'::regprocedure, 'public.verified_account_context()'::regprocedure, 'activation.farmers_guard()'::regprocedure)
             AND p.prosecdef AND r.rolname = 'postgres'), '3'
  UNION ALL SELECT 5, 'the app can still call both context functions (anon, authenticated)',
         (SELECT (has_function_privilege('anon', 'public.verified_session_context()', 'EXECUTE')
              AND has_function_privilege('authenticated', 'public.verified_session_context()', 'EXECUTE')
              AND has_function_privilege('anon', 'public.verified_account_context()', 'EXECUTE')
              AND has_function_privilege('authenticated', 'public.verified_account_context()', 'EXECUTE'))::text), 'true'
  UNION ALL SELECT 6, 'the internal guard is closed to the API roles',
         (SELECT (has_function_privilege('anon', 'activation.farmers_guard()', 'EXECUTE')
               OR has_function_privilege('authenticated', 'activation.farmers_guard()', 'EXECUTE')
               OR has_function_privilege('service_role', 'activation.farmers_guard()', 'EXECUTE'))::text), 'false'
  UNION ALL SELECT 7, 'both farmers guard triggers are still installed and enabled',
         (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.farmers'::regclass AND tgname IN ('zz_activation_farmers_guard_ins', 'zz_activation_farmers_guard_upd') AND tgenabled = 'O'), '2'
  UNION ALL SELECT 8, 'no farmer was made pending by the migration (count of pending farmers; 0 on 2026-11-25)',
         (SELECT count(*)::text FROM public.farmers WHERE activation_pending), '0'
  UNION ALL SELECT 9, 'farmers the gate does not touch (not pending) = all farmers',
         (SELECT (count(*) FILTER (WHERE NOT activation_pending) = count(*))::text FROM public.farmers), 'true'
) v ORDER BY n;
