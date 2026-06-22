SELECT cron.schedule(
  'cleanup-expired-weather-cache-hourly',
  '7 * * * *',
  $$ SELECT public.cleanup_expired_weather_cache(); $$
);