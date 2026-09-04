create or replace function public.enforce_schedule_task_rule_governance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s record; bad record;
begin
  if NEW.rule_ids is null or cardinality(NEW.rule_ids)=0 then return NEW; end if;
  select cultivation_method into s from public.crop_schedules where id=NEW.schedule_id;
  for bad in select r.rule_id,r.is_farmer_servable,r.is_safety_block,r.cultivation_method_applicable from public.decision_rules r where r.rule_id=any(NEW.rule_ids) and r.trigger_class='CONTEXT_SCHEDULE' and r.is_active=true and (r.is_safety_block=true or r.is_farmer_servable=false) loop
    raise exception 'Unsafe/non-servable schedule rule % cannot be persisted',bad.rule_id;
  end loop;
  if s.cultivation_method is not null and exists(select 1 from public.decision_rules r where r.rule_id=any(NEW.rule_ids) and r.trigger_class='CONTEXT_SCHEDULE' and r.is_active=true and r.cultivation_method_applicable is not null and cardinality(r.cultivation_method_applicable)>0 and not ('any'=any(r.cultivation_method_applicable) or s.cultivation_method=any(r.cultivation_method_applicable))) then
    raise exception 'Schedule task rule is not applicable to the schedule cultivation method';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_schedule_task_rule_governance on public.schedule_tasks;
create trigger trg_enforce_schedule_task_rule_governance before insert or update of rule_ids,schedule_id on public.schedule_tasks for each row execute function public.enforce_schedule_task_rule_governance();