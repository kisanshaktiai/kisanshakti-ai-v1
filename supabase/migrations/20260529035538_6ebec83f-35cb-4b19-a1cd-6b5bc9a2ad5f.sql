
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-data-retention-nightly') THEN
    PERFORM cron.unschedule('cleanup-data-retention-nightly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-sessions-hourly') THEN
    PERFORM cron.unschedule('cleanup-expired-sessions-hourly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-idempotency-daily') THEN
    PERFORM cron.unschedule('cleanup-idempotency-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-data-retention-nightly',
  '15 3 * * *',
  $$ SELECT public.cleanup_old_data_with_retention(); $$
);

SELECT cron.schedule(
  'cleanup-expired-sessions-hourly',
  '23 * * * *',
  $$ SELECT public.cleanup_expired_sessions(); $$
);

SELECT cron.schedule(
  'cleanup-idempotency-daily',
  '37 3 * * *',
  $$ SELECT public.cleanup_old_idempotency_records(); $$
);

CREATE INDEX IF NOT EXISTS idx_farmer_alerts_farmer_unread_created
  ON public.farmer_alerts (farmer_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_crop_growth_uploads_land_uploaded
  ON public.crop_growth_uploads (land_id, upload_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_crop_growth_alerts_land_unread
  ON public.crop_growth_alerts (land_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_video_tutorials_active_feed
  ON public.video_tutorials (is_active, is_featured DESC, view_count DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_farmer_pending
  ON public.offline_sync_queue (farmer_id, created_at)
  WHERE synced = false;
