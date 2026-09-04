-- Production hardening matching the 2026-09-04 crop-schedule forensic audit.
-- Applied to the live Supabase project as the corresponding migration.

update public.rag_chunks c
set crop_codes = null
from public.rag_documents d
where c.document_id = d.id
  and c.is_active = true
  and d.id = '5cbe147f-85f1-49e1-b3ef-7b81028f3e23'::uuid
  and c.crop_codes is not null
  and not (c.crop_codes <@ coalesce(d.crop_codes, '{}'::text[]));

create or replace function public.assert_rag_chunk_crop_integrity()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.rag_chunks c
    join public.rag_documents d on d.id = c.document_id
    where c.is_active = true
      and d.is_active = true
      and c.crop_codes is not null
      and d.crop_codes is not null
      and not (c.crop_codes <@ d.crop_codes)
  ) then
    raise exception 'RAG chunk crop-code integrity violation';
  end if;
end;
$$;

revoke all on function public.assert_rag_chunk_crop_integrity() from public;
grant execute on function public.assert_rag_chunk_crop_integrity() to service_role;

create or replace function public.sync_schedule_task_context()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare s record;
begin
  select variety_id, generation_language into s
  from public.crop_schedules
  where id = NEW.schedule_id;
  if s is not null then
    if NEW.variety_id is null then NEW.variety_id := s.variety_id; end if;
    if NEW.language is null or btrim(NEW.language) = '' then NEW.language := coalesce(s.generation_language, 'en'); end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_schedule_task_context on public.schedule_tasks;
create trigger trg_sync_schedule_task_context
before insert on public.schedule_tasks
for each row execute function public.sync_schedule_task_context();

comment on function public.sync_schedule_task_context() is
'Preserves schedule-level variety and language at task persistence when the task payload omits them.';

select public.assert_rag_chunk_crop_integrity();
