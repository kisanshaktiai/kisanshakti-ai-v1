create or replace function public.annotate_schedule_variety_scope_gaps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare g jsonb; gaps jsonb;
begin
  g := coalesce(NEW.generation_params, '{}'::jsonb);
  gaps := coalesce(g->'gaps','[]'::jsonb);
  if NEW.variety_id is not null then
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fertilizer_recommendation_master' and column_name='variety_id') then
      gaps := gaps || to_jsonb('fertilizer_variety_unscoped:' || NEW.variety_id::text);
    end if;
    if not exists (select 1 from public.crop_baseline_guidelines_v2 where is_active=true and variety_id=NEW.variety_id) then
      gaps := gaps || to_jsonb('irrigation_variety_unscoped:' || NEW.variety_id::text);
    end if;
  end if;
  NEW.generation_params := jsonb_set(g,'{gaps}',gaps,true);
  return NEW;
end;
$$;

drop trigger if exists trg_annotate_schedule_variety_scope_gaps on public.crop_schedules;
create trigger trg_annotate_schedule_variety_scope_gaps before insert on public.crop_schedules for each row execute function public.annotate_schedule_variety_scope_gaps();