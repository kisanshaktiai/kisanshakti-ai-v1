-- ============================================================================
-- Validation for 20261124160000_farmer_activation_core.sql  (read-only)
-- ============================================================================
-- Run after the migration. Every row shows what was found next to what is
-- expected; any row where the two differ means stop and look.
-- This file is NOT a migration: it changes nothing.
-- ============================================================================
SELECT * FROM (
  SELECT 1 AS n, 'feature flag exists and is OFF' AS check_name,
         COALESCE((SELECT is_enabled::text FROM public.feature_flags WHERE flag_name = 'farmer_activation_required'), 'missing') AS actual,
         'false' AS expected
  UNION ALL SELECT 2, 'enforcement is off for the database',
         (SELECT (public.activation_enforcement_status()->>'enforced')), 'false'
  UNION ALL SELECT 3, 'holding tenant is the default tenant',
         (SELECT (public.activation_enforcement_status()->>'holding_tenant_id') = (SELECT id::text FROM public.tenants WHERE is_default IS TRUE))::text, 'true'
  UNION ALL SELECT 4, 'both secrets exist in Vault (64 hex characters each)',
         (SELECT count(*)::text FROM vault.decrypted_secrets WHERE name IN ('activation_code_pepper', 'activation_code_enc_key') AND decrypted_secret ~ '^[0-9a-f]{64}$'), '2'
  UNION ALL SELECT 5, 'no existing farmer became pending',
         (SELECT count(*)::text FROM public.farmers WHERE activation_pending), '0'
  UNION ALL SELECT 6, 'no existing farmer was touched (activated_at / activation_code_id empty)',
         (SELECT count(*)::text FROM public.farmers WHERE activated_at IS NOT NULL OR activation_code_id IS NOT NULL), '0'
  UNION ALL SELECT 7, 'farmers guards installed',
         (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.farmers'::regclass AND tgname LIKE 'zz_activation%' AND tgenabled = 'O'), '2'
  UNION ALL SELECT 8, 'guards on codes, batches and audit trail installed',
         (SELECT count(*)::text FROM pg_trigger WHERE tgrelid IN ('public.activation_codes'::regclass, 'public.activation_code_batches'::regclass, 'public.activation_logs'::regclass) AND tgname LIKE 'activation%' AND tgenabled = 'O'), '8'
  UNION ALL SELECT 9, 'entry points present',
         (SELECT count(*)::text FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'activation\_%'), '8'
  UNION ALL SELECT 10, 'anon can execute none of them',
         (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'activation\_%' AND has_function_privilege('anon', p.oid, 'EXECUTE')), '0'
  UNION ALL SELECT 11, 'signed-in users cannot execute redeem / status / expiry',
         (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('activation_redeem', 'activation_enforcement_status', 'activation_expire_due') AND has_function_privilege('authenticated', p.oid, 'EXECUTE')), '0'
  UNION ALL SELECT 12, 'service role can execute redeem / status / expiry',
         (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('activation_redeem', 'activation_enforcement_status', 'activation_expire_due') AND has_function_privilege('service_role', p.oid, 'EXECUTE')), '3'
  UNION ALL SELECT 13, 'API roles cannot use the internal schema',
         (SELECT count(*)::text FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r WHERE has_schema_privilege(r, 'activation', 'USAGE')), '0'
  UNION ALL SELECT 14, 'signed-in users cannot read the hash or the encrypted copy',
         (SELECT (has_column_privilege('authenticated', 'public.activation_codes', 'code_hash', 'SELECT')
               OR has_column_privilege('authenticated', 'public.activation_codes', 'code_ciphertext', 'SELECT')
               OR has_column_privilege('authenticated', 'public.activation_codes', 'code', 'SELECT'))::text), 'false'
  UNION ALL SELECT 15, 'signed-in users and anon cannot write codes, batches or audit rows',
         (SELECT count(*)::text FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['public.activation_codes', 'public.activation_code_batches', 'public.activation_logs']) t, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p WHERE has_table_privilege(r, t, p)), '0'
  UNION ALL SELECT 16, 'anon can read none of the three tables',
         (SELECT count(*)::text FROM unnest(ARRAY['public.activation_codes', 'public.activation_code_batches', 'public.activation_logs']) t WHERE has_table_privilege('anon', t, 'SELECT')), '0'
  UNION ALL SELECT 17, 'row security is on for the three tables',
         (SELECT count(*)::text FROM pg_class WHERE oid IN ('public.activation_codes'::regclass, 'public.activation_code_batches'::regclass, 'public.activation_logs'::regclass) AND relrowsecurity), '3'
  UNION ALL SELECT 18, 'one mobile number = one farmer index is in place',
         (SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'farmers_mobile_global_unique'), '1'
  UNION ALL SELECT 19, 'hourly expiry job is scheduled',
         (SELECT count(*)::text FROM cron.job WHERE jobname = 'activation-codes-expire-hourly'), '1'
  UNION ALL SELECT 20, 'no code, batch or audit row was created by the migration',
         (SELECT ((SELECT count(*) FROM public.activation_codes) + (SELECT count(*) FROM public.activation_code_batches) + (SELECT count(*) FROM public.activation_logs))::text), '0'
) v ORDER BY n;

-- Go-live readiness (information, not pass/fail): the flag must stay OFF while
-- any tenant that should activate farmers shows subscription_ok = false.
SELECT t.slug, t.status::text AS tenant_status, t.max_farmers AS seat_limit,
       (SELECT count(*) FROM public.farmers f WHERE f.tenant_id = t.id AND NOT f.activation_pending AND COALESCE(f.archived, false) = false) AS seats_used,
       COALESCE((SELECT s.status FROM public.tenant_subscriptions s WHERE s.tenant_id = t.id ORDER BY s.created_at DESC NULLS LAST LIMIT 1), 'no subscription row') AS subscription,
       COALESCE((SELECT s.status IN ('active', 'trial', 'trialing') AND (s.current_period_end IS NULL OR s.current_period_end > now())
                   FROM public.tenant_subscriptions s WHERE s.tenant_id = t.id ORDER BY s.created_at DESC NULLS LAST LIMIT 1), false) AS subscription_ok
  FROM public.tenants t
 ORDER BY t.is_default DESC NULLS LAST, t.slug;
