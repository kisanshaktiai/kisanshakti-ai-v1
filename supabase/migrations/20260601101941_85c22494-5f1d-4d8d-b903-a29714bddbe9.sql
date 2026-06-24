
-- Remove any prior schedule with this name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('analytics-forecast-monthly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'analytics-forecast-monthly',
  '0 2 1 * *',
  $cron$
  SELECT net.http_post(
    url := 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/analytics-forecast',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2xra3p4ZW1zYmVuaXl1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjcxNjUsImV4cCI6MjA2ODAwMzE2NX0.dUnGp7wbwYom1FPbn_4EGf3PWjgmr8mXwL2w2SdYOh4"}'::jsonb,
    body := '{"mode":"all","limit":1000}'::jsonb
  );
  $cron$
);
