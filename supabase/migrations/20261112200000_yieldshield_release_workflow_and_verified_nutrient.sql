-- YieldShield surgical fixes 2026-11-12 — STAGING FIRST. Not applied by source CI.
-- No farmer rows, schedules, tasks, approvals or agronomy reference rows are created or changed.
-- Every statement is idempotent and self-contained (no session state, no TEMP tables).
--
--   A. Controlled scientific approval workflow for public.yieldshield_crop_release_approvals
--      (the registry had a reader and no writer, so no crop could ever leave "provisional").
--   B. Verified nutrient-action producer: the only emitter of APPLY_NUTRIENT_VERIFIED.
--   C. Privilege closure for SECURITY DEFINER engine functions callable by `authenticated`.

-- ───────────────────────────── A. approval workflow ─────────────────────────────
-- Registry (same shape as 20261112000100; repeated IF NOT EXISTS so A is deployable alone).
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

-- Append-only audit of every approval / revocation. Never updated, never deleted.
create table if not exists public.yieldshield_crop_release_approval_audit (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null,
  action text not null check (action in ('approve', 'revoke')),
  crop_code text not null,
  cultivation_method text not null,
  crop_cycle text not null,
  region_code text not null,
  variety_id uuid null,
  stage_graph_sha256 text not null,
  evidence_bundle_sha256 text not null,
  reviewed_by text not null,
  review_note text null,
  expires_at timestamptz null,
  recorded_at timestamptz not null default now()
);
alter table public.yieldshield_crop_release_approval_audit enable row level security;
revoke all on table public.yieldshield_crop_release_approval_audit from PUBLIC, anon, authenticated;
grant select on table public.yieldshield_crop_release_approval_audit to service_role;

-- The ONLY write path. Service role only. An approval binds one exact scope to one exact
-- stage-graph fingerprint (ai-smart-schedule action "release_fingerprint" returns it) and to the
-- hash of the evidence bundle the reviewer signed. It does not and cannot approve an individual
-- chemical, dose or rule: those stay governed by decision_rules.expert_approved.
create or replace function public.yieldshield_record_crop_release(
  p_action text,
  p_crop_code text,
  p_cultivation_method text,
  p_crop_cycle text,
  p_region_code text,
  p_variety_id uuid,
  p_stage_graph_sha256 text,
  p_evidence_bundle_sha256 text,
  p_reviewed_by text,
  p_expires_at timestamptz default null,
  p_review_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_id uuid;
  v_now timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'yieldshield_record_crop_release: service role required' using errcode = '42501';
  end if;
  if v_action not in ('approve', 'revoke') then
    raise exception 'action must be approve or revoke' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_crop_code, ''))) = 0 or length(btrim(coalesce(p_cultivation_method, ''))) = 0
     or length(btrim(coalesce(p_crop_cycle, ''))) = 0 or length(btrim(coalesce(p_region_code, ''))) = 0 then
    raise exception 'crop, cultivation method, crop cycle and region are all required' using errcode = '22023';
  end if;
  if coalesce(p_stage_graph_sha256, '') !~ '^[0-9a-f]{64}$' or coalesce(p_evidence_bundle_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'stage graph and evidence bundle fingerprints must be lowercase sha256' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reviewed_by, ''))) = 0 then
    raise exception 'reviewer identity is required' using errcode = '22023';
  end if;
  if v_action = 'approve' and (p_expires_at is null or p_expires_at <= v_now) then
    raise exception 'an approval needs a future expiry' using errcode = '22023';
  end if;

  if v_action = 'approve' then
    insert into public.yieldshield_crop_release_approvals as a
      (crop_code, cultivation_method, crop_cycle, region_code, variety_id, status,
       stage_graph_sha256, evidence_bundle_sha256, reviewed_by, reviewed_at, expires_at, updated_at)
    values (btrim(p_crop_code), btrim(p_cultivation_method), btrim(p_crop_cycle), btrim(p_region_code), p_variety_id,
            'approved', p_stage_graph_sha256, p_evidence_bundle_sha256, btrim(p_reviewed_by), v_now, p_expires_at, v_now)
    on conflict on constraint yieldshield_release_approval_scope do update set
      status = 'approved', stage_graph_sha256 = excluded.stage_graph_sha256,
      evidence_bundle_sha256 = excluded.evidence_bundle_sha256, reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at, expires_at = excluded.expires_at, updated_at = v_now
    returning a.id into v_id;
  else
    update public.yieldshield_crop_release_approvals a
       set status = 'revoked', updated_at = v_now
     where a.crop_code = btrim(p_crop_code) and a.cultivation_method = btrim(p_cultivation_method)
       and a.crop_cycle = btrim(p_crop_cycle) and a.region_code = btrim(p_region_code)
       and a.variety_id is not distinct from p_variety_id
    returning a.id into v_id;
    if v_id is null then
      raise exception 'no approval exists for this scope' using errcode = 'P0002';
    end if;
  end if;

  insert into public.yieldshield_crop_release_approval_audit
    (approval_id, action, crop_code, cultivation_method, crop_cycle, region_code, variety_id,
     stage_graph_sha256, evidence_bundle_sha256, reviewed_by, review_note, expires_at, recorded_at)
  values (v_id, v_action, btrim(p_crop_code), btrim(p_cultivation_method), btrim(p_crop_cycle), btrim(p_region_code), p_variety_id,
          p_stage_graph_sha256, p_evidence_bundle_sha256, btrim(p_reviewed_by), p_review_note,
          case when v_action = 'approve' then p_expires_at end, v_now);

  return jsonb_build_object('ok', true, 'approval_id', v_id, 'action', v_action);
end;
$function$;
revoke all on function public.yieldshield_record_crop_release(text,text,text,text,text,uuid,text,text,text,timestamptz,text) from PUBLIC, anon, authenticated;
grant execute on function public.yieldshield_record_crop_release(text,text,text,text,text,uuid,text,text,text,timestamptz,text) to service_role;

-- ─────────────────────── B. verified nutrient-action producer ───────────────────────
-- Emits farm_decision DUE / APPLY_NUTRIENT_VERIFIED only when ALL of these hold for the land:
--   * an expert-approved, farmer-servable nutrition rule of this crop and current stage requires a
--     'nutrient' observation and carries a TYPED threshold: etl_value_min, with etl_unit_type equal
--     to the measurement_type of the crop's active observation_protocol;
--   * a land_observation of that measurement_type exists inside the rule's lookback, with a value
--     inside the protocol's valid range (a reading outside the instrument range is not evidence);
--   * the reading is BELOW the rule's etl_value_min (the approved critical value).
-- It never estimates a reading, never reads a threshold out of prose and never sets a quantity:
-- the reconciler only brings the already-approved nutrition card forward inside its own window.
-- With no typed threshold or no reading it emits nothing and the WATCH decision stands.
create or replace function public.derive_verified_nutrient_decisions(
  p_land_id uuid,
  p_date date default current_date,
  p_obs_lookback_days integer default 7
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_st record; v_rule record; v_proto record; v_obs record;
  v_due integer := 0; v_checked integer := 0;
begin
  select land_id, tenant_id, farmer_id, crop_code, stage_code, growth_stage
    into v_st from public.land_farm_state where land_id = p_land_id and state_date = p_date;
  if not found or v_st.stage_code is null then
    return jsonb_build_object('ok', true, 'due', 0, 'reason', 'no_stage_state');
  end if;

  select p.measurement_type, p.value_min, p.value_max, p.unit into v_proto
    from public.observation_protocol p
   where p.observation_category = 'nutrient' and p.is_active
     and (p.crop_code is null or lower(p.crop_code) = lower(v_st.crop_code))
   order by (p.crop_code is not null) desc limit 1;
  if v_proto.measurement_type is null then
    return jsonb_build_object('ok', true, 'due', 0, 'reason', 'no_nutrient_observation_protocol');
  end if;

  for v_rule in
    select dr.rule_id, dr.etl_value_min, dr.forecast_horizon_days, dr.scientific_source
      from public.decision_rules dr
     where lower(dr.crop_code) = lower(v_st.crop_code) and dr.is_active
       and coalesce(dr.expert_approved, false) and coalesce(dr.is_farmer_servable, true)
       and lower(coalesce(dr.category, '')) = 'nutrition'
       and dr.required_observation_category is not null
       and exists (select 1 from unnest(dr.required_observation_category) c where lower(c) = 'nutrient')
       and dr.etl_value_min is not null
       and lower(coalesce(dr.etl_unit_type, '')) = lower(v_proto.measurement_type)
       and ( lower(coalesce(dr.growth_stage, '')) = lower(coalesce(v_st.growth_stage, ''))
          or exists (select 1 from unnest(dr.stage_applicable) s
                      where lower(s) in (lower(v_st.stage_code), lower(coalesce(v_st.growth_stage, '')))) )
  loop
    v_checked := v_checked + 1;
    select o.id, o.value, o.observed_at, o.source into v_obs
      from public.land_observation o
     where o.land_id = p_land_id
       and lower(o.measurement_type) = lower(v_proto.measurement_type)
       and o.value is not null
       and (v_proto.value_min is null or o.value >= v_proto.value_min)
       and (v_proto.value_max is null or o.value <= v_proto.value_max)
       and o.observed_at >= (p_date - coalesce(v_rule.forecast_horizon_days, p_obs_lookback_days))::timestamptz
       and o.observed_at < (p_date + 1)::timestamptz
     order by o.observed_at desc limit 1;
    if v_obs.id is null or v_obs.value >= v_rule.etl_value_min then
      continue;
    end if;
    perform public.upsert_farm_decision(p_land_id, v_st.tenant_id, v_st.farmer_id, null, null, p_date,
      'observe:nutrient:verified:' || v_rule.rule_id, 'nutrient', 'DUE', 'high', 'APPLY_NUTRIENT_VERIFIED',
      'Crop reading is below the approved level',
      'The recorded crop reading is below the approved critical value for this stage. Apply the planned top-dressing from your schedule; the quantity on the schedule card is unchanged.',
      v_rule.rule_id, null,
      jsonb_build_object('observation_id', v_obs.id, 'measurement_type', v_proto.measurement_type,
        'observed_value', v_obs.value, 'observed_at', v_obs.observed_at, 'observation_source', v_obs.source,
        'threshold_below', v_rule.etl_value_min, 'unit', v_proto.unit, 'rule', v_rule.rule_id,
        'source', coalesce(v_rule.scientific_source, 'decision_rules'),
        'producer', 'derive_verified_nutrient_decisions@1.0.0'),
      'verified_nutrient_producer', p_date + 1);
    v_due := v_due + 1;
  end loop;

  return jsonb_build_object('ok', true, 'due', v_due, 'rules_checked', v_checked,
                            'measurement_type', v_proto.measurement_type);
end;
$function$;
revoke all on function public.derive_verified_nutrient_decisions(uuid, date, integer) from PUBLIC, anon, authenticated;
grant execute on function public.derive_verified_nutrient_decisions(uuid, date, integer) to service_role;

-- ───────────────────────────── C. privilege closure ─────────────────────────────
-- Verified on the live project 2026-11-12: these SECURITY DEFINER functions take a caller-supplied
-- land id, perform no ownership check, write engine state (or run for every land) and were
-- executable by `authenticated`. Every caller in this repository is an Edge Function using the
-- service role. Read-only resolvers used by the app are intentionally not touched here.
do $closure$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.apply_stage_transitions(uuid)',
    'public.initialize_crop_cycle_stage(uuid)',
    'public.run_daily_phenology()',
    'public.reconcile_schedule_for_land(uuid)',
    'public.persist_ai_crop_schedule_atomic(jsonb,jsonb,jsonb)'
  ] loop
    if to_regprocedure(v_sig) is not null then
      execute format('revoke all on function %s from PUBLIC, anon, authenticated', v_sig);
      execute format('grant execute on function %s to service_role', v_sig);
    end if;
  end loop;
end;
$closure$;
