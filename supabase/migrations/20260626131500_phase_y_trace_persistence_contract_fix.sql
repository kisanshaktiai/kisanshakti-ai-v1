-- Phase Y trace persistence hardening: align runtime trace inserts with DB contracts.
-- The original ai_decision_log.decision_type CHECK only allowed legacy schedule/pest/disease values.
-- Runtime AI chat decisions also persist diagnosis/advisory/clarification/prescription/etc.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.ai_decision_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%decision_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.ai_decision_log DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.ai_decision_log
  ADD CONSTRAINT ai_decision_log_decision_type_check
  CHECK (decision_type IN (
    'schedule_generation',
    'schedule_refinement',
    'alert_generation',
    'marketing_prediction',
    'pest_detection',
    'disease_detection',
    'diagnosis',
    'advisory',
    'clarification',
    'observation_response',
    'safety_block',
    'prescription',
    'monitoring',
    'unknown'
  ));

-- Re-assert Phase Y forensic columns in case the previous migration was not applied in production.
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
