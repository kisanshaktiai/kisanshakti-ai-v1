-- Read-only staging smoke checks AFTER applying the YieldShield migrations.
-- Do not run migration verification against production before approval.
SELECT proname, has_function_privilege('anon',oid,'EXECUTE') AS anonymous,
       has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated,
       has_function_privilege('service_role',oid,'EXECUTE') AS internal_service
FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND proname IN ('complete_schedule_task_atomic','persist_ai_crop_schedule_atomic','reconcile_schedule_for_land');
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='task_completions' AND column_name='operation_id';
SELECT policyname,cmd,roles FROM pg_policies
WHERE schemaname='public' AND tablename='task_completions';
SELECT crop_code, crop_cycle, cultivation_method, count(*) AS stage_rows,
  count(gdd_min) AS gdd_windows, count(kc_coefficient) AS stage_kc
FROM crop_stage_master WHERE is_active
GROUP BY crop_code,crop_cycle,cultivation_method ORDER BY crop_code;
SELECT decision_key,status,count(*) FROM farm_decision
WHERE decision_date>=current_date-7 AND decision_key LIKE 'water:%'
GROUP BY decision_key,status ORDER BY decision_key,status;
-- Before releasing new quantitative fertilizer recommendations, verify this crop/method
-- has a reviewed and EXACT applicable agronomy record.
SELECT crop_code,region_code,soil_fertility_class,cultivation_context,review_status
FROM fertilizer_recommendation_master ORDER BY crop_code;

-- 2026-11-12 deployment contract. Every row must read present=true BEFORE the matching Edge
-- Function version is deployed. Read-only.
SELECT obj, present FROM (VALUES
  ('table yieldshield_crop_release_approvals', to_regclass('public.yieldshield_crop_release_approvals') IS NOT NULL),
  ('table yieldshield_crop_release_approval_audit', to_regclass('public.yieldshield_crop_release_approval_audit') IS NOT NULL),
  ('table crop_schedule_review_drafts', to_regclass('public.crop_schedule_review_drafts') IS NOT NULL),
  ('rpc yieldshield_record_crop_release', to_regprocedure('public.yieldshield_record_crop_release(text,text,text,text,text,uuid,text,text,text,timestamptz,text)') IS NOT NULL),
  ('rpc derive_verified_nutrient_decisions', to_regprocedure('public.derive_verified_nutrient_decisions(uuid,date,integer)') IS NOT NULL),
  ('rpc complete_schedule_task_atomic', to_regprocedure('public.complete_schedule_task_atomic(uuid,uuid,uuid,boolean,timestamptz,jsonb,numeric,text,text[],jsonb,integer,integer)') IS NOT NULL),
  ('rpc persist_ai_crop_schedule_atomic', to_regprocedure('public.persist_ai_crop_schedule_atomic(jsonb,jsonb,jsonb)') IS NOT NULL)
) AS contract(obj, present);
-- Must return zero rows: SECURITY DEFINER engine writers still executable by app roles.
SELECT p.oid::regprocedure AS exposed_function
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN ('apply_stage_transitions','initialize_crop_cycle_stage','run_daily_phenology','reconcile_schedule_for_land',
                    'persist_ai_crop_schedule_atomic','complete_schedule_task_atomic','yieldshield_record_crop_release','derive_verified_nutrient_decisions')
  AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
