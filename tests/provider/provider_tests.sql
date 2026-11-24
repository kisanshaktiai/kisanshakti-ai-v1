-- ═══════════════════════════════════════════════════════════════════════════
-- tests/provider/provider_tests.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Tests for the Provider Workspace migrations (20261124140000 … 140300) on a
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
