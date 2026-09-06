-- 2026-09-05 — Crop schedule: language contract, gap location, governance method check.
--
-- (1) sync_schedule_task_context: schedule_tasks.language = NULL is the pipeline's deliberate
--     "this task was NOT narrated" signal (ai-smart-schedule/index.ts persists language only for
--     narrated tasks; src/lib/scheduleTaskPresentation.ts keys its untranslated-text guard on it;
--     schedule-narrate selects pending work by it). The 2026-09-04 trigger overwrote it with
--     generation_language, which made English text present as the farmer's language. The trigger
--     now syncs variety_id only.
-- (2) annotate_schedule_variety_scope_gaps: the pipeline, the API response and the UI read
--     metadata.gaps; the trigger wrote generation_params.gaps. It now appends to metadata.gaps.
-- (3) enforce_schedule_task_rule_governance: crop_schedules.cultivation_method holds the stage-clock
--     method (index.ts: stageClockMethod ?? cultivationMethod), while the generator's methodFilter
--     accepts a rule that matches the farmer's method OR the stage-clock method. The trigger now
--     applies the same acceptance set, read from generation_params.resolved_inputs, so a rule scoped
--     to a child method (e.g. one the farmer actually selected) can no longer fail the atomic persist.
-- (4) Data repair for rows written while (1) was live: language back to NULL where the pipeline
--     had flagged the task as needing translation. No text is changed.
-- (5) Data repair: lands whose active schedule has a sowing_date but whose planting_date is NULL
--     (three sugarcane lands on 2026-09-05) cannot resolve phenology/GDD and are skipped by the
--     reconciler every night. planting_date is copied from the land's own active schedule only.

-- ── (1) language is owned by the pipeline / schedule-narrate ─────────────────────────────
create or replace function public.sync_schedule_task_context()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s record;
begin
  select variety_id into s from public.crop_schedules where id = NEW.schedule_id;
  if s is not null and NEW.variety_id is null then
    NEW.variety_id := s.variety_id;
  end if;
  return NEW;
end;
$$;

comment on function public.sync_schedule_task_context() is
'Preserves schedule-level variety_id at task persistence when the task payload omits it. Never sets language: NULL language means "not narrated" and is owned by ai-smart-schedule / schedule-narrate.';

-- ── (2) variety-scope gaps go where the pipeline reads gaps ──────────────────────────────
create or replace function public.annotate_schedule_variety_scope_gaps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare m jsonb; gaps jsonb; g text;
begin
  m := coalesce(NEW.metadata, '{}'::jsonb);
  gaps := coalesce(m->'gaps', '[]'::jsonb);
  if jsonb_typeof(gaps) <> 'array' then gaps := '[]'::jsonb; end if;
  if NEW.variety_id is not null then
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'fertilizer_recommendation_master' and column_name = 'variety_id') then
      g := 'fertilizer_variety_unscoped:' || NEW.variety_id::text;
      if not gaps ? g then gaps := gaps || to_jsonb(g); end if;
    end if;
    if not exists (select 1 from public.crop_baseline_guidelines_v2 where is_active = true and variety_id = NEW.variety_id) then
      g := 'irrigation_variety_unscoped:' || NEW.variety_id::text;
      if not gaps ? g then gaps := gaps || to_jsonb(g); end if;
    end if;
  end if;
  NEW.metadata := jsonb_set(m, '{gaps}', gaps, true);
  return NEW;
end;
$$;

-- ── (3) governance trigger uses the same method acceptance set as the generator ──────────
create or replace function public.enforce_schedule_task_rule_governance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  bad record;
  accepted text[];
begin
  if NEW.rule_ids is null or cardinality(NEW.rule_ids) = 0 then return NEW; end if;

  select cultivation_method,
         generation_params->'resolved_inputs'->>'cultivationMethod' as farmer_method,
         generation_params->'resolved_inputs'->>'stageClockMethod'  as stage_clock_method
    into s
    from public.crop_schedules
   where id = NEW.schedule_id;

  for bad in
    select r.rule_id
      from public.decision_rules r
     where r.rule_id = any(NEW.rule_ids)
       and r.trigger_class = 'CONTEXT_SCHEDULE'
       and r.is_active = true
       and (r.is_safety_block = true or r.is_farmer_servable = false)
  loop
    raise exception 'Unsafe/non-servable schedule rule % cannot be persisted', bad.rule_id;
  end loop;

  accepted := array_remove(array['any', s.cultivation_method, s.farmer_method, s.stage_clock_method]::text[], null);

  if cardinality(accepted) > 1 and exists (
    select 1
      from public.decision_rules r
     where r.rule_id = any(NEW.rule_ids)
       and r.trigger_class = 'CONTEXT_SCHEDULE'
       and r.is_active = true
       and r.cultivation_method_applicable is not null
       and cardinality(r.cultivation_method_applicable) > 0
       and not (r.cultivation_method_applicable && accepted)
  ) then
    raise exception 'Schedule task rule is not applicable to the schedule cultivation method';
  end if;

  return NEW;
end;
$$;

-- ── (4) repair rows stamped by the old sync trigger ──────────────────────────────────────
update public.schedule_tasks
   set language = null,
       updated_at = now()
 where language is not null
   and (resources->>'needs_translation') = 'true';

-- ── (5) anchor lands that have an active schedule but no planting_date ────────────────────
update public.lands l
   set planting_date = s.sowing_date,
       gdd_anchor_type = coalesce(l.gdd_anchor_type, 'planting'),
       gdd_anchor_date = coalesce(l.gdd_anchor_date, s.sowing_date),
       updated_at = now()
  from public.crop_schedules s
 where s.land_id = l.id
   and s.is_active = true
   and s.status = 'active'
   and l.planting_date is null
   and s.sowing_date is not null;
