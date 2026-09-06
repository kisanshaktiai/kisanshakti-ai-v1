-- 2026-09-06 — resolve_crop_phenology(uuid): the ACTIVE SCHEDULE is the crop-cycle SSOT.
--
-- Live defect (verified): the land-id wrapper took crop / cycle / variety / dates from `lands`,
-- took only cultivation_method from the schedule, forced 'transplanted' whenever any
-- transplant_date existed (even a stale one from a previous crop), and finally GUESSED the
-- method from a hard-coded crop list with a transplanted default. It also passed
-- lower(lands.current_crop) straight through as a crop code, so lands whose current_crop is a
-- label or a local-language name ("brinjal (eggplant)", "तांदूळ") never resolved at all.
--
-- New precedence (no agronomy, no crop list):
--   1. the active crop_schedule (crop, variety, cultivation_method, crop_cycle, sowing_date,
--      transplant_date) — the farmer's own declared cycle;
--   2. the land record only for what the schedule does not carry (or when no schedule exists);
--   3. crop code resolved through crops / crop_synonyms (the same SSOT the app uses);
--   4. cultivation_method: schedule → land-only fallback ONLY when the crop's stage graph
--      defines exactly one method (a structural fact, not a guess) → otherwise UNRESOLVED:
--      the function returns no row, and every caller (reconciler, farm state, proactive
--      evaluator, chat) already treats "no row" as phenology_unresolved.
--   transplant_date is an ANCHOR passed to the phenology model; it never chooses the method.
-- Signature, return type and the delegated full resolver are unchanged.

create or replace function public.resolve_crop_phenology(p_land_id uuid)
 returns table(stage_uuid uuid, stage_code text, growth_stage text, crop_code text, crop_cycle text, cultivation_method text, previous_stage_uuid uuid, next_stage_uuid uuid, expected_transition_date date, reference_system text, phenology_model text, current_das integer, current_dat integer, current_gdd numeric, expected_height_cm_min numeric, expected_height_cm_max numeric, expected_leaf_count_min integer, expected_leaf_count_max integer, expected_ndvi_min numeric, expected_ndvi_max numeric, phenology_index numeric, confidence numeric, evidence_sources text[], source text, resolver_version integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_land               record;
  v_sched              record;
  v_crop_input         text;
  v_crop_code          text;
  v_crop_cycle         text;
  v_cultivation_method text;
  v_variety_id         uuid;
  v_sow_date           date;
  v_transplant_date    date;
  v_current_gdd        numeric;
  v_method_count       integer;
begin
  -- 1. Land record (secondary source)
  select l.current_crop, l.crop_cycle, l.current_crop_variety_id,
         l.planting_date, l.last_sowing_date, l.transplant_date, l.current_gdd
    into v_land
    from public.lands l
   where l.id = p_land_id;
  if not found then return; end if;

  -- 2. Active schedule (primary source). One active schedule per land is the lifecycle rule;
  --    if several exist, the most recently created wins deterministically.
  select cs.crop_name, cs.variety_id, cs.cultivation_method, cs.crop_cycle,
         cs.sowing_date, cs.transplant_date
    into v_sched
    from public.crop_schedules cs
   where cs.land_id = p_land_id
     and cs.is_active = true
     and cs.status = 'active'
   order by cs.created_at desc
   limit 1;

  -- 3. Crop code: schedule crop first, then land crop; resolved through the crop SSOT.
  v_crop_input := coalesce(nullif(trim(v_sched.crop_name), ''), nullif(trim(v_land.current_crop), ''));
  if v_crop_input is null then return; end if;

  select lower(c.value) into v_crop_code
    from public.crops c
   where c.is_active = true
     and (lower(c.value) = lower(v_crop_input) or lower(c.label) = lower(v_crop_input)
          or c.label_local = v_crop_input or c.local_name = v_crop_input)
   limit 1;
  if v_crop_code is null then
    select lower(s.canonical_crop) into v_crop_code
      from public.crop_synonyms s
     where s.is_active = true and lower(s.variant_name) = lower(v_crop_input)
     limit 1;
  end if;
  if v_crop_code is null then v_crop_code := lower(v_crop_input); end if;

  -- 4. Cycle, variety, anchors: schedule first, land second.
  v_crop_cycle      := lower(coalesce(nullif(v_sched.crop_cycle, ''), nullif(v_land.crop_cycle, ''), ''));
  v_variety_id      := coalesce(v_sched.variety_id, v_land.current_crop_variety_id);
  v_sow_date        := coalesce(v_sched.sowing_date, v_land.planting_date, v_land.last_sowing_date);
  v_transplant_date := coalesce(v_sched.transplant_date, case when v_sched.crop_name is null then v_land.transplant_date else null end);
  v_current_gdd     := v_land.current_gdd;

  -- 5. Cultivation method: declared by the schedule, or structurally unique for the crop.
  --    Never inferred from a date, a crop name, or a default.
  v_cultivation_method := lower(nullif(trim(coalesce(v_sched.cultivation_method, '')), ''));
  if v_cultivation_method is null then
    select count(distinct lower(m.cultivation_method)),
           min(lower(m.cultivation_method))
      into v_method_count, v_cultivation_method
      from public.crop_stage_master m
     where lower(m.crop_code) = v_crop_code and m.is_active = true
       and m.cultivation_method is not null;
    if coalesce(v_method_count, 0) <> 1 then
      return;  -- unresolved: more than one possible phenology, no farmer declaration
    end if;
  end if;

  -- 6. Guard: need a crop and an anchor date.
  if v_crop_code = '' or v_sow_date is null then return; end if;

  -- 7. Delegate to the full resolver (unchanged).
  return query
  select * from public.resolve_crop_phenology(
    p_crop_code          := v_crop_code,
    p_crop_cycle         := v_crop_cycle,
    p_cultivation_method := v_cultivation_method,
    p_variety_id         := v_variety_id,
    p_sow_date           := v_sow_date,
    p_transplant_date    := v_transplant_date,
    p_current_gdd        := v_current_gdd,
    p_as_of              := current_date,
    p_land_id            := p_land_id
  );
end;
$function$;

comment on function public.resolve_crop_phenology(uuid) is
'Stage SSOT for a land. Precedence: active crop_schedule → lands. Cultivation method is never guessed: schedule value, else the crop''s single defined method, else unresolved (no row).';
