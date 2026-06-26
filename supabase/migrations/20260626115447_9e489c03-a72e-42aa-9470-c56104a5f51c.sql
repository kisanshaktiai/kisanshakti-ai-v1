ALTER TABLE public.ai_decision_log
  ADD COLUMN IF NOT EXISTS runtime_trace          jsonb,
  ADD COLUMN IF NOT EXISTS graph_snapshot         jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_metrics       jsonb,
  ADD COLUMN IF NOT EXISTS context_snapshot       jsonb,
  ADD COLUMN IF NOT EXISTS clarification_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS observation_snapshot   jsonb,
  ADD COLUMN IF NOT EXISTS rule_snapshot          jsonb,
  ADD COLUMN IF NOT EXISTS hypothesis_snapshot    jsonb,
  ADD COLUMN IF NOT EXISTS decision_snapshot      jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_versions     jsonb,
  ADD COLUMN IF NOT EXISTS pipeline_version       text,
  ADD COLUMN IF NOT EXISTS graph_version          text,
  ADD COLUMN IF NOT EXISTS runtime_version        text,
  ADD COLUMN IF NOT EXISTS execution_mode         text,
  ADD COLUMN IF NOT EXISTS trace_level            text,
  ADD COLUMN IF NOT EXISTS created_runtime_ms     integer,
  ADD COLUMN IF NOT EXISTS trace_id               text,
  ADD COLUMN IF NOT EXISTS execution_id           text;

ALTER TABLE public.ai_chat_audit_logs
  ADD COLUMN IF NOT EXISTS execution_id     text,
  ADD COLUMN IF NOT EXISTS pipeline_version text,
  ADD COLUMN IF NOT EXISTS graph_version    text,
  ADD COLUMN IF NOT EXISTS runtime_version  text;

CREATE INDEX IF NOT EXISTS idx_adl_trace_id        ON public.ai_decision_log(trace_id);
CREATE INDEX IF NOT EXISTS idx_adl_execution_id    ON public.ai_decision_log(execution_id);
CREATE INDEX IF NOT EXISTS idx_adl_land_created    ON public.ai_decision_log(land_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acal_execution_id   ON public.ai_chat_audit_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_acal_symbolic_dec   ON public.ai_chat_audit_logs(symbolic_decision_id);