-- 2026-09-08 — Closed decision loop: task decision state, crop-state ledger, decision linkage, cron order.
-- Runs statement by statement (no session state). Adds columns only; never deletes data.

-- (1) schedule_tasks.decision_state — the farm_decision status vocabulary, separate from task_date.
--     Vocabulary is copied from the live CHECK farm_decision_status_check (not invented).
alter table public.schedule_tasks add column if not exists decision_state text;
alter table public.schedule_tasks add column if not exists decision_id uuid;
alter table public.schedule_tasks add column if not exists decision_evaluated_at timestamptz;
alter table public.schedule_tasks drop constraint if exists schedule_tasks_decision_state_check;
alter table public.schedule_tasks add constraint schedule_tasks_decision_state_check
  check (decision_state is null or decision_state = any (array['DUE','WATCH','BLOCKED','INFO','DONE','MISSED','DISMISSED','EXPIRED','SUPERSEDED']));
alter table public.schedule_tasks drop constraint if exists schedule_tasks_decision_id_fkey;
alter table public.schedule_tasks add constraint schedule_tasks_decision_id_fkey foreign key (decision_id) references public.farm_decision(id) on delete set null;
create index if not exists idx_schedule_tasks_decision_state on public.schedule_tasks (schedule_id, decision_state) where decision_state is not null;

-- (2) schedule_monitoring → the crop-state ledger (existing columns kept; ledger columns added).
alter table public.schedule_monitoring add column if not exists run_mode text;
alter table public.schedule_monitoring add column if not exists engine text;
alter table public.schedule_monitoring add column if not exists state_snapshot jsonb;
alter table public.schedule_monitoring add column if not exists decisions_evaluated jsonb not null default '[]'::jsonb;
alter table public.schedule_monitoring add column if not exists decision jsonb;
alter table public.schedule_monitoring add column if not exists changes jsonb not null default '[]'::jsonb;
alter table public.schedule_monitoring add column if not exists engine_versions jsonb;
alter table public.schedule_monitoring add column if not exists stage_code text;
alter table public.schedule_monitoring add column if not exists stage_source text;
alter table public.schedule_monitoring add column if not exists skipped_reason text;
alter table public.schedule_monitoring drop constraint if exists schedule_monitoring_run_mode_check;
alter table public.schedule_monitoring add constraint schedule_monitoring_run_mode_check check (run_mode is null or run_mode in ('live','dry_run'));
create index if not exists idx_schedule_monitoring_schedule_day on public.schedule_monitoring (schedule_id, check_date desc);
comment on table public.schedule_monitoring is 'Crop-state ledger: one row per active schedule per reconciler run — state observed (land_farm_state), decisions evaluated (farm_decision), outcome per task, changes and why, engine versions (generator / reconciler / decision engine / rule set). run_mode=dry_run rows are traces of a dry run.';

-- (3) farm_decision linkage index (task_id / schedule_id are written by the reconciler when a decision is applied).
create index if not exists idx_farm_decision_task on public.farm_decision (task_id) where task_id is not null;

-- (4) Cron order: decisions are derived at 13:45 UTC (run_daily_farm_decisions); the reconciler must run after them.
--     Same job name and command; only the schedule changes (02:00 → 14:15 UTC).
do $$
declare v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'schedule-reconciler-daily';
  if v_cmd is not null then
    perform cron.unschedule('schedule-reconciler-daily');
    perform cron.schedule('schedule-reconciler-daily', '15 14 * * *', v_cmd);
  end if;
end
$$;

-- Read-only checks after the first run:
--   select check_date, run_mode, stage_code, jsonb_array_length(decisions_evaluated) decisions, jsonb_array_length(changes) changes, engine_versions
--     from schedule_monitoring order by created_at desc limit 5;
--   select t.task_name, t.task_date, t.decision_state, d.decision_key, d.status from schedule_tasks t join farm_decision d on d.id = t.decision_id where t.decision_state is not null;
--   select change_type, old_value, new_value, reason, evidence->'decision_key' key, evidence->'evidence'->>'why_now' why from schedule_adjustments order by created_at desc limit 10;
