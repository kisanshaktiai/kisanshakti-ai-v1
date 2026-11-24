-- ═══════════════════════════════════════════════════════════════════════════
-- tests/identity/behaviour_tests.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Invariant tests for the identity migrations at the database layer. Runs on a
-- fresh replica with 20261124090000 … 20261124090700 AND the staged cutover applied
-- (run.sh builds it). Local replica only.
--
-- Every line is: PASS|FAIL | test | actual | expected. run.sh fails on any FAIL.
--
-- call_as(role, token, sql)  runs sql as that database role with that
--                            x-session-token header and returns its single value,
--                            or ERR <sqlstate> <message>.
-- run_as(role, token, sql)   same, for statements; returns OK rows=N or ERR ….
-- A fourth argument sets auth.uid() (a signed-in portal user).
-- ═══════════════════════════════════════════════════════════════════════════
\set QUIET on
\pset format unaligned
\pset tuples_only on

CREATE OR REPLACE FUNCTION public.chk(p_name text, p_actual text, p_expected text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_actual IS NOT DISTINCT FROM p_expected THEN 'PASS' ELSE 'FAIL' END
         || ' | ' || p_name || ' | actual: ' || coalesce(p_actual, '(null)') || ' | expected: ' || coalesce(p_expected, '(null)') $$;

CREATE OR REPLACE FUNCTION public.call_as(p_role text, p_token text, p_sql text, p_uid text DEFAULT '') RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.headers', CASE WHEN p_token IS NULL THEN '{}' ELSE json_build_object('x-session-token', p_token)::text END, true);
  PERFORM set_config('test.uid', p_uid, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERR ' || SQLSTATE || ' ' || left(SQLERRM, 200);
  END;
  EXECUTE 'RESET ROLE';
  RETURN coalesce(v, '(null)');
END $$;

CREATE OR REPLACE FUNCTION public.run_as(p_role text, p_token text, p_sql text, p_uid text DEFAULT '') RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; n bigint;
BEGIN
  PERFORM set_config('request.headers', CASE WHEN p_token IS NULL THEN '{}' ELSE json_build_object('x-session-token', p_token)::text END, true);
  PERFORM set_config('test.uid', p_uid, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql; GET DIAGNOSTICS n = ROW_COUNT; v := 'OK rows=' || n;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERR ' || SQLSTATE || ' ' || left(SQLERRM, 200);
  END;
  EXECUTE 'RESET ROLE';
  RETURN v;
END $$;

-- ── fixtures: people who are NOT farmers, and a farmer who holds all three roles ─
-- (in production these rows are written by the M2 auth actions, as the service role)
INSERT INTO accounts (id, tenant_id, mobile_number, display_name, language_code, pin_hash) VALUES
  ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000009001', 'Test Provider One',   'mr', repeat('91', 32)),
  ('9c000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000009002', 'Test Customer One',   'hi', repeat('92', 32)),
  ('9a000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '0000009001', 'Test Provider Two',   'hi', repeat('93', 32)),
  ('9a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '0000009003', 'Test Provider Three', 'en', repeat('94', 32));
INSERT INTO account_roles (account_id, tenant_id, role, status, source) VALUES
  ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('9c000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CUSTOMER',         'ACTIVE', 'TEST_FIXTURE'),
  ('9a000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('9a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CUSTOMER',         'ACTIVE', 'TEST_FIXTURE');
INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active, active_role, role_verified_at) VALUES
  ('9a000000-0000-0000-0000-000000000001', 'sess-p1',  hash_session_token('tok-p1'),  now() + interval '30 days', true, 'SERVICE_PROVIDER', now()),
  ('9c000000-0000-0000-0000-000000000001', 'sess-c1',  hash_session_token('tok-c1'),  now() + interval '30 days', true, 'CUSTOMER',         now()),
  ('9a000000-0000-0000-0000-000000000002', 'sess-p2',  hash_session_token('tok-p2'),  now() + interval '30 days', true, 'SERVICE_PROVIDER', now()),
  ('9a000000-0000-0000-0000-000000000003', 'sess-p3',  hash_session_token('tok-p3'),  now() + interval '30 days', true, 'SERVICE_PROVIDER', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sess-a1p', hash_session_token('tok-a1p'), now() + interval '30 days', true, 'SERVICE_PROVIDER', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sess-a1c', hash_session_token('tok-a1c'), now() + interval '30 days', true, 'CUSTOMER',         now()),
  ('9a000000-0000-0000-0000-000000000001', 'sess-p1x', hash_session_token('tok-p1x'), now() - interval '1 minute', true, 'SERVICE_PROVIDER', now()),
  ('9a000000-0000-0000-0000-000000000001', 'sess-p1o', hash_session_token('tok-p1o'), now() + interval '30 days', false, 'SERVICE_PROVIDER', now());

\echo '=== C. Fail closed, never lock out an existing farmer ==='
SELECT chk('C01 every farmer that existed before the migrations has an account of the same id and an ACTIVE FARMER role',
  (SELECT count(*) || ' of ' || (SELECT count(*) FROM farmers) FROM farmers f
     JOIN accounts a ON a.id = f.id AND a.tenant_id = f.tenant_id AND a.mobile_number = f.mobile_number::text AND a.status = 'ACTIVE'
     JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' AND r.status = 'ACTIVE' AND r.source = 'BACKFILL'), '6 of 6');
SELECT chk('C02 standing check v_identity_integrity_gaps', (SELECT count(*)::text FROM v_identity_integrity_gaps), '0');
SELECT chk('C03 cutover precondition query from the staged file',
  (SELECT count(*)::text FROM v_identity_integrity_gaps WHERE gap IN ('FARMER_WITHOUT_ACCOUNT', 'FARMER_ROLE_MISSING', 'FARMER_ACCOUNT_CLOSED')), '0');
SELECT chk('C04 after cutover, farmer A1''s session from before the migrations still resolves to A1',
  call_as('anon', 'tok-a1', $$SELECT farmer_id || ' / ' || tenant_id FROM verified_session_context()$$),
  'aaaaaaaa-0000-0000-0000-000000000001 / 11111111-1111-1111-1111-111111111111');
SELECT chk('C05 after cutover, farmer B1''s session still resolves to B1',
  call_as('anon', 'tok-b1', $$SELECT farmer_id || ' / ' || tenant_id FROM verified_session_context()$$),
  'bbbbbbbb-0000-0000-0000-000000000001 / 22222222-2222-2222-2222-222222222222');
SELECT chk('C06 a deactivated farmer (farmers.is_active = false) stays out, as before',
  call_as('anon', 'tok-a3', $$SELECT farmer_id::text FROM verified_session_context()$$), '(null)');
BEGIN;
INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-3000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000003001', repeat('31', 32), 'TST-A-3001');
SELECT chk('C07 inside the inserting transaction the account and role already exist',
  (SELECT a.status || ' ' || r.status || ' ' || r.source FROM accounts a JOIN account_roles r ON r.account_id = a.id WHERE a.id = 'aaaaaaaa-3000-0000-0000-000000000001'), 'ACTIVE ACTIVE FARMER_TRIGGER');
ROLLBACK;
SELECT chk('C08 the insert rolled back, and so did its account and role',
  (SELECT (SELECT count(*) FROM farmers WHERE id = 'aaaaaaaa-3000-0000-0000-000000000001') || '/' || (SELECT count(*) FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000001')
       || '/' || (SELECT count(*) FROM account_roles WHERE account_id = 'aaaaaaaa-3000-0000-0000-000000000001')), '0/0/0');
SELECT chk('C09 a farmer inserted with no tenant: the insert itself succeeds',
  run_as('service_role', NULL, $$INSERT INTO farmers (id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-3000-0000-0000-000000000002', '0000003002', repeat('32', 32), 'TST-X-3002')$$), 'OK rows=1');
SELECT chk('C10 … no tenant is invented: no account, an open NULL_TENANT note, and the standing check reports the farmer',
  (SELECT (SELECT count(*) FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000002') || ' accounts, note=' ||
          (SELECT coalesce(string_agg(reason, ','), '(none)') FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000002' AND resolved_at IS NULL) || ', gap=' ||
          (SELECT coalesce(string_agg(gap, ','), '(none)') FROM v_identity_integrity_gaps WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000002')),
  '0 accounts, note=NULL_TENANT, gap=FARMER_WITHOUT_ACCOUNT');
SELECT chk('C11 … and no session can be created for that farmer (fails closed)',
  run_as('service_role', NULL, $$INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at) VALUES ('aaaaaaaa-3000-0000-0000-000000000002', 'sess-x', hash_session_token('tok-x'), now() + interval '1 day')$$),
  'ERR 23503 insert or update on table "user_sessions" violates foreign key constraint "user_sessions_account_fkey"');
DELETE FROM farmers WHERE id = 'aaaaaaaa-3000-0000-0000-000000000002';
UPDATE account_link_conflicts SET resolved_at = now(), resolution = 'TEST_CLEANUP' WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000002';
SELECT run_as('service_role', NULL, $$INSERT INTO farmers (id, tenant_id, farmer_code) VALUES ('aaaaaaaa-3000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'TST-A-3003')$$) AS act \gset
SELECT chk('C12 a farmer inserted with no mobile number gets a NULL_MOBILE note',
  :'act'
  || ' note=' || (SELECT coalesce(string_agg(reason, ','), '(none)') FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000003' AND resolved_at IS NULL),
  'OK rows=1 note=NULL_MOBILE');
SELECT run_as('service_role', NULL, $$UPDATE farmers SET mobile_number = '0000003003', pin_hash = repeat('33', 32) WHERE id = 'aaaaaaaa-3000-0000-0000-000000000003'$$) AS act \gset
SELECT chk('C13 … when the portal later fills the number, the account and role appear and the note closes as LINKED',
  :'act'
  || ' ' || (SELECT a.status || ' ' || a.mobile_number || ' ' || r.status FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' WHERE a.id = 'aaaaaaaa-3000-0000-0000-000000000003')
  || ' note=' || (SELECT coalesce(string_agg(resolution, ','), '(none)') FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000003'),
  'OK rows=1 ACTIVE 0000003003 ACTIVE note=LINKED');
SELECT run_as('service_role', NULL, $$DELETE FROM farmers WHERE id = 'aaaaaaaa-3000-0000-0000-000000000003'$$) AS act \gset
SELECT chk('C14 delete a farmer who holds no other role: farmers row gone, account kept and CLOSED, role kept and REVOKED',
  :'act'
  || ' ' || (SELECT a.status || ' ' || r.status FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' WHERE a.id = 'aaaaaaaa-3000-0000-0000-000000000003'),
  'OK rows=1 CLOSED REVOKED');
SELECT run_as('service_role', NULL, $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-3000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '0000003003', repeat('34', 32), 'TST-A-3004')$$) AS act \gset
SELECT chk('C15 the portal creates the same person again with a new id: a new ACTIVE account, the old one untouched',
  :'act'
  || ' ' || (SELECT string_agg(right(id::text, 4) || ':' || status, ',' ORDER BY id) FROM accounts WHERE tenant_id = '11111111-1111-1111-1111-111111111111' AND mobile_number = '0000003003'),
  'OK rows=1 0003:CLOSED,0004:ACTIVE');
DELETE FROM farmers WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004';
SELECT run_as('service_role', NULL, $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-3000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '0000003004', repeat('35', 32), 'TST-A-3005')$$) AS act \gset
SELECT chk('C16 a farmers row re-inserted with its OLD id reopens that account and role instead of making a second one',
  :'act'
  || ' ' || (SELECT a.status || ' ' || a.mobile_number || ' ' || r.status || ' roles=' || (SELECT count(*) FROM account_roles WHERE account_id = a.id)
               FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' WHERE a.id = 'aaaaaaaa-3000-0000-0000-000000000004'),
  'OK rows=1 ACTIVE 0000003004 ACTIVE roles=1');
SELECT chk('C17 standing check is clean again after all of the above', (SELECT count(*)::text FROM v_identity_integrity_gaps), '0');

\echo '=== A. Authority is server side ==='
SELECT chk('A01 provider-only session: verified_account_context()',
  call_as('anon', 'tok-p1', $$SELECT account_id || ' / ' || tenant_id || ' / ' || active_role FROM verified_account_context()$$),
  '9a000000-0000-0000-0000-000000000001 / 11111111-1111-1111-1111-111111111111 / SERVICE_PROVIDER');
SELECT chk('A02 get_current_account_id() and get_current_role()',
  call_as('anon', 'tok-c1', $$SELECT get_current_account_id() || ' / ' || get_current_role()$$), '9c000000-0000-0000-0000-000000000001 / CUSTOMER');
SELECT chk('A03 farmer session (NULL active_role) reads as FARMER in the account context',
  call_as('anon', 'tok-a1', $$SELECT account_id || ' / ' || active_role FROM verified_account_context()$$), 'aaaaaaaa-0000-0000-0000-000000000001 / FARMER');
UPDATE user_sessions SET active_role = 'CUSTOMER' WHERE session_id = 'sess-p1';
SELECT chk('A04 active_role forged to a role the account does not hold (CUSTOMER): no context',
  call_as('anon', 'tok-p1', $$SELECT account_id::text FROM verified_account_context()$$), '(null)');
UPDATE user_sessions SET active_role = 'FARMER' WHERE session_id = 'sess-p1';
SELECT chk('A05 active_role forged to FARMER on a provider-only account: no account context and no farmer context',
  call_as('anon', 'tok-p1', $$SELECT coalesce((SELECT account_id::text FROM verified_account_context()), 'none') || ' / ' || coalesce(get_current_farmer_id()::text, 'none')$$), 'none / none');
UPDATE user_sessions SET active_role = NULL WHERE session_id = 'sess-p1';
SELECT chk('A06 active_role blanked (NULL = FARMER) on a provider-only account: no context either',
  call_as('anon', 'tok-p1', $$SELECT coalesce((SELECT account_id::text FROM verified_account_context()), 'none') || ' / ' || coalesce(get_current_farmer_id()::text, 'none')$$), 'none / none');
UPDATE user_sessions SET active_role = 'SERVICE_PROVIDER' WHERE session_id = 'sess-p1';
SELECT chk('A07 a signed-in portal user whose auth.uid() equals an account id can still edit that session row through the old user_sessions policy …',
  run_as('authenticated', NULL, $$UPDATE user_sessions SET active_role = 'CUSTOMER' WHERE session_id = 'sess-p1'$$, '9a000000-0000-0000-0000-000000000001'), 'OK rows=1');
SELECT chk('A08 … and gains nothing: the membership is checked on every request',
  call_as('anon', 'tok-p1', $$SELECT account_id::text FROM verified_account_context()$$), '(null)');
UPDATE user_sessions SET active_role = 'SERVICE_PROVIDER' WHERE session_id = 'sess-p1';
SELECT chk('A09 active_role outside the three role codes is refused by the database',
  run_as('service_role', NULL, $$UPDATE user_sessions SET active_role = 'ADMIN' WHERE session_id = 'sess-p1'$$),
  'ERR 23503 insert or update on table "user_sessions" violates foreign key constraint "user_sessions_active_role_fkey"');
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT chk('A10 role SUSPENDED: the very next request has no context',
  call_as('anon', 'tok-p1', $$SELECT account_id::text FROM verified_account_context()$$), '(null)');
UPDATE account_roles SET status = 'PENDING' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT chk('A11 role PENDING: no context', call_as('anon', 'tok-p1', $$SELECT account_id::text FROM verified_account_context()$$), '(null)');
UPDATE account_roles SET status = 'REVOKED' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT chk('A12 role REVOKED: no context', call_as('anon', 'tok-p1', $$SELECT account_id::text FROM verified_account_context()$$), '(null)');
UPDATE account_roles SET status = 'ACTIVE' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND role = 'SERVICE_PROVIDER';
SELECT chk('A13 role ACTIVE again: context is back', call_as('anon', 'tok-p1', $$SELECT active_role FROM verified_account_context()$$), 'SERVICE_PROVIDER');
UPDATE accounts SET status = 'SUSPENDED' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT chk('A14 account SUSPENDED: neither the farmer session nor the provider session of that person has a context',
  call_as('anon', 'tok-a1', $$SELECT coalesce(get_current_farmer_id()::text, 'none') || ' / ' || coalesce(get_current_account_id()::text, 'none')$$)
  || ' ; ' || call_as('anon', 'tok-a1p', $$SELECT coalesce(get_current_account_id()::text, 'none')$$), 'none / none ; none');
UPDATE accounts SET status = 'ACTIVE' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT chk('A15 expired session, deactivated session, unknown token, no token: no context',
  call_as('anon', 'tok-p1x', $$SELECT coalesce(get_current_account_id()::text, 'none')$$) || ' / ' ||
  call_as('anon', 'tok-p1o', $$SELECT coalesce(get_current_account_id()::text, 'none')$$) || ' / ' ||
  call_as('anon', 'no-such-token', $$SELECT coalesce(get_current_account_id()::text, 'none')$$) || ' / ' ||
  call_as('anon', NULL, $$SELECT coalesce(get_current_account_id()::text, 'none')$$), 'none / none / none / none');
SELECT chk('A16 client roles cannot read or write accounts',
  call_as('anon', 'tok-p1', $$SELECT count(*)::text FROM accounts$$) || ' ; ' ||
  run_as('authenticated', 'tok-p1', $$UPDATE accounts SET status = 'ACTIVE'$$, '9a000000-0000-0000-0000-000000000001'),
  'ERR 42501 permission denied for table accounts ; ERR 42501 permission denied for table accounts');
SELECT chk('A17 client roles cannot read or write memberships',
  call_as('authenticated', 'tok-p1', $$SELECT count(*)::text FROM account_roles$$) || ' ; ' ||
  run_as('anon', 'tok-p1', $$INSERT INTO account_roles (account_id, tenant_id, role, source) VALUES ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CUSTOMER', 'SELF')$$),
  'ERR 42501 permission denied for table account_roles ; ERR 42501 permission denied for table account_roles');

\echo '=== B. Farmer data is closed to non-farmers (database layer) ==='
SELECT chk('B01 provider-only session: no farmer context',
  call_as('anon', 'tok-p1', $$SELECT coalesce((SELECT farmer_id::text FROM verified_session_context()), 'none') || ' / ' || coalesce(get_current_farmer_id()::text, 'none') || ' / ' || coalesce(get_current_tenant_id()::text, 'none')$$), 'none / none / none');
SELECT chk('B02 customer-only session: no farmer context',
  call_as('anon', 'tok-c1', $$SELECT coalesce(get_current_farmer_id()::text, 'none')$$), 'none');
SELECT chk('B03 provider-only session sees no user_profiles row through the farmer header policies',
  call_as('anon', 'tok-p1', $$SELECT count(*)::text FROM user_profiles$$), '0');
SELECT chk('B04 provider-only session sees no farmers row (role authenticated holds the column grants)',
  call_as('authenticated', 'tok-p1', $$SELECT count(*)::text FROM farmers$$), '0');
SELECT chk('B05 a farmer in the Farmer Workspace sees exactly the own farmers row and profile',
  call_as('authenticated', 'tok-a1', $$SELECT count(*) || ':' || min(farmer_code) FROM farmers$$) || ' ; ' || call_as('anon', 'tok-a1', $$SELECT count(*)::text FROM user_profiles$$), '1:TST-A-0001 ; 1');
SELECT chk('B06 the SAME person on a session switched to the Provider Workspace has no farmer context and sees no farmer data',
  call_as('anon', 'tok-a1p', $$SELECT coalesce(get_current_farmer_id()::text, 'none')$$) || ' ; ' ||
  call_as('authenticated', 'tok-a1p', $$SELECT count(*)::text FROM farmers$$) || ' ; ' || call_as('anon', 'tok-a1p', $$SELECT count(*)::text FROM user_profiles$$), 'none ; 0 ; 0');
SELECT chk('B07 … and on a session switched to the Customer Workspace',
  call_as('anon', 'tok-a1c', $$SELECT coalesce(get_current_farmer_id()::text, 'none')$$) || ' ; ' || call_as('anon', 'tok-a1c', $$SELECT count(*)::text FROM user_profiles$$), 'none ; 0');
SELECT chk('B08 a farmer cannot update the own farmers row from a Provider Workspace session (0 rows), and can from a farmer session (1 row)',
  run_as('authenticated', 'tok-a1p', $$UPDATE farmers SET notes = 'x' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$) || ' ; ' ||
  run_as('authenticated', 'tok-a1',  $$UPDATE farmers SET notes = 'own edit' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$), 'OK rows=0 ; OK rows=1');
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER';
SELECT chk('B09 FARMER role SUSPENDED while farmers.is_active is still true: farmer context closes on the next request, provider context stays',
  call_as('anon', 'tok-a1', $$SELECT coalesce(get_current_farmer_id()::text, 'none')$$) || ' ; ' || call_as('anon', 'tok-a1p', $$SELECT coalesce(get_current_role(), 'none')$$), 'none ; SERVICE_PROVIDER');
UPDATE account_roles SET status = 'ACTIVE' WHERE account_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND role = 'FARMER';
SELECT chk('B10 the boundary the other way: a farmer session cannot use the provider/customer Reach functions',
  call_as('anon', 'tok-a1', $$SELECT get_account_reach('SERVICE_PROVIDER')::text$$) || ' ; ' ||
  call_as('anon', 'tok-a1', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 25)::text$$),
  'ERR 42501 REACH_ROLE_NOT_ACTIVE ; ERR 42501 REACH_ROLE_NOT_ACTIVE');
SELECT chk('B11 a tenant admin of tenant A still sees every tenant A farmer and no tenant B farmer',
  call_as('authenticated', NULL, $$SELECT count(*) || ' rows, tenants=' || count(DISTINCT tenant_id) FROM farmers$$, '7a7a7a7a-0000-0000-0000-00000000000a'), '4 rows, tenants=1');

\echo '=== D. Self-service covers only the three roles ==='
SELECT chk('D01 the role lookup holds exactly the three codes',
  (SELECT string_agg(code, ',' ORDER BY sort_order) FROM account_role_codes), 'FARMER,SERVICE_PROVIDER,CUSTOMER');
SELECT chk('D02 a membership with any other role code is refused',
  run_as('service_role', NULL, $$INSERT INTO account_roles (account_id, tenant_id, role, source) VALUES ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'TENANT_ADMIN', 'SELF')$$),
  'ERR 23503 insert or update on table "account_roles" violates foreign key constraint "account_roles_role_fkey"');
SELECT chk('D03 a membership status outside ACTIVE/PENDING/SUSPENDED/REVOKED is refused',
  run_as('service_role', NULL, $$UPDATE account_roles SET status = 'VERIFIED' WHERE account_id = '9a000000-0000-0000-0000-000000000001'$$),
  'ERR 23514 new row for relation "account_roles" violates check constraint "account_roles_status_check"');
SELECT chk('D04 client roles cannot add a role code',
  run_as('authenticated', 'tok-p1', $$INSERT INTO account_role_codes (code, label_en) VALUES ('SUPER_USER', 'x')$$, '9a000000-0000-0000-0000-000000000001'), 'ERR 42501 permission denied for table account_role_codes');
SELECT chk('D05 client roles cannot call the account-link function (it would create an account for any id)',
  call_as('anon', 'tok-p1', $$SELECT link_farmer_account(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0000008888', 'SELF')::text$$) || ' ; ' ||
  call_as('authenticated', 'tok-p1', $$SELECT link_farmer_account(gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0000008888', 'SELF')::text$$),
  'ERR 42501 permission denied for function link_farmer_account ; ERR 42501 permission denied for function link_farmer_account');
SELECT chk('D06 one membership per account and role',
  run_as('service_role', NULL, $$INSERT INTO account_roles (account_id, tenant_id, role, source) VALUES ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'DUP')$$),
  'ERR 23505 duplicate key value violates unique constraint "account_roles_account_role_key"');

\echo '=== E. No new enumeration (database layer) ==='
SELECT chk('E01 without a session every Reach call gives the same answer, whatever the arguments',
  call_as('anon', NULL, $$SELECT get_account_reach('SERVICE_PROVIDER')::text$$) || ' ; ' || call_as('anon', NULL, $$SELECT get_account_reach('NO_SUCH_ROLE')::text$$) || ' ; ' ||
  call_as('anon', 'no-such-token', $$SELECT set_account_reach('CUSTOMER', gen_random_uuid(), 9999)::text$$),
  'ERR 42501 NOT_AUTHENTICATED ; ERR 42501 NOT_AUTHENTICATED ; ERR 42501 NOT_AUTHENTICATED');
SELECT chk('E02 without a session the standing-check view, the conflict notes and the role lookup are unreadable',
  call_as('anon', NULL, $$SELECT count(*)::text FROM v_identity_integrity_gaps$$) || ' ; ' || call_as('anon', NULL, $$SELECT count(*)::text FROM account_link_conflicts$$) || ' ; ' ||
  call_as('anon', NULL, $$SELECT count(*)::text FROM account_role_codes$$),
  'ERR 42501 permission denied for view v_identity_integrity_gaps ; ERR 42501 permission denied for table account_link_conflicts ; ERR 42501 permission denied for table account_role_codes');

\echo '=== F. Tenancy ==='
SELECT chk('F01 a membership naming a tenant other than its account''s tenant is refused',
  run_as('service_role', NULL, $$INSERT INTO account_roles (account_id, tenant_id, role, source) VALUES ('9a000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'CUSTOMER', 'CROSS')$$),
  'ERR 23503 insert or update on table "account_roles" violates foreign key constraint "account_roles_account_tenant_fkey"');
SELECT chk('F02 the same mobile number in two tenants is two separate accounts (fixtures P1 in A, P2 in B)',
  (SELECT count(*) || ' accounts, ' || count(DISTINCT tenant_id) || ' tenants' FROM accounts WHERE mobile_number = '0000009001'), '2 accounts, 2 tenants');
SELECT chk('F03 a second open account for the same tenant and mobile number is refused',
  run_as('service_role', NULL, $$INSERT INTO accounts (tenant_id, mobile_number) VALUES ('11111111-1111-1111-1111-111111111111', '0000009001')$$),
  'ERR 23505 duplicate key value violates unique constraint "accounts_tenant_mobile_open_uidx"');
SELECT chk('F04 an account without a tenant is refused',
  run_as('service_role', NULL, $$INSERT INTO accounts (mobile_number) VALUES ('0000009099')$$),
  'ERR 23502 null value in column "tenant_id" of relation "accounts" violates not-null constraint');
SELECT chk('F05 each context carries the account''s own tenant (provider P2 of tenant B)',
  call_as('anon', 'tok-p2', $$SELECT tenant_id::text FROM verified_account_context()$$), '22222222-2222-2222-2222-222222222222');
SELECT run_as('service_role', NULL, $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('bbbbbbbb-3000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '0000009002', repeat('36', 32), 'TST-B-3001')$$) AS act \gset
SELECT chk('F06 a farmer inserted in tenant B with the mobile number of a tenant A provider gets an own tenant B account',
  :'act'
  || ' ' || (SELECT tenant_id || ' ' || status FROM accounts WHERE id = 'bbbbbbbb-3000-0000-0000-000000000001'), 'OK rows=1 22222222-2222-2222-2222-222222222222 ACTIVE');
SELECT run_as('service_role', NULL, $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('9a000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '0000003007', repeat('37', 32), 'TST-A-3007')$$) AS act \gset
SELECT chk('F07 a farmers row whose id is already an account of ANOTHER tenant: insert succeeds, nothing is linked across tenants, a TENANT_MISMATCH note is written',
  :'act'
  || ' account_tenant=' || (SELECT right(tenant_id::text, 4) FROM accounts WHERE id = '9a000000-0000-0000-0000-000000000002')
  || ' farmer_roles=' || (SELECT count(*) FROM account_roles WHERE account_id = '9a000000-0000-0000-0000-000000000002' AND role = 'FARMER')
  || ' note=' || (SELECT coalesce(string_agg(reason, ','), '(none)') FROM account_link_conflicts WHERE farmer_id = '9a000000-0000-0000-0000-000000000002' AND resolved_at IS NULL),
  'OK rows=1 account_tenant=2222 farmer_roles=0 note=TENANT_MISMATCH');
DELETE FROM farmers WHERE id = '9a000000-0000-0000-0000-000000000002';
UPDATE account_link_conflicts SET resolved_at = now(), resolution = 'TEST_CLEANUP' WHERE farmer_id = '9a000000-0000-0000-0000-000000000002';
-- F08/F09: a dedicated person registered as provider only (own PIN, a live session, one unused reset code)
INSERT INTO accounts (id, tenant_id, mobile_number, display_name, pin_hash, pin_updated_at)
VALUES ('9a000000-0000-0000-0000-0000000000f8', '11111111-1111-1111-1111-111111111111', '0000009008', 'Test Provider F08', repeat('99', 32), now());
INSERT INTO account_roles (account_id, tenant_id, role, status, source)
VALUES ('9a000000-0000-0000-0000-0000000000f8', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'SELF_REGISTERED');
INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active, active_role, role_verified_at)
VALUES ('9a000000-0000-0000-0000-0000000000f8', 'sess-f8', hash_session_token('tok-f8'), now() + interval '1 day', true, 'SERVICE_PROVIDER', now());
SELECT run_as('service_role', NULL, $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-3000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '0000009008', repeat('38', 32), 'TST-A-3008')$$) AS act \gset
SELECT chk('F08 the portal inserts a farmer whose number a provider-only account of the SAME tenant holds: the account is adopted under the farmer id (one login per person), keeps its Provider role, gains FARMER, loses its own PIN copy and its old sessions, and no conflict stays open',
  :'act'
  || ' old_id=' || (SELECT count(*) FROM accounts WHERE id = '9a000000-0000-0000-0000-0000000000f8')
  || ' farmer_account=' || (SELECT status || '/' || display_name || '/pin=' || (pin_hash IS NOT NULL) FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000008')
  || ' roles=' || (SELECT string_agg(role || ':' || status, ',' ORDER BY role) FROM account_roles WHERE account_id = 'aaaaaaaa-3000-0000-0000-000000000008')
  || ' live_old_sessions=' || (SELECT count(*) FROM user_sessions WHERE session_id = 'sess-f8' AND is_active)
  || ' open_notes=' || (SELECT count(*) FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000008' AND resolved_at IS NULL)
  || ' open_accounts_for_number=' || (SELECT count(*) FROM accounts WHERE mobile_number = '0000009008' AND status <> 'CLOSED'),
  'OK rows=1 old_id=0 farmer_account=ACTIVE/Test Provider F08/pin=false roles=FARMER:ACTIVE,SERVICE_PROVIDER:ACTIVE live_old_sessions=0 open_notes=0 open_accounts_for_number=1');
SELECT run_as('service_role', NULL, $$INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at) VALUES ('aaaaaaaa-3000-0000-0000-000000000008', 'sess-y', hash_session_token('tok-y'), now() + interval '1 day')$$) AS act \gset
SELECT chk('F09 … that farmer gets a session and a farmer context, the token of the earlier registration is dead, and the standing check is clean',
  :'act'
  || ' farmer_ctx=' || coalesce(call_as('anon', 'tok-y', $$SELECT (get_current_farmer_id() = 'aaaaaaaa-3000-0000-0000-000000000008')::text$$), '(null)')
  || ' old_token=' || coalesce(call_as('anon', 'tok-f8', $$SELECT coalesce(get_current_account_id()::text, 'none')$$), '(null)')
  || ' gap=' || (SELECT coalesce(string_agg(gap, ','), '(none)') FROM v_identity_integrity_gaps WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000008'),
  'OK rows=1 farmer_ctx=true old_token=none gap=(none)');
DELETE FROM farmers WHERE id = 'aaaaaaaa-3000-0000-0000-000000000008';

\echo '=== Mobile number changes made by a portal ==='
SELECT run_as('service_role', NULL, $$UPDATE farmers SET mobile_number = '0000003099' WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004'$$) AS act \gset
SELECT chk('M01 the account follows a changed mobile number',
  :'act'
  || ' ' || (SELECT mobile_number FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004'), 'OK rows=1 0000003099');
SELECT updated_at::text AS before FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004' \gset
SELECT pg_sleep(0.05) IS NOT NULL AS waited \gset
SELECT run_as('service_role', NULL, $$UPDATE farmers SET mobile_number = '0000003099', failed_login_attempts = 2, last_login_at = now() WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004'$$) AS act \gset
SELECT chk('M02 an update that resends the same number with other fields does not touch the account (updated_at unchanged)',
  :'act' || ' ' || (SELECT updated_at::text FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004'), 'OK rows=1 ' || :'before');
SELECT run_as('service_role', NULL, $$UPDATE farmers SET mobile_number = '0000009003' WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004'$$) AS act \gset
SELECT chk('M03 (open point for review) number changed to one a provider-only account of the tenant holds: the portal update succeeds, the account keeps its old number, a note is written, the standing check reports MOBILE_DRIFT',
  :'act'
  || ' account=' || (SELECT mobile_number FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004')
  || ' note=' || (SELECT reason || '>' || right(account_id::text, 4) FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000004' AND resolved_at IS NULL)
  || ' gap=' || (SELECT string_agg(gap, ',') FROM v_identity_integrity_gaps WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000004'),
  'OK rows=1 account=0000003099 note=MOBILE_ACCOUNT_EXISTS>0003 gap=MOBILE_DRIFT');
SELECT run_as('service_role', NULL, $$UPDATE farmers SET mobile_number = '0000003098' WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004'$$) AS act \gset
SELECT chk('M04 number changed back to a free one: account follows, the note closes, the standing check is clean',
  :'act'
  || ' account=' || (SELECT mobile_number FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004')
  || ' open_notes=' || (SELECT count(*) FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000004' AND resolved_at IS NULL)
  || ' gaps=' || (SELECT count(*) FROM v_identity_integrity_gaps), 'OK rows=1 account=0000003098 open_notes=0 gaps=0');
SELECT run_as('service_role', NULL, $$UPDATE farmers SET mobile_number = NULL, pin_hash = NULL WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004'$$) AS act \gset
SELECT chk('M05 number cleared by a portal (mobile and pin set to NULL): update succeeds, account kept as it was, MOBILE_CLEARED note',
  :'act'
  || ' account=' || (SELECT mobile_number || '/' || status FROM accounts WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004')
  || ' note=' || (SELECT reason FROM account_link_conflicts WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000004' AND resolved_at IS NULL),
  'OK rows=1 account=0000003098/ACTIVE note=MOBILE_CLEARED');
DELETE FROM farmers WHERE id = 'aaaaaaaa-3000-0000-0000-000000000004';
UPDATE account_link_conflicts SET resolved_at = now(), resolution = 'TEST_CLEANUP' WHERE farmer_id = 'aaaaaaaa-3000-0000-0000-000000000004';

\echo '=== H. Reach is the account''s own and server-validated ==='
SELECT chk('H01 before anything is set: not set, policy bounds returned, 3 changes left',
  call_as('anon', 'tok-p1', $$SELECT (r->>'is_set') || ' ' || (r->'policy'->>'radius_min_km') || '-' || (r->'policy'->>'radius_max_km') || '/' || (r->'policy'->>'radius_step_km') || ' default ' || (r->'policy'->>'radius_default_km') || ' left ' || (r->>'changes_remaining') FROM get_account_reach('SERVICE_PROVIDER') r$$),
  'false 5-100/5 default 25 left 3');
SELECT chk('H02 radius below the minimum, above the maximum, missing',
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 0)::text$$) || ' ; ' ||
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 105)::text$$) || ' ; ' ||
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', NULL)::text$$),
  'ERR P0001 REACH_RADIUS_OUT_OF_BOUNDS ; ERR P0001 REACH_RADIUS_OUT_OF_BOUNDS ; ERR P0001 REACH_RADIUS_OUT_OF_BOUNDS');
SELECT chk('H03 radius inside the bounds but off the step',
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 27)::text$$), 'ERR P0001 REACH_RADIUS_OFF_STEP');
SELECT chk('H04 village with no centre point, inactive village, unknown village, missing village',
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-0000000000a0', 25)::text$$) || ' ; ' ||
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-0000000000b0', 25)::text$$) || ' ; ' ||
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-00000000dead', 25)::text$$) || ' ; ' ||
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', NULL, 25)::text$$),
  'ERR P0001 REACH_VILLAGE_INVALID ; ERR P0001 REACH_VILLAGE_INVALID ; ERR P0001 REACH_VILLAGE_INVALID ; ERR P0001 REACH_VILLAGE_INVALID');
SELECT chk('H05 a provider session cannot set the CUSTOMER Reach, and FARMER has no Reach',
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 25)::text$$) || ' ; ' ||
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('FARMER', '71000000-0000-0000-0000-000000000001', 25)::text$$),
  'ERR 42501 REACH_ROLE_NOT_ACTIVE ; ERR P0001 REACH_ROLE_INVALID');
SELECT chk('H06 nothing was written by the rejected calls',
  (SELECT (SELECT count(*) FROM account_reach_settings) || '/' || (SELECT count(*) FROM account_reach_history)), '0/0');
SELECT chk('H07 first set-up: stored, not counted as a change',
  call_as('anon', 'tok-p1', $$SELECT (r->>'is_set') || ' ' || (r->>'base_village_id') || ' ' || (r->>'radius_km') || ' left ' || (r->>'changes_remaining') FROM set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25) r$$),
  'true 71000000-0000-0000-0000-000000000001 25 left 3');
SELECT chk('H08 the stored row carries the account''s own id and tenant',
  (SELECT account_id || ' ' || tenant_id || ' ' || role FROM account_reach_settings), '9a000000-0000-0000-0000-000000000001 11111111-1111-1111-1111-111111111111 SERVICE_PROVIDER');
SELECT call_as('anon', 'tok-p1', $$SELECT 'left ' || (set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25)->>'changes_remaining')$$) AS act \gset
SELECT chk('H09 re-sending the current values is not a change',
  :'act'
  || ' history=' || (SELECT count(*) FROM account_reach_history), 'left 3 history=1');
SELECT chk('H10 change 1 (radius only), change 2 (village only), change 3 (both): 2, 1, 0 left',
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 50)->>'changes_remaining'$$) || ',' ||
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000002', 50)->>'changes_remaining'$$) || ',' ||
  call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000003', 10)->>'changes_remaining'$$), '2,1,0');
SELECT chk('H11 change 4 is refused, and so are five more attempts (village moves and radius moves alike)',
  (SELECT string_agg(DISTINCT call_as('anon', 'tok-p1', format($$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-00000000000%s', %s)::text$$, 1 + g % 2, 15 + 5 * g)), ' ; ') || ' x' || count(*) FROM generate_series(1, 6) g),
  'ERR P0001 REACH_CHANGE_LIMIT_REACHED x6');
SELECT chk('H12 after the refusals the stored Reach is still change 3, history is 1 INITIAL + 3 CHANGE',
  (SELECT right(base_village_id::text, 4) || ' ' || radius_km FROM account_reach_settings WHERE account_id = '9a000000-0000-0000-0000-000000000001')
  || ' ' || (SELECT string_agg(change_kind || '=' || n, ',' ORDER BY change_kind) FROM (SELECT change_kind, count(*) n FROM account_reach_history WHERE account_id = '9a000000-0000-0000-0000-000000000001' GROUP BY 1) x),
  '0003 10 CHANGE=3,INITIAL=1');
SELECT chk('H13 the read tells the client 0 changes are left and when the next one opens',
  call_as('anon', 'tok-p1', $$SELECT (r->>'changes_remaining') || ' next_in_days=' || round(extract(epoch FROM ((r->>'next_change_at')::timestamptz - now())) / 86400.0) FROM get_account_reach('SERVICE_PROVIDER') r$$), '0 next_in_days=7');
SELECT chk('H14 another account is not affected by that throttle and cannot see that Reach (customer C1 reads own, empty)',
  call_as('anon', 'tok-c1', $$SELECT (r->>'is_set') || ' ' || coalesce(r->>'base_village_id', 'none') || ' left ' || (r->>'changes_remaining') FROM get_account_reach('CUSTOMER') r$$), 'false none left 3');
SELECT chk('H15 client roles cannot read or write the Reach tables directly',
  call_as('anon', 'tok-p1', $$SELECT count(*)::text FROM account_reach_settings$$) || ' ; ' ||
  run_as('authenticated', 'tok-p1', $$UPDATE account_reach_settings SET radius_km = 100$$, '9a000000-0000-0000-0000-000000000001') || ' ; ' ||
  call_as('anon', 'tok-p1', $$SELECT count(*)::text FROM account_reach_history$$) || ' ; ' ||
  run_as('authenticated', 'tok-p1', $$DELETE FROM account_reach_history$$, '9a000000-0000-0000-0000-000000000001'),
  'ERR 42501 permission denied for table account_reach_settings ; ERR 42501 permission denied for table account_reach_settings ; ERR 42501 permission denied for table account_reach_history ; ERR 42501 permission denied for table account_reach_history');
SELECT chk('H16 history is append-only even for the service role and the table owner (update, delete, truncate)',
  run_as('service_role', NULL, $$UPDATE account_reach_history SET changed_at = now() - interval '30 days'$$) || ' ; ' ||
  run_as('service_role', NULL, $$DELETE FROM account_reach_history$$) || ' ; ' ||
  run_as('postgres', NULL, $$UPDATE account_reach_history SET changed_at = now() - interval '30 days'$$) || ' ; ' ||
  run_as('postgres', NULL, $$DELETE FROM account_reach_history$$) || ' ; ' ||
  run_as('postgres', NULL, $$TRUNCATE account_reach_history$$),
  'ERR 42501 permission denied for table account_reach_history ; ERR 42501 permission denied for table account_reach_history ; ERR 42501 account_reach_history is append-only ; ERR 42501 account_reach_history is append-only ; ERR 42501 account_reach_history is append-only');
SELECT chk('H17 the throttle is per account across both roles: A1 sets up provider and customer Reach (not counted), then 2 provider changes + 1 customer change, then both roles are refused',
  call_as('anon', 'tok-a1p', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25)->>'changes_remaining'$$) || ',' ||
  call_as('anon', 'tok-a1c', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000002', 25)->>'changes_remaining'$$) || ',' ||
  call_as('anon', 'tok-a1p', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 30)->>'changes_remaining'$$) || ',' ||
  call_as('anon', 'tok-a1p', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 35)->>'changes_remaining'$$) || ',' ||
  call_as('anon', 'tok-a1c', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000002', 30)->>'changes_remaining'$$) || ' ; ' ||
  call_as('anon', 'tok-a1p', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 40)::text$$) || ' ; ' ||
  call_as('anon', 'tok-a1c', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000002', 35)::text$$),
  '3,3,2,1,0 ; ERR P0001 REACH_CHANGE_LIMIT_REACHED ; ERR P0001 REACH_CHANGE_LIMIT_REACHED');
SELECT chk('H18 the limits are data: with radius_max_km edited to 50, a radius of 60 is refused',
  run_as('postgres', NULL, $$UPDATE system_config SET config_value = jsonb_set(config_value, '{radius_max_km}', '50') WHERE config_key = 'account_reach_policy'$$) || ' ' ||
  call_as('anon', 'tok-c1', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 60)::text$$), 'OK rows=1 ERR P0001 REACH_RADIUS_OUT_OF_BOUNDS');
SELECT chk('H19 an incoherent policy (step that does not divide the range) disables the write and the read instead of guessing',
  run_as('postgres', NULL, $$UPDATE system_config SET config_value = jsonb_set(config_value, '{radius_step_km}', '7') WHERE config_key = 'account_reach_policy'$$) || ' ' ||
  call_as('anon', 'tok-c1', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 25)::text$$) || ' ; ' || call_as('anon', 'tok-c1', $$SELECT get_account_reach('CUSTOMER')::text$$),
  'OK rows=1 ERR P0001 REACH_POLICY_MISSING ; ERR P0001 REACH_POLICY_MISSING');
SELECT chk('H20 a missing policy row does the same',
  run_as('postgres', NULL, $$UPDATE system_config SET config_key = 'account_reach_policy_parked' WHERE config_key = 'account_reach_policy'$$) || ' ' ||
  call_as('anon', 'tok-c1', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 25)::text$$), 'OK rows=1 ERR P0001 REACH_POLICY_MISSING');
UPDATE system_config SET config_key = 'account_reach_policy',
       config_value = '{"radius_min_km": 5, "radius_max_km": 100, "radius_step_km": 5, "radius_default_km": 25, "change_limit_count": 3, "change_limit_window_days": 7}'
 WHERE config_key = 'account_reach_policy_parked';
SELECT chk('H21 a Reach row for a role the account does not hold cannot exist, whoever writes it',
  run_as('postgres', NULL, $$INSERT INTO account_reach_settings (account_id, tenant_id, role, base_village_id, radius_km) VALUES ('9c000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25)$$),
  'ERR 23503 insert or update on table "account_reach_settings" violates foreign key constraint "account_reach_settings_membership_fkey"');
SELECT chk('H22 a Reach row naming a tenant other than the membership''s tenant cannot exist',
  run_as('postgres', NULL, $$INSERT INTO account_reach_settings (account_id, tenant_id, role, base_village_id, radius_km) VALUES ('9c000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'CUSTOMER', '71000000-0000-0000-0000-000000000001', 25)$$),
  'ERR 23503 insert or update on table "account_reach_settings" violates foreign key constraint "account_reach_settings_membership_fkey"');
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = '9c000000-0000-0000-0000-000000000001' AND role = 'CUSTOMER';
SELECT chk('H23 a suspended role cannot set or read Reach',
  call_as('anon', 'tok-c1', $$SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 25)::text$$) || ' ; ' || call_as('anon', 'tok-c1', $$SELECT get_account_reach('CUSTOMER')::text$$),
  'ERR 42501 NOT_AUTHENTICATED ; ERR 42501 NOT_AUTHENTICATED');
UPDATE account_roles SET status = 'ACTIVE' WHERE account_id = '9c000000-0000-0000-0000-000000000001' AND role = 'CUSTOMER';
-- Age P1's three changes past the window. History is append-only, so the test has to
-- switch the guard off for this one statement (replica mode skips ordinary triggers).
SET session_replication_role = replica;
UPDATE account_reach_history SET changed_at = changed_at - interval '8 days' WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND change_kind = 'CHANGE';
SET session_replication_role = origin;
SELECT chk('H24 once the three changes are older than the window, a change is accepted again',
  call_as('anon', 'tok-p1', $$SELECT (r->>'radius_km') || ' left ' || (r->>'changes_remaining') FROM set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000003', 15) r$$), '15 left 2');
SELECT chk('H25 a village that is somebody''s base cannot be hard-deleted (deactivating it still works)',
  run_as('postgres', NULL, $$DELETE FROM villages WHERE id = '71000000-0000-0000-0000-000000000003'$$) || ' ; ' ||
  run_as('postgres', NULL, $$UPDATE villages SET is_active = false WHERE id = '71000000-0000-0000-0000-000000000005'$$),
  'ERR 23503 update or delete on table "villages" violates foreign key constraint "account_reach_settings_base_village_id_fkey" on table "account_reach_settings" ; OK rows=1');

\echo '=== Credential, single copy ==='
SELECT chk('X01 before: the farmer who also holds provider and customer roles keeps the credential on farmers only',
  (SELECT 'farmer_pin=' || left(f.pin_hash, 4) || ' account_pin=' || coalesce(left(a.pin_hash, 4), 'none') FROM farmers f JOIN accounts a ON a.id = f.id WHERE f.id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'farmer_pin=a1a1 account_pin=none');
SELECT run_as('authenticated', NULL, $$DELETE FROM farmers WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001' AND tenant_id = '11111111-1111-1111-1111-111111111111'$$, '7a7a7a7a-0000-0000-0000-00000000000a') AS act \gset
SELECT chk('X02 a portal deletes that farmers row: FARMER role REVOKED, account stays ACTIVE, the credential moves to the account',
  :'act'
  || ' ' || (SELECT a.status || ' account_pin=' || left(a.pin_hash, 4) || ' roles=' || (SELECT string_agg(role || ':' || status, ',' ORDER BY role) FROM account_roles WHERE account_id = a.id)
               FROM accounts a WHERE a.id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'OK rows=1 ACTIVE account_pin=a1a1 roles=CUSTOMER:ACTIVE,FARMER:REVOKED,SERVICE_PROVIDER:ACTIVE');
SELECT chk('X03 after: the farmer session is dead, the provider session still works, Reach survived',
  call_as('anon', 'tok-a1', $$SELECT coalesce(get_current_farmer_id()::text, 'none') || ' / ' || coalesce(get_current_account_id()::text, 'none')$$) || ' ; ' ||
  call_as('anon', 'tok-a1p', $$SELECT get_current_role() || ' radius ' || (get_account_reach('SERVICE_PROVIDER')->>'radius_km')$$), 'none / none ; SERVICE_PROVIDER radius 35');
SELECT chk('X04 standing check after everything: 0 gaps (no credential held twice, none missing)', (SELECT count(*)::text FROM v_identity_integrity_gaps), '0');
SELECT chk('X05 accounts that hold a pin_hash are exactly the people without a farmers row',
  (SELECT count(*) || ' with pin, ' || count(*) FILTER (WHERE EXISTS (SELECT 1 FROM farmers f WHERE f.id = a.id)) || ' of them also farmers' FROM accounts a WHERE a.pin_hash IS NOT NULL), '6 with pin, 0 of them also farmers');
