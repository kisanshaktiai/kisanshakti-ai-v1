-- 2026-09-07 — LLM enrichment tier: proposal ledger + promotion into decision_rules.
-- Every practice the schedule model proposes for a domain the database left empty is recorded
-- here with its verification outcome. Verified proposals were served to the farmer as ordinary
-- tasks; rejected ones were NOT shown. An agronomist promotes a proposal with
-- promote_llm_proposal(), which writes a governed decision_rules row so the next schedule for
-- that crop/method/region takes it from the database (tier 1) instead of asking the model.

create table if not exists public.schedule_llm_proposals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid,
  farmer_id         uuid,
  land_id           uuid references public.lands(id) on delete set null,
  schedule_id       uuid references public.crop_schedules(id) on delete set null,
  crop_code         text not null,
  variety_id        uuid,
  cultivation_method text,
  region_code       text,
  stage_key         text not null,
  domain            text not null,
  task_type         text not null,
  proposal          jsonb not null,
  verification      jsonb not null default '{}'::jsonb,
  rag_evidence      jsonb not null default '[]'::jsonb,
  rejection_reasons text[] not null default '{}',
  status            text not null check (status in ('verified','pending_review','rejected','promoted')),
  model             text,
  candidate_id      text,
  reviewed_by       text,
  reviewed_at       timestamptz,
  review_note       text,
  promoted_rule_id  text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_sched_llm_proposals_review on public.schedule_llm_proposals (status, crop_code, domain, created_at desc);
create index if not exists idx_sched_llm_proposals_schedule on public.schedule_llm_proposals (schedule_id);

alter table public.schedule_llm_proposals enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polrelid='public.schedule_llm_proposals'::regclass and polname='sched_llm_proposals_service_all') then
    create policy sched_llm_proposals_service_all on public.schedule_llm_proposals for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policy where polrelid='public.schedule_llm_proposals'::regclass and polname='sched_llm_proposals_tenant_read') then
    create policy sched_llm_proposals_tenant_read on public.schedule_llm_proposals for select to authenticated
      using (tenant_id::text = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'tenant_id', ''));
  end if;
end $$;

-- Promotion: agronomist-approved proposal → decision_rules row (governed, dated or observation-triggered per the proposal).
create or replace function public.promote_llm_proposal(p_proposal_id uuid, p_reviewer text, p_rule_id text default null, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pr        record;
  v_rule_id text;
  v_input   jsonb;
  v_cat     text;
  v_trigger text;
  v_cond    jsonb;
  v_steps   text;
begin
  select * into pr from public.schedule_llm_proposals where id = p_proposal_id;
  if not found then raise exception 'proposal % not found', p_proposal_id; end if;
  if pr.status = 'promoted' then return pr.promoted_rule_id; end if;

  v_input := coalesce(pr.proposal->'inputs'->0, '{}'::jsonb);
  v_cond  := coalesce(pr.proposal->'condition', '{"type":"none"}'::jsonb);
  v_cat   := case pr.domain
               when 'WEED' then 'weed' when 'PEST' then 'pest' when 'DISEASE' then 'disease'
               when 'PGR' then 'physiology' when 'IRRIGATION' then 'irrigation'
               when 'NUTRIENT' then 'nutrition' when 'MICRONUTRIENT' then 'nutrition'
               when 'ORGANIC_INPUT' then 'nutrition' when 'BIOLOGICAL_INPUT' then 'nutrition'
               else 'management' end;
  v_trigger := case when v_cond->>'type' in ('observation','weather','soil_test') then 'OBSERVATION' else 'CONTEXT_SCHEDULE' end;
  v_rule_id := coalesce(p_rule_id, upper(pr.crop_code) || '_' || upper(pr.domain) || '_LLM_' || to_char(now(), 'YYYYMMDDHH24MISS'));
  v_steps := (select string_agg(x, ' ') from jsonb_array_elements_text(coalesce(pr.proposal->'action_steps','[]'::jsonb)) x);

  insert into public.decision_rules (
    rule_id, crop_code, category, action_type, action_text, knowledge_text, reason_text,
    trigger_class, stage_applicable, growth_stage, cultivation_method_applicable, region_code,
    active_ingredient, dosage_per_acre, water_volume_per_acre, application_method, phi_days,
    etl_threshold, condition_code, requires_field_action, contraindications,
    is_active, expert_approved, approved_by, approval_date, verification_status, regulatory_status,
    scientific_source, is_system_derived, derived_from, input_class, confidence_score, priority, scope
  ) values (
    v_rule_id, pr.crop_code, v_cat,
    case when v_trigger = 'OBSERVATION' then 'apply_treatment' else 'recommend' end,
    coalesce(pr.proposal->>'title','') || '. ' || coalesce(v_steps,''),
    pr.proposal->>'purpose', pr.proposal->>'purpose',
    v_trigger, array[pr.stage_key], pr.stage_key,
    case when pr.cultivation_method is null then array['any'] else array[pr.cultivation_method] end,
    pr.region_code,
    v_input->>'active_ingredient',
    case when v_input->>'dose_value' is not null then (v_input->>'dose_value') || ' ' || coalesce(v_input->>'dose_unit','') else null end,
    case when v_input->>'water_volume_l_per_acre' is not null then (v_input->>'water_volume_l_per_acre') || ' L' else null end,
    pr.proposal->>'method',
    nullif(pr.proposal->>'phi_days','')::int,
    coalesce(v_cond->>'etl', v_cond->>'text'), v_cond->>'etl',
    true,
    (select array_agg(x) from jsonb_array_elements_text(coalesce(pr.proposal->'precautions','[]'::jsonb)) x),
    true, true, p_reviewer, now(), 'verified', 'approved',
    'LLM proposal ' || pr.id::text || ' (' || coalesce(pr.proposal->>'source_kind','') || '), promoted by ' || p_reviewer,
    true, 'schedule_llm_proposals:' || pr.id::text,
    case when (v_input->>'organic')::boolean then 'organic' when v_input->>'kind' in ('herbicide','insecticide','fungicide','pgr','acaricide','nematicide') then 'synthetic_chemical' when v_input->>'kind' in ('fertilizer','micronutrient') then 'synthetic_fertilizer' else null end,
    nullif(pr.proposal->>'confidence','')::numeric, 3, 'global'
  );

  update public.schedule_llm_proposals
     set status = 'promoted', promoted_rule_id = v_rule_id, reviewed_by = p_reviewer, reviewed_at = now(), review_note = p_note
   where id = p_proposal_id;
  return v_rule_id;
end;
$$;

comment on function public.promote_llm_proposal(uuid, text, text, text) is
'Agronomist promotion of a verified/pending LLM proposal into decision_rules. The rule is created expert_approved and regulatory_status=approved because the reviewer is asserting it; servability is then computed by the existing generated column.';

-- Review helpers (read-only):
--   select id, crop_code, domain, stage_key, proposal->>'title', status, rejection_reasons from schedule_llm_proposals where status='pending_review' order by created_at desc;
--   select promote_llm_proposal('<id>', 'agronomist@kisanshakti');
