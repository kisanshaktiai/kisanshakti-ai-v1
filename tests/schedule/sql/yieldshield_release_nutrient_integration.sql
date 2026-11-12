-- Real-PostgreSQL integration test for
--   supabase/migrations/20261112200000_yieldshield_release_workflow_and_verified_nutrient.sql
-- Runs ONLY against a throw-away database (tests/schedule/sql/run.sh creates and drops it).
-- It is not a staging-project test: the fixture below reproduces just the columns the migration
-- reads/writes (farm_decision + upsert_farm_decision copied from the live definitions on
-- 2026-11-12). Any failed assertion raises and aborts with a non-zero exit code.
\set ON_ERROR_STOP on
\set QUIET on

-- ── fixture: Supabase roles, auth.role(), and the tables the migration touches ──
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create function auth.role() returns text language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                   nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.lands (id uuid primary key, tenant_id uuid, farmer_id uuid);
create table public.land_farm_state (land_id uuid, state_date date, tenant_id uuid, farmer_id uuid,
  crop_code text, stage_code text, growth_stage text, primary key (land_id, state_date));
create table public.decision_rules (rule_id text primary key, crop_code text, is_active boolean, expert_approved boolean,
  is_farmer_servable boolean, category text, required_observation_category text[], etl_value_min numeric,
  etl_unit_type text, growth_stage text, stage_applicable text[], forecast_horizon_days integer, scientific_source text);
create table public.observation_protocol (measurement_type text, crop_code text, observation_category text, unit text,
  value_min numeric, value_max numeric, is_active boolean);
create table public.land_observation (id uuid primary key default gen_random_uuid(), land_id uuid, measurement_type text,
  value numeric, observed_at timestamptz, source text);
create table public.farm_decision (
  id uuid not null default gen_random_uuid() primary key, land_id uuid not null references public.lands(id) on delete cascade,
  tenant_id uuid, farmer_id uuid, schedule_id uuid, task_id uuid, decision_date date not null, decision_key text not null,
  category text not null, status text not null check (status = any (array['DUE','WATCH','BLOCKED','INFO','DONE','MISSED','DISMISSED','EXPIRED','SUPERSEDED'])),
  priority text not null check (priority = any (array['critical','high','medium','low'])), action_code text not null,
  title_en text not null, action_text_en text, rule_id text, alert_id uuid, evidence jsonb not null default '{}'::jsonb,
  source text not null, valid_until date, acted_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (land_id, decision_date, decision_key));
create function public.upsert_farm_decision(p_land uuid, p_tenant uuid, p_farmer uuid, p_sched uuid, p_task uuid, p_date date, p_key text, p_cat text, p_status text, p_prio text, p_action text, p_title text, p_text text, p_rule text, p_alert uuid, p_evidence jsonb, p_source text, p_valid_until date)
 returns void language sql security definer set search_path to 'public' as $function$
  INSERT INTO public.farm_decision
    (land_id, tenant_id, farmer_id, schedule_id, task_id, decision_date, decision_key, category, status,
     priority, action_code, title_en, action_text_en, rule_id, alert_id, evidence, source, valid_until)
  VALUES (p_land, p_tenant, p_farmer, p_sched, p_task, p_date, p_key, p_cat, p_status, p_prio, p_action,
          p_title, p_text, p_rule, p_alert, coalesce(p_evidence, '{}'::jsonb), p_source, p_valid_until)
  ON CONFLICT (land_id, decision_date, decision_key) DO UPDATE SET
     schedule_id = EXCLUDED.schedule_id, task_id = EXCLUDED.task_id, category = EXCLUDED.category,
     status = EXCLUDED.status, priority = EXCLUDED.priority, action_code = EXCLUDED.action_code,
     title_en = EXCLUDED.title_en, action_text_en = EXCLUDED.action_text_en, rule_id = EXCLUDED.rule_id,
     alert_id = EXCLUDED.alert_id, evidence = EXCLUDED.evidence, source = EXCLUDED.source,
     valid_until = EXCLUDED.valid_until, updated_at = now()
  WHERE public.farm_decision.status NOT IN ('DONE','MISSED','DISMISSED','EXPIRED','SUPERSEDED');
$function$;
-- engine writers that exist live and were executable by `authenticated` (bodies irrelevant here)
create function public.apply_stage_transitions(p_land_id uuid) returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
create function public.run_daily_phenology() returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
create function public.reconcile_schedule_for_land(p_land_id uuid) returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
create function public.persist_ai_crop_schedule_atomic(p_schedule jsonb, p_tasks jsonb, p_land jsonb) returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
grant execute on all functions in schema public to authenticated;

-- ── apply the migration twice: it must be idempotent ──
\ir ../../../supabase/migrations/20261112200000_yieldshield_release_workflow_and_verified_nutrient.sql
\ir ../../../supabase/migrations/20261112200000_yieldshield_release_workflow_and_verified_nutrient.sql

create function pg_temp.expect_error(p_sql text, p_state text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'FAILED %: expected sqlstate %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED %: statement succeeded but had to fail with %', p_label, p_state;
end $$;
create function pg_temp.check_true(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAILED %', p_label; end if; end $$;

-- ════════════ 1. privileges: app roles are locked out, service role is not ════════════
select pg_temp.check_true(not has_function_privilege(r, f, 'execute'), 'app role must not execute ' || f || ' as ' || r)
  from unnest(array['anon','authenticated']) r,
       unnest(array['public.yieldshield_record_crop_release(text,text,text,text,text,uuid,text,text,text,timestamptz,text)',
                    'public.derive_verified_nutrient_decisions(uuid,date,integer)',
                    'public.apply_stage_transitions(uuid)','public.run_daily_phenology()',
                    'public.reconcile_schedule_for_land(uuid)','public.persist_ai_crop_schedule_atomic(jsonb,jsonb,jsonb)']) f;
select pg_temp.check_true(has_function_privilege('service_role', f, 'execute'), 'service role must execute ' || f)
  from unnest(array['public.yieldshield_record_crop_release(text,text,text,text,text,uuid,text,text,text,timestamptz,text)',
                    'public.derive_verified_nutrient_decisions(uuid,date,integer)','public.apply_stage_transitions(uuid)']) f;
select pg_temp.check_true(not has_table_privilege(r, t, 'select') and not has_table_privilege(r, t, 'insert'), 'app role must not read/write ' || t)
  from unnest(array['anon','authenticated']) r,
       unnest(array['public.yieldshield_crop_release_approvals','public.yieldshield_crop_release_approval_audit']) t;
select pg_temp.check_true(not has_table_privilege('service_role', 'public.yieldshield_crop_release_approvals', 'insert'),
  'even the service role cannot write the registry except through the audited function');

-- an authenticated session really is refused at call time
set role authenticated;
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH',null,repeat('a',64),repeat('b',64),'x', now()+interval '1 day', null)$q$, '42501', 'authenticated cannot approve');
select pg_temp.expect_error($q$select public.derive_verified_nutrient_decisions(gen_random_uuid())$q$, '42501', 'authenticated cannot run the nutrient producer');
select pg_temp.expect_error($q$select public.apply_stage_transitions(gen_random_uuid())$q$, '42501', 'authenticated cannot write another land''s stage ledger');
select pg_temp.expect_error($q$select count(*) from public.yieldshield_crop_release_approvals$q$, '42501', 'authenticated cannot read approvals');
reset role;

-- ════════════ 2. approval workflow ════════════
-- a caller holding EXECUTE but not presenting the service-role claim is still refused
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH',null,repeat('a',64),repeat('b',64),'review-board', now()+interval '1 day', null)$q$, '42501', 'approval needs the service-role claim');

set request.jwt.claims = '{"role":"service_role"}';
set role service_role;
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH',null,'NOT-A-HASH',repeat('b',64),'review-board', now()+interval '1 day', null)$q$, '22023', 'bad stage-graph fingerprint');
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH',null,repeat('a',64),repeat('b',64),'  ', now()+interval '1 day', null)$q$, '22023', 'blank reviewer');
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH',null,repeat('a',64),repeat('b',64),'review-board', now()-interval '1 day', null)$q$, '22023', 'expiry in the past');
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH',null,repeat('a',64),repeat('b',64),'review-board', null, null)$q$, '22023', 'approval without expiry');
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','',null,repeat('a',64),repeat('b',64),'review-board', now()+interval '1 day', null)$q$, '22023', 'missing region');
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('publish','rice','transplanted','universal','IN-MH',null,repeat('a',64),repeat('b',64),'review-board', now()+interval '1 day', null)$q$, '22023', 'unknown action');
select pg_temp.expect_error($q$select public.yieldshield_record_crop_release('revoke','rice','transplanted','universal','IN-MH',null,repeat('a',64),repeat('b',64),'review-board', null, null)$q$, 'P0002', 'revoke without an approval');
select pg_temp.check_true((select count(*) = 0 from public.yieldshield_crop_release_approvals), 'rejected calls must leave the registry empty');

select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH',null,repeat('a',64),repeat('b',64),'review-board', now()+interval '180 days', 'fixture review') as approved \gset
select pg_temp.check_true((select count(*) = 1 from public.yieldshield_crop_release_approvals where status='approved' and stage_graph_sha256=repeat('a',64) and variety_id is null), 'approve writes exactly one approved row');
-- re-approval after a stage-graph change replaces the fingerprint in place (same scope, same id)
select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH',null,repeat('c',64),repeat('b',64),'review-board', now()+interval '180 days', null) as reapproved \gset
select pg_temp.check_true((select count(*) = 1 and bool_and(stage_graph_sha256=repeat('c',64)) from public.yieldshield_crop_release_approvals), 're-approval updates the same scope row');
select pg_temp.check_true((:'approved'::jsonb ->> 'approval_id') = (:'reapproved'::jsonb ->> 'approval_id'), 're-approval keeps the approval id');
-- a different variety is a different scope
select public.yieldshield_record_crop_release('approve','rice','transplanted','universal','IN-MH','00000000-0000-4000-8000-000000000001',repeat('c',64),repeat('b',64),'review-board', now()+interval '30 days', null) \gset v_
select pg_temp.check_true((select count(*) = 2 from public.yieldshield_crop_release_approvals), 'variety-scoped approval is a separate row');
select public.yieldshield_record_crop_release('revoke','rice','transplanted','universal','IN-MH',null,repeat('c',64),repeat('b',64),'review-board', null, 'withdrawn') \gset r_
select pg_temp.check_true((select status = 'revoked' from public.yieldshield_crop_release_approvals where variety_id is null), 'revoke marks the row revoked');
select pg_temp.check_true((select status = 'approved' from public.yieldshield_crop_release_approvals where variety_id is not null), 'revoke does not touch another scope');
select pg_temp.check_true((select count(*) = 4 and count(*) filter (where action='revoke') = 1 from public.yieldshield_crop_release_approval_audit), 'every approve/revoke is audited');
select pg_temp.expect_error($q$update public.yieldshield_crop_release_approval_audit set reviewed_by='x'$q$, '42501', 'audit rows cannot be rewritten by the service role');
select pg_temp.expect_error($q$delete from public.yieldshield_crop_release_approvals$q$, '42501', 'approvals cannot be deleted by the service role');
reset role;

-- ════════════ 3. verified nutrient-action producer ════════════
insert into public.lands values
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a0000000-0000-4000-8000-000000000001'),
  ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b0000000-0000-4000-8000-000000000002');
insert into public.land_farm_state values
  ('11111111-1111-4111-8111-111111111111', date '2026-07-20','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a0000000-0000-4000-8000-000000000001','rice','RICE_TILLERING','tillering'),
  ('22222222-2222-4222-8222-222222222222', date '2026-07-20','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b0000000-0000-4000-8000-000000000002','rice','RICE_TILLERING','tillering');
-- protocol range and rule threshold are TEST FIXTURE numbers, not agronomic recommendations
insert into public.observation_protocol values ('fixture_reading','rice','nutrient','score',1,6,true);
insert into public.decision_rules values
  ('FIX_NUTR_UNTYPED','rice',true,true,true,'nutrition',array['nutrient'],null,null,null,array['tillering'],null,'fixture'),
  ('FIX_NUTR_UNAPPROVED','rice',true,false,true,'nutrition',array['nutrient'],3,'fixture_reading',null,array['tillering'],null,'fixture');

set request.jwt.claims = '{"role":"service_role"}';
set role service_role;
select pg_temp.check_true((public.derive_verified_nutrient_decisions('11111111-1111-4111-8111-111111111111', date '2026-07-20') ->> 'due') = '0', 'no typed approved threshold => nothing produced');
reset role;
insert into public.land_observation (land_id, measurement_type, value, observed_at, source) values
  ('11111111-1111-4111-8111-111111111111','fixture_reading',2,'2026-07-19 08:00+00','farmer');
set role service_role;
select pg_temp.check_true((public.derive_verified_nutrient_decisions('11111111-1111-4111-8111-111111111111', date '2026-07-20') ->> 'due') = '0',
  'a low reading alone never authorizes: untyped and unapproved rules are ignored (threshold is never read from prose)');
reset role;
insert into public.decision_rules values
  ('FIX_NUTR_TYPED','rice',true,true,true,'nutrition',array['nutrient'],3,'fixture_reading',null,array['tillering'],null,'fixture'),
  ('FIX_NUTR_OTHER_STAGE','rice',true,true,true,'nutrition',array['nutrient'],3,'fixture_reading',null,array['flowering'],null,'fixture'),
  ('FIX_NUTR_OTHER_UNIT','rice',true,true,true,'nutrition',array['nutrient'],3,'another_reading',null,array['tillering'],null,'fixture');
set role service_role;
-- cross-tenant: land 2 has no reading of its own; land 1's reading must not leak into it
select pg_temp.check_true((public.derive_verified_nutrient_decisions('22222222-2222-4222-8222-222222222222', date '2026-07-20') ->> 'due') = '0', 'another tenant''s observation is never used');
select pg_temp.check_true((public.derive_verified_nutrient_decisions('11111111-1111-4111-8111-111111111111', date '2026-07-20') ->> 'due') = '1', 'reading below the typed approved threshold => one verified decision');
select pg_temp.check_true((public.derive_verified_nutrient_decisions('11111111-1111-4111-8111-111111111111', date '2026-07-20') ->> 'due') = '1', 'second run');
reset role;
select pg_temp.check_true((select count(*) = 1 from public.farm_decision), 'idempotent: one decision row after two runs, none for the other tenant');
select pg_temp.check_true((select status='DUE' and action_code='APPLY_NUTRIENT_VERIFIED' and decision_key='observe:nutrient:verified:FIX_NUTR_TYPED'
   and tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and (evidence->>'observed_value')::numeric = 2 and (evidence->>'threshold_below')::numeric = 3
   and evidence ? 'observation_id' and action_text_en !~ '[0-9]'
   from public.farm_decision), 'decision carries the reading, the threshold and the tenant, and no quantity');

-- readings that are not evidence: at/above threshold, outside the instrument range, too old, future-dated
delete from public.farm_decision; delete from public.land_observation;
insert into public.land_observation (land_id, measurement_type, value, observed_at, source) values
  ('11111111-1111-4111-8111-111111111111','fixture_reading',3,'2026-07-20 06:00+00','farmer'),
  ('11111111-1111-4111-8111-111111111111','fixture_reading',0.2,'2026-07-20 07:00+00','farmer'),
  ('11111111-1111-4111-8111-111111111111','fixture_reading',2,'2026-07-01 07:00+00','farmer'),
  ('11111111-1111-4111-8111-111111111111','fixture_reading',2,'2026-07-25 07:00+00','farmer'),
  ('11111111-1111-4111-8111-111111111111','fixture_reading',null,'2026-07-20 09:00+00','farmer');
set role service_role;
select pg_temp.check_true((public.derive_verified_nutrient_decisions('11111111-1111-4111-8111-111111111111', date '2026-07-20') ->> 'due') = '0',
  'at-threshold, out-of-range, stale, future and empty readings produce nothing');
select pg_temp.check_true((public.derive_verified_nutrient_decisions('11111111-1111-4111-8111-111111111111', date '2026-07-21') ->> 'reason') = 'no_stage_state', 'no field state for the day => nothing');
reset role;
select pg_temp.check_true((select count(*) = 0 from public.farm_decision), 'nothing was written');

\echo YIELDSHIELD_SQL_INTEGRATION_OK
