-- ═══════════════════════════════════════════════════════════════════════════
-- tests/provider/provider_tests.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Tests for the Provider Workspace migrations (20261124140000 … 140400) on a
-- fresh local replica that already has the identity migrations and the cutover
-- (run.sh builds it). Local replica only.
-- Every line is: PASS|FAIL | test | actual | expected. run.sh fails on any FAIL.
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


-- g(token, path): one value out of provider_workspace_get() for that session
CREATE OR REPLACE FUNCTION public.g(p_token text, p_path text) RETURNS text LANGUAGE sql AS $$
  SELECT public.call_as('anon', p_token, format('SELECT coalesce(provider_workspace_get() #>> %L, ''(null)'')', p_path)) $$;
-- w(token, sql): run a provider function, return OK or the error
CREATE OR REPLACE FUNCTION public.w(p_token text, p_sql text) RETURNS text LANGUAGE sql AS $$
  SELECT regexp_replace(public.call_as('anon', p_token, 'SELECT left(''OK'' || coalesce((' || p_sql || ')::text, ''''), 2)'), '^ERR [0-9A-Z]{5} ', 'ERR ') $$;
-- q(sql): read one value in a fresh statement, so it sees what the call before it wrote
CREATE OR REPLACE FUNCTION public.q(p_sql text) RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE v text; BEGIN EXECUTE p_sql INTO v; RETURN coalesce(v, '(null)'); END $$;

-- ── fixtures: two providers and a customer in tenant A, clearly fake ────────
INSERT INTO accounts (id, tenant_id, mobile_number, display_name, language_code, pin_hash) VALUES
  ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000009001', 'Test Provider One',   'mr', repeat('91', 32)),
  ('9c000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000009002', 'Test Customer One',   'hi', repeat('92', 32)),
  ('9a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '0000009003', 'Test Provider Three', 'en', repeat('94', 32));
INSERT INTO account_roles (account_id, tenant_id, role, status, source) VALUES
  ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE'),
  ('9c000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CUSTOMER',         'ACTIVE', 'TEST_FIXTURE'),
  ('9a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', 'ACTIVE', 'TEST_FIXTURE');
INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active, active_role, role_verified_at) VALUES
  ('9a000000-0000-0000-0000-000000000001', 'sess-p1', hash_session_token('tok-p1'), now() + interval '30 days', true, 'SERVICE_PROVIDER', now()),
  ('9c000000-0000-0000-0000-000000000001', 'sess-c1', hash_session_token('tok-c1'), now() + interval '30 days', true, 'CUSTOMER',         now()),
  ('9a000000-0000-0000-0000-000000000003', 'sess-p3', hash_session_token('tok-p3'), now() + interval '30 days', true, 'SERVICE_PROVIDER', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'sess-f1', hash_session_token('tok-f1'), now() + interval '30 days', true, 'FARMER',           now());

\echo '=== who may use the workspace ==='
SELECT chk('W01 no session token is refused', w(NULL, 'provider_workspace_get()'), 'ERR NOT_AUTHENTICATED');
SELECT chk('W02 an unknown token is refused', w('tok-nobody', 'provider_workspace_get()'), 'ERR NOT_AUTHENTICATED');
SELECT chk('W03 a customer session is refused', w('tok-c1', 'provider_workspace_get()'), 'ERR PROVIDER_ROLE_NOT_ACTIVE');
SELECT chk('W04 a farmer session is refused', w('tok-f1', 'provider_workspace_get()'), 'ERR PROVIDER_ROLE_NOT_ACTIVE');
SELECT chk('W05 a farmer session cannot write either', w('tok-f1', $$provider_save_profile('{"provider_type":"INDIVIDUAL","public_name":"X"}')$$), 'ERR PROVIDER_ROLE_NOT_ACTIVE');
SELECT chk('W06 a new provider has no profile and shows OFFLINE',
  g('tok-p1', '{profile}') || ' / ' || g('tok-p1', '{availability,state}') || ' / ' || g('tok-p1', '{services}'), '(null) / OFFLINE / []');
SELECT chk('W07 nothing can be saved before the profile exists',
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_ACRE","base_rate":900}')$$)
  || ' | ' || w('tok-p1', 'provider_set_accepting(false)') || ' | ' || w('tok-p1', 'provider_submit_for_review()'),
  'ERR PROVIDER_PROFILE_MISSING | ERR PROVIDER_PROFILE_MISSING | ERR PROVIDER_PROFILE_MISSING');

\echo '=== profile ==='
SELECT chk('P01 an unknown provider type, an empty name and bad languages are refused',
  w('tok-p1', $$provider_save_profile('{"provider_type":"ADMIN","public_name":"Test Tractor Service"}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_profile('{"provider_type":"INDIVIDUAL","public_name":"   "}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_profile('{"provider_type":"INDIVIDUAL","public_name":"A","languages_spoken":["not a code"]}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_profile('{"provider_type":"INDIVIDUAL","public_name":"A","experience_years":"many"}')$$),
  'ERR PROVIDER_TYPE_INVALID | ERR PROVIDER_NAME_INVALID | ERR PROVIDER_LANGUAGES_INVALID | ERR PROVIDER_INPUT_INVALID');
SELECT chk('P02 a profile is saved; fields a provider must not set are ignored (P4.4)',
  w('tok-p1', $$provider_save_profile('{"provider_type":"INDIVIDUAL","public_name":"  Test Tractor Service  ","experience_years":12,"about_text":"Test about text","about_language":"mr","languages_spoken":["mr","hi","mr"],"listing_status":"LISTED","verification_level":"GOLD","rating_average":5,"rating_count":99,"jobs_completed":500,"account_id":"9a000000-0000-0000-0000-000000000003","tenant_id":"22222222-2222-2222-2222-222222222222"}')$$)
  || ' ' || q($q$SELECT account_id || ' ' || tenant_id || ' [' || public_name || '] ' || listing_status || ' ' || coalesce(verification_level, 'null') || ' ' || coalesce(rating_average::text, 'null') || ' ' || rating_count || ' ' || jobs_completed || ' ' || array_to_string(languages_spoken, ',')
       FROM service_provider_profiles$q$) || ' rows=' || q('SELECT count(*) FROM service_provider_profiles'),
  'OK 9a000000-0000-0000-0000-000000000001 11111111-1111-1111-1111-111111111111 [Test Tractor Service] DRAFT null null 0 0 hi,mr rows=1');
SELECT w('tok-p3', $$provider_save_profile('{"provider_type":"NURSERY","public_name":"Test Nursery Three"}')$$) AS setup \gset

\echo '=== services ==='
SELECT chk('S01 a family, an unknown category, unit, tier and payment method are refused',
  w('tok-p1', $$provider_save_service('{"category_code":"LAND_PREP","title":"T","pricing_unit":"PER_ACRE","base_rate":900}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"NO_SUCH","title":"T","pricing_unit":"PER_ACRE","base_rate":900}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_MOON","base_rate":900}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_ACRE","base_rate":900,"skill_tier":"WIZARD"}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_ACRE","base_rate":900,"payment_methods":["CASH","GOLD"]}')$$),
  'ERR PROVIDER_CATEGORY_INVALID | ERR PROVIDER_CATEGORY_INVALID | ERR PROVIDER_UNIT_INVALID | ERR PROVIDER_SKILL_TIER_INVALID | ERR PROVIDER_PAYMENT_METHOD_INVALID');
SELECT chk('S02 a missing rate, a negative rate, a bad number, an empty title and half a capacity are refused',
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_ACRE"}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_ACRE","base_rate":-5}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_ACRE","base_rate":"cheap"}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"  ","pricing_unit":"PER_ACRE","base_rate":900}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_ACRE","base_rate":900,"capacity_value":8}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"T","pricing_unit":"PER_ACRE","base_rate":900,"season_start_month":13,"season_end_month":2}')$$)
  || ' rows=' || q('SELECT count(*) FROM provider_services'),
  'ERR PROVIDER_RATE_REQUIRED | ERR PROVIDER_INPUT_INVALID | ERR PROVIDER_INPUT_INVALID | ERR PROVIDER_INPUT_INVALID | ERR PROVIDER_INPUT_INVALID | ERR PROVIDER_INPUT_INVALID rows=0');
SELECT chk('S03 a full service is saved with every detail',
  w('tok-p1', $$provider_save_service('{"category_code":"ROTAVATOR","title":"Test rotavator work","description":"Test description","description_language":"mr","pricing_unit":"PER_ACRE","base_rate":900,"min_charge":500,"min_billable_qty":0.5,"advance_percent":20,"includes_operator":true,"includes_fuel":true,"capacity_value":8,"capacity_unit":"PER_ACRE","capacity_period":"DAY","travel_charge":200,"free_travel_km":5,"lead_time_days":2,"same_day_cutoff":"15:30","cancellation_hours":24,"season_start_month":11,"season_end_month":2,"crew_size":2,"skill_tier":"SKILLED","payment_methods":["CASH","UPI"],"status":"REMOVED","account_id":"9a000000-0000-0000-0000-000000000003"}')$$)
  || ' ' || q($q$SELECT account_id || ' ' || category_code || ' ' || pricing_unit || ' ' || base_rate || ' ' || currency || ' ' || min_charge || ' ' || advance_percent || ' ' || includes_operator || includes_fuel || includes_material || ' ' || capacity_value || '/' || capacity_unit || '/' || capacity_period || ' ' || lead_time_days || ' ' || same_day_cutoff || ' ' || season_start_month || '-' || season_end_month || ' ' || array_to_string(payment_methods, ',') || ' ' || status FROM provider_services$q$),
  'OK 9a000000-0000-0000-0000-000000000001 ROTAVATOR PER_ACRE 900.00 INR 500.00 20 truetruefalse 8.00/PER_ACRE/DAY 2 15:30:00 11-2 CASH,UPI ACTIVE');
SELECT id AS svc1 FROM provider_services \gset
SELECT chk('S04 a negotiable service stores no rate',
  w('tok-p1', $$provider_save_service('{"category_code":"GENERAL_LABOUR","title":"Test labour crew","pricing_unit":"NEGOTIABLE","base_rate":123,"crew_size":10}')$$)
  || ' ' || q($q$SELECT coalesce(base_rate::text, 'null') || ' ' || crew_size FROM provider_services WHERE category_code = 'GENERAL_LABOUR'$q$), 'OK null 10');
SELECT chk('S05 another provider cannot change, pause or see this service',
  w('tok-p3', format($$provider_save_service('{"id":"%s","category_code":"ROTAVATOR","title":"Taken","pricing_unit":"PER_ACRE","base_rate":1}')$$, :'svc1')) || ' | ' ||
  w('tok-p3', format($$provider_set_service_status('%s','REMOVED')$$, :'svc1')) || ' | ' || g('tok-p3', '{services}')
  || ' | ' || q(format($q$SELECT title || ' ' || base_rate || ' ' || status FROM provider_services WHERE id = %L$q$, :'svc1')),
  'ERR PROVIDER_SERVICE_NOT_FOUND | ERR PROVIDER_SERVICE_NOT_FOUND | [] | Test rotavator work 900.00 ACTIVE');
SELECT chk('S06 the owner updates, pauses and resumes it; a bad status is refused',
  w('tok-p1', format($$provider_save_service('{"id":"%s","category_code":"ROTAVATOR","title":"Test rotavator work","pricing_unit":"PER_HOUR","base_rate":1100}')$$, :'svc1')) || ' ' ||
  q(format($q$SELECT pricing_unit || ' ' || base_rate || ' ' || coalesce(min_charge::text, 'null') FROM provider_services WHERE id = %L$q$, :'svc1')) || ' | ' ||
  w('tok-p1', format($$provider_set_service_status('%s','PAUSED')$$, :'svc1')) || ' ' || q(format('SELECT status FROM provider_services WHERE id = %L', :'svc1')) || ' | ' ||
  w('tok-p1', format($$provider_set_service_status('%s','LISTED')$$, :'svc1')) || ' | ' ||
  w('tok-p1', format($$provider_set_service_status('%s','ACTIVE')$$, :'svc1')),
  'OK PER_HOUR 1100.00 null | OK PAUSED | ERR PROVIDER_STATUS_INVALID | OK');
UPDATE system_config SET config_value = config_value || '{"max_services": 2}' WHERE config_key = 'provider_workspace_policy';
SELECT chk('S07 the limit on services holds (set to 2 for this test)',
  w('tok-p1', $$provider_save_service('{"category_code":"PLOUGHING","title":"Third","pricing_unit":"PER_ACRE","base_rate":1}')$$) || ' rows=' || q($q$SELECT count(*) FROM provider_services WHERE account_id = '9a000000-0000-0000-0000-000000000001'$q$),
  'ERR PROVIDER_LIMIT_REACHED rows=2');
UPDATE system_config SET config_value = config_value || '{"max_services": 50}' WHERE config_key = 'provider_workspace_policy';
SELECT chk('S08 a removed service is gone from the workspace, kept in the table, and cannot be edited again',
  w('tok-p1', $$provider_save_service('{"category_code":"PLOUGHING","title":"To remove","pricing_unit":"PER_ACRE","base_rate":1}')$$) || ' ' ||
  w('tok-p1', format($$provider_set_service_status('%s','REMOVED')$$, q($q$SELECT id FROM provider_services WHERE title = 'To remove'$q$))) || ' ' ||
  w('tok-p1', format($$provider_set_service_status('%s','ACTIVE')$$, q($q$SELECT id FROM provider_services WHERE title = 'To remove'$q$))) ||
  ' shown=' || call_as('anon', 'tok-p1', $$SELECT jsonb_array_length(provider_workspace_get() -> 'services')::text$$) || ' stored=' || q($q$SELECT count(*) FROM provider_services WHERE account_id = '9a000000-0000-0000-0000-000000000001'$q$),
  'OK OK ERR PROVIDER_SERVICE_NOT_FOUND shown=2 stored=3');
UPDATE system_config SET config_value = config_value - 'timezone' WHERE config_key = 'provider_workspace_policy';
SELECT chk('S09 an incomplete policy row stops every function (nothing falls back to a constant)', w('tok-p1', 'provider_workspace_get()'), 'ERR PROVIDER_POLICY_MISSING');
UPDATE system_config SET config_value = config_value || '{"timezone": "Asia/Kolkata"}' WHERE config_key = 'provider_workspace_policy';

\echo '=== working hours, blackouts and the availability state (D13) ==='
SELECT chk('H01 bad working hours are refused',
  w('tok-p1', $$provider_set_working_hours('[{"weekday":1,"is_working":true,"start_time":"18:00","end_time":"07:00"}]')$$) || ' | ' ||
  w('tok-p1', $$provider_set_working_hours('[{"weekday":1,"is_working":true,"start_time":"07:00","end_time":"18:00"},{"weekday":1,"is_working":false}]')$$) || ' | ' ||
  w('tok-p1', $$provider_set_working_hours('[{"weekday":9,"is_working":true,"start_time":"07:00","end_time":"18:00"}]')$$) || ' | ' ||
  w('tok-p1', $$provider_set_working_hours('[{"weekday":2,"is_working":true}]')$$) || ' | ' || w('tok-p1', $$provider_set_working_hours('{}')$$),
  'ERR PROVIDER_HOURS_INVALID | ERR PROVIDER_HOURS_INVALID | ERR PROVIDER_HOURS_INVALID | ERR PROVIDER_HOURS_INVALID | ERR PROVIDER_HOURS_INVALID');
SELECT chk('H02 with all seven days open the provider is AVAILABLE today',
  w('tok-p1', $$provider_set_working_hours('[{"weekday":0,"is_working":true,"start_time":"00:00","end_time":"23:59:59"},{"weekday":1,"is_working":true,"start_time":"00:00","end_time":"23:59:59"},{"weekday":2,"is_working":true,"start_time":"00:00","end_time":"23:59:59"},{"weekday":3,"is_working":true,"start_time":"00:00","end_time":"23:59:59"},{"weekday":4,"is_working":true,"start_time":"00:00","end_time":"23:59:59"},{"weekday":5,"is_working":true,"start_time":"00:00","end_time":"23:59:59"},{"weekday":6,"is_working":true,"start_time":"00:00","end_time":"23:59:59"}]')$$)
  || ' ' || g('tok-p1', '{availability,state}') || ' ' || g('tok-p1', '{availability,next_free_date}'),
  'OK AVAILABLE ' || (now() AT TIME ZONE 'Asia/Kolkata')::date);
SELECT chk('H03 the availability a provider is shown holds a state and a date and nothing else (P4.3)',
  call_as('anon', 'tok-p1', $$SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(provider_workspace_get() -> 'availability') k$$), 'next_free_date,state');
SELECT chk('H04 the function farmers will be served from returns exactly two columns: state, next_free_date',
  (SELECT array_to_string(proargnames[2:3], ',') || ' out=' || cardinality(proallargtypes) - 1 FROM pg_proc WHERE proname = 'provider_availability'), 'state,next_free_date out=2');
SELECT chk('H05 a blackout over today and the next two days shows BUSY until the day after',
  w('tok-p1', format($$provider_add_blackout(%L, %L, 'PERSONAL')$$, ((now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp AT TIME ZONE 'Asia/Kolkata', ((now() AT TIME ZONE 'Asia/Kolkata')::date + 3)::timestamp AT TIME ZONE 'Asia/Kolkata'))
  || ' ' || g('tok-p1', '{availability,state}') || ' ' || g('tok-p1', '{availability,next_free_date}'),
  'OK BUSY ' || ((now() AT TIME ZONE 'Asia/Kolkata')::date + 3));
SELECT chk('H06 an overlapping, a backwards, a past and an over-long blackout are refused',
  w('tok-p1', format($$provider_add_blackout(%L, %L)$$, now() + interval '1 day', now() + interval '5 days')) || ' | ' ||
  w('tok-p1', format($$provider_add_blackout(%L, %L)$$, now() + interval '9 days', now() + interval '8 days')) || ' | ' ||
  w('tok-p1', format($$provider_add_blackout(%L, %L)$$, now() - interval '9 days', now() - interval '8 days')) || ' | ' ||
  w('tok-p1', format($$provider_add_blackout(%L, %L)$$, now() + interval '10 days', now() + interval '200 days')) || ' | ' ||
  w('tok-p1', format($$provider_add_blackout(%L, %L, 'with spaces')$$, now() + interval '10 days', now() + interval '11 days'))
  || ' rows=' || q('SELECT count(*) FROM provider_blackouts'),
  'ERR PROVIDER_BLACKOUT_OVERLAP | ERR PROVIDER_BLACKOUT_INVALID | ERR PROVIDER_BLACKOUT_INVALID | ERR PROVIDER_BLACKOUT_INVALID | ERR PROVIDER_BLACKOUT_INVALID rows=1');
SELECT chk('H07 switching off shows NOT_ACCEPTING; switching on returns to the derived state',
  w('tok-p1', 'provider_set_accepting(false)') || ' ' || g('tok-p1', '{availability,state}') || ' ' || g('tok-p1', '{availability,next_free_date}') || ' | ' ||
  w('tok-p1', 'provider_set_accepting(true)') || ' ' || g('tok-p1', '{availability,state}'),
  'OK NOT_ACCEPTING (null) | OK BUSY');
SELECT chk('H08 another provider cannot lift this blackout; the owner can, and is AVAILABLE again',
  w('tok-p3', format($$provider_cancel_blackout('%s')$$, (SELECT id FROM provider_blackouts))) || ' | ' ||
  w('tok-p1', format($$provider_cancel_blackout('%s')$$, (SELECT id FROM provider_blackouts))) || ' ' || g('tok-p1', '{availability,state}') || ' ' || g('tok-p1', '{blackouts}')
  || ' kept=' || q('SELECT count(*) FROM provider_blackouts WHERE cancelled_at IS NOT NULL'),
  'ERR PROVIDER_BLACKOUT_NOT_FOUND | OK AVAILABLE [] kept=1');
-- a confirmed job (written by the later task as a JOB blackout) makes the provider busy
INSERT INTO provider_blackouts (id, account_id, period, source)
VALUES ('b0000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001',
        tstzrange(((now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp AT TIME ZONE 'Asia/Kolkata', ((now() AT TIME ZONE 'Asia/Kolkata')::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'), 'JOB');
SELECT chk('H09 a job blackout shows BUSY until tomorrow, cannot be lifted by the provider, and the provider cannot book over it (P4.4)',
  g('tok-p1', '{availability,state}') || ' ' || g('tok-p1', '{availability,next_free_date}') || ' | ' ||
  w('tok-p1', $$provider_cancel_blackout('b0000000-0000-0000-0000-000000000001')$$) || ' | ' ||
  w('tok-p1', 'provider_set_accepting(true)') || ' ' || g('tok-p1', '{availability,state}'),
  'BUSY ' || ((now() AT TIME ZONE 'Asia/Kolkata')::date + 1) || ' | ERR PROVIDER_BLACKOUT_NOT_FOUND | OK BUSY');
UPDATE provider_blackouts SET cancelled_at = now() WHERE id = 'b0000000-0000-0000-0000-000000000001';
SELECT chk('H10 with only tomorrow''s weekday closed and today open the provider is AVAILABLE; with only today closed, BUSY until tomorrow',
  (SELECT w('tok-p1', format($$provider_set_working_hours('[{"weekday":%s,"is_working":false}]')$$, extract(dow FROM (now() AT TIME ZONE 'Asia/Kolkata')::date)::int))) || ' ' ||
  g('tok-p1', '{availability,state}') || ' ' || g('tok-p1', '{availability,next_free_date}'),
  'OK BUSY ' || ((now() AT TIME ZONE 'Asia/Kolkata')::date + 1));
SELECT w('tok-p1', format($$provider_set_working_hours('[{"weekday":%s,"is_working":true,"start_time":"00:00","end_time":"23:59:59"}]')$$, extract(dow FROM (now() AT TIME ZONE 'Asia/Kolkata')::date)::int)) AS setup \gset

\echo '=== equipment ==='
SELECT chk('E01 an unknown type, an undefined attribute and a wrong kind of value are refused',
  w('tok-p1', $$provider_save_equipment('{"equipment_type":"SPACESHIP"}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_equipment('{"equipment_type":"TRACTOR","attributes":{"OWNER_NAME":"x"}}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_equipment('{"equipment_type":"TRACTOR","attributes":{"POWER_HP":"fifty"}}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_equipment('{"equipment_type":"TRACTOR","ownership":"STOLEN"}')$$) || ' | ' ||
  w('tok-p1', $$provider_save_equipment('{"equipment_type":"TRACTOR","verified_at":"2026-01-01","year_made":1066}')$$),
  'ERR PROVIDER_EQUIPMENT_TYPE_INVALID | ERR PROVIDER_EQUIPMENT_ATTRIBUTE_INVALID | ERR PROVIDER_EQUIPMENT_ATTRIBUTE_INVALID | ERR PROVIDER_INPUT_INVALID | ERR PROVIDER_INPUT_INVALID');
SELECT chk('E02 equipment is saved; only the last four characters of the registration are kept, and verified_at cannot be set',
  w('tok-p1', $$provider_save_equipment('{"equipment_type":"TRACTOR","make":"Test Make","model":"T-50","year_made":2020,"attributes":{"POWER_HP":50,"FOUR_WHEEL_DRIVE":true},"registration":"zz-09 ab 1234","verified_at":"2026-01-01","verified_by":"9a000000-0000-0000-0000-000000000001"}')$$)
  || ' ' || q($q$SELECT registration_last4 || ' ' || (attributes ->> 'POWER_HP') || ' ' || coalesce(verified_at::text, 'null') || ' ' || (to_jsonb(e)::text ~* 'zz|09AB|09 ab')::text FROM provider_equipment e$q$),
  'OK 1234 50 null false');
SELECT id AS eq1 FROM provider_equipment \gset
SELECT chk('E03 a service can use the provider''s own equipment but not another provider''s',
  w('tok-p1', format($$provider_save_service('{"id":"%s","category_code":"ROTAVATOR","title":"Test rotavator work","pricing_unit":"PER_HOUR","base_rate":1100,"equipment_id":"%s"}')$$, :'svc1', :'eq1')) || ' | ' ||
  w('tok-p3', format($$provider_save_service('{"category_code":"SEEDLING_SUPPLY","title":"Test seedlings","pricing_unit":"PER_PIECE","base_rate":2,"equipment_id":"%s"}')$$, :'eq1')) || ' | ' ||
  w('tok-p3', format($$provider_remove_equipment('%s')$$, :'eq1')),
  'OK | ERR PROVIDER_EQUIPMENT_INVALID | ERR PROVIDER_EQUIPMENT_NOT_FOUND');
SELECT chk('E04 removing equipment keeps the row, hides it and unlinks the service',
  w('tok-p1', format($$provider_remove_equipment('%s')$$, :'eq1')) || ' ' || g('tok-p1', '{equipment}') || ' ' ||
  q(format('SELECT status FROM provider_equipment WHERE id = %L', :'eq1')) || ' ' || q(format($q$SELECT coalesce(equipment_id::text, 'null') FROM provider_services WHERE id = %L$q$, :'svc1')),
  'OK [] REMOVED null');

\echo '=== nursery store ==='
SELECT chk('N01 an unknown crop, kind and a per-area unit are refused',
  w('tok-p3', $$nursery_save_product('{"crop_id":"c0000000-0000-0000-0000-00000000dead","item_kind":"SEEDLING","pricing_unit":"PER_PIECE","price":2}')$$) || ' | ' ||
  w('tok-p3', $$nursery_save_product('{"crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"UNICORN","pricing_unit":"PER_PIECE","price":2}')$$) || ' | ' ||
  w('tok-p3', $$nursery_save_product('{"crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_ACRE","price":2}')$$) || ' | ' ||
  w('tok-p3', $$nursery_save_product('{"crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_PIECE"}')$$),
  'ERR NURSERY_CROP_INVALID | ERR NURSERY_KIND_INVALID | ERR PROVIDER_UNIT_INVALID | ERR NURSERY_PRICE_REQUIRED');
SELECT chk('N02 a product and a batch are saved',
  w('tok-p3', $$nursery_save_product('{"crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_TRAY","price":150,"min_order_qty":5}')$$) || ' ' ||
  w('tok-p3', format($$nursery_save_batch('{"product_id":"%s","total_qty":100,"ready_date":"2027-01-15"}')$$, q('SELECT id FROM nursery_products')))
  || ' ' || g('tok-p3', '{nursery_products,0,batches,0,total_qty}') || ' ' || g('tok-p3', '{nursery_products,0,batches,0,reserved_qty}'),
  'OK OK 100 0');
UPDATE nursery_batches SET reserved_qty = 40;       -- what the reservation functions of the later task will do
SELECT chk('N03 stock cannot be cut below what is reserved, by the provider or by anything else (P4.5)',
  w('tok-p3', format($$nursery_save_batch('{"id":"%s","total_qty":30,"ready_date":"2027-01-15"}')$$, (SELECT id FROM nursery_batches))) || ' | ' ||
  w('tok-p3', format($$nursery_save_batch('{"id":"%s","total_qty":40,"ready_date":"2027-01-20","reserved_qty":0}')$$, (SELECT id FROM nursery_batches))) || ' ' ||
  q($q$SELECT total_qty || '/' || reserved_qty FROM nursery_batches$q$) || ' | ' ||
  run_as('service_role', NULL, 'UPDATE nursery_batches SET reserved_qty = 41') || ' | ' ||
  left(run_as('service_role', NULL, 'UPDATE nursery_batches SET reserved_qty = -1'), 9),
  'ERR NURSERY_BATCH_BELOW_RESERVED | OK 40/40 | ERR 23514 new row for relation "nursery_batches" violates check constraint "nursery_batches_no_oversell" | ERR 23514');
SELECT chk('N04 another provider cannot add stock to, or change, this nursery',
  w('tok-p1', format($$nursery_save_batch('{"product_id":"%s","total_qty":5,"ready_date":"2027-01-15"}')$$, (SELECT id FROM nursery_products))) || ' | ' ||
  w('tok-p1', format($$nursery_save_batch('{"id":"%s","total_qty":999,"ready_date":"2027-01-15"}')$$, (SELECT id FROM nursery_batches))) || ' | ' ||
  w('tok-p1', format($$nursery_save_product('{"id":"%s","crop_id":"c0000000-0000-0000-0000-000000000002","item_kind":"GRAFT","pricing_unit":"PER_PIECE","price":1}')$$, (SELECT id FROM nursery_products)))
  || ' ' || g('tok-p1', '{nursery_products}'),
  'ERR NURSERY_PRODUCT_NOT_FOUND | ERR NURSERY_BATCH_NOT_FOUND | ERR NURSERY_PRODUCT_NOT_FOUND []');

\echo '=== listing ==='
SELECT chk('L01 a provider without an area set cannot ask to be listed',
  w('tok-p1', 'provider_submit_for_review()') || ' ' || g('tok-p1', '{reach_set}'), 'ERR PROVIDER_REACH_NOT_SET false');
SELECT chk('L02 a provider with no active service, or no working day, cannot ask to be listed',
  w('tok-p3', 'provider_submit_for_review()') || ' | ' ||
  w('tok-p3', $$provider_save_service('{"category_code":"SEEDLING_SUPPLY","title":"Test seedlings","pricing_unit":"PER_PIECE","base_rate":2}')$$) || ' ' || w('tok-p3', 'provider_submit_for_review()'),
  'ERR PROVIDER_NO_ACTIVE_SERVICE | OK ERR PROVIDER_HOURS_NOT_SET');
SELECT call_as('anon', 'tok-p1', $$SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25) ->> 'is_set'$$) AS setup \gset
SELECT chk('L03 with profile, service, hours and area the listing goes to PENDING_REVIEW, and asking twice changes nothing',
  w('tok-p1', 'provider_submit_for_review()') || ' ' || g('tok-p1', '{profile,listing_status}') || ' ' || w('tok-p1', 'provider_submit_for_review()') || ' ' || g('tok-p1', '{profile,listing_status}'),
  'OK PENDING_REVIEW OK PENDING_REVIEW');
SELECT chk('L04 no browser role can run the reviewer function or the internal ones',
  left(call_as('anon', 'tok-p1', $$SELECT provider_review_listing('9a000000-0000-0000-0000-000000000001', 'LIST')$$), 9) || ' ' ||
  left(call_as('authenticated', 'tok-p1', $$SELECT provider_review_listing('9a000000-0000-0000-0000-000000000001', 'LIST')$$), 9) || ' ' ||
  left(call_as('anon', 'tok-p1', $$SELECT state FROM provider_availability('9a000000-0000-0000-0000-000000000003')$$), 9) || ' ' ||
  left(call_as('anon', 'tok-p1', $$SELECT provider_workspace_policy()::text$$), 9) || ' ' ||
  left(call_as('anon', 'tok-p1', $$SELECT account_id::text FROM provider_session_account()$$), 9) || ' ' || g('tok-p1', '{profile,listing_status}'),
  'ERR 42501 ERR 42501 ERR 42501 ERR 42501 ERR 42501 PENDING_REVIEW');
SELECT chk('L05 the reviewer lists, suspends and re-lists; moves that are not allowed are refused',
  call_as('service_role', NULL, $$SELECT provider_review_listing('9a000000-0000-0000-0000-000000000001', 'LIST')$$) || ' ' ||
  right(call_as('service_role', NULL, $$SELECT provider_review_listing('9a000000-0000-0000-0000-000000000001', 'RETURN')$$), 27) || ' ' ||
  call_as('service_role', NULL, $$SELECT provider_review_listing('9a000000-0000-0000-0000-000000000001', 'SUSPEND', 'UNDER_REVIEW')$$) || ' ' ||
  call_as('service_role', NULL, $$SELECT provider_review_listing('9a000000-0000-0000-0000-000000000001', 'LIST')$$) || ' ' ||
  right(call_as('service_role', NULL, $$SELECT provider_review_listing('9a000000-0000-0000-0000-000000000001', 'MAKE_ADMIN')$$), 27),
  'LISTED PROVIDER_REVIEW_NOT_ALLOWED SUSPENDED LISTED PROVIDER_REVIEW_NOT_ALLOWED');
SELECT chk('L06 a listed provider saving their profile again stays LISTED and cannot change it themselves',
  w('tok-p1', $$provider_save_profile('{"provider_type":"BUSINESS","public_name":"Test Tractor Service","listing_status":"DRAFT"}')$$) || ' ' ||
  g('tok-p1', '{profile,listing_status}') || ' ' || g('tok-p1', '{profile,provider_type}'), 'OK LISTED BUSINESS');

\echo '=== the tables are closed to the browser (P4.9) ==='
SELECT chk('T01 anon and authenticated, with a valid provider token, can do nothing directly on the seven tables',
  (SELECT count(*) FILTER (WHERE r LIKE 'ERR 42501%') || ' of ' || count(*) FROM (
     SELECT call_as(ro, 'tok-p1', format(q, tb)) AS r
       FROM unnest(ARRAY['anon', 'authenticated']) ro,
            unnest(ARRAY['service_provider_profiles', 'provider_services', 'provider_working_hours', 'provider_blackouts', 'provider_equipment', 'nursery_products', 'nursery_batches']) tb,
            unnest(ARRAY['SELECT count(*)::text FROM %I', 'WITH x AS (UPDATE %I SET updated_at = now() RETURNING 1) SELECT count(*)::text FROM x',
                         'WITH x AS (DELETE FROM %I RETURNING 1) SELECT count(*)::text FROM x', 'WITH x AS (INSERT INTO %I DEFAULT VALUES RETURNING 1) SELECT count(*)::text FROM x']) q
      WHERE NOT (tb = 'provider_blackouts' AND q LIKE '%updated_at%')) t), '54 of 54');
SELECT chk('T02 no browser role holds any privilege on them, and DELETE and TRUNCATE are held by no app role',
  (SELECT count(*)::text FROM information_schema.role_table_grants WHERE table_schema = 'public'
     AND table_name IN ('service_provider_profiles', 'provider_services', 'provider_working_hours', 'provider_blackouts', 'provider_equipment', 'nursery_products', 'nursery_batches')
     AND (grantee IN ('anon', 'authenticated', 'PUBLIC') OR (grantee = 'service_role' AND privilege_type IN ('DELETE', 'TRUNCATE')))), '0');
SELECT chk('T03 lookups: anyone reads active rows, nobody in the browser writes them, an inactive row is hidden',
  call_as('anon', NULL, 'SELECT count(*)::text FROM service_categories WHERE parent_code IS NULL') || ' ' ||
  left(run_as('anon', 'tok-p1', $$UPDATE pricing_units SET label_en = 'x'$$), 9) || ' ' ||
  left(run_as('authenticated', 'tok-p1', $$INSERT INTO service_categories (code, label_en) VALUES ('HACK', 'x')$$), 9) || ' ' ||
  run_as('service_role', NULL, $$UPDATE provider_payment_methods SET is_active = false WHERE code = 'BANK_TRANSFER'$$) || ' ' ||
  call_as('anon', NULL, 'SELECT count(*)::text FROM provider_payment_methods') || ' ' ||
  w('tok-p1', format($$provider_save_service('{"id":"%s","category_code":"ROTAVATOR","title":"Test rotavator work","pricing_unit":"PER_HOUR","base_rate":1100,"payment_methods":["BANK_TRANSFER"]}')$$, :'svc1')),
  '16 ERR 42501 ERR 42501 OK rows=1 3 ERR PROVIDER_PAYMENT_METHOD_INVALID');

\echo '=== the catalogue and the Service Map are data (P4.7, P4.10) ==='
SELECT chk('C01 every service has an active family, and no family is offered as a service',
  (SELECT count(*) FILTER (WHERE c.parent_code IS NOT NULL AND p.code IS NULL) || ' orphans, ' || count(*) FILTER (WHERE p.parent_code IS NOT NULL) || ' three-level rows'
     FROM service_categories c LEFT JOIN service_categories p ON p.code = c.parent_code), '0 orphans, 0 three-level rows');
SELECT chk('C02 the Service Map lists exactly the activity codes the schedule_tasks constraint allows',
  (SELECT coalesce(string_agg(x, ',' ORDER BY x), '(same)') FROM (
     (SELECT m[1] AS x FROM regexp_matches((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'schedule_tasks_task_type_check'), '''([a-z_]+)''::text', 'g') m
      EXCEPT SELECT task_type FROM service_map_activities)
     UNION ALL
     (SELECT task_type FROM service_map_activities
      EXCEPT SELECT m[1] FROM regexp_matches((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'schedule_tasks_task_type_check'), '''([a-z_]+)''::text', 'g') m)) d),
  '(same)');
SELECT chk('C03 every mapped code has a map row, no unmapped code has one, and every mapped category is active',
  (SELECT count(*)::text FROM service_map_activities a WHERE a.is_mapped <> EXISTS (SELECT 1 FROM task_type_service_map m WHERE m.task_type = a.task_type AND m.is_active))
  || ' ' || (SELECT count(*)::text FROM task_type_service_map m JOIN service_categories c ON c.code = m.category_code WHERE NOT c.is_active)
  || ' ' || (SELECT count(*) FILTER (WHERE is_mapped) || '/' || count(*) FILTER (WHERE NOT is_mapped) FROM service_map_activities), '0 0 16/3');
SELECT chk('C04 the new flag exists and is off', (SELECT is_enabled::text || ' ' || rollout_percentage FROM feature_flags WHERE flag_name = 'provider_workspace'), 'false 0');

\echo '=== the flag check the app uses (provider_workspace_enabled) ==='
SELECT chk('F01 flag off: false for a provider, a customer and no session',
  call_as('anon', 'tok-p1', 'SELECT provider_workspace_enabled()') || ' ' || call_as('anon', 'tok-c1', 'SELECT provider_workspace_enabled()') || ' ' || call_as('anon', NULL, 'SELECT provider_workspace_enabled()'),
  'false false false');
UPDATE feature_flags SET is_enabled = true, target_tenants = ARRAY['22222222-2222-2222-2222-222222222222']::uuid[] WHERE flag_name = 'provider_workspace';
SELECT chk('F02 flag on for another tenant only: still false', q($$SELECT call_as('anon', 'tok-p1', 'SELECT provider_workspace_enabled()')$$), 'false');
UPDATE feature_flags SET target_tenants = ARRAY['11111111-1111-1111-1111-111111111111']::uuid[] WHERE flag_name = 'provider_workspace';
SELECT chk('F03 flag on for this tenant: true with a session, false without one',
  q($$SELECT call_as('anon', 'tok-p1', 'SELECT provider_workspace_enabled()') || ' ' || call_as('anon', NULL, 'SELECT provider_workspace_enabled()') || ' ' || call_as('anon', 'tok-nobody', 'SELECT provider_workspace_enabled()')$$),
  'true false false');
UPDATE feature_flags SET flag_status = 'archived' WHERE flag_name = 'provider_workspace';
SELECT chk('F04 a flag that is not active is off', q($$SELECT call_as('anon', 'tok-p1', 'SELECT provider_workspace_enabled()')$$), 'false');
UPDATE feature_flags SET flag_status = 'active', expires_at = now() - interval '1 minute' WHERE flag_name = 'provider_workspace';
SELECT chk('F05 an expired flag is off', q($$SELECT call_as('anon', 'tok-p1', 'SELECT provider_workspace_enabled()')$$), 'false');
UPDATE feature_flags SET expires_at = NULL, target_tenants = '{}'::uuid[], rollout_percentage = 100 WHERE flag_name = 'provider_workspace';
SELECT chk('F06 rollout 100 turns it on for every tenant', q($$SELECT call_as('anon', 'tok-p1', 'SELECT provider_workspace_enabled()')$$), 'true');
UPDATE feature_flags SET is_enabled = false, rollout_percentage = 0 WHERE flag_name = 'provider_workspace';
SELECT chk('F07 switched off again: false', q($$SELECT call_as('anon', 'tok-p1', 'SELECT provider_workspace_enabled()')$$), 'false');

\echo '=== nursery store: variety, description, photos (20261124140500) ==='
SELECT id AS np1 FROM nursery_products WHERE account_id = '9a000000-0000-0000-0000-000000000003' LIMIT 1 \gset
SELECT chk('N01 a variety must be a seed variety of the same crop; a local name is kept only without one',
  w('tok-p3', format($$nursery_save_product('{"id":"%s","crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_TRAY","price":150,"variety_id":"d0000000-0000-0000-0000-000000000002"}')$$, :'np1')) || ' | ' ||
  w('tok-p3', format($$nursery_save_product('{"id":"%s","crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_TRAY","price":150,"variety_id":"d0000000-0000-0000-0000-000000000009"}')$$, :'np1')) || ' | ' ||
  w('tok-p3', format($$nursery_save_product('{"id":"%s","crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_TRAY","price":150,"variety_id":"d0000000-0000-0000-0000-000000000001","variety_name_local":"ignored"}')$$, :'np1')) || ' ' ||
  q(format($q$SELECT coalesce(variety_id::text, 'none') || '/' || coalesce(variety_name_local, 'none') FROM nursery_products WHERE id = %L$q$, :'np1')) || ' | ' ||
  w('tok-p3', format($$nursery_save_product('{"id":"%s","crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_TRAY","price":150,"variety_name_local":"  Local Name  "}')$$, :'np1')) || ' ' ||
  q(format($q$SELECT coalesce(variety_id::text, 'none') || '/' || coalesce(variety_name_local, 'none') FROM nursery_products WHERE id = %L$q$, :'np1')),
  'ERR NURSERY_VARIETY_INVALID | ERR NURSERY_VARIETY_INVALID | OK d0000000-0000-0000-0000-000000000001/none | OK none/Local Name');
SELECT chk('N02 the description keeps its language, is trimmed, and is capped at 600',
  w('tok-p3', format($$nursery_save_product('{"id":"%s","crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_TRAY","price":150,"description":" Healthy plants ","description_language":"mr"}')$$, :'np1')) || ' ' ||
  q(format($q$SELECT description || '/' || description_language FROM nursery_products WHERE id = %L$q$, :'np1')) || ' | ' ||
  w('tok-p3', format($$nursery_save_product('{"id":"%s","crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_TRAY","price":150,"description":"%s","description_language":"mr"}')$$, :'np1', repeat('x', 601))) || ' | ' ||
  w('tok-p3', format($$nursery_save_product('{"id":"%s","crop_id":"c0000000-0000-0000-0000-000000000001","item_kind":"SEEDLING","pricing_unit":"PER_TRAY","price":150,"description":"","description_language":"mr"}')$$, :'np1')) || ' ' ||
  q(format($q$SELECT coalesce(description, 'none') || '/' || coalesce(description_language, 'none') FROM nursery_products WHERE id = %L$q$, :'np1')),
  'OK Healthy plants/mr | ERR PROVIDER_INPUT_INVALID | OK none/none');
SELECT chk('N03 photos: only the service role attaches, only under the product''s own folder, at most three, same path once',
  left(call_as('anon', 'tok-p3', format($$SELECT nursery_attach_photo('9a000000-0000-0000-0000-000000000003', %L, 'x')::text$$, :'np1')), 9) || ' | ' ||
  call_as('service_role', NULL, format($$SELECT nursery_attach_photo('9a000000-0000-0000-0000-000000000003', %L, '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000001/%s/abcdefgh.jpg')::text$$, :'np1', :'np1')) || ' | ' ||
  call_as('service_role', NULL, format($$SELECT nursery_attach_photo('9a000000-0000-0000-0000-000000000001', %L, '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000001/%s/abcdefgh.jpg')::text$$, :'np1', :'np1')) || ' | ' ||
  call_as('service_role', NULL, format($$SELECT jsonb_array_length(nursery_attach_photo('9a000000-0000-0000-0000-000000000003', %L, '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000003/%s/photo-0001.jpg'))::text$$, :'np1', :'np1')) || ' ' ||
  call_as('service_role', NULL, format($$SELECT jsonb_array_length(nursery_attach_photo('9a000000-0000-0000-0000-000000000003', %L, '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000003/%s/photo-0001.jpg'))::text$$, :'np1', :'np1')) || ' ' ||
  call_as('service_role', NULL, format($$SELECT jsonb_array_length(nursery_attach_photo('9a000000-0000-0000-0000-000000000003', %L, '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000003/%s/photo-0002.jpg'))::text$$, :'np1', :'np1')) || ' ' ||
  call_as('service_role', NULL, format($$SELECT jsonb_array_length(nursery_attach_photo('9a000000-0000-0000-0000-000000000003', %L, '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000003/%s/photo-0003.jpg'))::text$$, :'np1', :'np1')) || ' ' ||
  regexp_replace(call_as('service_role', NULL, format($$SELECT nursery_attach_photo('9a000000-0000-0000-0000-000000000003', %L, '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000003/%s/photo-0004.jpg')::text$$, :'np1', :'np1')), '^ERR [0-9A-Z]{5} ', 'ERR ') || ' | ' ||
  g('tok-p3', '{nursery_products,0,photo_paths,2}'),
  'ERR 42501 | ERR P0001 NURSERY_PHOTO_PATH_INVALID | ERR P0001 NURSERY_PRODUCT_NOT_FOUND | 1 1 2 3 ERR NURSERY_PHOTO_LIMIT | 11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000003/' || :'np1' || '/photo-0003.jpg');
SELECT chk('N04 the owner removes a photo; another provider cannot; the array shrinks',
  w('tok-p1', format($$nursery_remove_photo('%s', '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000003/%s/photo-0003.jpg')$$, :'np1', :'np1')) || ' | ' ||
  w('tok-p3', format($$nursery_remove_photo('%s', '11111111-1111-1111-1111-111111111111/9a000000-0000-0000-0000-000000000003/%s/photo-0003.jpg')$$, :'np1', :'np1')) || ' ' ||
  q(format($q$SELECT cardinality(photo_paths)::text FROM nursery_products WHERE id = %L$q$, :'np1')),
  'ERR NURSERY_PRODUCT_NOT_FOUND | OK 2');

\echo '=== services near me (20261124140500) ==='
-- fixtures: provider one (tractor work) and provider three (nursery) both based in Test Village One; farmer one's land 2 km away
INSERT INTO account_reach_settings (account_id, tenant_id, role, base_village_id, radius_km) VALUES
  ('9a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25),
  ('9a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 25)
  ON CONFLICT DO NOTHING;
UPDATE service_provider_profiles SET listing_status = 'LISTED' WHERE account_id IN ('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000003');
UPDATE nursery_products SET status = 'ACTIVE' WHERE id = :'np1';
SELECT chk('S01 flag off: refused; a provider session is not a farmer; no session is refused',
  w('tok-f1', 'farm_services_nearby()') || ' | ' || w('tok-p1', 'farm_services_nearby()') || ' | ' || w(NULL, 'farm_services_nearby()') || ' | ' ||
  call_as('anon', 'tok-f1', 'SELECT farm_services_enabled()::text'),
  'ERR FEATURE_DISABLED | ERR NOT_AUTHENTICATED | ERR NOT_AUTHENTICATED | false');
UPDATE feature_flags SET is_enabled = true, target_tenants = ARRAY['11111111-1111-1111-1111-111111111111']::uuid[] WHERE flag_name = 'farm_services_search';
SELECT chk('S02 flag on, farmer without a located land: not located, every kind counts zero',
  q($$SELECT call_as('anon', 'tok-f1', 'SELECT (farm_services_nearby() ->> ''located'') || '' '' || (SELECT count(*) FILTER (WHERE (f ->> ''count'')::int > 0) || ''/'' || count(*) FROM jsonb_array_elements(farm_services_nearby() -> ''families'') f)')$$),
  'false 0/16');
INSERT INTO lands (id, farmer_id, tenant_id, name, center_lat, center_lon) VALUES
  ('1a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Test Land Near', 16.7230, 74.2433),
  ('1a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Test Land Far',  18.5204, 73.8567);
SELECT chk('S03 with a land 2 km away: land preparation and nursery each count one provider',
  q($$SELECT call_as('anon', 'tok-f1', 'SELECT (farm_services_nearby() ->> ''located'') || '' '' || (SELECT string_agg(f ->> ''code'' || ''='' || (f ->> ''count''), '','' ORDER BY f ->> ''code'') FROM jsonb_array_elements(farm_services_nearby() -> ''families'') f WHERE (f ->> ''count'')::int > 0)')$$),
  'true LABOUR=1,LAND_PREP=1,NURSERY=1');
SELECT chk('S04 the land-preparation list: provider one, nearest land, his rotavator rate, no nursery store, no mobile',
  q($$SELECT call_as('anon', 'tok-f1', 'SELECT (SELECT (c ->> ''public_name'') || '' '' || (c ->> ''distance_km'') || '' '' || jsonb_array_length(c -> ''services'') || '' '' || (c #>> ''{services,0,base_rate}'') || '' '' || coalesce(c ->> ''store'', ''null'') || '' '' || (c ? ''mobile_number'') || (c::text ILIKE ''%mobile%'') FROM jsonb_array_elements(farm_services_providers(''LAND_PREP'')) c)')$$),
  'Test Tractor Service 2.0 1 1100.00 null falsefalse');
SELECT chk('S05 the nursery list: provider three with a store summary of one plant and two photos, and his one nursery service',
  q($$SELECT call_as('anon', 'tok-f1', 'SELECT (SELECT (c ->> ''public_name'') || '' '' || (c #>> ''{store,product_count}'') || '' '' || jsonb_array_length(c #> ''{store,photo_paths}'') || '' '' || jsonb_array_length(c -> ''services'') FROM jsonb_array_elements(farm_services_providers(''NURSERY'')) c)')$$),
  'Test Nursery Three 1 2 1');
SELECT chk('S06 an unknown kind is refused',
  w('tok-f1', $$farm_services_providers('UNICORN')$$), 'ERR SERVICE_FAMILY_INVALID');
UPDATE nursery_batches SET ready_date = current_date - 1 WHERE product_id = :'np1';
SELECT chk('S07 the store: the plant as last saved (every save is whole), its photos and the stock free now',
  q($$SELECT call_as('anon', 'tok-f1', 'SELECT (SELECT (s #>> ''{provider,public_name}'') || '' | '' || coalesce(p ->> ''variety_name_local'', ''none'') || '' '' || coalesce(p ->> ''description'', ''none'') || ''/'' || coalesce(p ->> ''description_language'', ''none'') || '' '' || jsonb_array_length(p -> ''photo_paths'') || '' '' || (p ->> ''available_qty'') || '' '' || jsonb_array_length(p -> ''batches'') FROM nursery_store(''9a000000-0000-0000-0000-000000000003'') s, jsonb_array_elements(s -> ''products'') p)')$$),
  'Test Nursery Three | none none/none 2 0 0');
UPDATE nursery_batches SET total_qty = 100, reserved_qty = 40 WHERE product_id = :'np1';
SELECT chk('S08 the store counts stock as total minus reserved and shows a batch only while something is free',
  q($$SELECT call_as('anon', 'tok-f1', 'SELECT (SELECT (p ->> ''available_qty'') || '' '' || (p #>> ''{batches,0,available_qty}'') FROM nursery_store(''9a000000-0000-0000-0000-000000000003'') s, jsonb_array_elements(s -> ''products'') p)')$$),
  '60 60');
SELECT chk('S09 a provider without plants, or one not listed, or one out of reach, has no store and is not listed',
  w('tok-f1', $$nursery_store('9a000000-0000-0000-0000-000000000001')$$) || ' | ' ||
  q($$SELECT run_as('service_role', NULL, $u$UPDATE service_provider_profiles SET listing_status = 'PENDING_REVIEW' WHERE account_id = '9a000000-0000-0000-0000-000000000003'$u$)$$) || ' ' ||
  w('tok-f1', $$nursery_store('9a000000-0000-0000-0000-000000000003')$$) || ' | ' ||
  q($$SELECT run_as('service_role', NULL, $u$UPDATE service_provider_profiles SET listing_status = 'LISTED' WHERE account_id = '9a000000-0000-0000-0000-000000000003'$u$)$$) || ' ' ||
  q($$SELECT run_as('service_role', NULL, $u$UPDATE account_reach_settings SET radius_km = 1 WHERE account_id = '9a000000-0000-0000-0000-000000000003'$u$)$$) || ' ' ||
  w('tok-f1', $$nursery_store('9a000000-0000-0000-0000-000000000003')$$) || ' ' ||
  q($$SELECT call_as('anon', 'tok-f1', 'SELECT jsonb_array_length(farm_services_providers(''NURSERY''))::text')$$),
  'ERR NURSERY_STORE_NOT_FOUND | OK rows=1 ERR NURSERY_STORE_NOT_FOUND | OK rows=1 OK rows=1 ERR NURSERY_STORE_NOT_FOUND 0');
UPDATE account_reach_settings SET radius_km = 25 WHERE account_id = '9a000000-0000-0000-0000-000000000003';
SELECT chk('S10 a farmer of another tenant inside the radius sees the same providers (discovery by radius, not tenant)',
  q($$SELECT run_as('service_role', NULL, $u$INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active, active_role, created_at) VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'sess-fb', hash_session_token('tok-fb'), now() + interval '30 days', true, 'FARMER', now())$u$)$$) || ' ' ||
  q($$SELECT run_as('service_role', NULL, $u$INSERT INTO lands (id, farmer_id, tenant_id, name, center_lat, center_lon) VALUES ('1b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Test Land B', 16.7100, 74.2500)$u$)$$) || ' ' ||
  q($$SELECT run_as('service_role', NULL, $u$UPDATE feature_flags SET target_tenants = ARRAY['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222']::uuid[] WHERE flag_name = 'farm_services_search'$u$)$$) || ' ' ||
  q($$SELECT call_as('anon', 'tok-fb', 'SELECT jsonb_array_length(farm_services_providers(''NURSERY''))::text || ''/'' || jsonb_array_length(farm_services_providers(''LAND_PREP''))::text')$$),
  'OK rows=1 OK rows=1 OK rows=1 1/1');
SELECT chk('S11 the farmer functions never return a session, a mobile number or a tenant',
  q($$SELECT call_as('anon', 'tok-f1', 'SELECT ((farm_services_providers(''NURSERY'')::text || farm_services_providers(''LAND_PREP'')::text || nursery_store(''9a000000-0000-0000-0000-000000000003'')::text) ~* ''(mobile|session|tenant_id|pin_hash)'')::text')$$),
  'false');
UPDATE feature_flags SET is_enabled = false, target_tenants = '{}'::uuid[] WHERE flag_name = 'farm_services_search';

\echo '=== service requests: ask, answer, book, done, rate (20261124140600) ==='
-- tday(): today as the request functions count it (the policy timezone, not the server's)
CREATE OR REPLACE FUNCTION public.tday() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;
-- fm(token, path): one value out of the farmer's own requests; pin(token, path): one value out of the provider's inbox
CREATE OR REPLACE FUNCTION public.fm(p_token text, p_path text) RETURNS text LANGUAGE sql AS $$
  SELECT public.call_as('anon', p_token, format('SELECT coalesce(farm_service_requests_mine() #>> %L, ''(null)'')', p_path)) $$;
CREATE OR REPLACE FUNCTION public.pin(p_token text, p_path text) RETURNS text LANGUAGE sql AS $$
  SELECT public.call_as('anon', p_token, format('SELECT coalesce(provider_requests_inbox() #>> %L, ''(null)'')', p_path)) $$;
UPDATE service_provider_profiles SET accepts_requests = true WHERE account_id IN ('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000003');
SELECT id AS svc_p1 FROM provider_services WHERE account_id = '9a000000-0000-0000-0000-000000000001' AND category_code = 'ROTAVATOR' AND status = 'ACTIVE' LIMIT 1 \gset
SELECT chk('R01 flag off: a farmer cannot ask; a provider session is never a farmer',
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"provider_service_id":"%s"}')$$, tday(), :'svc_p1')) || ' | ' ||
  w('tok-p1', 'farm_service_requests_mine()'), 'ERR FEATURE_DISABLED | ERR NOT_AUTHENTICATED');
UPDATE feature_flags SET is_enabled = true, target_tenants = ARRAY['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222']::uuid[] WHERE flag_name = 'farm_services_search';
SELECT chk('R02 a request needs a real kind, a day from today to the horizon, an amount, the farmer''s own located land, and a provider in reach',
  w('tok-f1', $$farm_service_request_create('{"kind":"GIFT"}')$$) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"provider_service_id":"%s"}')$$, tday() - 1, :'svc_p1')) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"provider_service_id":"%s"}')$$, tday() + 61, :'svc_p1')) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":0,"provider_service_id":"%s"}')$$, tday(), :'svc_p1')) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1b000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"provider_service_id":"%s"}')$$, tday(), :'svc_p1')) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000002","needed_date":"%s","quantity":2,"provider_service_id":"%s"}')$$, tday(), :'svc_p1')) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"provider_service_id":"not-a-uuid"}')$$, tday())) || ' | ' ||
  q('SELECT count(*) FROM service_requests'),
  'ERR REQUEST_INPUT_INVALID | ERR REQUEST_DATE_INVALID | ERR REQUEST_DATE_INVALID | ERR REQUEST_QUANTITY_INVALID | ERR REQUEST_LAND_INVALID | ERR PROVIDER_OUT_OF_REACH | ERR REQUEST_INPUT_INVALID | 0');

SELECT w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"provider_service_id":"%s"}')$$, tday(), :'svc_p1')) AS r \gset
SELECT id AS rq1 FROM service_requests ORDER BY created_at DESC LIMIT 1 \gset
SELECT chk('R03 asked of one provider: open, his name shown, his number not yet, the rate the farmer saw kept',
  :'r' || ' ' || fm('tok-f1', '{0,status}') || ' ' || fm('tok-f1', '{0,is_direct}') || ' ' || fm('tok-f1', '{0,provider,public_name}') || ' ' || fm('tok-f1', '{0,provider,mobile}') || ' ' || fm('tok-f1', '{0,quoted_rate}') || ' ' || fm('tok-f1', '{0,quantity_unit}'),
  'OK OPEN true Test Tractor Service (null) 1100.00 PER_HOUR');
SELECT chk('R04 the provider sees the request without any name, number, village or tenant; another provider does not see it',
  pin('tok-p1', '{new,0,id}') || ' ' || pin('tok-p1', '{new,0,distance_km}') || ' ' || pin('tok-p1', '{new,0,farmer}') || ' ' ||
  call_as('anon', 'tok-p1', $$SELECT ((provider_requests_inbox()::text) ~* '(mobile|0000000001|tenant|village|land_name|"name")')::text$$) || ' ' ||
  call_as('anon', 'tok-p3', $$SELECT jsonb_array_length(provider_requests_inbox() -> 'new')::text$$),
  :'rq1' || ' 2 (null) false 0');
SELECT w('tok-p1', format($$provider_request_respond('%s', '{"action":"ACCEPT"}')$$, :'rq1')) AS r \gset
SELECT chk('R05 accepted as asked: booked at once, and only now both sides see name and number; the sharing is logged',
  :'r' || ' ' || fm('tok-f1', '{0,status}') || ' ' || fm('tok-f1', '{0,agreed_rate}') || ' ' || fm('tok-f1', '{0,provider,mobile}') || ' | ' ||
  pin('tok-p1', '{jobs,0,farmer,mobile}') || ' ' || pin('tok-p1', '{jobs,0,farmer,land_name}') || ' ' || pin('tok-p1', '{new}') || ' | ' ||
  q(format($q$SELECT string_agg(event, ',' ORDER BY id) FROM service_request_events WHERE request_id = %L$q$, :'rq1')),
  'OK CONFIRMED 1100.00 0000009001 | 0000000001 Test Land Near [] | CREATED,OFFERED,CONFIRMED,CONTACT_SHARED');
SELECT chk('R06 nobody else can touch it: another farmer cannot cancel it, another provider cannot finish it, the same provider cannot answer twice',
  w('tok-fb', format($$farm_service_request_cancel('%s')$$, :'rq1')) || ' | ' || w('tok-p3', format($$provider_job_done('%s')$$, :'rq1')) || ' | ' ||
  w('tok-p1', format($$provider_request_respond('%s', '{"action":"ACCEPT"}')$$, :'rq1')),
  'ERR REQUEST_NOT_FOUND | ERR REQUEST_NOT_AVAILABLE | ERR REQUEST_NOT_AVAILABLE');
SELECT w('tok-p1', format($$provider_job_done('%s')$$, :'rq1')) AS r \gset
SELECT w('tok-f1', format($$farm_service_request_rate('%s', 9)$$, :'rq1')) AS bad \gset
SELECT w('tok-f1', format($$farm_service_request_rate('%s', 4)$$, :'rq1')) AS good \gset
SELECT w('tok-f1', format($$farm_service_request_rate('%s', 1)$$, :'rq1')) AS again \gset
SELECT chk('R07 done, then rated once with 1 to 5 stars; the provider''s rating and finished jobs are counted from it',
  :'r' || ' ' || :'bad' || ' ' || :'good' || ' ' || :'again' || ' | ' || fm('tok-f1', '{0,status}') || ' ' || fm('tok-f1', '{0,farmer_rating}') || ' | ' ||
  q($q$SELECT rating_average || ' ' || rating_count || ' ' || jobs_completed FROM service_provider_profiles WHERE account_id = '9a000000-0000-0000-0000-000000000001'$q$),
  'OK ERR RATING_INVALID OK ERR REQUEST_NOT_AVAILABLE | DONE 4 | 4.00 1 1');

SELECT w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":1,"provider_service_id":"%s"}')$$, tday() + 2, :'svc_p1')) AS r \gset
SELECT id AS rq2 FROM service_requests ORDER BY created_at DESC LIMIT 1 \gset
SELECT w('tok-p1', format($$provider_request_respond('%s', '{"action":"ACCEPT"}')$$, :'rq2')) AS a \gset
SELECT w('tok-p1', format($$provider_job_done('%s')$$, :'rq2')) AS early \gset
SELECT w('tok-p1', format($$provider_request_cancel('%s')$$, :'rq2')) AS cancel \gset
SELECT chk('R08 a job cannot be marked done before its day; the provider can cancel it, and the farmer sees who cancelled',
  :'a' || ' ' || :'early' || ' ' || :'cancel' || ' ' || q(format($q$SELECT status || ' ' || cancelled_by FROM service_requests WHERE id = %L$q$, :'rq2')),
  'OK ERR JOB_NOT_STARTED OK CANCELLED PROVIDER');

SELECT w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"category_code":"ROTAVATOR","quantity_unit":"PER_ACRE"}')$$, tday())) AS r \gset
SELECT id AS rq3 FROM service_requests ORDER BY created_at DESC LIMIT 1 \gset
SELECT chk('R09 asked of everyone near: the provider who offers that service sees it, the nursery does not, and an unknown service or unit is refused',
  :'r' || ' ' || pin('tok-p1', '{new,0,id}') || ' ' || pin('tok-p1', '{new,0,is_direct}') || ' ' || pin('tok-p1', '{new,0,my_service,base_rate}') || ' ' ||
  call_as('anon', 'tok-p3', $$SELECT jsonb_array_length(provider_requests_inbox() -> 'new')::text$$) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"category_code":"LAND_PREP","quantity_unit":"PER_ACRE"}')$$, tday())) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2,"category_code":"ROTAVATOR","quantity_unit":"NEGOTIABLE"}')$$, tday())),
  'OK ' || :'rq3' || ' false 1100.00 0 | ERR REQUEST_SERVICE_NOT_FOUND | ERR REQUEST_UNIT_INVALID');
SELECT w('tok-p1', format($$provider_request_respond('%s', '{"action":"ACCEPT"}')$$, :'rq3')) AS r \gset
SELECT chk('R10 accepting a request sent to everyone is an offer at his own rate and unit; the farmer still chooses',
  :'r' || ' ' || q(format($q$SELECT status FROM service_requests WHERE id = %L$q$, :'rq3')) || ' ' || fm('tok-f1', '{0,offers,0,rate}') || ' ' || fm('tok-f1', '{0,offers,0,pricing_unit}') || ' ' ||
  fm('tok-f1', '{0,offers,0,public_name}') || ' ' || fm('tok-f1', '{0,offers,0,distance_km}') || ' ' || pin('tok-p1', '{waiting,0,my_offer,status}'),
  'OK OPEN 1100.00 PER_HOUR Test Tractor Service 2.0 PENDING');
SELECT fm('tok-f1', '{0,offers,0,id}') AS offer3 \gset
SELECT w('tok-fb', format($$farm_service_offer_accept('%s')$$, :'offer3')) AS stranger \gset
SELECT w('tok-f1', format($$farm_service_offer_accept('%s')$$, :'offer3')) AS r \gset
SELECT w('tok-f1', format($$farm_service_offer_accept('%s')$$, :'offer3')) AS again \gset
SELECT chk('R11 only the asking farmer can say yes, once; then it is booked with that provider',
  :'stranger' || ' ' || :'r' || ' ' || :'again' || ' ' || q(format($q$SELECT status || ' ' || agreed_unit || ' ' || (provider_account_id = '9a000000-0000-0000-0000-000000000001') FROM service_requests WHERE id = %L$q$, :'rq3')),
  'ERR OFFER_NOT_FOUND OK ERR OFFER_NOT_AVAILABLE CONFIRMED PER_HOUR true');
SELECT w('tok-f1', format($$farm_service_request_cancel('%s')$$, :'rq3')) AS r \gset

SELECT w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":3,"provider_service_id":"%s"}')$$, tday() + 1, :'svc_p1')) AS r \gset
SELECT id AS rq4 FROM service_requests ORDER BY created_at DESC LIMIT 1 \gset
SELECT w('tok-p1', format($$provider_request_respond('%s', '{"action":"OFFER","rate":"abc"}')$$, :'rq4')) AS badrate \gset
SELECT w('tok-p1', format($$provider_request_respond('%s', '{"action":"OFFER","rate":1000,"offer_date":"%s"}')$$, :'rq4', tday() - 3)) AS baddate \gset
SELECT w('tok-p1', format($$provider_request_respond('%s', '{"action":"OFFER","rate":1000,"offer_date":"%s"}')$$, :'rq4', tday() + 3)) AS r \gset
SELECT chk('R12 another rate or day is an offer the farmer must answer; saying no to it ends a request that was for that provider alone',
  :'badrate' || ' ' || :'baddate' || ' ' || :'r' || ' ' || fm('tok-f1', '{0,status}') || ' ' || fm('tok-f1', '{0,offers,0,rate}') || ' ' || (fm('tok-f1', '{0,offers,0,offer_date}') = (tday() + 3)::text) || ' | ' ||
  w('tok-f1', format($$farm_service_offer_decline('%s')$$, fm('tok-f1', '{0,offers,0,id}'))),
  'ERR REQUEST_INPUT_INVALID ERR REQUEST_DATE_INVALID OK OPEN 1000.00 true | OK');
SELECT chk('R12b after the no: cancelled by the farmer', q(format($q$SELECT status || ' ' || cancelled_by FROM service_requests WHERE id = %L$q$, :'rq4')), 'CANCELLED FARMER');

SELECT w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":3,"provider_service_id":"%s"}')$$, tday() + 1, :'svc_p1')) AS r \gset
SELECT id AS rq5 FROM service_requests ORDER BY created_at DESC LIMIT 1 \gset
SELECT w('tok-p1', format($$provider_request_respond('%s', '{"action":"REFUSE"}')$$, :'rq5')) AS r \gset
SELECT chk('R13 the provider says no: the farmer sees it declined, and the provider''s list is clear',
  :'r' || ' ' || fm('tok-f1', '{0,status}') || ' ' || pin('tok-p1', '{new}'), 'OK DECLINED []');

\echo '=== service requests: nursery plants and stock ==='
UPDATE nursery_batches SET total_qty = 100, reserved_qty = 40, ready_date = tday() - 1 WHERE product_id = :'np1';
SELECT chk('R14 plants: whole numbers only, never more than one batch has free',
  w('tok-f1', format($$farm_service_request_create('{"kind":"NURSERY","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":2.5,"nursery_product_id":"%s"}')$$, tday(), :'np1')) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"NURSERY","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":70,"nursery_product_id":"%s"}')$$, tday(), :'np1')) || ' | ' ||
  w('tok-f1', format($$farm_service_request_create('{"kind":"NURSERY","land_id":"1a000000-0000-0000-0000-000000000002","needed_date":"%s","quantity":10,"nursery_product_id":"%s"}')$$, tday(), :'np1')),
  'ERR REQUEST_QUANTITY_INVALID | ERR NURSERY_STOCK_SHORT | ERR NURSERY_STORE_NOT_FOUND');
SELECT w('tok-f1', format($$farm_service_request_create('{"kind":"NURSERY","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":50,"nursery_product_id":"%s"}')$$, tday(), :'np1')) AS r1 \gset
SELECT id AS rn1 FROM service_requests ORDER BY created_at DESC LIMIT 1 \gset
SELECT w('tok-fb', format($$farm_service_request_create('{"kind":"NURSERY","land_id":"1b000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":50,"nursery_product_id":"%s"}')$$, tday(), :'np1')) AS r2 \gset
SELECT id AS rn2 FROM service_requests ORDER BY created_at DESC LIMIT 1 \gset
SELECT w('tok-p3', format($$provider_request_respond('%s', '{"action":"ACCEPT"}')$$, :'rn1')) AS a1 \gset
SELECT w('tok-p3', format($$provider_request_respond('%s', '{"action":"ACCEPT"}')$$, :'rn2')) AS a2 \gset
SELECT chk('R15 two farmers ask for 50 each with 60 free: the first booking reserves the plants, the second is refused, nothing is oversold',
  :'r1' || ' ' || :'r2' || ' ' || :'a1' || ' ' || :'a2' || ' | ' || q(format($q$SELECT total_qty || '/' || reserved_qty FROM nursery_batches WHERE product_id = %L$q$, :'np1')) || ' ' ||
  q(format($q$SELECT status FROM service_requests WHERE id = %L$q$, :'rn1')) || ' ' || q(format($q$SELECT status FROM service_requests WHERE id = %L$q$, :'rn2')) || ' ' ||
  q(format($q$SELECT count(*) FROM service_request_offers WHERE request_id = %L$q$, :'rn2')),
  'OK OK OK ERR NURSERY_STOCK_SHORT | 100/90 CONFIRMED OPEN 0');
SELECT w('tok-f1', format($$farm_service_request_cancel('%s')$$, :'rn1')) AS c \gset
SELECT w('tok-p3', format($$provider_request_respond('%s', '{"action":"ACCEPT"}')$$, :'rn2')) AS a2 \gset
SELECT w('tok-p3', format($$provider_job_done('%s')$$, :'rn2')) AS d \gset
SELECT chk('R16 a cancelled booking gives the plants back; a finished one takes them off the stock',
  :'c' || ' ' || :'a2' || ' ' || :'d' || ' ' || q(format($q$SELECT total_qty || '/' || reserved_qty FROM nursery_batches WHERE product_id = %L$q$, :'np1')) || ' ' ||
  call_as('anon', 'tok-fb', $$SELECT farm_service_requests_mine() #>> '{0,status}'$$) || ' ' || call_as('anon', 'tok-fb', $$SELECT farm_service_requests_mine() #>> '{0,plant,crop_id}'$$),
  'OK OK OK 50/40 DONE c0000000-0000-0000-0000-000000000001');

\echo '=== service requests: limits, saved providers, counts, expiry, direct table access ==='
UPDATE system_config SET config_value = config_value || '{"max_open_requests": 1}' WHERE config_key = 'farm_services_policy';
SELECT w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":1,"category_code":"ROTAVATOR","quantity_unit":"PER_ACRE"}')$$, tday() + 5)) AS one \gset
SELECT w('tok-f1', format($$farm_service_request_create('{"kind":"SERVICE","land_id":"1a000000-0000-0000-0000-000000000001","needed_date":"%s","quantity":1,"category_code":"ROTAVATOR","quantity_unit":"PER_ACRE"}')$$, tday() + 6)) AS two \gset
UPDATE system_config SET config_value = config_value || '{"max_open_requests": 10}' WHERE config_key = 'farm_services_policy';
SELECT id AS rq6 FROM service_requests ORDER BY created_at DESC LIMIT 1 \gset
SELECT chk('R17 the policy limits how many open requests one farmer may have', :'one' || ' ' || :'two', 'OK ERR REQUEST_LIMIT_REACHED');
SELECT chk('R18 what waits for the farmer is counted on read',
  call_as('anon', 'tok-f1', $$SELECT (farm_services_nearby() -> 'requests')::text$$),
  '{"open": 1, "booked": 0, "to_rate": 0, "offers_waiting": 0}');
SELECT call_as('anon', 'tok-f1', $$SELECT farm_services_save_provider('9a000000-0000-0000-0000-000000000001', true)::text$$) AS s1 \gset
SELECT call_as('anon', 'tok-f1', $$SELECT (farm_services_providers('LAND_PREP') #>> '{0,saved}')$$) AS seen1 \gset
SELECT call_as('anon', 'tok-fb', $$SELECT (farm_services_providers('LAND_PREP') #>> '{0,saved}')$$) AS other \gset
SELECT call_as('anon', 'tok-f1', $$SELECT farm_services_save_provider('9a000000-0000-0000-0000-000000000001', false)::text$$) AS s2 \gset
SELECT chk('R19 a saved provider shows as saved to that farmer only; unsaving keeps the row',
  :'s1' || ' ' || :'seen1' || ' ' || :'other' || ' ' || :'s2' || ' ' || call_as('anon', 'tok-f1', $$SELECT (farm_services_providers('LAND_PREP') #>> '{0,saved}')$$) || ' ' ||
  q($q$SELECT count(*) || ' ' || bool_or(is_saved) FROM farmer_saved_providers$q$) || ' ' ||
  regexp_replace(call_as('anon', 'tok-f1', $$SELECT farm_services_save_provider('9a000000-0000-0000-0000-00000000dead', true)::text$$), '^ERR [0-9A-Z]{5} ', 'ERR '),
  'true true false false false 1 false ERR PROVIDER_NOT_FOUND');
UPDATE service_requests SET needed_date = tday() - 1 WHERE id = :'rq6';
SELECT chk('R20 a request past its day with no booking reads as expired and can no longer be answered',
  fm('tok-f1', '{0,status}') || ' ' || w('tok-p1', format($$provider_request_respond('%s', '{"action":"ACCEPT"}')$$, :'rq6')) || ' ' || pin('tok-p1', '{new}'),
  'EXPIRED ERR REQUEST_NOT_AVAILABLE []');
SELECT chk('R21 the browser cannot read or write the request tables directly; the event log cannot be changed even by the service role',
  left(call_as('anon', 'tok-f1', 'SELECT count(*)::text FROM service_requests'), 9) || ' ' ||
  left(call_as('authenticated', 'tok-p1', 'SELECT count(*)::text FROM service_request_offers'), 9) || ' ' ||
  left(run_as('anon', 'tok-f1', $$UPDATE service_requests SET status = 'DONE'$$), 9) || ' ' ||
  left(run_as('service_role', NULL, $$UPDATE service_request_events SET event = 'X'$$), 9) || ' ' ||
  left(run_as('service_role', NULL, $$DELETE FROM service_requests$$), 9),
  'ERR 42501 ERR 42501 ERR 42501 ERR 42501 ERR 42501');
UPDATE feature_flags SET is_enabled = false, target_tenants = '{}'::uuid[] WHERE flag_name = 'farm_services_search';

\echo '=== suspension and account adoption ==='
UPDATE account_roles SET status = 'SUSPENDED' WHERE account_id = '9a000000-0000-0000-0000-000000000003' AND role = 'SERVICE_PROVIDER';
SELECT chk('A01 a suspended provider is shut out on the next request and shows OFFLINE to the server',
  w('tok-p3', 'provider_workspace_get()') || ' ' || w('tok-p3', 'provider_set_accepting(true)') || ' ' || (SELECT state FROM provider_availability('9a000000-0000-0000-0000-000000000003')),
  'ERR NOT_AUTHENTICATED ERR NOT_AUTHENTICATED OFFLINE');
SELECT run_as('service_role', NULL, $$INSERT INTO farmers (id, tenant_id, mobile_number, pin_hash, farmer_code) VALUES ('aaaaaaaa-7000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '0000009001', repeat('71', 32), 'TST-A-7001')$$) AS act \gset
SELECT chk('A02 when a portal adds this provider as a farmer, the whole business follows the adopted account',
  :'act' || ' old=' || (SELECT count(*) FROM service_provider_profiles WHERE account_id = '9a000000-0000-0000-0000-000000000001')
  || ' new=' || (SELECT p.listing_status || ' services=' || (SELECT count(*) FROM provider_services s WHERE s.account_id = p.account_id) || ' hours=' || (SELECT count(*) FROM provider_working_hours h WHERE h.account_id = p.account_id) || ' blackouts=' || (SELECT count(*) FROM provider_blackouts b WHERE b.account_id = p.account_id) || ' equipment=' || (SELECT count(*) FROM provider_equipment e WHERE e.account_id = p.account_id)
        FROM service_provider_profiles p WHERE p.account_id = 'aaaaaaaa-7000-0000-0000-000000000001'),
  'OK rows=1 old=0 new=LISTED services=3 hours=7 blackouts=2 equipment=1');
