-- 2026-09-06 — SECURITY (separate from the scheduler patch). Supabase advisor: RLS disabled on
-- public.env_observations_202612 and public.spatial_ref_sys.
--
-- env_observations_202612 is a partition of env_observations. Every sibling partition
-- (202608..202611, _hist) already has RLS enabled with NO partition-level policies — the parent's
-- policies (env_observations_tenant_read, env_observations_service_write) govern access through
-- the parent, and direct partition access is denied. Enabling RLS here makes 202612 identical to
-- its siblings; no policy is added because none exists on any sibling.
alter table public.env_observations_202612 enable row level security;

-- spatial_ref_sys is PostGIS public reference data (EPSG definitions). Enable RLS and allow reads
-- so geometry transforms keep working for every role. Owned by the extension in some projects, so
-- the ALTER is attempted and reported rather than allowed to abort the migration.
do $$
begin
  execute 'alter table public.spatial_ref_sys enable row level security';
  if not exists (select 1 from pg_policy where polrelid = 'public.spatial_ref_sys'::regclass and polname = 'spatial_ref_sys_read_all') then
    execute 'create policy spatial_ref_sys_read_all on public.spatial_ref_sys for select using (true)';
  end if;
exception when insufficient_privilege then
  raise notice 'spatial_ref_sys is owned by the PostGIS extension in this project; enable RLS on it from the dashboard as the owner role';
end
$$;
