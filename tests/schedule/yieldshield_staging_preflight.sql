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
