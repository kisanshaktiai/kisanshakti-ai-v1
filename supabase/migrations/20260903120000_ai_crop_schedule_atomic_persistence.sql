-- P0 persistence integrity: create the schedule, all tasks, and the land activation
-- update inside one database transaction. If any statement fails, PostgreSQL rolls back
-- the entire RPC call, so an active schedule can never be committed without its tasks.

create or replace function public.persist_ai_crop_schedule_atomic(
  p_schedule jsonb,
  p_tasks jsonb,
  p_land jsonb
)
returns table (
  schedule_id uuid,
  task_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schedule_id uuid;
  v_task_count integer;
  v_expected_count integer;
  v_land_id uuid;
begin
  if jsonb_typeof(p_schedule) <> 'object' then
    raise exception 'p_schedule must be a JSON object';
  end if;

  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) = 0 then
    raise exception 'p_tasks must be a non-empty JSON array';
  end if;

  v_land_id := nullif(p_schedule->>'land_id', '')::uuid;
  if v_land_id is null then
    raise exception 'p_schedule.land_id is required';
  end if;

  -- Serialize schedule creation for this land and fail before writing if the land vanished.
  perform 1
  from public.lands
  where id = v_land_id
  for update;

  if not found then
    raise exception 'land % not found', v_land_id;
  end if;

  insert into public.crop_schedules (
    land_id, farmer_id, tenant_id, crop_name, crop_variety, variety_id,
    cultivation_method, crop_cycle, sowing_date, transplant_date,
    expected_harvest_date, is_active, status, generation_language, ai_model,
    input_soil_data, input_weather_data, input_land_coordinates, agro_climatic_zone,
    calculated_for_area_acres, total_duration_days, seed_quantity_kg,
    fertilizer_n_kg, fertilizer_p_kg, fertilizer_k_kg, total_estimated_cost,
    state_region, district_name, farming_type, tasks_total_count,
    tasks_completed_count, backdated_consent, backdated_consent_at,
    generation_params, metadata
  )
  values (
    (p_schedule->>'land_id')::uuid,
    nullif(p_schedule->>'farmer_id', '')::uuid,
    nullif(p_schedule->>'tenant_id', '')::uuid,
    p_schedule->>'crop_name',
    p_schedule->>'crop_variety',
    nullif(p_schedule->>'variety_id', '')::uuid,
    p_schedule->>'cultivation_method',
    p_schedule->>'crop_cycle',
    (p_schedule->>'sowing_date')::date,
    nullif(p_schedule->>'transplant_date', '')::date,
    nullif(p_schedule->>'expected_harvest_date', '')::date,
    coalesce((p_schedule->>'is_active')::boolean, true),
    coalesce(p_schedule->>'status', 'active'),
    p_schedule->>'generation_language',
    p_schedule->>'ai_model',
    p_schedule->'input_soil_data',
    p_schedule->'input_weather_data',
    p_schedule->'input_land_coordinates',
    p_schedule->>'agro_climatic_zone',
    nullif(p_schedule->>'calculated_for_area_acres', '')::numeric,
    nullif(p_schedule->>'total_duration_days', '')::integer,
    nullif(p_schedule->>'seed_quantity_kg', '')::numeric,
    nullif(p_schedule->>'fertilizer_n_kg', '')::numeric,
    nullif(p_schedule->>'fertilizer_p_kg', '')::numeric,
    nullif(p_schedule->>'fertilizer_k_kg', '')::numeric,
    nullif(p_schedule->>'total_estimated_cost', '')::numeric,
    p_schedule->>'state_region',
    p_schedule->>'district_name',
    p_schedule->>'farming_type',
    nullif(p_schedule->>'tasks_total_count', '')::integer,
    coalesce(nullif(p_schedule->>'tasks_completed_count', '')::integer, 0),
    coalesce((p_schedule->>'backdated_consent')::boolean, false),
    nullif(p_schedule->>'backdated_consent_at', '')::timestamptz,
    coalesce(p_schedule->'generation_params', '{}'::jsonb),
    coalesce(p_schedule->'metadata', '{}'::jsonb)
  )
  returning id into v_schedule_id;

  insert into public.schedule_tasks (
    schedule_id, farmer_id, tenant_id, task_name, task_description,
    task_type, task_date, projected_date, days_from_sowing, anchor_type,
    anchor_stage, gdd_target, stage_key, stage_uuid, stage_name, stage_order,
    priority, weather_dependent, status, sequence_order, instructions,
    precautions, resources, estimated_cost, currency, rule_ids,
    trigger_rule_id, confidence, source_refs, language, is_pinned
  )
  select
    v_schedule_id,
    x.farmer_id,
    x.tenant_id,
    x.task_name,
    x.task_description,
    x.task_type,
    x.task_date,
    x.projected_date,
    x.days_from_sowing,
    x.anchor_type,
    x.anchor_stage,
    x.gdd_target,
    x.stage_key,
    x.stage_uuid,
    x.stage_name,
    x.stage_order,
    x.priority,
    x.weather_dependent,
    x.status,
    x.sequence_order,
    x.instructions,
    x.precautions,
    x.resources,
    x.estimated_cost,
    x.currency,
    x.rule_ids,
    x.trigger_rule_id,
    x.confidence,
    x.source_refs,
    x.language,
    x.is_pinned
  from jsonb_to_recordset(p_tasks) as x(
    farmer_id uuid,
    tenant_id uuid,
    task_name text,
    task_description text,
    task_type text,
    task_date date,
    projected_date date,
    days_from_sowing integer,
    anchor_type text,
    anchor_stage text,
    gdd_target numeric,
    stage_key text,
    stage_uuid uuid,
    stage_name text,
    stage_order integer,
    priority text,
    weather_dependent boolean,
    status text,
    sequence_order integer,
    instructions text[],
    precautions text[],
    resources jsonb,
    estimated_cost numeric,
    currency varchar,
    rule_ids text[],
    trigger_rule_id text,
    confidence numeric,
    source_refs jsonb,
    language varchar,
    is_pinned boolean
  );

  get diagnostics v_task_count = row_count;
  v_expected_count := nullif(p_schedule->>'tasks_total_count', '')::integer;

  if v_task_count <> jsonb_array_length(p_tasks) then
    raise exception 'task insert count mismatch: inserted %, requested %',
      v_task_count, jsonb_array_length(p_tasks);
  end if;

  if v_expected_count is not null and v_task_count <> v_expected_count then
    raise exception 'task count mismatch: inserted %, schedule expects %',
      v_task_count, v_expected_count;
  end if;

  update public.lands
  set
    current_crop = p_land->>'current_crop',
    current_crop_variety_id = nullif(p_land->>'current_crop_variety_id', '')::uuid,
    planting_date = nullif(p_land->>'planting_date', '')::date,
    transplant_date = nullif(p_land->>'transplant_date', '')::date,
    gdd_anchor_type = p_land->>'gdd_anchor_type',
    gdd_anchor_date = nullif(p_land->>'gdd_anchor_date', '')::date,
    current_gdd = nullif(p_land->>'current_gdd', '')::numeric,
    gdd_last_computed_at = nullif(p_land->>'gdd_last_computed_at', '')::timestamptz,
    expected_harvest_date = nullif(p_land->>'expected_harvest_date', '')::date,
    active_schedule_id = v_schedule_id,
    crop_cycle = p_land->>'crop_cycle',
    updated_at = now()
  where id = v_land_id;

  if not found then
    raise exception 'land % disappeared during schedule persistence', v_land_id;
  end if;

  return query select v_schedule_id, v_task_count;
end;
$$;

revoke all on function public.persist_ai_crop_schedule_atomic(jsonb, jsonb, jsonb) from public;
grant execute on function public.persist_ai_crop_schedule_atomic(jsonb, jsonb, jsonb) to service_role;

comment on function public.persist_ai_crop_schedule_atomic(jsonb, jsonb, jsonb) is
  'Atomically persists an AI crop schedule, its non-empty task set, and land activation state. Any failure rolls back all writes.';
