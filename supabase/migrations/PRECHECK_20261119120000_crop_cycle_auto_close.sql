-- Run BEFORE applying 20261119120000_crop_cycle_auto_close.sql. Read-only.
-- Same rule as crop_cycle_close_plan(), with the policy the migration inserts:
-- grace 10 days, notice_from = today (the go-live day), margin 0.
--   harvest_date : variety duration for the cultivation method -> variety maturity days ->
--                  end of the crop's harvest window
--   card_today   : the farmer app shows the harvest card today (days_left on the card)
--   release_on   : the day the land is freed if the farmer does not answer
with pol as (select 10 as grace, current_date as notice_from, 0 as margin,
                    array['harvest','harvest_maturity','maturation_harvest','successive_harvest']::text[] as hs),
s as (
  select cs.*, l.name as land_name,
         lower(coalesce(nullif(cs.generation_params #>> '{resolved_inputs,cropCode}', ''),
           (select c.value from crops c where c.is_active and lower(trim(cs.crop_name)) in (lower(c.value), lower(coalesce(c.label,'')), lower(coalesce(c.local_name,'')), lower(coalesce(c.label_hi,'')), lower(coalesce(c.label_mr,''))) limit 1),
           (select c.value from crop_synonyms y join crops c on lower(c.value) = lower(y.canonical_crop) where y.is_active and lower(y.variant_name) = lower(trim(cs.crop_name)) limit 1))) as crop_code
    from crop_schedules cs join lands l on l.id = cs.land_id
   where cs.is_active and cs.sowing_date is not null and l.is_active and l.deleted_at is null),
vca as (select s.id, max(case when v.duration_reference = 'transplanting' then s.transplant_date else s.sowing_date end + v.duration_days_max) as d
          from s join variety_cultivation_agronomy v on v.variety_id = s.variety_id
           and v.cultivation_method is not distinct from s.cultivation_method and v.duration_days_max is not null
         group by s.id),
mp as (select s.id, s.sowing_date + p.maturity_days_max as d from s join master_products p on p.id = s.variety_id where p.maturity_days_max is not null),
hm as (select m.*, lower(m.crop_code) as cc from crop_stage_master m, pol where m.is_active and lower(m.growth_stage) = any (pol.hs)),
h as (select s.id, max(case when m.das_reference = 'transplanting' then s.transplant_date else s.sowing_date end + m.das_max) as win_end
        from s join hm m on m.cc = s.crop_code
         and (m.cultivation_method is not distinct from s.cultivation_method
              or not exists (select 1 from hm m2 where m2.cc = s.crop_code and m2.cultivation_method is not distinct from s.cultivation_method))
       group by s.id),
x as (select s.land_name, s.crop_code, s.cultivation_method, s.sowing_date, s.transplant_date, h.win_end,
             coalesce(vca.d, mp.d, h.win_end) as harvest_date,
             case when vca.d is not null then 'variety_duration' when mp.d is not null then 'variety_maturity'
                  when h.win_end is not null then 'crop_harvest_window' else 'no_harvest_timeline' end as basis
        from s left join vca on vca.id = s.id left join mp on mp.id = s.id left join h on h.id = s.id)
select x.land_name, x.crop_code, x.cultivation_method, x.sowing_date, x.transplant_date,
       x.harvest_date, x.basis, x.win_end + pol.margin as latest_still_in_field_date,
       greatest(x.harvest_date, pol.notice_from) + pol.grace as release_on,
       (greatest(x.harvest_date, pol.notice_from) + pol.grace) - current_date as days_left,
       current_date > x.harvest_date and current_date < greatest(x.harvest_date, pol.notice_from) + pol.grace as card_today
  from x cross join pol
 order by release_on nulls last;
