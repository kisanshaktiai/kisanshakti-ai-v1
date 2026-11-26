-- ═══════════════════════════════════════════════════════════════════════════
-- tests/identity/portal_replay.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Replays, statement shape for statement shape, the writes and reads the three
-- codebases make on farmers, user_profiles, user_sessions and pin_reset_codes:
--   * tenant portal  (kisanshaktiai-tenant-dash, EnhancedFarmerDataService.ts:
--                     createFarmer, comprehensive create, updateFarmer, deleteFarmer)
--   * admin portal   (kisan-command-center-nexus, farmersService.ts: 50-row batches)
--   * farmer app     (_shared/farmer-auth-core.ts: register, createSession, verifyPin,
--                     changePin, requestPinReset)
--
-- run.sh runs this same file on a database WITHOUT the identity migrations and on
-- databases WITH them, and diffs the output. This file therefore never names an
-- identity object; every line it prints must be identical on both sides.
--
-- t(sql) runs one statement as the current role and prints OK rows=N or
-- ERR <sqlstate> <message>. q(sql) prints one value.
-- ═══════════════════════════════════════════════════════════════════════════
\set QUIET on
\pset format unaligned
\pset tuples_only on
\pset fieldsep ' | '

CREATE OR REPLACE FUNCTION public.t(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN
  EXECUTE p_sql; GET DIAGNOSTICS n = ROW_COUNT; RETURN 'OK rows=' || n;
EXCEPTION WHEN OTHERS THEN RETURN 'ERR ' || SQLSTATE || ' ' || left(SQLERRM, 110); END $$;
CREATE OR REPLACE FUNCTION public.q(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; BEGIN EXECUTE p_sql INTO v; RETURN coalesce(v, '(null)');
EXCEPTION WHEN OTHERS THEN RETURN 'ERR ' || SQLSTATE || ' ' || left(SQLERRM, 110); END $$;
GRANT EXECUTE ON FUNCTION public.t(text), public.q(text) TO anon, authenticated, service_role;

\echo '=== TENANT PORTAL, signed in as the tenant admin of tenant A (role authenticated) ==='
SET ROLE authenticated;
SELECT set_config('test.uid', '7a7a7a7a-0000-0000-0000-00000000000a', false) AS v \gset cfg_

SELECT 'R01 createFarmer exactly as sent (own id, .select() = RETURNING *)', t($$
  INSERT INTO farmers (tenant_id, mobile_number, pin_hash, farmer_code, farmer_name, language_preference, metadata,
                       id, total_app_opens, total_queries, created_at, updated_at)
  VALUES ('11111111-1111-1111-1111-111111111111', '0000000500', repeat('5a', 32), 'TST-A-0500', 'Test Farmer R01', 'mr',
          '{"personal_info":{"full_name":"Test Farmer R01","language_preference":"mr"}}',
          'aaaaaaaa-1000-0000-0000-000000000500', 0, 0, now(), now())
  RETURNING *$$);
SELECT 'R02 createFarmer, same row, no RETURNING (own id, unsalted 64-hex pin_hash, personal_info)', t($$
  INSERT INTO farmers (tenant_id, mobile_number, pin_hash, farmer_code, farmer_name, language_preference, metadata,
                       id, total_app_opens, total_queries, created_at, updated_at)
  VALUES ('11111111-1111-1111-1111-111111111111', '0000000501', repeat('5b', 32), 'TST-A-0501', 'Test Farmer R02', 'mr',
          '{"personal_info":{"full_name":"Test Farmer R02","language_preference":"mr"},"address_info":{"village":"Test Village One"}}',
          'aaaaaaaa-1000-0000-0000-000000000501', 0, 0, now(), now())$$);
SELECT 'R03 comprehensive create (database-generated id, 20 columns)', t($$
  INSERT INTO farmers (tenant_id, farmer_code, mobile_number, pin_hash, farmer_name, farming_experience_years, total_land_acres,
                       primary_crops, farm_type, has_irrigation, has_storage, has_tractor, irrigation_type, is_verified,
                       total_app_opens, total_queries, language_preference, preferred_contact_method, notes, metadata)
  VALUES ('11111111-1111-1111-1111-111111111111', 'TST-A-0502', '0000000502', repeat('5c', 32), 'Test Farmer R03', 4, 2.5,
          ARRAY['crop_x','crop_y'], 'mixed', true, false, false, 'drip', false, 0, 0, 'hi', 'mobile', 'replay note',
          '{"personal_info":{"full_name":"Test Farmer R03","language_preference":"hi"},"address_info":{"village":"Test Village Two","taluka":"Test Taluka"},"farming_info":{"has_storage":false},"additional_info":{"notes":"replay note"}}')$$);
SELECT 'R04 insert without pin_hash (legal only with no mobile number)', t($$
  INSERT INTO farmers (tenant_id, farmer_code, farmer_name, id)
  VALUES ('11111111-1111-1111-1111-111111111111', 'TST-A-0503', 'Test Farmer R04', 'aaaaaaaa-1000-0000-0000-000000000503')$$);
SELECT 'R05 insert with a mobile number but without pin_hash', t($$
  INSERT INTO farmers (tenant_id, farmer_code, mobile_number, id)
  VALUES ('11111111-1111-1111-1111-111111111111', 'TST-A-0504', '0000000504', 'aaaaaaaa-1000-0000-0000-000000000504')$$);
SELECT 'R06 insert into tenant B by the admin of tenant A', t($$
  INSERT INTO farmers (tenant_id, farmer_code, mobile_number, pin_hash, id)
  VALUES ('22222222-2222-2222-2222-222222222222', 'TST-B-0505', '0000000505', repeat('5d', 32), 'aaaaaaaa-1000-0000-0000-000000000505')$$);
SELECT 'R07 insert a mobile number another farmer of the tenant already has', t($$
  INSERT INTO farmers (tenant_id, farmer_code, mobile_number, pin_hash, id)
  VALUES ('11111111-1111-1111-1111-111111111111', 'TST-A-0506', '0000000001', repeat('5e', 32), 'aaaaaaaa-1000-0000-0000-000000000506')$$);
SELECT 'R08 updateFarmer exactly as sent (.select() = RETURNING *)', t($$
  UPDATE farmers SET notes = 'edited in portal', updated_at = now()
   WHERE id = 'aaaaaaaa-1000-0000-0000-000000000501' AND tenant_id = '11111111-1111-1111-1111-111111111111' RETURNING *$$);
SELECT 'R09 updateFarmer, no RETURNING (notes and metadata)', t($$
  UPDATE farmers SET notes = 'edited in portal',
         metadata = '{"personal_info":{"full_name":"Test Farmer R02 Edited","language_preference":"mr"}}', updated_at = now()
   WHERE id = 'aaaaaaaa-1000-0000-0000-000000000501' AND tenant_id = '11111111-1111-1111-1111-111111111111'$$);
SELECT 'R10 updateFarmer changing the mobile number to a free one', t($$
  UPDATE farmers SET mobile_number = '0000000599', updated_at = now()
   WHERE id = 'aaaaaaaa-1000-0000-0000-000000000501' AND tenant_id = '11111111-1111-1111-1111-111111111111'$$);
SELECT 'R11 updateFarmer changing the mobile number to one a farmer of the tenant has', t($$
  UPDATE farmers SET mobile_number = '0000000002', updated_at = now()
   WHERE id = 'aaaaaaaa-1000-0000-0000-000000000501' AND tenant_id = '11111111-1111-1111-1111-111111111111'$$);
SELECT 'R12 updateFarmer changing the mobile number to one a farmer of tenant B has', t($$
  UPDATE farmers SET mobile_number = '0000000101', updated_at = now()
   WHERE id = 'aaaaaaaa-1000-0000-0000-000000000501' AND tenant_id = '11111111-1111-1111-1111-111111111111'$$);
SELECT 'R13 updateFarmer resending the unchanged mobile number with other fields', t($$
  UPDATE farmers SET mobile_number = '0000000599', farm_type = 'mixed', is_active = true, updated_at = now()
   WHERE id = 'aaaaaaaa-1000-0000-0000-000000000501' AND tenant_id = '11111111-1111-1111-1111-111111111111'$$);
SELECT 'R14 deleteFarmer through the tenant-admin policy', t($$
  DELETE FROM farmers WHERE id = 'aaaaaaaa-1000-0000-0000-000000000501' AND tenant_id = '11111111-1111-1111-1111-111111111111'$$);
SELECT 'R15 create the same person again (same mobile number, new portal id)', t($$
  INSERT INTO farmers (tenant_id, mobile_number, pin_hash, farmer_code, farmer_name, language_preference, metadata,
                       id, total_app_opens, total_queries, created_at, updated_at)
  VALUES ('11111111-1111-1111-1111-111111111111', '0000000599', repeat('5f', 32), 'TST-A-0507', 'Test Farmer R15', 'mr',
          '{"personal_info":{"full_name":"Test Farmer R15"}}',
          'aaaaaaaa-1000-0000-0000-000000000507', 0, 0, now(), now())$$);
SELECT 'R16 deleteFarmer on a farmer of tenant B by the admin of tenant A', t($$
  DELETE FROM farmers WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001' AND tenant_id = '22222222-2222-2222-2222-222222222222'$$);
SELECT 'R17 portal list read (safe columns) sees only tenant A', q($$
  SELECT count(*) || ' rows, tenants=' || count(DISTINCT tenant_id) FROM farmers$$);
SELECT 'R18 portal read of pin_hash', t($$SELECT pin_hash FROM farmers LIMIT 1$$);
SELECT 'R19 admin-import shape: 50-row batch, no RETURNING', t($$
  INSERT INTO farmers (farmer_code, mobile_number, pin_hash, farmer_name, tenant_id, created_at, updated_at)
  SELECT 'TST-A-B' || g, lpad((1000 + g)::text, 10, '0'), md5(g::text) || md5((g + 1)::text), 'Test Batch Farmer ' || g,
         '11111111-1111-1111-1111-111111111111', now(), now()
    FROM generate_series(1, 50) g$$);
SELECT 'R20 50-row batch where row 50 repeats an existing mobile number (must fail as a whole)', t($$
  INSERT INTO farmers (farmer_code, mobile_number, pin_hash, tenant_id, created_at, updated_at)
  SELECT 'TST-A-C' || g, CASE WHEN g = 50 THEN '0000000001' ELSE lpad((2000 + g)::text, 10, '0') END,
         md5(g::text) || md5((g + 2)::text), '11111111-1111-1111-1111-111111111111', now(), now()
    FROM generate_series(1, 50) g$$);
SELECT 'R21 rows left behind by the failed batch', q($$SELECT count(*) FROM farmers WHERE farmer_code LIKE 'TST-A-C%'$$);

\echo '=== ADMIN PORTAL, signed in user with no tenant membership (role authenticated) ==='
SELECT set_config('test.uid', '5a5a5a5a-0000-0000-0000-000000000001', false) AS v \gset cfg_
SELECT 'R22 50-row batch for tenant B', t($$
  INSERT INTO farmers (farmer_code, mobile_number, pin_hash, tenant_id, created_at, updated_at)
  SELECT 'TST-B-D' || g, lpad((3000 + g)::text, 10, '0'), md5(g::text) || md5((g + 3)::text),
         '22222222-2222-2222-2222-222222222222', now(), now()
    FROM generate_series(1, 50) g$$);
RESET ROLE;

\echo '=== SERVICE ROLE (edge functions, service-key imports) ==='
SET ROLE service_role;
SELECT set_config('test.uid', '', false) AS v \gset cfg_
SELECT 'R23 50-row batch for tenant B with RETURNING *', t($$
  INSERT INTO farmers (farmer_code, mobile_number, pin_hash, tenant_id, created_at, updated_at)
  SELECT 'TST-B-E' || g, lpad((4000 + g)::text, 10, '0'), md5(g::text) || md5((g + 4)::text),
         '22222222-2222-2222-2222-222222222222', now(), now()
    FROM generate_series(1, 50) g
  RETURNING *$$);
SELECT 'R24 farmer app register: farmers insert', t($$
  INSERT INTO farmers (mobile_number, tenant_id, pin_hash, pin_updated_at, language_preference, is_active,
                       app_install_date, total_app_opens, login_attempts, failed_login_attempts, id)
  VALUES ('0000000700', '11111111-1111-1111-1111-111111111111', repeat('7a', 32), now(), 'mr', true,
          now(), 0, 0, 0, 'aaaaaaaa-2000-0000-0000-000000000700')
  RETURNING *$$);
SELECT 'R25 farmer app register: user_profiles upsert (its error is ignored by the app)', t($$
  INSERT INTO user_profiles (id, farmer_id, tenant_id, mobile_number, preferred_language, is_profile_complete)
  VALUES ('aaaaaaaa-2000-0000-0000-000000000700', 'aaaaaaaa-2000-0000-0000-000000000700',
          '11111111-1111-1111-1111-111111111111', '0000000700', 'mr', false)
  ON CONFLICT (id) DO UPDATE SET farmer_id = EXCLUDED.farmer_id, tenant_id = EXCLUDED.tenant_id,
     mobile_number = EXCLUDED.mobile_number, preferred_language = EXCLUDED.preferred_language,
     is_profile_complete = EXCLUDED.is_profile_complete$$);
SELECT 'R26 createSession: retire expired sessions', t($$
  UPDATE user_sessions SET is_active = false
   WHERE user_id = 'aaaaaaaa-2000-0000-0000-000000000700' AND expires_at < now()$$);
SELECT 'R27 createSession: insert the session row', t($$
  INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active, last_activity_at, device_info)
  VALUES ('aaaaaaaa-2000-0000-0000-000000000700', 'sess-r27', public.hash_session_token('tok-r27'),
          now() + interval '30 days', true, now(), '{"ua":"replay","platform":null}')$$);
SELECT 'R28 verifyPin failure: lockout counters', t($$
  UPDATE farmers SET failed_login_attempts = 1, last_failed_login = now() WHERE id = 'aaaaaaaa-2000-0000-0000-000000000700'$$);
SELECT 'R29 verifyPin success: login counters', t($$
  UPDATE farmers SET failed_login_attempts = 0, last_login_at = now(), last_app_open = now(), total_app_opens = 1
   WHERE id = 'aaaaaaaa-2000-0000-0000-000000000700'$$);
SELECT 'R30 changePin: new hash', t($$
  UPDATE farmers SET pin_hash = repeat('7b', 32), pin_updated_at = now() WHERE id = 'aaaaaaaa-2000-0000-0000-000000000700'$$);
SELECT 'R31 requestPinReset: code row', t($$
  INSERT INTO pin_reset_codes (farmer_id, tenant_id, mobile_number, code_hash, expires_at)
  VALUES ('aaaaaaaa-2000-0000-0000-000000000700', '11111111-1111-1111-1111-111111111111', '0000000700', repeat('c0', 32), now() + interval '10 minutes')$$);
SELECT 'R32 payment webhook style: subscription fields on farmers', t($$
  UPDATE farmers SET subscription_status = 'active', subscription_expires_at = now() + interval '6 months'
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'$$);
SELECT 'R33 session for a farmer that existed before the migrations', t($$
  INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'sess-r33', public.hash_session_token('tok-r33'), now() + interval '30 days', true)$$);
SELECT 'R34 delete tenant C (cascades to its two farmers)', t($$DELETE FROM tenants WHERE id = '33333333-3333-3333-3333-333333333333'$$);
RESET ROLE;

\echo '=== FARMER APP BROWSER (role anon + x-session-token header) ==='
SET ROLE anon;
SELECT set_config('request.headers', '{"x-session-token":"tok-a1"}', false) AS v \gset cfg_
SELECT 'R35 farmer A1: verified_session_context()', q($$SELECT farmer_id || ' / ' || tenant_id FROM verified_session_context()$$);
SELECT 'R36 farmer A1: get_current_farmer_id()', q($$SELECT get_current_farmer_id()::text$$);
SELECT 'R37 farmer A1: own profile rows visible', q($$SELECT count(*) || ' rows, mobiles=' || coalesce(string_agg(mobile_number, ',' ORDER BY mobile_number), '') FROM user_profiles$$);
SELECT 'R38 farmer A1: direct read of farmers', t($$SELECT id FROM farmers$$);
SELECT set_config('request.headers', '{"x-session-token":"tok-r27"}', false) AS v \gset cfg_
SELECT 'R39 farmer registered in this replay: verified_session_context()', q($$SELECT farmer_id || ' / ' || tenant_id FROM verified_session_context()$$);
SELECT set_config('request.headers', '{"x-session-token":"tok-r33"}', false) AS v \gset cfg_
SELECT 'R40 farmer A2 (new session): verified_session_context()', q($$SELECT farmer_id || ' / ' || tenant_id FROM verified_session_context()$$);
SELECT set_config('request.headers', '{"x-session-token":"tok-b1"}', false) AS v \gset cfg_
SELECT 'R41 farmer B1: verified_session_context()', q($$SELECT farmer_id || ' / ' || tenant_id FROM verified_session_context()$$);
SELECT 'R42 farmer B1: own profile rows visible', q($$SELECT count(*) || ' rows, mobiles=' || coalesce(string_agg(mobile_number, ',' ORDER BY mobile_number), '') FROM user_profiles$$);
SELECT set_config('request.headers', '{"x-session-token":"tok-a3"}', false) AS v \gset cfg_
SELECT 'R43 deactivated farmer A3: verified_session_context()', q($$SELECT farmer_id::text FROM verified_session_context()$$);
SELECT set_config('request.headers', '{"x-session-token":"no-such-token"}', false) AS v \gset cfg_
SELECT 'R44 unknown token: verified_session_context()', q($$SELECT farmer_id::text FROM verified_session_context()$$);
SELECT set_config('request.headers', '{}', false) AS v \gset cfg_
SELECT 'R45 no token: verified_session_context()', q($$SELECT farmer_id::text FROM verified_session_context()$$);
SELECT 'R46 no token: profile rows visible', q($$SELECT count(*)::text FROM user_profiles$$);
RESET ROLE;

\echo '=== END STATE (table owner; database-generated ids and clock values left out) ==='
\echo '--- farmers'
SELECT coalesce(t.slug, '(no tenant)'), coalesce(f.mobile_number, '(no mobile)'), f.farmer_code, f.farmer_name, f.is_active,
       (f.pin_hash IS NOT NULL) AS has_pin, left(f.pin_hash, 6) AS pin_prefix, f.language_preference, f.notes,
       f.failed_login_attempts, f.total_app_opens, f.subscription_status,
       (f.metadata - 'user_profile_id')::text AS metadata, (f.metadata ? 'user_profile_id') AS has_profile_link
  FROM farmers f LEFT JOIN tenants t ON t.id = f.tenant_id
 ORDER BY 1, 3;
\echo '--- user_profiles'
SELECT coalesce(p.mobile_number, '(no mobile)'), coalesce(f.farmer_code, '(farmer has no code)'), p.full_name, p.display_name, p.village, p.taluka,
       coalesce(p.tenant_id::text, '(null)'), p.preferred_language, p.is_profile_complete,
       (p.metadata - 'farmer_id')::text AS metadata
  FROM user_profiles p LEFT JOIN farmers f ON f.id = p.farmer_id
 ORDER BY 2, 1;
\echo '--- user_sessions'
SELECT s.session_id, coalesce(f.farmer_code, f.mobile_number, '(farmer row gone)'), s.is_active
  FROM user_sessions s LEFT JOIN farmers f ON f.id = s.user_id ORDER BY 1;
\echo '--- counts'
SELECT 'farmers=' || (SELECT count(*) FROM farmers) || ' user_profiles=' || (SELECT count(*) FROM user_profiles)
    || ' farmer_subscriptions=' || (SELECT count(*) FROM farmer_subscriptions)
    || ' user_sessions=' || (SELECT count(*) FROM user_sessions)
    || ' pin_reset_codes=' || (SELECT count(*) FROM pin_reset_codes)
    || ' tenants=' || (SELECT count(*) FROM tenants);
