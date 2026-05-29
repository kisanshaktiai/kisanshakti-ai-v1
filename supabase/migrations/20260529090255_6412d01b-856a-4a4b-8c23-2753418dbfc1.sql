SELECT cron.schedule(
  'cleanup-rate-limit-tracking-10min',
  '*/10 * * * *',
  $$SELECT public.cleanup_rate_limit_tracking();$$
);