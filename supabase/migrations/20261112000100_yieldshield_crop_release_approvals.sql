-- YieldShield scientific approval register. STAGING FIRST; this migration is not
-- automatically deployed by source CI. No approvals are seeded or inferred.
-- It authorizes a crop × selected method × cycle × region × variety combination
-- only after external agronomist review and fingerprinting of the selected stage graph.
create table if not exists public.yieldshield_crop_release_approvals (
  id uuid primary key default gen_random_uuid(),
  crop_code text not null check (length(btrim(crop_code)) > 0),
  cultivation_method text not null check (length(btrim(cultivation_method)) > 0),
  crop_cycle text not null check (length(btrim(crop_cycle)) > 0),
  region_code text not null check (length(btrim(region_code)) > 0),
  variety_id uuid null,
  status text not null default 'revoked' check (status in ('approved', 'revoked')),
  stage_graph_sha256 text not null check (stage_graph_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_bundle_sha256 text not null check (evidence_bundle_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text not null check (length(btrim(reviewed_by)) > 0),
  reviewed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yieldshield_release_approval_period check (expires_at > reviewed_at),
  constraint yieldshield_release_approval_scope unique nulls not distinct
    (crop_code, cultivation_method, crop_cycle, region_code, variety_id)
);
alter table public.yieldshield_crop_release_approvals enable row level security;
revoke all on table public.yieldshield_crop_release_approvals from PUBLIC, anon, authenticated;
grant select on table public.yieldshield_crop_release_approvals to service_role;
comment on table public.yieldshield_crop_release_approvals is
'Default-deny scientific approval registry. No automatic approvals. Managed by privileged, audited agronomist review; Edge generator reads using service role only.';
