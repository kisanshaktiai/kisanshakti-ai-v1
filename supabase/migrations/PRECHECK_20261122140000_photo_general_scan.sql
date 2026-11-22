-- ═══════════════════════════════════════════════════════════════════════════
-- PRECHECK for 20261122140000_photo_general_scan.sql — READ-ONLY, run by hand
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
-- Every row should show ok = true before the migration is applied.
-- The *_before_def rows print the current definitions — keep that output as
-- the rollback copy.
-- ═══════════════════════════════════════════════════════════════════════════

select 'uploads.land_id nullable' as check_name,
       (select is_nullable = 'YES' from information_schema.columns
         where table_schema = 'public' and table_name = 'crop_growth_uploads' and column_name = 'land_id') as ok
union all
select 'diagnosis.land_id nullable',
       (select is_nullable = 'YES' from information_schema.columns
         where table_schema = 'public' and table_name = 'crop_photo_diagnosis' and column_name = 'land_id')
union all
select 'no land-less uploads exist yet',
       (select count(*) = 0 from public.crop_growth_uploads where land_id is null)
union all
select 'no land-less diagnoses exist yet',
       (select count(*) = 0 from public.crop_photo_diagnosis where land_id is null)
union all
select 'all existing upload paths satisfy the new check',
       (select count(*) = 0 from public.crop_growth_uploads
         where storage_path is not null
           and not (storage_path ~~ (tenant_id::text || '/' || farmer_id::text || '/' || coalesce(land_id::text, '_general') || '/%')))
union all
select 'vision.diagnose route active with steps',
       (select r.is_active and exists (select 1 from public.ai_task_route_step s where s.task_key = r.task_key)
          from public.ai_task_route r where r.task_key = 'vision.diagnose')
union all
select 'vision policy enabled', (select (config_value->>'enabled')::boolean from public.system_config where config_key = 'vision_diagnosis_policy')
union all
select 'photo policy has observation_min_confidence',
       (select jsonb_typeof(config_value->'observation_min_confidence') = 'number' from public.system_config where config_key = 'photo_diagnosis_policy');

-- Rollback copy of the current definitions (save this output).
select 'crop_photo_fill_context_before_def' as name, pg_get_functiondef('public.crop_photo_fill_context'::regproc) as def
union all
select 'crop_photo_diagnosis_fill_identity_before_def', pg_get_functiondef('public.crop_photo_diagnosis_fill_identity'::regproc)
union all
select 'crop_photo_diagnosis_photo_same_land_before_def', pg_get_functiondef('public.crop_photo_diagnosis_photo_same_land'::regproc)
union all
select 'path_owner_chk_before_def', pg_get_constraintdef(oid) from pg_constraint where conname = 'crop_growth_uploads_path_owner_chk';
