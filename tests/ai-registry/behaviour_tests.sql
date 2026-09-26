-- Behaviour tests for 20260925120000_ai_model_registry.sql (local replica only).
-- Every case runs in its own savepoint and is rolled back; t() returns OK or ERR:<message>.
CREATE OR REPLACE FUNCTION public.t(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN
  EXECUTE p_sql; GET DIAGNOSTICS n = ROW_COUNT; RETURN 'OK rows=' || n;
EXCEPTION WHEN OTHERS THEN RETURN 'ERR: ' || left(SQLERRM, 110); END $$;
GRANT EXECUTE ON FUNCTION public.t(text) TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.q(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; BEGIN EXECUTE p_sql INTO v; RETURN v;
EXCEPTION WHEN OTHERS THEN RETURN 'ERR: ' || left(SQLERRM, 110); END $$;
GRANT EXECUTE ON FUNCTION public.q(text) TO anon, authenticated, service_role;

-- fixtures
INSERT INTO tenants (id, name) VALUES ('11111111-1111-1111-1111-111111111111','Tenant A'),('22222222-2222-2222-2222-222222222222','Tenant B');
INSERT INTO farmers (id, tenant_id) VALUES ('aaaaaaaa-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111'),
                                           ('bbbbbbbb-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222');
INSERT INTO admin_users (id, email, role, is_active) VALUES ('5a5a5a5a-0000-0000-0000-000000000001','root@x.in','super_admin',true);
INSERT INTO user_tenants VALUES ('7a7a7a7a-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','tenant_admin',true);

\echo '=== RULES (as table owner) ==='
SELECT 'T01 step → candidate model rejected' AS test, t($$INSERT INTO ai_task_route_step VALUES ('brain.explain',4,'openai:gpt-6-luna')$$) AS result
UNION ALL SELECT 'T02 step → retired model rejected', t($$INSERT INTO ai_task_route_step VALUES ('brain.nlu',2,'gemini:gemini-2.0-flash')$$)
UNION ALL SELECT 'T03 vision task → text-only model rejected', t($$INSERT INTO ai_task_route_step VALUES ('vision.photo_chat',2,'openai:gpt-4o-mini')$$)
UNION ALL SELECT 'T04 reasoning none on gpt-5-mini rejected', t($$UPDATE ai_task_route SET params='{"reasoning_effort":"none"}', change_reason='test' WHERE task_key='alert.enrich'$$)
UNION ALL SELECT 'T05 reasoning low on gpt-5-mini accepted', t($$UPDATE ai_task_route SET params='{"reasoning_effort":"low"}', change_reason='test' WHERE task_key='alert.enrich'$$)
UNION ALL SELECT 'T06 unknown params key rejected', t($$UPDATE ai_task_route SET params='{"top_k":3}', change_reason='test' WHERE task_key='rag.answer'$$)
UNION ALL SELECT 'T07 retire a routed model rejected', t($$UPDATE ai_model_catalog SET status='retired', change_reason='test' WHERE model_key='openai:gpt-5.6-luna'$$)
UNION ALL SELECT 'T08 change model identity rejected', t($$UPDATE ai_model_catalog SET api_model_id='gpt-x' WHERE model_key='openai:gpt-4o'$$)
UNION ALL SELECT 'T09 delete catalog row rejected', t($$DELETE FROM ai_model_catalog WHERE model_key='gemini:gemini-2.0-flash'$$)
UNION ALL SELECT 'T10 delete route rejected', t($$DELETE FROM ai_task_route WHERE task_key='vision.diagnose'$$)
UNION ALL SELECT 'T11 empty change_reason rejected', t($$UPDATE ai_task_route SET change_reason='  ' WHERE task_key='rag.answer'$$)
UNION ALL SELECT 'T12 bad contract shape rejected', t($$INSERT INTO ai_model_catalog (model_key,provider,api_model_id,status,api_contract,change_reason) VALUES ('openai:x','openai','x','candidate','{"token_param":"tokens"}','t')$$)
UNION ALL SELECT 'T13 key must equal provider:api_id', t($$INSERT INTO ai_model_catalog (model_key,provider,api_model_id,status,api_contract,change_reason) VALUES ('openai:y','openai','z','candidate','{"token_param":"max_tokens","temperature":"allowed","reasoning_efforts":[]}','t')$$)
UNION ALL SELECT 'T14 price for unknown model rejected', t($$INSERT INTO ai_model_pricing (model_name,input_cost_per_1k,output_cost_per_1k) VALUES ('openai:not-in-catalog',0.001,0.002)$$)
UNION ALL SELECT 'T15 old price row still editable', t($$UPDATE ai_model_pricing SET notes='stale' WHERE model_name='openai/gpt-5-mini'$$);

\echo '=== LIFECYCLE: evaluate gpt-6-luna → promote → route it (one transaction, rolled back) ==='
BEGIN;
SELECT 'L1 promote candidate' AS step, t($$UPDATE ai_model_catalog SET status='active', change_reason='eval passed (test)' WHERE model_key='openai:gpt-6-luna'$$) AS result
UNION ALL SELECT 'L2 swap into brain.explain step 1', t($$UPDATE ai_task_route_step SET model_key='openai:gpt-6-luna' WHERE task_key='brain.explain' AND step_no=1$$)
UNION ALL SELECT 'L3 vision route now accepts gpt-6-luna', t($$INSERT INTO ai_task_route_step VALUES ('vision.photo_chat',2,'openai:gpt-6-luna')$$)
UNION ALL SELECT 'L4 audit rows for these 3 changes', q($$SELECT count(*)::text FROM ai_registry_audit_log WHERE created_at = now()$$);
ROLLBACK;

\echo '=== LEDGER ==='
BEGIN;
SELECT 'G1 insert: tenant derived from farmer (caller sent Tenant B)' AS test,
  t($$INSERT INTO ai_model_metrics (model_name,tenant_id,farmer_id,task_key,function_name,error_class,query_count,resource_usage)
      VALUES ('openai:gpt-5.6-luna','22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-00000000000a','brain.explain','ai-agriculture-chat','ok',1,'{"input_tokens":900,"output_tokens":300}')$$) AS result
UNION ALL SELECT 'G2 stored tenant is Tenant A', q($$SELECT (tenant_id='11111111-1111-1111-1111-111111111111')::text FROM ai_model_metrics WHERE farmer_id='aaaaaaaa-0000-0000-0000-00000000000a'$$)
UNION ALL SELECT 'G3 routed row without error_class rejected', t($$INSERT INTO ai_model_metrics (model_name,task_key,function_name) VALUES ('openai:gpt-5.6-luna','rag.answer','ai-general-chat')$$)
UNION ALL SELECT 'G4 unknown model_name rejected', t($$INSERT INTO ai_model_metrics (model_name) VALUES ('gpt-4o')$$)
UNION ALL SELECT 'G5 ledger UPDATE rejected', t($$UPDATE ai_model_metrics SET cost_usd=0$$)
UNION ALL SELECT 'G6 ledger DELETE rejected', t($$DELETE FROM ai_model_metrics$$)
UNION ALL SELECT 'G7 farmer delete clears link, keeps row', t($$DELETE FROM farmers WHERE id='aaaaaaaa-0000-0000-0000-00000000000a'$$)
UNION ALL SELECT 'G8 row kept with farmer_id NULL', q($$SELECT count(*)::text FROM ai_model_metrics WHERE farmer_id IS NULL AND task_key='brain.explain'$$)
UNION ALL SELECT 'G9 audit log UPDATE rejected', t($$UPDATE ai_registry_audit_log SET action='update'$$);
ROLLBACK;

\echo '=== SECURITY (per role) ==='
-- ledger fixture rows for both tenants (as owner)
INSERT INTO ai_model_metrics (model_name,farmer_id,task_key,function_name,error_class,query_count)
VALUES ('openai:gpt-4o-mini','aaaaaaaa-0000-0000-0000-00000000000a','farmer.translate','translate-text','ok',1),
       ('openai:gpt-4o-mini','bbbbbbbb-0000-0000-0000-00000000000b','farmer.translate','translate-text','ok',1);

BEGIN; SET LOCAL ROLE anon;
SELECT 'S01 anon TRUNCATE pricing' AS test, t('TRUNCATE ai_model_pricing') AS result
UNION ALL SELECT 'S02 anon TRUNCATE metrics', t('TRUNCATE ai_model_metrics')
UNION ALL SELECT 'S03 anon read catalog', t('SELECT * FROM ai_model_catalog')
UNION ALL SELECT 'S04 anon insert metrics', t($$INSERT INTO ai_model_metrics (model_name) VALUES ('openai:gpt-4o')$$);
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('test.uid','9e9e9e9e-0000-0000-0000-000000000009',true), set_config('test.role','authenticated',true),
       set_config('test.jwt','{"email":"fake-admin@gmail.com"}',true);
SELECT 'S05 old hole: email contains "admin" → metrics rows visible' AS test, q('SELECT count(*)::text FROM ai_model_metrics') AS result
UNION ALL SELECT 'S06 same user reads catalog', q('SELECT count(*)::text FROM ai_model_catalog')
UNION ALL SELECT 'S07 same user edits a route', t($$UPDATE ai_task_route SET is_active=false, change_reason='x' WHERE task_key='rag.answer'$$)
UNION ALL SELECT 'S08 same user TRUNCATE pricing', t('TRUNCATE ai_model_pricing')
UNION ALL SELECT 'S09 same user writes audit log', t($$INSERT INTO ai_registry_audit_log (table_name,row_key,action) VALUES ('x','y','insert')$$);
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('test.uid','7a7a7a7a-0000-0000-0000-000000000001',true), set_config('test.role','authenticated',true);
SELECT 'S10 tenant admin (Tenant A) sees only own ledger rows' AS test,
       q($$SELECT count(*)::text || ' rows, other-tenant rows=' || count(*) FILTER (WHERE tenant_id <> '11111111-1111-1111-1111-111111111111')::text FROM ai_model_metrics$$) AS result
UNION ALL SELECT 'S11 tenant admin reads registry', q('SELECT count(*)::text FROM ai_task_route');
ROLLBACK;

BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('test.uid','5a5a5a5a-0000-0000-0000-000000000001',true), set_config('test.role','authenticated',true);
SELECT 'S12 super admin sees all ledger rows' AS test, q('SELECT count(*)::text FROM ai_model_metrics') AS result
UNION ALL SELECT 'S13 super admin reads catalog', q('SELECT count(*)::text FROM ai_model_catalog')
UNION ALL SELECT 'S14 super admin edits a route', t($$UPDATE ai_task_route SET params='{"max_output_tokens":800}', change_reason='cap output (test)' WHERE task_key='voice.navigate'$$)
UNION ALL SELECT 'S15 audit row names the super admin', q($$SELECT (changed_by='5a5a5a5a-0000-0000-0000-000000000001' AND change_reason='cap output (test)')::text FROM ai_registry_audit_log WHERE row_key='voice.navigate' ORDER BY created_at DESC LIMIT 1$$)
UNION ALL SELECT 'S16 super admin reads pricing (admin panel path)', q('SELECT count(*)::text FROM ai_model_pricing')
UNION ALL SELECT 'S17 super admin cannot edit ledger', t('DELETE FROM ai_model_metrics');
ROLLBACK;

BEGIN; SET LOCAL ROLE service_role;
SELECT 'S18 service role reads routes+steps' AS test, q('SELECT count(*)::text FROM ai_task_route_step') AS result
UNION ALL SELECT 'S19 service role writes ledger', t($$INSERT INTO ai_model_metrics (model_name,task_key,function_name,error_class,query_count) VALUES ('openai:gpt-4o','vision.crop_scan','ai-crop-scan','ok',1)$$);
ROLLBACK;
