create or replace function public.sync_schedule_task_context()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s record;
begin
  select variety_id, generation_language into s from public.crop_schedules where id = NEW.schedule_id;
  if s is not null then
    if NEW.variety_id is null then NEW.variety_id := s.variety_id; end if;
    if NEW.language is null or btrim(NEW.language) = '' then NEW.language := coalesce(s.generation_language, 'en'); end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_schedule_task_context on public.schedule_tasks;
create trigger trg_sync_schedule_task_context before insert on public.schedule_tasks for each row execute function public.sync_schedule_task_context();