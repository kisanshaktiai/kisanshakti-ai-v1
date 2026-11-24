-- ═══════════════════════════════════════════════════════════════════════════
-- tests/identity/breaker/breaker_sql.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Independent attack script for the multi-role identity migrations, database layer.
-- Built and run by run_breaker.sh on a throw-away local replica (bootstrap + M1 +
-- cutover + the M2 account functions). Never run against a Supabase project.
--
-- Every line:  PASS | id | what was tried | evidence     (attack failed, invariant held)
--              BROKEN | id | what was tried | evidence   (attack succeeded)
--              INFO | …                                  (observation, no verdict)
-- All people are fake; mobiles are in the unassigned 00000xxxxx range.
-- ═══════════════════════════════════════════════════════════════════════════
\set QUIET on
\pset format unaligned
\pset tuples_only on

-- atk(role, headers, sql [, uid]): run sql as that DB role with those request headers
-- (exactly what PostgREST sets) and return its single value or ERR <sqlstate> <message>.
CREATE OR REPLACE FUNCTION public.atk(p_role text, p_headers jsonb, p_sql text, p_uid text DEFAULT '') RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.headers', coalesce(p_headers, '{}'::jsonb)::text, true);
  PERFORM set_config('test.uid', p_uid, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERR ' || SQLSTATE || ' ' || left(SQLERRM, 160);
  END;
  EXECUTE 'RESET ROLE';
  RETURN coalesce(v, '(null)');
END $$;
-- atk_n: same for a statement; returns OK rows=N or ERR …
CREATE OR REPLACE FUNCTION public.atk_n(p_role text, p_headers jsonb, p_sql text, p_uid text DEFAULT '') RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; n bigint;
BEGIN
  PERFORM set_config('request.headers', coalesce(p_headers, '{}'::jsonb)::text, true);
  PERFORM set_config('test.uid', p_uid, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql; GET DIAGNOSTICS n = ROW_COUNT; v := 'OK rows=' || n;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERR ' || SQLSTATE || ' ' || left(SQLERRM, 160);
  END;
  EXECUTE 'RESET ROLE';
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION public.verdict(p_id text, p_what text, p_held boolean, p_evidence text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_held IS TRUE THEN 'PASS' ELSE 'BROKEN' END || ' | ' || p_id || ' | ' || p_what || ' | ' || coalesce(p_evidence, '(null)') $$;
CREATE OR REPLACE FUNCTION public.tok(p text) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('x-session-token', p) $$;

-- ── fixtures ────────────────────────────────────────────────────────────────
-- tenant A = 1111…, tenant B = 2222…; farmers A1 (tok-a1), B1 (tok-b1) come from the bootstrap.
INSERT INTO accounts (id, tenant_id, mobile_number, display_name, pin_hash) VALUES
  ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000009001', 'Fake Provider A',  repeat('91', 32)),
  ('9a000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '0000009001', 'Fake Provider B',  repeat('93', 32)),
  ('9c000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000009002', 'Fake Customer A',  repeat('92', 32)),
  ('9a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '0000009003', 'Fake Provider A3', repeat('94', 32)),
  ('9a000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '0000009004', 'Fake Provider A4', repeat('95', 32)),
  ('9a000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '0000009005', 'Fake Provider A5', repeat('96', 32));
INSERT INTO account_roles (account_id, tenant_id, role, status, source) VALUES
  ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('9a000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('9a000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'CUSTOMER',         'ACTIVE', 'TEST_FIXTURE'),
  ('9c000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CUSTOMER',         'ACTIVE', 'TEST_FIXTURE'),
  ('9a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('9a000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('9a000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CUSTOMER',         'ACTIVE', 'TEST_FIXTURE');
INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active, active_role, role_verified_at) VALUES
  ('9a000000-0000-0000-0000-000000000001', 'bk-p1',  hash_session_token('tok-p1'),  now() + interval '7 days', true, 'SERVICE_PROVIDER', now()),
  ('9a000000-0000-0000-0000-000000000002', 'bk-p2',  hash_session_token('tok-p2'),  now() + interval '7 days', true, 'SERVICE_PROVIDER', now()),
  ('9c000000-0000-0000-0000-000000000001', 'bk-c1',  hash_session_token('tok-c1'),  now() + interval '7 days', true, 'CUSTOMER',         now()),
  ('9a000000-0000-0000-0000-000000000003', 'bk-p3',  hash_session_token('tok-p3'),  now() + interval '7 days', true, 'SERVICE_PROVIDER', now()),
  ('9a000000-0000-0000-0000-000000000004', 'bk-p4',  hash_session_token('tok-p4'),  now() + interval '7 days', true, 'SERVICE_PROVIDER', now()),
  ('9a000000-0000-0000-0000-000000000005', 'bk-p5',  hash_session_token('tok-p5'),  now() + interval '7 days', true, 'SERVICE_PROVIDER', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bk-a1p', hash_session_token('tok-a1p'), now() + interval '7 days', true, 'SERVICE_PROVIDER', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bk-a1c', hash_session_token('tok-a1c'), now() + interval '7 days', true, 'CUSTOMER',         now()),
  -- forged / stale role values written straight into the session row
  ('9a000000-0000-0000-0000-000000000001', 'bk-p1f', hash_session_token('tok-p1-as-farmer'), now() + interval '7 days', true, 'FARMER', now()),
  ('9a000000-0000-0000-0000-000000000001', 'bk-p1n', hash_session_token('tok-p1-null-role'), now() + interval '7 days', true, NULL,     now()),
  ('9a000000-0000-0000-0000-000000000001', 'bk-p1c', hash_session_token('tok-p1-as-customer'), now() + interval '7 days', true, 'CUSTOMER', now());

\echo '=== A. authority is server side ==='
SELECT verdict('A01', 'anon, no headers at all: account context', v = '0', 'rows=' || v)
  FROM (SELECT atk('anon', '{}', $$SELECT count(*)::text FROM verified_account_context()$$) v) x;
SELECT verdict('A02', 'provider token + forged x-farmer-id of farmer A1: farmer context', v = '(null)', 'get_current_farmer_id=' || v)
  FROM (SELECT atk('anon', tok('tok-p1') || '{"x-farmer-id":"aaaaaaaa-0000-0000-0000-000000000001","x-tenant-id":"11111111-1111-1111-1111-111111111111"}', $$SELECT get_current_farmer_id()::text$$) v) x;
SELECT verdict('A03', 'no token, only forged x-farmer-id / x-tenant-id of farmer A1', v = '(null)', 'get_current_farmer_id=' || v)
  FROM (SELECT atk('anon', '{"x-farmer-id":"aaaaaaaa-0000-0000-0000-000000000001","x-tenant-id":"11111111-1111-1111-1111-111111111111"}', $$SELECT get_current_farmer_id()::text$$) v) x;
SELECT verdict('A04', 'farmer A1 token + forged x-tenant-id of tenant B: tenant context stays A', v = '11111111-1111-1111-1111-111111111111', 'get_current_tenant_id=' || v)
  FROM (SELECT atk('anon', tok('tok-a1') || '{"x-tenant-id":"22222222-2222-2222-2222-222222222222"}', $$SELECT get_current_tenant_id()::text$$) v) x;
SELECT verdict('A05', 'provider token + forged x-tenant-id of tenant B: account context tenant stays A', v = '11111111-1111-1111-1111-111111111111', 'tenant=' || v)
  FROM (SELECT atk('anon', tok('tok-p1') || '{"x-tenant-id":"22222222-2222-2222-2222-222222222222"}', $$SELECT tenant_id::text FROM verified_account_context()$$) v) x;
SELECT verdict('A06', 'session row forged to active_role FARMER for a provider-only account', v = '(null)/(null)', v)
  FROM (SELECT atk('anon', tok('tok-p1-as-farmer'), $$SELECT get_current_farmer_id()::text$$) || '/' || atk('anon', tok('tok-p1-as-farmer'), $$SELECT get_current_account_id()::text$$) v) x;
SELECT verdict('A07', 'session row with NULL active_role (legacy = FARMER) for a provider-only account', v = '(null)/(null)', v)
  FROM (SELECT atk('anon', tok('tok-p1-null-role'), $$SELECT get_current_farmer_id()::text$$) || '/' || atk('anon', tok('tok-p1-null-role'), $$SELECT get_current_account_id()::text$$) v) x;
SELECT verdict('A08', 'session row forged to CUSTOMER, a role the account does not hold', v = '(null)', 'role=' || v)
  FROM (SELECT atk('anon', tok('tok-p1-as-customer'), $$SELECT get_current_role()$$) v) x;
SELECT verdict('A09', 'anon rewrites its own session row to active_role FARMER', v LIKE 'ERR 42501%' OR v = 'OK rows=0', v)
  FROM (SELECT atk_n('anon', tok('tok-p1'), $$UPDATE user_sessions SET active_role = 'FARMER' WHERE session_id = 'bk-p1'$$) v) x;
SELECT verdict('A10', 'authenticated (no auth.uid) rewrites a session row to active_role FARMER', v LIKE 'ERR %' OR v = 'OK rows=0', v)
  FROM (SELECT atk_n('authenticated', tok('tok-p1'), $$UPDATE user_sessions SET active_role = 'FARMER' WHERE session_id = 'bk-p1'$$) v) x;
SELECT verdict('A11', 'signed-in portal user (auth.uid = other person) inserts a session row for farmer A1', v LIKE 'ERR %', v)
  FROM (SELECT atk_n('authenticated', '{}', $$INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, active_role) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bk-forged', hash_session_token('tok-forged'), now() + interval '1 day', 'FARMER')$$, '5a5a5a5a-0000-0000-0000-000000000001') v) x;
SELECT verdict('A12', 'signed-in portal user reads other people''s session rows', v = '0' OR v LIKE 'ERR %', 'rows=' || v)
  FROM (SELECT atk('authenticated', '{}', $$SELECT count(*)::text FROM user_sessions$$, '5a5a5a5a-0000-0000-0000-000000000001') v) x;
-- mid-session changes
BEGIN;
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT verdict('A13', 'role SUSPENDED mid-session: next request', v = '(null)', 'account=' || v)
  FROM (SELECT atk('anon', tok('tok-p1'), $$SELECT get_current_account_id()::text$$) v) x;
UPDATE account_roles SET status = 'REVOKED' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT verdict('A14', 'role REVOKED mid-session: next request', v = '(null)', 'account=' || v)
  FROM (SELECT atk('anon', tok('tok-p1'), $$SELECT get_current_account_id()::text$$) v) x;
UPDATE account_roles SET status = 'PENDING' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT verdict('A15', 'role PENDING: next request', v = '(null)', 'account=' || v)
  FROM (SELECT atk('anon', tok('tok-p1'), $$SELECT get_current_account_id()::text$$) v) x;
ROLLBACK;
BEGIN;
UPDATE accounts SET status = 'SUSPENDED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT verdict('A16', 'account SUSPENDED mid-session: farmer context and account context of all three of its sessions', v = '(null)/(null)/(null)', v)
  FROM (SELECT atk('anon', tok('tok-a1'), $$SELECT get_current_farmer_id()::text$$) || '/' || atk('anon', tok('tok-a1p'), $$SELECT get_current_account_id()::text$$) || '/' || atk('anon', tok('tok-a1c'), $$SELECT get_current_account_id()::text$$) v) x;
UPDATE accounts SET status = 'CLOSED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT verdict('A17', 'account CLOSED mid-session', v = '(null)/(null)', v)
  FROM (SELECT atk('anon', tok('tok-a1'), $$SELECT get_current_farmer_id()::text$$) || '/' || atk('anon', tok('tok-a1p'), $$SELECT get_current_account_id()::text$$) v) x;
ROLLBACK;
BEGIN;
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER';
SELECT verdict('A18', 'FARMER role SUSPENDED mid-session: farmer context gone, provider workspace of the same person still open', v = '(null)/aaaaaaaa-0000-0000-0000-000000000001', v)
  FROM (SELECT atk('anon', tok('tok-a1'), $$SELECT get_current_farmer_id()::text$$) || '/' || atk('anon', tok('tok-a1p'), $$SELECT get_current_account_id()::text$$) v) x;
ROLLBACK;

\echo '=== B. farmer data closed to non-farmers; account data closed to everyone ==='
SELECT verdict('B01', 'farmer A1 who switched to the Provider workspace: farmer context', v = '(null)/(null)', v)
  FROM (SELECT atk('anon', tok('tok-a1p'), $$SELECT get_current_farmer_id()::text$$) || '/' || atk('anon', tok('tok-a1c'), $$SELECT farmer_id::text FROM verified_session_context()$$) v) x;
-- every table / view of schema public, as anon and as authenticated, with each non-farmer token and with none
CREATE TEMP TABLE bk_scan AS
SELECT c.relname, r.rolname, t.label,
       atk(r.rolname, t.hdr, format('SELECT count(*)::text FROM public.%I', c.relname)) AS res
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
 CROSS JOIN (VALUES ('no token', '{}'::jsonb), ('provider', tok('tok-p1')), ('customer', tok('tok-c1')),
                    ('farmer-in-provider-workspace', tok('tok-a1p')),
                    ('provider+forged x-farmer-id', tok('tok-p1') || '{"x-farmer-id":"aaaaaaaa-0000-0000-0000-000000000001","x-tenant-id":"11111111-1111-1111-1111-111111111111"}'::jsonb)) t(label, hdr)
 WHERE c.relkind IN ('r', 'v', 'p', 'm') AND c.relname NOT LIKE 'bk_%';
GRANT SELECT ON bk_scan TO PUBLIC;
SELECT 'INFO | B02 | relations in public that return rows to a non-farmer caller (everything else: 0 rows or permission denied) | '
       || coalesce(string_agg(DISTINCT relname || '=' || res, ', '), '(none)')
  FROM bk_scan WHERE res NOT LIKE 'ERR %' AND res <> '0';
SELECT verdict('B03', 'any relation holding farmer / account / session / credential data returns a row to a non-farmer caller',
               count(*) = 0, coalesce(string_agg(DISTINCT relname || ' as ' || rolname || ' with ' || label || ' -> ' || res, '; '), 'none of ' ||
               (SELECT count(DISTINCT relname) FROM bk_scan) || ' relations x 2 roles x 5 header sets'))
  FROM bk_scan
 WHERE res NOT LIKE 'ERR %' AND res <> '0'
   AND relname IN ('farmers', 'user_profiles', 'farmer_subscriptions', 'user_sessions', 'pin_reset_codes', 'accounts', 'account_roles',
                   'account_reach_settings', 'account_reach_history', 'account_link_conflicts', 'v_identity_integrity_gaps', 'user_tenants');
-- every function of schema public that anon or authenticated may execute
SELECT 'INFO | B04 | functions in public executable by anon/authenticated (secdef marked *) | '
       || string_agg(p.proname || CASE WHEN p.prosecdef THEN '*' ELSE '' END || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' ORDER BY p.proname)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.prokind = 'f' AND p.proname NOT IN ('atk', 'atk_n', 'verdict', 'tok') AND p.proname NOT LIKE 'uuid_%'
   AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
SELECT verdict('B05', 'identity functions that write or link accounts are executable by anon or authenticated',
               count(*) = 0, coalesce(string_agg(p.proname, ', '), 'none'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname IN ('account_register_self', 'account_add_role_self', 'account_switch_session_role', 'link_farmer_account',
                     'note_account_link_conflict', 'handle_farmer_account_created', 'handle_farmer_account_deleted',
                     'handle_farmer_account_mobile_changed', 'account_reach_policy', 'account_reach_history_append_only')
   AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
SELECT verdict('B06', 'provider calls the three context functions hoping for somebody else: they only ever describe the caller',
               v = '9a000000-0000-0000-0000-000000000001|SERVICE_PROVIDER|(null)|(null)', v)
  FROM (SELECT atk('anon', tok('tok-p1'), $$SELECT get_current_account_id()::text$$) || '|' || atk('anon', tok('tok-p1'), $$SELECT get_current_role()$$) || '|' ||
               atk('anon', tok('tok-p1'), $$SELECT get_current_farmer_id()::text$$) || '|' || atk('anon', tok('tok-p1'), $$SELECT get_current_tenant_id()::text$$) v) x;
SELECT verdict('B07', 'provider (authenticated role, own token) writes a farmer row / deletes one / truncates', v ~ '^(ERR [0-9A-Z]+ [^|]*\|){2}ERR', v)
  FROM (SELECT atk_n('authenticated', tok('tok-p1'), $$UPDATE farmers SET farmer_name = 'x' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001' RETURNING 1/0$$) || '|' ||
               atk_n('anon', tok('tok-p1'), $$DELETE FROM farmers WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) || '|' ||
               atk_n('anon', tok('tok-p1'), $$TRUNCATE accounts CASCADE$$) v) x;
SELECT verdict('B08', 'authenticated provider UPDATE of a farmer row (plain statement)', v = 'OK rows=0' OR v LIKE 'ERR %', v)
  FROM (SELECT atk_n('authenticated', tok('tok-p1'), $$UPDATE farmers SET farmer_name = 'x' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) v) x;

\echo '=== D. self-service covers only the three roles; no self-granted status ==='
SELECT verdict('D01', t.what, v LIKE 'ERR 42501%', v)
  FROM (VALUES
   ('anon+token INSERT account_roles (own account, CUSTOMER ACTIVE)', 'anon', $$INSERT INTO account_roles (account_id, tenant_id, role, status, source) VALUES ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CUSTOMER', 'ACTIVE', 'SELF')$$),
   ('authenticated+token INSERT account_roles', 'authenticated', $$INSERT INTO account_roles (account_id, tenant_id, role, status, source) VALUES ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CUSTOMER', 'ACTIVE', 'SELF')$$),
   ('anon+token UPDATE accounts.mobile_verified_at', 'anon', $$UPDATE accounts SET mobile_verified_at = now() WHERE id = '9a000000-0000-0000-0000-000000000001'$$),
   ('authenticated+token UPDATE accounts.mobile_verified_at / status / pin_hash', 'authenticated', $$UPDATE accounts SET mobile_verified_at = now(), status = 'ACTIVE', pin_hash = repeat('00', 32) WHERE id = '9a000000-0000-0000-0000-000000000001'$$),
   ('anon+token UPDATE account_roles.status', 'anon', $$UPDATE account_roles SET status = 'ACTIVE'$$),
   ('authenticated+token DELETE account_roles', 'authenticated', $$DELETE FROM account_roles$$),
   ('anon+token INSERT accounts', 'anon', $$INSERT INTO accounts (tenant_id, mobile_number) VALUES ('11111111-1111-1111-1111-111111111111', '0000009999')$$),
   ('anon+token INSERT account_role_codes (ADMIN)', 'anon', $$INSERT INTO account_role_codes (code, label_en) VALUES ('ADMIN', 'Admin')$$),
   ('anon+token SELECT accounts.pin_hash', 'anon', $$SELECT pin_hash FROM accounts LIMIT 1$$),
   ('authenticated+token SELECT account_roles', 'authenticated', $$SELECT count(*) FROM account_roles$$),
   ('anon+token rpc account_add_role_self', 'anon', $$SELECT account_add_role_self('9a000000-0000-0000-0000-000000000001', 'CUSTOMER')$$),
   ('authenticated+token rpc account_add_role_self', 'authenticated', $$SELECT account_add_role_self('9a000000-0000-0000-0000-000000000001', 'CUSTOMER')$$),
   ('anon rpc account_register_self', 'anon', $$SELECT account_register_self('11111111-1111-1111-1111-111111111111', '0000009998', repeat('ab', 32), ARRAY['CUSTOMER'], 'hi', 'x')$$),
   ('authenticated rpc account_register_self', 'authenticated', $$SELECT account_register_self('11111111-1111-1111-1111-111111111111', '0000009998', repeat('ab', 32), ARRAY['CUSTOMER'], 'hi', 'x')$$),
   ('anon+token rpc account_switch_session_role (own token hash)', 'anon', $$SELECT account_switch_session_role(hash_session_token('tok-p1'), 'FARMER')$$),
   ('authenticated+token rpc account_switch_session_role', 'authenticated', $$SELECT account_switch_session_role(hash_session_token('tok-p1'), 'CUSTOMER')$$),
   ('anon rpc link_farmer_account (make an account for any id)', 'anon', $$SELECT link_farmer_account(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0000009997', 'X')$$),
   ('authenticated rpc link_farmer_account', 'authenticated', $$SELECT link_farmer_account('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000009001', 'X')$$),
   ('anon SELECT v_identity_integrity_gaps', 'anon', $$SELECT count(*) FROM v_identity_integrity_gaps$$),
   ('authenticated SELECT account_link_conflicts', 'authenticated', $$SELECT count(*) FROM account_link_conflicts$$)
  ) t(what, rol, q), LATERAL (SELECT atk_n(t.rol, tok('tok-p1'), t.q) v) x;
-- the service-role functions themselves (what the auth core can be made to do)
SELECT verdict('D02', 'account_register_self with roles ' || t.r, v LIKE 'ERR % ACCOUNT_ROLE_INVALID', v)
  FROM (VALUES ('{FARMER}'), ('{ADMIN}'), ('{SERVICE_PROVIDER,ADMIN}'), ('{CUSTOMER,CUSTOMER}'), ('{}'), ('{NULL}'), ('{customer}'), ('{SERVICE_PROVIDER,FARMER}'), ('{VERIFIED_PROVIDER}')) t(r),
       LATERAL (SELECT atk('service_role', '{}', format($$SELECT account_register_self('11111111-1111-1111-1111-111111111111', '0000009996', repeat('ab', 32), %L::text[], 'hi', 'x')::text$$, t.r)) v) x;
SELECT verdict('D03', 'account_add_role_self with role ' || coalesce(t.r, 'NULL'), v LIKE 'ERR % ACCOUNT_ROLE_INVALID', v)
  FROM (VALUES ('ADMIN'), ('TENANT_ADMIN'), ('farmer'), ('VERIFIED'), (''), (NULL)) t(r),
       LATERAL (SELECT atk('service_role', '{}', format($$SELECT account_add_role_self('9a000000-0000-0000-0000-000000000001', %L)$$, t.r)) v) x;
BEGIN;
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT verdict('D04', 'owner re-adds a SUSPENDED Service Provider role', v = 'SUSPENDED / SUSPENDED', v)
  FROM (SELECT atk('service_role', '{}', $$SELECT account_add_role_self('9a000000-0000-0000-0000-000000000001', 'SERVICE_PROVIDER')$$) || ' / ' ||
               (SELECT status FROM account_roles WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER') v) x;
SELECT verdict('D05', 'owner switches a live session into the SUSPENDED role', v LIKE 'ERR 42501 ROLE_NOT_HELD%', v)
  FROM (SELECT atk('service_role', '{}', $$SELECT account_switch_session_role(hash_session_token('tok-p1'), 'SERVICE_PROVIDER')$$) v) x;
UPDATE account_roles SET status = 'REVOKED' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT verdict('D06', 'owner re-adds a REVOKED Service Provider role', v = 'REVOKED / REVOKED', v)
  FROM (SELECT atk('service_role', '{}', $$SELECT account_add_role_self('9a000000-0000-0000-0000-000000000001', 'SERVICE_PROVIDER')$$) || ' / ' ||
               (SELECT status FROM account_roles WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER') v) x;
ROLLBACK;
BEGIN;
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER';
SELECT verdict('D07', 'owner re-adds a SUSPENDED Farmer role (farmers row still there)', v = 'SUSPENDED / SUSPENDED', v)
  FROM (SELECT atk('service_role', '{}', $$SELECT account_add_role_self('aaaaaaaa-0000-0000-0000-000000000001', 'FARMER')$$) || ' / ' ||
               (SELECT status FROM account_roles WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER') v) x;
SELECT verdict('D08', 'owner switches into the SUSPENDED Farmer role', v LIKE 'ERR 42501 ROLE_NOT_HELD%', v)
  FROM (SELECT atk('service_role', '{}', $$SELECT account_switch_session_role(hash_session_token('tok-a1p'), 'FARMER')$$) v) x;
ROLLBACK;
-- D09: Farmer role taken away by the tenant admin (farmers row deleted), person stays as provider, then re-adds FARMER by self-service.
BEGIN;
SELECT atk_n('authenticated', '{}', $$DELETE FROM farmers WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS del \gset
SELECT (SELECT status FROM account_roles WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER') AS before_status \gset
SELECT atk('service_role', '{}', $$SELECT account_add_role_self('aaaaaaaa-0000-0000-0000-000000000001', 'FARMER')$$) AS readd \gset
SELECT verdict('D09', 'tenant admin deletes the farmers row (FARMER role -> REVOKED); the person, still a provider, calls addRole FARMER',
               (SELECT status FROM account_roles WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER') = 'REVOKED',
               'admin delete: ' || :'del' || '; role before: ' || :'before_status' || '; account_add_role_self returned: ' || :'readd' || '; role now: ' ||
               (SELECT status || ' source=' || source FROM account_roles WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER') ||
               '; farmers row re-created: ' || (SELECT count(*) FROM farmers WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') ||
               '; farmer context for a session switched back to FARMER: ' ||
               atk('service_role', '{}', $$SELECT account_switch_session_role(hash_session_token('tok-a1p'), 'FARMER')$$) || ' -> ' ||
               atk('anon', tok('tok-a1p'), $$SELECT get_current_farmer_id()::text$$));
ROLLBACK;
-- D10: SUSPENDED Farmer role + admin deletes the farmers row + self re-add
BEGIN;
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER';
DELETE FROM farmers WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT (SELECT status FROM account_roles WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER') AS mid_status \gset
SELECT atk('service_role', '{}', $$SELECT account_add_role_self('aaaaaaaa-0000-0000-0000-000000000001', 'FARMER')$$) AS readd \gset
SELECT verdict('D10', 'Farmer role SUSPENDED, then the farmers row is deleted by the portal, then the person calls addRole FARMER',
               (SELECT status FROM account_roles WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER') <> 'ACTIVE',
               'SUSPENDED -> after delete: ' || :'mid_status' || ' -> account_add_role_self: ' || :'readd' || ' -> role now: ' ||
               (SELECT status FROM account_roles WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER'));
ROLLBACK;
-- D11: FARMER role REVOKED by an admin directly in account_roles (farmers row kept); any later mobile change re-activates it
BEGIN;
UPDATE account_roles SET status = 'REVOKED' WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000002' AND role = 'FARMER';
SELECT atk_n('authenticated', '{}', $$UPDATE farmers SET mobile_number = '0000002222' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS upd \gset
SELECT 'INFO | D11 | FARMER role REVOKED in account_roles (farmers row kept); the tenant portal later edits that farmer''s mobile number (not self-service: a side effect of link_farmer_account) | '
       || 'portal update: ' || :'upd' || '; role now: ' || (SELECT status || ' source=' || source FROM account_roles WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000002' AND role = 'FARMER');
ROLLBACK;

\echo '=== C. fail closed, never lock out a farmer ==='
SELECT atk_n('authenticated', '{}', $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-4000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000004001', repeat('41', 32), 'BK-A-4001')$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS ins \gset
SELECT verdict('C01', 'tenant admin inserts one farmer with its own id and a PIN', v = 'ACTIVE/ACTIVE', :'ins' || ' account/role=' || coalesce(v, '(none)'))
  FROM (SELECT (SELECT a.status || '/' || r.status FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' WHERE a.id = 'aaaaaaaa-4000-0000-0000-000000000001') v) x;
SELECT atk_n('authenticated', '{}', $$INSERT INTO farmers (id, tenant_id, farmer_code) VALUES ('aaaaaaaa-4000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'BK-A-4002')$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS ins \gset
SELECT verdict('C02', 'tenant admin inserts a farmer WITHOUT pin_hash (the live CHECK farmers_pin_hash_check then also forces mobile NULL): account in the same transaction (literal reading of C; such a farmer has no number to log in with, see C03)',
               (SELECT count(*) FROM accounts WHERE id = 'aaaaaaaa-4000-0000-0000-000000000002') = 1,
               :'ins' || '; accounts=' || (SELECT count(*) FROM accounts WHERE id = 'aaaaaaaa-4000-0000-0000-000000000002') || '; note=' ||
               (SELECT coalesce(string_agg(reason, ','), '(none)') FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-4000-0000-0000-000000000002' AND resolved_at IS NULL));
SELECT atk_n('authenticated', '{}', $$INSERT INTO farmers (id, tenant_id, mobile_number, farmer_code) VALUES ('aaaaaaaa-4000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '0000004003', 'BK-A-4003')$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS ins \gset
SELECT 'INFO | C02b | a farmer with a mobile but no pin_hash cannot be inserted at all on this schema, before or after the migrations (pre-existing CHECK) | ' || :'ins';
SELECT atk_n('authenticated', '{}', $$UPDATE farmers SET mobile_number = '0000004002', pin_hash = repeat('42', 32) WHERE id = 'aaaaaaaa-4000-0000-0000-000000000002'$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS upd \gset
SELECT verdict('C03', '… that farmer gets the account as soon as the portal fills mobile + PIN', v = 'ACTIVE/ACTIVE', :'upd' || ' account/role=' || coalesce(v, '(none)'))
  FROM (SELECT (SELECT a.status || '/' || r.status FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' WHERE a.id = 'aaaaaaaa-4000-0000-0000-000000000002') v) x;
SELECT atk_n('authenticated', '{}', $$INSERT INTO farmers (tenant_id, mobile_number, pin_hash, farmer_code) SELECT '11111111-1111-1111-1111-111111111111', '00000050' || lpad(g::text, 2, '0'), repeat('50', 32), 'BK-A-50' || lpad(g::text, 2, '0') FROM generate_series(1, 50) g$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS ins \gset
SELECT verdict('C04', '50-row batch insert by the tenant admin', v = '50', :'ins' || '; with ACTIVE account + ACTIVE FARMER role: ' || v)
  FROM (SELECT (SELECT count(*)::text FROM farmers f JOIN accounts a ON a.id = f.id AND a.status = 'ACTIVE' JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' AND r.status = 'ACTIVE' WHERE f.farmer_code LIKE 'BK-A-50%') v) x;
-- C05: the number is already held by a provider-only account of the same tenant (anyone can self-register one, see the edge script)
SELECT atk_n('authenticated', '{}', $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-4000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '0000009004', repeat('45', 32), 'BK-A-4005')$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS ins \gset
SELECT verdict('C05', 'tenant admin inserts a farmer whose number a provider-only account of the same tenant already holds: account + FARMER role in the same transaction',
               (SELECT count(*) FROM accounts WHERE id = 'aaaaaaaa-4000-0000-0000-000000000005') = 1,
               :'ins' || '; accounts with the farmer id=' || (SELECT count(*) FROM accounts WHERE id = 'aaaaaaaa-4000-0000-0000-000000000005') ||
               '; FARMER roles=' || (SELECT count(*) FROM account_roles WHERE account_id = 'aaaaaaaa-4000-0000-0000-000000000005') ||
               '; note=' || (SELECT coalesce(string_agg(reason, ','), '(none)') FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-4000-0000-0000-000000000005' AND resolved_at IS NULL) ||
               '; gap=' || (SELECT coalesce(string_agg(gap, ','), '(none)') FROM v_identity_integrity_gaps WHERE farmer_id = 'aaaaaaaa-4000-0000-0000-000000000005'));
SELECT verdict('C06', '… and that farmer can be given a session (what the auth core does right after a correct PIN)', v = 'OK rows=1', v)
  FROM (SELECT atk_n('service_role', '{}', $$INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, active_role) VALUES ('aaaaaaaa-4000-0000-0000-000000000005', 'bk-c05', hash_session_token('tok-c05'), now() + interval '7 days', 'FARMER')$$) v) x;
-- C07: farmer who also holds a provider role is deleted and re-created by the portal with a new id (its documented delete-and-recreate flow)
BEGIN;
SELECT atk_n('authenticated', '{}', $$DELETE FROM farmers WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS del \gset
SELECT atk_n('authenticated', '{}', $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-4000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '0000000001', repeat('47', 32), 'BK-A-4007')$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS ins \gset
SELECT verdict('C07', 'portal deletes a farmer who also holds Provider/Customer, then creates the same person again with a new id',
               (SELECT count(*) FROM accounts WHERE id = 'aaaaaaaa-4000-0000-0000-000000000007') = 1,
               'delete: ' || :'del' || '; insert: ' || :'ins' || '; account for the new farmer id=' || (SELECT count(*) FROM accounts WHERE id = 'aaaaaaaa-4000-0000-0000-000000000007') ||
               '; note=' || (SELECT coalesce(string_agg(reason, ','), '(none)') FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-4000-0000-0000-000000000007' AND resolved_at IS NULL) ||
               '; session for the new farmer: ' || atk_n('service_role', '{}', $$INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, active_role) VALUES ('aaaaaaaa-4000-0000-0000-000000000007', 'bk-c07', hash_session_token('tok-c07'), now() + interval '7 days', 'FARMER')$$) ||
               '; credentials now live for this number: farmers.pin_hash=' || (SELECT left(pin_hash, 4) FROM farmers WHERE id = 'aaaaaaaa-4000-0000-0000-000000000007') ||
               ' and accounts.pin_hash=' || (SELECT coalesce(left(pin_hash, 4), '(null)') FROM accounts WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'));
ROLLBACK;
SELECT atk_n('authenticated', '{}', $$UPDATE farmers SET notes = 'x', mobile_number = '0000004091' WHERE id = 'aaaaaaaa-4000-0000-0000-000000000001'$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS upd \gset
SELECT (SELECT mobile_number FROM accounts WHERE id = 'aaaaaaaa-4000-0000-0000-000000000001') AS acc_mobile \gset
SELECT atk_n('authenticated', '{}', $$DELETE FROM farmers WHERE id = 'aaaaaaaa-4000-0000-0000-000000000001'$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS del \gset
SELECT verdict('C08', 'tenant admin updates (incl. mobile) and deletes a farmer (plain farmer, no other role)', v = 'OK rows=1 / 0000004091 / OK rows=1 / CLOSED+REVOKED', v)
  FROM (SELECT :'upd' || ' / ' || :'acc_mobile' || ' / ' || :'del' || ' / ' ||
               (SELECT a.status || '+' || r.status FROM accounts a JOIN account_roles r ON r.account_id = a.id WHERE a.id = 'aaaaaaaa-4000-0000-0000-000000000001') v) x;
SELECT verdict('C09', 'tenant admin of tenant B touches a tenant-A farmer / its account side effects', v = 'OK rows=0 / OK rows=0', v)
  FROM (SELECT atk_n('authenticated', '{}', $$UPDATE farmers SET mobile_number = '0000004092' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'$$, '7a7a7a7a-0000-0000-0000-00000000000b') || ' / ' ||
               atk_n('authenticated', '{}', $$DELETE FROM farmers WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'$$, '7a7a7a7a-0000-0000-0000-00000000000b') v) x;

\echo '=== F. tenancy ==='
SELECT verdict('F01', 'membership row that names a tenant other than its account''s (superuser insert)', v LIKE 'ERR 23503%', v)
  FROM (SELECT atk_n('postgres', '{}', $$INSERT INTO account_roles (account_id, tenant_id, role, status, source) VALUES ('9a000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'CUSTOMER', 'ACTIVE', 'X_TENANT')$$) v) x;
SELECT verdict('F02', 'tenant-A provider session switched into CUSTOMER, a role only its same-mobile twin in tenant B holds', v LIKE 'ERR 42501 ROLE_NOT_HELD%', v)
  FROM (SELECT atk('service_role', '{}', $$SELECT account_switch_session_role(hash_session_token('tok-p1'), 'CUSTOMER')$$) v) x;
SELECT atk('anon', tok('tok-p1') || '{"x-tenant-id":"22222222-2222-2222-2222-222222222222"}', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 10) ->> 'is_set'$$) AS f3 \gset
SELECT verdict('F03', 'tenant-A provider sets Reach while sending x-tenant-id of tenant B; rows are then checked for its same-mobile twin in tenant B', v = 'true / 0 rows for twin / own tenant 11111111-1111-1111-1111-111111111111', v)
  FROM (SELECT :'f3' || ' / ' || (SELECT count(*) FROM account_reach_settings WHERE account_id = '9a000000-0000-0000-0000-000000000002') || ' rows for twin / own tenant ' ||
               (SELECT tenant_id::text FROM account_reach_settings WHERE account_id = '9a000000-0000-0000-0000-000000000001') v) x;
SELECT verdict('F04', 'tenant-B provider reads Reach hoping for the tenant-A twin''s village', v::jsonb ->> 'is_set' = 'false', left(v, 80))
  FROM (SELECT atk('anon', tok('tok-p2') || '{"x-tenant-id":"11111111-1111-1111-1111-111111111111","x-farmer-id":"9a000000-0000-0000-0000-000000000001"}', $$SELECT get_account_reach('SERVICE_PROVIDER')::text$$) v) x;
SELECT verdict('F05', 'account_register_self for a number that is a FARMER in the same tenant', v LIKE 'ERR % ACCOUNT_EXISTS', v)
  FROM (SELECT atk('service_role', '{}', $$SELECT account_register_self('11111111-1111-1111-1111-111111111111', '0000000002', repeat('ab', 32), ARRAY['CUSTOMER'], 'hi', 'x')::text$$) v) x;
BEGIN;
UPDATE farmers SET tenant_id = '22222222-2222-2222-2222-222222222222' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT 'INFO | F06 | a farmers row is moved to tenant B by a service-role / two-tenant-admin update (no attacker path): the account and memberships do NOT follow | '
       || 'farmer context tenant=' || atk('anon', tok('tok-a1'), $$SELECT tenant_id::text FROM verified_session_context()$$) ||
          '; account context tenant (same person, provider session)=' || atk('anon', tok('tok-a1p'), $$SELECT tenant_id::text FROM verified_account_context()$$) ||
          '; gap=' || (SELECT coalesce(string_agg(gap, ','), '(none)') FROM v_identity_integrity_gaps WHERE farmer_id = 'aaaaaaaa-0000-0000-0000-000000000001');
ROLLBACK;

\echo '=== H. Reach ==='
SELECT verdict('H01', 'radius ' || coalesce(t.r, 'NULL'), v ~ 'REACH_RADIUS_(OUT_OF_BOUNDS|OFF_STEP)|ERR 22', v)
  FROM (VALUES ('0'), ('4'), ('-5'), ('101'), ('105'), ('7'), ('12'), ('99'), ('2147483647'), ('-2147483648'), (NULL)) t(r),
       LATERAL (SELECT atk('anon', tok('tok-p3'), format($$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', %s)::text$$, coalesce(t.r, 'NULL'))) v) x;
SELECT verdict('H02', 'village: ' || t.what, v LIKE 'ERR % REACH_VILLAGE_INVALID', v)
  FROM (VALUES ('NULL', 'NULL'), ('unknown id', $$'71000000-0000-0000-0000-00000000ffff'$$), ('no centre point', $$'71000000-0000-0000-0000-0000000000a0'$$), ('inactive', $$'71000000-0000-0000-0000-0000000000b0'$$)) t(what, vid),
       LATERAL (SELECT atk('anon', tok('tok-p3'), format($$SELECT set_account_reach('SERVICE_PROVIDER', %s, 25)::text$$, t.vid)) v) x;
SELECT verdict('H03', t.what, v LIKE t.expect, v)
  FROM (VALUES
    ('FARMER role has no Reach (farmer session, set)',            'tok-a1',  $$SELECT set_account_reach('FARMER', '71000000-0000-0000-0000-000000000001', 25)::text$$, 'ERR % REACH_ROLE_INVALID'),
    ('FARMER role has no Reach (farmer session, get)',            'tok-a1',  $$SELECT get_account_reach('FARMER')::text$$,                                              'ERR % REACH_ROLE_INVALID'),
    ('farmer session sets the Provider Reach of the same person', 'tok-a1',  $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25)::text$$, 'ERR 42501 REACH_ROLE_NOT_ACTIVE'),
    ('provider session sets a Customer Reach it does not hold',   'tok-p3',  $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 25)::text$$, 'ERR 42501 REACH_ROLE_NOT_ACTIVE'),
    ('provider session reads the Customer Reach of the same account', 'tok-a1p', $$SELECT get_account_reach('CUSTOMER')::text$$,                                         'ERR 42501 REACH_ROLE_NOT_ACTIVE'),
    ('no token',                                                  NULL,      $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25)::text$$, 'ERR 42501 NOT_AUTHENTICATED'),
    ('forged-role session (CUSTOMER not held)',                   'tok-p1-as-customer', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 25)::text$$, 'ERR 42501 NOT_AUTHENTICATED'),
    ('role code ADMIN',                                           'tok-p3',  $$SELECT set_account_reach('ADMIN', '71000000-0000-0000-0000-000000000001', 25)::text$$,  'ERR % REACH_ROLE_INVALID')
  ) t(what, token, q, expect), LATERAL (SELECT atk('anon', CASE WHEN t.token IS NULL THEN '{}'::jsonb ELSE tok(t.token) END, t.q) v) x;
SELECT verdict('H04', t.what, v LIKE 'ERR 42501%', v)
  FROM (VALUES
    ('anon+token SELECT account_reach_settings',        'anon',          $$SELECT count(*) FROM account_reach_settings$$),
    ('authenticated+token SELECT account_reach_history', 'authenticated', $$SELECT count(*) FROM account_reach_history$$),
    ('anon+token INSERT account_reach_settings (radius 500)', 'anon',     $$INSERT INTO account_reach_settings (account_id, tenant_id, role, base_village_id, radius_km) VALUES ('9a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 500)$$),
    ('authenticated+token UPDATE another account''s Reach', 'authenticated', $$UPDATE account_reach_settings SET radius_km = 100$$),
    ('anon+token DELETE account_reach_history (reset the throttle)', 'anon', $$DELETE FROM account_reach_history$$),
    ('service_role DELETE account_reach_history (reset the throttle)', 'service_role', $$DELETE FROM account_reach_history$$),
    ('service_role UPDATE account_reach_history', 'service_role', $$UPDATE account_reach_history SET change_kind = 'INITIAL'$$),
    ('anon rpc account_reach_policy', 'anon', $$SELECT count(*) FROM account_reach_policy()$$)
  ) t(what, rol, q), LATERAL (SELECT atk_n(t.rol, tok('tok-p3'), t.q) v) x;
SELECT verdict('H05', 'anon+token rewrites the Reach policy row in system_config (limit 9999)', v = 'OK rows=0' OR v LIKE 'ERR %', v)
  FROM (SELECT atk_n('anon', tok('tok-p3'), $$UPDATE system_config SET config_value = jsonb_set(config_value, '{change_limit_count}', '9999') WHERE config_key = 'account_reach_policy'$$) v) x;
-- throttle, sequential: P3 sets once (INITIAL) then changes
SELECT atk('anon', tok('tok-p3'), $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 5) ->> 'is_set'$$) AS h_init \gset
SELECT string_agg(atk('anon', tok('tok-p3'), format($$SELECT 'accepted' FROM set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000002', %s)$$, 5 + 5 * g)), ' | ' ORDER BY g) AS h_seq FROM generate_series(1, 6) g \gset
SELECT verdict('H06', 'six changes in a row by one provider (limit 3 per 7 days)',
               (SELECT count(*) FROM account_reach_history WHERE account_id = '9a000000-0000-0000-0000-000000000003' AND change_kind = 'CHANGE') = 3,
               'initial is_set=' || :'h_init' || '; ' || :'h_seq');
SELECT verdict('H07', 're-sending the stored values, or flipping back and forth, to dodge the count once the limit is reached', v LIKE 'ERR % REACH_CHANGE_LIMIT_REACHED', v)
  FROM (SELECT atk('anon', tok('tok-p3'), $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 5)::text$$) v) x;
-- throttle is per account across both roles: A1 holds provider and customer
SELECT atk('anon', tok('tok-a1p'), $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 5) ->> 'is_set'$$) AS a1p_init,
       atk('anon', tok('tok-a1c'), $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 5) ->> 'is_set'$$) AS a1c_init \gset
SELECT string_agg(atk('anon', tok(CASE WHEN g % 2 = 0 THEN 'tok-a1p' ELSE 'tok-a1c' END),
         format($$SELECT 'accepted' FROM set_account_reach(%L, '71000000-0000-0000-0000-000000000003', %s)$$, CASE WHEN g % 2 = 0 THEN 'SERVICE_PROVIDER' ELSE 'CUSTOMER' END, 5 + 5 * g)), ' | ' ORDER BY g) AS h_two FROM generate_series(1, 8) g \gset
SELECT verdict('H08', 'one person alternates between the Provider and the Customer session to get 3 + 3 changes',
               (SELECT count(*) FROM account_reach_history WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND change_kind = 'CHANGE') = 3,
               'CHANGE rows=' || (SELECT count(*) FROM account_reach_history WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND change_kind = 'CHANGE') || '; ' || :'h_two');
BEGIN;
UPDATE system_config SET config_value = config_value - 'radius_step_km' WHERE config_key = 'account_reach_policy';
-- (uses P1: since the adoption fix, P4's sessions are ended when C05 adds P4's number as a farmer)
SELECT verdict('H09', 'incomplete policy row: set and get fail closed', v = 'ERR P0001 REACH_POLICY_MISSING / ERR P0001 REACH_POLICY_MISSING', v)
  FROM (SELECT atk('anon', tok('tok-p1'), $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 5)::text$$) || ' / ' || atk('anon', tok('tok-p1'), $$SELECT get_account_reach('SERVICE_PROVIDER')::text$$) v) x;
ROLLBACK;
BEGIN;
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = '9a000000-0000-0000-0000-000000000004' AND role = 'SERVICE_PROVIDER';
SELECT verdict('H10', 'suspended provider sets Reach', v LIKE 'ERR 42501 NOT_AUTHENTICATED', v)
  FROM (SELECT atk('anon', tok('tok-p4'), $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 5)::text$$) v) x;
ROLLBACK;

\echo '=== G. the other portals (beyond the byte-identical replay in tests/identity/run.sh) ==='
BEGIN;
SELECT atk_n('service_role', '{}', $$DELETE FROM tenants WHERE id = '11111111-1111-1111-1111-111111111111'$$) AS del \gset
SELECT verdict('G01', 'service role deletes a whole tenant that has farmers, provider/customer accounts, sessions, Reach rows and Reach history', :'del' = 'OK rows=1',
               :'del' || '; accounts left for the tenant=' || (SELECT count(*) FROM accounts WHERE tenant_id = '11111111-1111-1111-1111-111111111111') ||
               '; farmers left=' || (SELECT count(*) FROM farmers WHERE tenant_id = '11111111-1111-1111-1111-111111111111') ||
               '; reach history kept (append-only, no FK)=' || (SELECT count(*) FROM account_reach_history WHERE tenant_id = '11111111-1111-1111-1111-111111111111'));
ROLLBACK;
SELECT verdict('G02', 'tenant admin: 3 inserts, 1 update, 1 delete of farmers in one transaction, with identity rows following', v = 'OK rows=3 / OK rows=1 / OK rows=1 / 2 ACTIVE accounts', v)
  FROM (SELECT 1) one,
       LATERAL (SELECT atk_n('authenticated', '{}', $$INSERT INTO farmers (tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('11111111-1111-1111-1111-111111111111', '0000006001', repeat('61', 32), 'BK-G-1'), ('11111111-1111-1111-1111-111111111111', '0000006002', repeat('62', 32), 'BK-G-2'), ('11111111-1111-1111-1111-111111111111', '0000006003', repeat('63', 32), 'BK-G-3')$$, '7a7a7a7a-0000-0000-0000-00000000000a') a) s1,
       LATERAL (SELECT atk_n('authenticated', '{}', $$UPDATE farmers SET farmer_name = 'Fake G', notes = 'edited' WHERE farmer_code = 'BK-G-1'$$, '7a7a7a7a-0000-0000-0000-00000000000a') b) s2,
       LATERAL (SELECT atk_n('authenticated', '{}', $$DELETE FROM farmers WHERE farmer_code = 'BK-G-3'$$, '7a7a7a7a-0000-0000-0000-00000000000a') c) s3,
       LATERAL (SELECT s1.a || ' / ' || s2.b || ' / ' || s3.c || ' / 2 ACTIVE accounts' v) x;
SELECT 'INFO | G02b | … identity rows after that transaction | ' || string_agg(a.mobile_number || ':' || a.status || '/' || r.status, ', ' ORDER BY a.mobile_number)
  FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' WHERE a.mobile_number IN ('0000006001', '0000006002', '0000006003');
SELECT 'INFO | G03 | a village loader (other codebase) hard-deletes a village that is somebody''s Reach base: new behaviour, the delete is now refused (outside the five tables G names) | '
       || atk_n('service_role', '{}', $$DELETE FROM villages WHERE id = '71000000-0000-0000-0000-000000000001'$$);
