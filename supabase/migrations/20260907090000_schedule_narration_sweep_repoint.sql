-- 2026-09-07 — Narration sweep: point the existing cron at the real endpoint.
-- The live job schedule-narrate-10m POSTs to /functions/v1/schedule-narrate, a function that does
-- not exist (edge-function cap; one feature = one edge function). Pending farmer-language
-- narration is served by ai-smart-schedule with body.action = 'narrate' (sweep mode when the
-- bearer is the service-role key, which vault secret schedule_narrate_key already holds).
-- Every 5 minutes, up to 3 schedules per run, oldest pending first.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'schedule-narrate-10m') then perform cron.unschedule('schedule-narrate-10m'); end if;
  if exists (select 1 from cron.job where jobname = 'schedule-narrate-5m') then perform cron.unschedule('schedule-narrate-5m'); end if;
end
$$;

select cron.schedule(
  'schedule-narrate-5m',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/ai-smart-schedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'schedule_narrate_key' LIMIT 1)
    ),
    body := jsonb_build_object('action', 'narrate', 'source', 'cron', 'limit', 3, 'at', now()),
    timeout_milliseconds := 120000
  );
  $cron$
);

-- Read-only check after the first run:
--   select invoked_at, payload->'results' from edge_invocation_logs
--    where function_name='ai-smart-schedule' and payload->>'action'='narrate' order by invoked_at desc limit 3;
