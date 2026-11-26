-- =====================================================================================
-- 20261120090000_harvest_card_still_in_field_cap.sql
--
-- First live day of the harvest card (20261119120000): for all four fields in their
-- countdown the end of the crop's harvest window had already passed, so
-- max_expected_date was in the past and the card hid "Crop is still in the field".
-- A farmer standing in a field that is still not cut (harvester, labour, rain, the
-- factory's cutting turn) could only say "harvest done" or watch the land be released.
--
-- Change (one expression in crop_cycle_close_plan, everything else identical to the
-- live definition from 20261119120000):
--   max_expected_date = greatest(harvest-window end + still_in_field_margin_days,
--                                p_as_of + grace_days)
-- record_crop_harvest validates the farmer's date against this same column, so the app
-- and the database stay in step. Each answer moves the release day by at most
-- grace_days from the day it is given; the land is never held without the farmer
-- answering again.
--
-- Second change, record_crop_harvest: "today" is the farmer's own calendar day
-- (farmers.timezone, all rows 'Asia/Kolkata' today, column default the same) instead of
-- the database's UTC current_date. Between local midnight and 05:30 IST the two differ:
-- "harvest done — today" was refused as HARVEST_DATE_IN_FUTURE while the phone, which
-- uses the farmer's local day, offered that date. Everything else in the function is the
-- live definition from 20261119120000.
-- No table or row changes. No session state.
-- =====================================================================================

create or replace function public.crop_cycle_close_plan(p_as_of date default current_date)
returns table (
  schedule_id uuid, land_id uuid, tenant_id uuid, farmer_id uuid, land_name text,
  land_lifecycle text, crop_name text, crop_code text, cultivation_method text, variety_id uuid,
  sowing_date date, transplant_date date,
  harvest_date date, harvest_basis text, harvest_window_end date, max_expected_date date,
  notice_from date, grace_days integer, release_on date, days_left integer,
  card_due boolean, due boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pol as (
    select coalesce((c.config_value->>'enabled')::boolean, false)                  as enabled,
           coalesce((c.config_value->>'grace_days')::int, 10)                       as grace,
           -- no notice_from = nothing is ever released (fail closed)
           coalesce((c.config_value->>'notice_from')::date, 'infinity'::date)       as notice_from,
           coalesce((c.config_value->>'still_in_field_margin_days')::int, 0)        as margin,
           array(select lower(jsonb_array_elements_text(c.config_value->'harvest_growth_stages'))) as hs
      from public.system_config c
     where c.config_key = 'crop_cycle_auto_close_policy'
  ),
  s as (
    select cs.id, cs.land_id, cs.tenant_id, cs.farmer_id, l.name::text as land_name,
           l.lifecycle_status::text as land_lifecycle, cs.crop_name, cs.cultivation_method, cs.variety_id,
           cs.sowing_date, cs.transplant_date,
           nullif(cs.metadata #>> '{harvest_watch,farmer_expected_harvest_date}', '')::date as farmer_date,
           -- crop identity: the generator's own resolution first, then the crops /
           -- crop_synonyms lookup that _shared/crop-resolver.ts uses (exact matches only)
           lower(coalesce(
             nullif(cs.generation_params #>> '{resolved_inputs,cropCode}', ''),
             (select c.value from public.crops c
               where c.is_active
                 and lower(trim(cs.crop_name)) in (lower(c.value), lower(coalesce(c.label, '')), lower(coalesce(c.local_name, '')),
                                                   lower(coalesce(c.label_hi, '')), lower(coalesce(c.label_mr, '')))
               limit 1),
             (select c.value from public.crop_synonyms y join public.crops c on lower(c.value) = lower(y.canonical_crop)
               where y.is_active and lower(y.variant_name) = lower(trim(cs.crop_name))
               limit 1)
           )) as crop_code
      from public.crop_schedules cs
      join public.lands l on l.id = cs.land_id
     where cs.is_active = true
       and cs.sowing_date is not null
       and l.is_active = true
       and l.deleted_at is null
  ),
  vca as (
    -- the variety's own duration for this cultivation method, from its own reference date
    select s.id,
           max(case when v.duration_reference = 'transplanting' then s.transplant_date else s.sowing_date end
               + v.duration_days_max) as d
      from s
      join public.variety_cultivation_agronomy v
        on v.variety_id = s.variety_id
       and v.cultivation_method is not distinct from s.cultivation_method
       and v.duration_days_max is not null
     group by s.id
  ),
  mp as (
    select s.id, s.sowing_date + p.maturity_days_max as d
      from s join public.master_products p on p.id = s.variety_id
     where p.maturity_days_max is not null
  ),
  hm as (
    select m.*, lower(m.crop_code) as cc
      from public.crop_stage_master m, pol
     where m.is_active = true
       and lower(m.growth_stage) = any (pol.hs)
  ),
  h as (
    -- the crop's harvest window in its own lane; if the schedule's lane has no harvest
    -- row, every lane of the crop is used and the LATEST end is taken (never early)
    select s.id,
           max(case when m.das_reference = 'transplanting' then s.transplant_date else s.sowing_date end + m.das_max) as win_end
      from s
      join hm m on m.cc = s.crop_code
       and (m.cultivation_method is not distinct from s.cultivation_method
            or not exists (select 1 from hm m2 where m2.cc = s.crop_code
                             and m2.cultivation_method is not distinct from s.cultivation_method))
     group by s.id
  ),
  x as (
    select s.*, h.win_end,
           coalesce(s.farmer_date, vca.d, mp.d, h.win_end) as hdate,
           case when s.farmer_date is not null then 'farmer_reported'
                when vca.d is not null then 'variety_duration'
                when mp.d is not null then 'variety_maturity'
                when h.win_end is not null then 'crop_harvest_window'
                else 'no_harvest_timeline' end as basis
      from s
      left join vca on vca.id = s.id
      left join mp  on mp.id  = s.id
      left join h   on h.id   = s.id
  )
  select x.id, x.land_id, x.tenant_id, x.farmer_id, x.land_name, x.land_lifecycle, x.crop_name, x.crop_code,
         x.cultivation_method, x.variety_id, x.sowing_date, x.transplant_date,
         x.hdate, x.basis, x.win_end,
         -- 20261120: the latest 'crop still in the field' date is the later of the crop's
         -- harvest-window end (+ margin) and p_as_of + grace_days, so a farmer can always
         -- push the countdown on by up to grace_days from the day he answers
         greatest(x.win_end + pol.margin, p_as_of + pol.grace),
         pol.notice_from, pol.grace,
         greatest(x.hdate, pol.notice_from) + pol.grace,
         (greatest(x.hdate, pol.notice_from) + pol.grace) - p_as_of,
         pol.enabled and x.hdate is not null and p_as_of > x.hdate and p_as_of >= pol.notice_from
           and p_as_of < greatest(x.hdate, pol.notice_from) + pol.grace,
         pol.enabled and x.hdate is not null and greatest(x.hdate, pol.notice_from) + pol.grace <= p_as_of
    from x cross join pol;
$function$;

revoke all on function public.crop_cycle_close_plan(date) from public, anon, authenticated;
grant execute on function public.crop_cycle_close_plan(date) to service_role;

create or replace function public.record_crop_harvest(p_land_id uuid, p_farmer_id uuid, p_harvested boolean, p_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_land   record;
  v_s      record;
  v_p      record;
  v_new    record;
  v_alerts int := 0;
  v_decs   int := 0;
  v_today  date;
BEGIN
  SELECT id, farmer_id, tenant_id INTO v_land
    FROM public.lands
   WHERE id = p_land_id AND is_active = true AND deleted_at IS NULL;
  IF v_land.id IS NULL OR v_land.farmer_id IS DISTINCT FROM p_farmer_id THEN
    RAISE EXCEPTION 'LAND_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 20261120: "today" is the farmer's own calendar day (farmers.timezone), not the
  -- database's UTC day — between local midnight and 05:30 IST they differ, and a
  -- harvest done today was refused as HARVEST_DATE_IN_FUTURE. Falls back to
  -- current_date when the farmer has no valid timezone.
  SELECT (now() AT TIME ZONE f.timezone)::date INTO v_today
    FROM public.farmers f
   WHERE f.id = p_farmer_id
     AND f.timezone IN (SELECT name FROM pg_timezone_names);
  v_today := coalesce(v_today, current_date);

  SELECT * INTO v_s
    FROM public.crop_schedules
   WHERE land_id = p_land_id AND is_active = true
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF v_s.id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_CROP' USING ERRCODE = 'P0002';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'DATE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_harvested THEN
    IF p_date > v_today THEN
      RAISE EXCEPTION 'HARVEST_DATE_IN_FUTURE' USING ERRCODE = '22023';
    END IF;
    IF v_s.sowing_date IS NOT NULL AND p_date <= v_s.sowing_date THEN
      RAISE EXCEPTION 'HARVEST_DATE_BEFORE_SOWING' USING ERRCODE = '22023';
    END IF;

    -- the real harvest. The EXISTING BEFORE trigger fn_cascade_harvest_completion marks the
    -- schedule HARVESTED and inactive, frees the land with this date as last_harvest_date and
    -- writes HARVEST_COMPLETED. status is set here so the deactivation is not read as a cancel.
    UPDATE public.crop_schedules
       SET harvest_status       = 'FULLY_HARVESTED',
           actual_harvest_date  = p_date,
           harvest_confirmed_by = p_farmer_id,
           harvest_confirmed_at = now(),
           harvest_response     = coalesce(harvest_response, '{}'::jsonb)
                                  || jsonb_build_object('channel', 'harvest_card', 'reported_on', v_today),
           status               = 'completed',
           completed_at         = coalesce(completed_at, now()),
           updated_at           = now()
     WHERE id = v_s.id;

    -- the harvest trigger does not deactivate land_crops; do what
    -- fn_release_land_on_schedule_deactivate does for every other ending
    UPDATE public.land_crops SET is_active = false, updated_at = now()
     WHERE land_id = p_land_id AND is_active = true;

    -- nothing about the finished crop stays open for the farmer (rows kept, never deleted)
    WITH e AS (
      UPDATE public.proactive_alerts SET status = 'EXPIRED', updated_at = now()
       WHERE land_id = p_land_id AND status IN ('PENDING', 'DELIVERED', 'SEEN')
      RETURNING 1)
    SELECT count(*) INTO v_alerts FROM e;
    WITH e AS (
      UPDATE public.farm_decision SET status = 'EXPIRED', updated_at = now()
       WHERE land_id = p_land_id AND status IN ('DUE', 'WATCH', 'BLOCKED', 'INFO')
      RETURNING 1)
    SELECT count(*) INTO v_decs FROM e;

    RETURN jsonb_build_object('ok', true, 'harvested', true, 'schedule_id', v_s.id,
                              'actual_harvest_date', p_date, 'alerts_closed', v_alerts, 'decisions_closed', v_decs);
  END IF;

  -- "crop still in the field": a new expected harvest date, after today and not beyond the
  -- end of the crop's harvest window (+ the policy margin)
  SELECT * INTO v_p FROM public.crop_cycle_close_plan(v_today) p WHERE p.schedule_id = v_s.id;
  IF p_date <= v_today THEN
    RAISE EXCEPTION 'EXPECTED_DATE_NOT_IN_FUTURE' USING ERRCODE = '22023';
  END IF;
  IF v_p.max_expected_date IS NULL OR p_date > v_p.max_expected_date THEN
    RAISE EXCEPTION 'EXPECTED_DATE_BEYOND_CROP_WINDOW' USING ERRCODE = '22023';
  END IF;

  UPDATE public.crop_schedules
     SET metadata   = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('harvest_watch', jsonb_build_object(
                        'farmer_expected_harvest_date', p_date,
                        'reported_on', v_today,
                        'previous_harvest_date', v_p.harvest_date,
                        'previous_basis', v_p.harvest_basis)),
         updated_at = now()
   WHERE id = v_s.id;

  INSERT INTO public.crop_lifecycle_events
    (tenant_id, farmer_id, land_id, schedule_id, event_type, from_status, to_status, payload, actor)
  VALUES
    (v_land.tenant_id, p_farmer_id, p_land_id, v_s.id, 'HARVEST_EXPECTED_DATE_REPORTED', NULL, NULL,
     jsonb_build_object('farmer_expected_harvest_date', p_date, 'previous_harvest_date', v_p.harvest_date,
                        'previous_basis', v_p.harvest_basis, 'channel', 'harvest_card'),
     p_farmer_id);

  -- the answered card closes; a new one comes after the new date
  WITH e AS (
    UPDATE public.proactive_alerts SET status = 'ACTED', acted_at = now(), updated_at = now()
     WHERE land_id = p_land_id AND rule_id = 'HARVEST_CONFIRM_QUESTION' AND status IN ('PENDING', 'DELIVERED', 'SEEN')
    RETURNING 1)
  SELECT count(*) INTO v_alerts FROM e;

  SELECT * INTO v_new FROM public.crop_cycle_close_plan(v_today) p WHERE p.schedule_id = v_s.id;
  RETURN jsonb_build_object('ok', true, 'harvested', false, 'schedule_id', v_s.id,
                            'expected_harvest_date', p_date, 'release_on', v_new.release_on, 'alerts_closed', v_alerts);
END;
$function$;

revoke all on function public.record_crop_harvest(uuid, uuid, boolean, date) from public, anon, authenticated;
grant execute on function public.record_crop_harvest(uuid, uuid, boolean, date) to service_role;
