-- ═══════════════════════════════════════════════════════════════════════════
-- PRECHECK_20261124090000_identity_accounts.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Read-only. Run each statement on its own, BEFORE applying
-- 20261124090000 … 20261124090700. Nothing here writes. The PRECHECK_ prefix keeps
-- a migration runner from picking this file up.
--
-- Values read on 2026-11-24 from project qfklkkzxemsbeniyugiz are noted beside each
-- check so a change since then is visible at once.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Nothing the migrations create may already exist. Expected: 0 rows. (2026-11-24: 0 rows)
SELECT 'relation' AS kind, c.relname AS name
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 WHERE c.relname IN ('accounts', 'account_roles', 'account_role_codes', 'account_link_conflicts',
                     'account_reach_settings', 'account_reach_history', 'v_identity_integrity_gaps')
UNION ALL
SELECT 'function', p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname IN ('verified_account_context', 'get_current_account_id', 'get_current_role',
                     'set_account_reach', 'get_account_reach', 'account_reach_policy',
                     'link_farmer_account', 'note_account_link_conflict',
                     'handle_farmer_account_created', 'handle_farmer_account_deleted',
                     'handle_farmer_account_mobile_changed', 'account_reach_history_append_only')
UNION ALL
SELECT 'trigger on farmers', t.tgname
  FROM pg_trigger t
 WHERE t.tgrelid = 'public.farmers'::regclass AND t.tgname LIKE 'on_farmer_account%'
UNION ALL
SELECT 'column', a.attrelid::regclass::text || '.' || a.attname
  FROM pg_attribute a
 WHERE a.attrelid IN ('public.user_sessions'::regclass, 'public.pin_reset_codes'::regclass)
   AND a.attname IN ('active_role', 'role_verified_at', 'account_id') AND NOT a.attisdropped
UNION ALL
SELECT 'system_config key', config_key
  FROM public.system_config WHERE config_key = 'account_reach_policy';

-- 2. Farmers the backfill cannot link. Expected: every count 0 except the first.
--    (2026-11-24: farmers 28, the rest 0)
SELECT 'farmers' AS check_name, count(*)::text AS actual FROM public.farmers
UNION ALL
SELECT 'farmers with a NULL tenant (get no account; reported, no tenant is invented)', count(*)::text
  FROM public.farmers WHERE tenant_id IS NULL
UNION ALL
SELECT 'farmers with a NULL mobile number (get no account)', count(*)::text
  FROM public.farmers WHERE mobile_number IS NULL
UNION ALL
SELECT 'tenant + mobile pairs held by more than one farmer', count(*)::text
  FROM (SELECT 1 FROM public.farmers WHERE tenant_id IS NOT NULL AND mobile_number IS NOT NULL
         GROUP BY tenant_id, mobile_number HAVING count(*) > 1) d
UNION ALL
SELECT 'farmers whose mobile number is not 10 digits', count(*)::text
  FROM public.farmers WHERE mobile_number IS NOT NULL AND mobile_number::text !~ '^[0-9]{10}$'
UNION ALL
SELECT 'farmers whose tenant row does not exist', count(*)::text
  FROM public.farmers f WHERE f.tenant_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = f.tenant_id);

-- 3. Sessions that would be orphans after the backfill (their user_id is not a farmer).
--    Expected: 0. (2026-11-24: 2 sessions, 0 orphans)
SELECT 'sessions' AS check_name, count(*)::text AS actual FROM public.user_sessions
UNION ALL
SELECT 'sessions whose user_id is not a farmers.id', count(*)::text
  FROM public.user_sessions s
 WHERE NOT EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = s.user_id);

-- 4. Rollback copy: the definition of verified_session_context() as it is right now.
--    Keep the output. It must equal statement 1 of the ROLLBACK file.
SELECT pg_get_functiondef(p.oid) AS verified_session_context_now
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname = 'verified_session_context';

-- 5. Triggers on farmers right now. Expected: the six below and nothing named on_farmer_account_*.
--    on_farmer_created, on_farmer_deleted, on_farmer_subscription_autoenroll, on_farmer_updated,
--    set_farmer_tenant_id_trigger, update_farmers_updated_at
SELECT t.tgname, pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t
 WHERE t.tgrelid = 'public.farmers'::regclass AND NOT t.tgisinternal
 ORDER BY t.tgname;

-- 6. Shapes the migrations rely on.
--    (2026-11-24: farmer_id is NOT NULL, 0 reset rows, 449771 active villages with a centre,
--     update_updated_at() and hash_session_token(text) exist)
SELECT 'pin_reset_codes.farmer_id NOT NULL' AS check_name, a.attnotnull::text AS actual
  FROM pg_attribute a WHERE a.attrelid = 'public.pin_reset_codes'::regclass AND a.attname = 'farmer_id'
UNION ALL
SELECT 'pin_reset_codes rows', count(*)::text FROM public.pin_reset_codes
UNION ALL
SELECT 'active villages with a centre point', count(*)::text
  FROM public.villages WHERE is_active AND center_lat IS NOT NULL AND center_lon IS NOT NULL
UNION ALL
SELECT 'update_updated_at() exists', count(*)::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname = 'update_updated_at' AND p.pronargs = 0
UNION ALL
SELECT 'hash_session_token(text) exists', count(*)::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname = 'hash_session_token' AND p.pronargs = 1;
