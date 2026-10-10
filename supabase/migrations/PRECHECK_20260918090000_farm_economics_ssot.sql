-- Run BEFORE applying 20260918090000_farm_economics_ssot.sql. Read-only.
-- Every row must show ok = true; a false row means the migration must not be applied as written.
select 'financial_transactions has tenant_id, farmer_id, land_id' chk,
       (select count(*) from information_schema.columns where table_name='financial_transactions' and column_name in ('tenant_id','farmer_id','land_id')) = 3 ok
union all select 'yield_predictions has tenant_id, farmer_id, land_id',
       (select count(*) from information_schema.columns where table_name='yield_predictions' and column_name in ('tenant_id','farmer_id','land_id')) = 3
union all select 'analytics_forecasts has farmer_id, land_id',
       (select count(*) from information_schema.columns where table_name='analytics_forecasts' and column_name in ('farmer_id','land_id')) = 2
union all select 'lands has tenant_id, farmer_id, deleted_at',
       (select count(*) from information_schema.columns where table_name='lands' and column_name in ('tenant_id','farmer_id','deleted_at')) = 3
union all select 'master_product_categories.id is uuid',
       exists (select 1 from information_schema.columns where table_name='master_product_categories' and column_name='id' and data_type='uuid')
union all select 'no target table already exists',
       not exists (select 1 from information_schema.tables where table_schema='public' and table_name in
         ('expense_component_master','expense_component_task_map','expense_component_product_category_map',
          'cost_component_standard','cultivation_operation_norm','crop_yield_potential','land_expense_estimate','market_location_map'))
union all select 'anon can execute get_current_farmer_id and has_tenant_access',
       has_function_privilege('anon','public.get_current_farmer_id()','EXECUTE') and has_function_privilege('anon','public.has_tenant_access(uuid)','EXECUTE')
union all select 'task_type vocabulary in live schedules is covered by the task map',
       not exists (select 1 from schedule_tasks st join crop_schedules cs on cs.id=st.schedule_id where cs.is_active
                   and st.task_type not in ('sowing','nutrition','pest_management','disease_management','weed_management','growth_regulation',
                                            'irrigation','land_preparation','intercultural','harvest','post_harvest','monitoring','advisory','planning'));
