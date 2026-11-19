-- =====================================================================================
-- 20261119120000_crop_cycle_auto_close.sql   (v3 — variety harvest date + farmer harvest card)
--
-- Crop-cycle authority: a crop's life on a land ends when it is harvested. Farmers
-- rarely tell us — until now the farmer app had no "harvest done" button, the only
-- harvest confirmations ever recorded (9) were set by one backend batch on 2026-06-06,
-- and the daily harvest job (cron 'harvest-engine-daily') posts to a schedules-api route
-- that does not exist and has been answered 401 every day. So the crop never ends, and
-- every service keeps running on fields that are already empty.
--
-- What this migration does (no table is created or dropped, no row is deleted):
--  1. system_config 'crop_cycle_auto_close_policy' (grace_days 10, notice_from = the day
--     this migration is applied, the harvest stage names, still_in_field_margin_days 0)
--     and the ui_translations rows for the harvest card (en / hi / mr).
--  2. crop_cycle_close_plan(as_of) — for every active, sown crop schedule:
--       harvest date, first match wins:
--         a. the date the farmer gave on the card ("crop still in the field")
--         b. variety_cultivation_agronomy.duration_days_max for the schedule's variety AND
--            cultivation method, counted from duration_reference (transplanting ->
--            transplant_date, else sowing_date)
--         c. master_products.maturity_days_max of the variety, from the sowing date
--         d. the end of the crop's harvest window in crop_stage_master (same lane;
--            transplanting reference -> transplant_date)
--       release_on = later of (harvest date, notice_from) + grace_days. A crop already
--         overdue on the day this goes live still gets the full warning period.
--       card_due   = after the harvest date, from notice_from, before release_on: the farmer
--         app shows the harvest card on app open with release_on - today days left.
--       max_expected_date = crop harvest-window end + still_in_field_margin_days: the latest
--         date the farmer may give for "crop still in the field".
--     A schedule with no harvest timeline at all (none of a-d) is never auto-closed.
--  3. land_has_active_crop_cycle(land): the one rule every service uses — land active, in a
--     crop-on-field state (CROP_ACTIVE / READY_FOR_HARVEST / WAITING_HARVEST_CONFIRMATION)
--     and holding an active crop schedule with a sowing date. Same rule in the proactive
--     evaluator (crop-cycle.ts), the satellite screen (useFieldSky.ts), the NDVI pipeline (db.py).
--  4. run_daily_crop_cycle_close(date, dry_run): on release_on, closes the schedule
--     (is_active=false, status='completed', metadata.auto_closed with every date used and
--     harvest_confirmed=false). The EXISTING trigger fn_release_land_on_schedule_deactivate
--     releases the land; the crop moves to previous_* as fn_cascade_harvest_completion does
--     (harvest dates are not invented); CROP_CYCLE_AUTO_CLOSED is written to
--     crop_lifecycle_events; open Farm Today decisions on lands with no crop -> EXPIRED.
--  5. record_crop_harvest(land, farmer, harvested, date) — the farmer's answer on the card,
--     called by proactive-question-seed (action 'harvest_answer') after the session is verified:
--       harvested = true  -> the real harvest: harvest_status FULLY_HARVESTED +
--                            actual_harvest_date; the EXISTING trigger
--                            fn_cascade_harvest_completion closes the schedule and frees the
--                            land with the true date. Date between sowing and today.
--       harvested = false -> "crop still in the field": the farmer's expected harvest date
--                            (after today, not beyond max_expected_date) is kept in
--                            metadata.harvest_watch; the countdown restarts from it.
--  6. The four daily jobs that picked lands by the left-over crop name now also require
--     land_has_active_crop_cycle: run_daily_phenology, run_daily_farm_state,
--     run_daily_farm_decisions, accumulate_gdd_batch (live bodies + that one condition).
--  7. Cron 'harvest-engine-daily' now runs run_daily_crop_cycle_close() at 00:45 UTC.
--
-- Resume: saving a new crop schedule — the existing trigger fn_block_double_active_schedule
-- moves the land back to CROP_ACTIVE; every service picks it up on its next run.
--
-- PREVIEW (read-only): run PRECHECK_20261119120000_crop_cycle_auto_close.sql first; after
-- applying: select * from public.crop_cycle_close_plan(current_date) order by release_on;
--           select public.run_daily_crop_cycle_close(current_date, true);  -- dry run
-- UNDO one auto-closed schedule: update crop_schedules set is_active=true, status='active',
--   completed_at=null, metadata = metadata - 'auto_closed' where id='<id>'; restore
--   lands.current_crop from previous_crop for that land.
-- No session state is used (safe for the stateless SQL runner).
-- =====================================================================================

-- 1. Policy and card texts ---------------------------------------------------------------
insert into public.system_config (config_key, config_value, description)
values (
  'crop_cycle_auto_close_policy',
  jsonb_build_object(
    'enabled', true,
    'grace_days', 10,
    'notice_from', to_jsonb(current_date),
    'still_in_field_margin_days', 0,
    'harvest_growth_stages', jsonb_build_array('harvest', 'harvest_maturity', 'maturation_harvest', 'successive_harvest')
  ),
  'Crop-cycle auto close. Harvest date = farmer''s card answer, else the variety duration (variety_cultivation_agronomy, then master_products), else the end of the crop''s harvest window in crop_stage_master. The land is released grace_days after the later of the harvest date and notice_from (the go-live day, so no crop is released without a full warning period). still_in_field_margin_days extends the latest date a farmer may give for "crop still in the field" beyond the crop''s harvest window. Read by crop_cycle_close_plan().'
)
on conflict (config_key) do nothing;

insert into public.ui_translations (ui_key, language_code, display_text) values
  ('harvest.question.title', 'en', 'Is the harvest of {{land}} done?'),
  ('harvest.question.title', 'hi', 'क्या {{land}} की कटाई हो गई?'),
  ('harvest.question.title', 'mr', '{{land}} ची काढणी झाली का?'),
  ('harvest.question.body',  'en', 'The harvest of {{land}} was due around {{harvest_date}}. Please enter the actual harvest date. If it is not updated, this land will be freed from its crop schedule on {{release_on}}.'),
  ('harvest.question.body',  'hi', '{{land}} की कटाई लगभग {{harvest_date}} को होनी थी। कृपया असली कटाई की तारीख डालें। अगर तारीख नहीं डाली गई, तो {{release_on}} को यह खेत फसल कार्यक्रम से अपने आप मुक्त हो जाएगा।'),
  ('harvest.question.body',  'mr', '{{land}} ची काढणी साधारण {{harvest_date}} ला होणार होती. कृपया काढणीची खरी तारीख टाका. तारीख टाकली नाही, तर {{release_on}} ला हे शेत पीक वेळापत्रकातून आपोआप मोकळे होईल.')
on conflict (ui_key, language_code) do nothing;

-- 2. The plan ------------------------------------------------------------------------------
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
         x.win_end + pol.margin,
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

-- 3. The one eligibility rule ------------------------------------------------------------
create or replace function public.land_has_active_crop_cycle(p_land_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.lands l
      join public.crop_schedules cs on cs.land_id = l.id and cs.is_active = true and cs.sowing_date is not null
     where l.id = p_land_id
       and l.is_active = true
       and l.deleted_at is null
       and l.lifecycle_status in ('CROP_ACTIVE', 'READY_FOR_HARVEST', 'WAITING_HARVEST_CONFIRMATION')
  );
$function$;

revoke all on function public.land_has_active_crop_cycle(uuid) from public, anon, authenticated;
grant execute on function public.land_has_active_crop_cycle(uuid) to service_role;

-- 4. The daily close ---------------------------------------------------------------------
create or replace function public.run_daily_crop_cycle_close(p_date date default current_date, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_p        record;
  v_closed   jsonb := '[]'::jsonb;
  v_due      int := 0;
  v_errors   int := 0;
  v_no_line  int := 0;
  v_dec_exp  int := 0;
  v_start    timestamptz := clock_timestamp();
BEGIN
  FOR v_p IN SELECT * FROM public.crop_cycle_close_plan(p_date) LOOP
    IF v_p.harvest_basis = 'no_harvest_timeline' THEN
      v_no_line := v_no_line + 1;
      CONTINUE;
    END IF;
    IF NOT v_p.due THEN CONTINUE; END IF;
    v_due := v_due + 1;
    IF p_dry_run THEN
      v_closed := v_closed || jsonb_build_object('schedule_id', v_p.schedule_id, 'land_id', v_p.land_id, 'land', v_p.land_name,
                    'crop', v_p.crop_code, 'harvest_date', v_p.harvest_date, 'basis', v_p.harvest_basis, 'release_on', v_p.release_on);
      CONTINUE;
    END IF;

    BEGIN
      -- close the schedule; the existing AFTER trigger fn_release_land_on_schedule_deactivate
      -- releases the land (AVAILABLE, active_schedule_id NULL) and logs SCHEDULE_DEACTIVATED
      UPDATE public.crop_schedules
         SET is_active    = false,
             status       = 'completed',
             completed_at = coalesce(completed_at, now()),
             metadata     = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('auto_closed', jsonb_build_object(
                              'closed_on', p_date,
                              'harvest_date', v_p.harvest_date,
                              'harvest_basis', v_p.harvest_basis,
                              'harvest_window_end', v_p.harvest_window_end,
                              'notice_from', v_p.notice_from,
                              'release_on', v_p.release_on,
                              'grace_days', v_p.grace_days,
                              'harvest_confirmed', false)),
             updated_at   = now()
       WHERE id = v_p.schedule_id
         AND is_active = true;

      IF FOUND THEN
        -- the finished crop moves to previous_*, as fn_cascade_harvest_completion does for a
        -- confirmed harvest; harvest dates are NOT written (no one confirmed them).
        -- Only when no new crop has taken the land in the meantime.
        UPDATE public.lands
           SET previous_crop_id        = current_crop_id,
               previous_crop           = current_crop,
               last_crop               = current_crop,
               current_crop_id         = NULL,
               current_crop_variety_id = NULL,
               current_crop            = NULL,
               crop_stage              = NULL,
               updated_at              = now()
         WHERE id = v_p.land_id
           AND active_schedule_id IS NULL;

        INSERT INTO public.crop_lifecycle_events
          (tenant_id, farmer_id, land_id, schedule_id, event_type, from_status, to_status, payload, actor)
        VALUES
          (v_p.tenant_id, v_p.farmer_id, v_p.land_id, v_p.schedule_id, 'CROP_CYCLE_AUTO_CLOSED',
           v_p.land_lifecycle, 'AVAILABLE',
           jsonb_build_object('crop', v_p.crop_code, 'harvest_date', v_p.harvest_date, 'harvest_basis', v_p.harvest_basis,
             'harvest_window_end', v_p.harvest_window_end, 'notice_from', v_p.notice_from,
             'release_on', v_p.release_on, 'grace_days', v_p.grace_days, 'harvest_confirmed', false),
           NULL);

        v_closed := v_closed || jsonb_build_object('schedule_id', v_p.schedule_id, 'land_id', v_p.land_id, 'land', v_p.land_name,
                      'crop', v_p.crop_code, 'harvest_date', v_p.harvest_date, 'basis', v_p.harvest_basis);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      BEGIN
        INSERT INTO public.system_health_events (event_type, source, severity, message, context)
        VALUES ('crop_cycle_close_error', 'run_daily_crop_cycle_close', 'error', SQLERRM,
                jsonb_build_object('schedule_id', v_p.schedule_id, 'land_id', v_p.land_id));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END;
  END LOOP;

  -- Farm Today decisions on a land with no crop in the field are about a crop that is not
  -- there: set to EXPIRED (kept, never deleted). Covers closed, cancelled and harvested crops.
  IF NOT p_dry_run THEN
    WITH e AS (
      UPDATE public.farm_decision d
         SET status = 'EXPIRED', updated_at = now()
       WHERE d.status IN ('DUE', 'WATCH', 'BLOCKED', 'INFO')
         AND NOT public.land_has_active_crop_cycle(d.land_id)
      RETURNING 1)
    SELECT count(*) INTO v_dec_exp FROM e;
  ELSE
    SELECT count(*) INTO v_dec_exp FROM public.farm_decision d
     WHERE d.status IN ('DUE', 'WATCH', 'BLOCKED', 'INFO') AND NOT public.land_has_active_crop_cycle(d.land_id);
  END IF;

  BEGIN
    INSERT INTO public.system_health_events (event_type, source, severity, message, context)
    VALUES ('crop_cycle_close_run', 'run_daily_crop_cycle_close',
            CASE WHEN v_errors > 0 THEN 'warning' ELSE 'info' END,
            CASE WHEN p_dry_run THEN 'run_daily_crop_cycle_close dry run' ELSE 'run_daily_crop_cycle_close completed' END,
            jsonb_build_object('date', p_date, 'dry_run', p_dry_run, 'due', v_due, 'closed', jsonb_array_length(v_closed),
                               'errors', v_errors, 'no_harvest_timeline', v_no_line, 'farm_decisions_expired', v_dec_exp,
                               'elapsed_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('date', p_date, 'dry_run', p_dry_run, 'due', v_due, 'closed', v_closed, 'errors', v_errors,
                            'no_harvest_timeline', v_no_line, 'farm_decisions_expired', v_dec_exp);
END;
$function$;

revoke all on function public.run_daily_crop_cycle_close(date, boolean) from public, anon, authenticated;
grant execute on function public.run_daily_crop_cycle_close(date, boolean) to service_role;

-- 5. The farmer's answer on the harvest card ---------------------------------------------
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
BEGIN
  SELECT id, farmer_id, tenant_id INTO v_land
    FROM public.lands
   WHERE id = p_land_id AND is_active = true AND deleted_at IS NULL;
  IF v_land.id IS NULL OR v_land.farmer_id IS DISTINCT FROM p_farmer_id THEN
    RAISE EXCEPTION 'LAND_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

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
    IF p_date > current_date THEN
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
                                  || jsonb_build_object('channel', 'harvest_card', 'reported_on', current_date),
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
  SELECT * INTO v_p FROM public.crop_cycle_close_plan(current_date) p WHERE p.schedule_id = v_s.id;
  IF p_date <= current_date THEN
    RAISE EXCEPTION 'EXPECTED_DATE_NOT_IN_FUTURE' USING ERRCODE = '22023';
  END IF;
  IF v_p.max_expected_date IS NULL OR p_date > v_p.max_expected_date THEN
    RAISE EXCEPTION 'EXPECTED_DATE_BEYOND_CROP_WINDOW' USING ERRCODE = '22023';
  END IF;

  UPDATE public.crop_schedules
     SET metadata   = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('harvest_watch', jsonb_build_object(
                        'farmer_expected_harvest_date', p_date,
                        'reported_on', current_date,
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

  SELECT * INTO v_new FROM public.crop_cycle_close_plan(current_date) p WHERE p.schedule_id = v_s.id;
  RETURN jsonb_build_object('ok', true, 'harvested', false, 'schedule_id', v_s.id,
                            'expected_harvest_date', p_date, 'release_on', v_new.release_on, 'alerts_closed', v_alerts);
END;
$function$;

revoke all on function public.record_crop_harvest(uuid, uuid, boolean, date) from public, anon, authenticated;
grant execute on function public.record_crop_harvest(uuid, uuid, boolean, date) to service_role;

-- 6. The four daily jobs: the live bodies, each with the crop-cycle condition added ------
CREATE OR REPLACE FUNCTION public.run_daily_phenology()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_land    record;
  v_r       record;
  v_n       integer := 0;
  v_written integer := 0;
BEGIN
  FOR v_land IN
    SELECT id FROM public.lands
    WHERE current_crop IS NOT NULL AND current_crop <> ''
      AND public.land_has_active_crop_cycle(id)   -- 20261119: no crop in the field, no stage clock
  LOOP
    PERFORM public.enforce_germination_gate(v_land.id);
    PERFORM public.apply_stage_transitions(v_land.id);

    SELECT r.stage_uuid, r.growth_stage, r.current_das, r.phenology_index
      INTO v_r
      FROM public.resolve_crop_phenology(v_land.id) r
     LIMIT 1;

    IF v_r.stage_uuid IS NOT NULL THEN
      UPDATE public.lands
         SET stage_uuid        = v_r.stage_uuid,
             crop_stage        = v_r.growth_stage,
             stage_source      = 'phenology_ssot',
             stage_resolved_at = now(),
             das               = v_r.current_das,
             phenology_index   = v_r.phenology_index
       WHERE id = v_land.id;
      v_written := v_written + 1;
    END IF;

    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('lands_processed', v_n, 'stage_cache_written', v_written, 'ran_at', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_daily_farm_state(p_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_l record; v_n int := 0; v_ok int := 0;
BEGIN
  FOR v_l IN SELECT id FROM public.lands WHERE current_crop IS NOT NULL AND current_crop <> ''
                AND public.land_has_active_crop_cycle(id) LOOP   -- 20261119: crop-cycle gate
    v_n := v_n + 1;
    IF public.build_land_farm_state(v_l.id, p_date) IS NOT NULL THEN v_ok := v_ok + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('lands', v_n, 'states_written', v_ok, 'date', p_date, 'ran_at', now());
END $function$;

CREATE OR REPLACE FUNCTION public.run_daily_farm_decisions(p_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_l record; v_n int := 0; v_due int := 0; v_exp int := 0; v_r jsonb;
BEGIN
  WITH e AS (
    UPDATE public.farm_decision SET status='EXPIRED', updated_at=now()
     WHERE status IN ('WATCH','BLOCKED','INFO','DUE') AND valid_until IS NOT NULL AND valid_until < p_date
     RETURNING 1)
  SELECT count(*) INTO v_exp FROM e;
  FOR v_l IN SELECT id FROM public.lands WHERE current_crop IS NOT NULL AND current_crop <> ''
                AND public.land_has_active_crop_cycle(id) LOOP   -- 20261119: crop-cycle gate
    v_r := public.derive_farm_decisions(v_l.id, p_date); v_n := v_n + 1; v_due := v_due + coalesce((v_r->>'due')::int, 0);
  END LOOP;
  RETURN jsonb_build_object('lands', v_n, 'due_total', v_due, 'expired', v_exp, 'date', p_date, 'ran_at', now());
END $function$;

CREATE OR REPLACE FUNCTION public.accumulate_gdd_batch(p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lid uuid; v_processed int := 0; v_errors int := 0;
  v_days_total bigint := 0; v_start timestamptz := clock_timestamp();
BEGIN
  FOR v_lid IN
    SELECT l.id FROM public.lands l
     WHERE l.current_crop IS NOT NULL
       AND (l.gdd_anchor_date IS NOT NULL OR l.last_sowing_date IS NOT NULL
            OR l.planting_date IS NOT NULL OR l.transplant_date IS NOT NULL)
       AND (l.harvest_date IS NULL OR l.harvest_date >= current_date - 30)
       AND public.land_has_active_crop_cycle(l.id)   -- 20261119: crop-cycle gate
     ORDER BY l.gdd_last_computed_at NULLS FIRST
     LIMIT p_limit
  LOOP
    BEGIN
      v_days_total := v_days_total + coalesce(public.accumulate_gdd_for_land(v_lid, 365), 0);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      BEGIN
        INSERT INTO public.system_health_events (event_type, source, severity, message, context)
        VALUES ('gdd_land_error', 'accumulate_gdd_batch', 'error', SQLERRM,
                jsonb_build_object('land_id', v_lid));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END;
  END LOOP;

  BEGIN
    INSERT INTO public.system_health_events (event_type, source, severity, message, context)
    VALUES ('gdd_batch_run', 'accumulate_gdd_batch',
            CASE WHEN v_errors > 0 THEN 'warning' ELSE 'info' END,
            'accumulate_gdd_batch completed',
            jsonb_build_object('lands_processed', v_processed, 'errors', v_errors,
                               'days_total', v_days_total,
                               'elapsed_ms', EXTRACT(EPOCH FROM (clock_timestamp()-v_start))*1000));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('lands_processed', v_processed, 'errors', v_errors, 'days_total', v_days_total);
END;
$function$;

-- 7. Repoint the dead daily harvest job to the database close (same job name) ------------
select cron.schedule('harvest-engine-daily', '45 0 * * *', $cron$select public.run_daily_crop_cycle_close()$cron$);
