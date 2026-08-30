# Crop Schedule Forensic Audit + Surgical Fix

## What I verified on the live system

Latest schedule `a7f0f0cc` (Rice / Indrayani, sown 2026-06-15): 78 tasks, but only **7 distinct task names**.

| Task | Count | Reality |
|---|---|---|
| सिंचन (Irrigation) | 47 | DAS 0,1,2,3,4,5,6,7,8,9 then every 2 days, then every 3 days |
| शेताची पाहणी (Scouting) | 26 | weekly per stage, identical text |
| Nutrition | 4 | task **name** is a full paragraph of advisory prose |
| Sowing | 1 | — |
| Land prep / seed treatment / harvest / post-harvest | 0 | never generated |

So "the same task on every day" is real and has four separate root causes.

### Root cause 1 — irrigation windows expanded into one calendar task per interval
`crop_baseline_guidelines_v2` for rice holds stage windows with `irrigation_interval_days` (germination = **1**, seedling = 2, tillering/PI/booting/heading/flowering = 3, grain filling = 5, maturity = **0**). The generator walks each window from `das_start` to `das_end` stepping by the interval and pushes a task per step. Germination alone produces 10 identical daily tasks. This is a *guideline* being materialised as fixed calendar work, which the concept says must instead be decided daily by weather/soil.

### Root cause 2 — per-event water quantity is the whole-stage total
`water_requirement_mm` is the **stage total** (germination 20 mm, tillering 60 mm). The generator stamps that same value on every expanded event, so the plan reads as 10 × 20 mm for germination. Season water totals are also inflated.

### Root cause 3 — `irrigation_interval_invalid` gap on every run
Maturity and harvest rows have `interval_days = 0`; the loop rejects them and pushes a gap, so late-season water withdrawal ("drain 10 days before harvest") is silently absent.

### Root cause 4 — scouting is a per-week clone, not a stage brief
One "Field scouting" task per stage per week with the same name and body, so the timeline looks duplicated.

### Root cause 5 — the daily cron does not do what the concept requires
`schedule-reconciler-daily` (02:00) runs, but reads **only** phenology drift. It has zero references to weather, NDVI, soil moisture or ET0. So the second half of the design — "static baseline, then daily adaptation from weather/NDVI/soil" — does not exist yet.

### Secondary findings
- Nutrition `task_name` = `rule.action_text` (a whole paragraph). Names must be short; prose belongs in the description.
- Coverage gaps on every run: `fertilizer_recommendation_master_no_row`, `soil_fertility_class_missing`, `labor_rates_no_row`, `stage_graph_exceeds_variety_duration`.
- Superseded schedules are left as `is_active=false` but `status='active'` with 0 tasks — 4 zombie rows for this one land.

## The fix (surgical, in order)

### A. Irrigation becomes one planned event per stage, not per day
In `generator/baseline-generator.ts`:
- Stop expanding a guideline row by interval into calendar tasks. Emit **one irrigation task per stage window**, dated at `das_start`, carrying the stage's total `water_requirement_mm`, the DB interval as `resources.interval_days`, and `das_start..das_end` as the recurrence window.
- Add `recurrence: { interval_days, window_start, window_end, expected_events }` to the task payload so the UI can show "Irrigate every 3 days during tillering (approx. 8 times)" as ONE card.
- `interval_days = 0` no longer a gap: it means **no irrigation in this window** — emit a `water_withdrawal` advisory task instead of dropping the row.
- Water total = sum of stage totals (unchanged) and now consistent with what the cards show.

### B. Scouting collapses to one task per stage
One scouting task per stage window with `recurrence.interval_days = 7`, named per stage ("Scouting — tillering"), carrying that stage's observation rule set. Removes 26 clones down to ~11.

### C. Short task names
`task_name` is capped and derived from rule `category`/`task_type` + stage; the paragraph moves to `task_description`. Keeps translation payloads sane too.

### D. Complete the baseline lifecycle
Emit the missing anchor tasks the standard PoP requires, still DB-sourced only: `land_preparation` and `seed_treatment` from the pre-sowing stages, and `harvest` / `post_harvest` from the maturity/harvest stage rows (these rows exist in `crop_baseline_guidelines_v2` for rice and are being skipped today).

### E. Make the daily cron actually adapt the schedule
Extend `schedule-reconciler` (keep the phenology gate exactly as-is) with an adaptation pass over the next 7 days of pending tasks, using existing DB state only — `land_weather_state` (rainfall, ET0, water deficit, irrigation_needed/urgency), `ndvi_data`, `soil_health`:
- Irrigation task due and `effective_rainfall_mm` covered the requirement → mark `skipped_by_weather`, push next occurrence by the DB interval.
- `irrigation_needed = true` with high urgency before the planned date → pull the event forward.
- Spray/nutrition task on a day with rain forecast → shift to the next suitable day.
- Every change writes a `schedule_adjustments` row with the evidence that caused it (unchanged contract), and `RescheduledNotice` already renders it.
- No new agronomic constants: thresholds read from the same DB tables the water-state engine writes.

### F. Housekeeping
- On successful generation, set superseded schedules to `status='superseded'` instead of leaving them `active` with 0 tasks.
- UI (`TaskTimeline` / `ModernTaskCard` / `InteractiveScheduleTable`): render the recurrence line for tasks that carry one, so a stage-level irrigation task reads as a repeating instruction rather than 10 cards.

## Technical notes
- Files touched: `supabase/functions/ai-smart-schedule/generator/baseline-generator.ts`, `.../generator/validate-schedule.ts`, `.../db/agronomy-repo.ts`, `supabase/functions/schedule-reconciler/index.ts`, `supabase/functions/schedules-api/index.ts` (supersede status), and the three schedule UI components.
- DB migration: add `recurrence jsonb` to `schedule_tasks` (nullable, no backfill needed) and allow `status='superseded'` on `crop_schedules`.
- No hardcoded agronomy is introduced — `tests/edge/schedule/no-hardcoded-agronomy_test.ts` stays green; intervals, water and stage windows keep coming from `crop_baseline_guidelines_v2` / `crop_stage_master`.
- Existing schedule `a7f0f0cc` will be regenerated after deploy so the fix is visible immediately.
