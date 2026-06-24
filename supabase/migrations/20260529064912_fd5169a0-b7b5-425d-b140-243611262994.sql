
-- ============================================================
-- Sprint 4: DB hardening — indexes, retention, autovacuum
-- All operations are additive / config-only. Safe to roll back.
-- ============================================================

-- 1) Composite indexes for hot read/cleanup paths (idempotent)
CREATE INDEX IF NOT EXISTS idx_proactive_eval_log_tenant_created
  ON public.proactive_evaluation_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proactive_eval_log_created
  ON public.proactive_evaluation_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proactive_events_tenant_created
  ON public.proactive_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ndvi_logs_tenant_created
  ON public.ndvi_processing_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tile_marking_progress_updated
  ON public.tile_marking_progress (updated_at DESC);

-- 2) Retention rules — drive existing cleanup_old_data_with_retention()
--    nightly cron 'cleanup-data-retention-nightly'. No archive (pure rotation).
INSERT INTO public.data_retention_config
  (table_name, retention_days, date_column, soft_delete, archive_before_delete, is_active)
VALUES
  ('proactive_evaluation_log', 30, 'created_at', false, false, true),
  ('proactive_events',         30, 'created_at', false, false, true),
  ('ndvi_processing_logs',     90, 'created_at', false, false, true),
  ('tile_marking_progress',    30, 'updated_at', false, false, true)
ON CONFLICT (table_name) DO UPDATE
  SET retention_days = EXCLUDED.retention_days,
      date_column    = EXCLUDED.date_column,
      soft_delete    = EXCLUDED.soft_delete,
      archive_before_delete = EXCLUDED.archive_before_delete,
      is_active      = true,
      updated_at     = now();

-- 3) Autovacuum tuning for high-churn tables (reclaim faster under load)
ALTER TABLE public.proactive_evaluation_log
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.proactive_events
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.ndvi_processing_logs
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.tile_marking_progress
  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.market_prices
  SET (autovacuum_vacuum_scale_factor = 0.1, autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.ai_chat_messages
  SET (autovacuum_vacuum_scale_factor = 0.1, autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE public.ai_decision_log
  SET (autovacuum_vacuum_scale_factor = 0.1, autovacuum_analyze_scale_factor = 0.05);

-- 4) ANALYZE so planner picks up new indexes/stats immediately
ANALYZE public.proactive_evaluation_log;
ANALYZE public.proactive_events;
ANALYZE public.ndvi_processing_logs;
ANALYZE public.tile_marking_progress;
