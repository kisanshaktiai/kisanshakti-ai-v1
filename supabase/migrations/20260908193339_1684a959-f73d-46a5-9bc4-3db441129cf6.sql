create or replace function public.get_sweep_key(p_name text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare v text;
begin
  if p_name is null or p_name not in ('schedule_narrate_key','schedule_reconciler_key') then
    return null;
  end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = p_name limit 1;
  return v;
end;
$$;

revoke all on function public.get_sweep_key(text) from public, anon, authenticated;
grant execute on function public.get_sweep_key(text) to service_role;