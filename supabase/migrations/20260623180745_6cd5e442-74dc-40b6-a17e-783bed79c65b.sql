-- Wave-S Hotfix: extend ai_decision_log decision_type to include chat-brain decision categories.
-- The chat orchestrator emits 'diagnosis', 'advisory', 'clarification', 'observation_response',
-- 'safety_block' which were rejected by the existing CHECK, leaving ai_decision_log empty
-- and depriving the system of decision telemetry.
ALTER TABLE public.ai_decision_log
  DROP CONSTRAINT IF EXISTS ai_decision_log_decision_type_check;

ALTER TABLE public.ai_decision_log
  ADD CONSTRAINT ai_decision_log_decision_type_check
  CHECK (decision_type = ANY (ARRAY[
    'schedule_generation'::text,
    'schedule_refinement'::text,
    'alert_generation'::text,
    'marketing_prediction'::text,
    'pest_detection'::text,
    'disease_detection'::text,
    'diagnosis'::text,
    'advisory'::text,
    'clarification'::text,
    'observation_response'::text,
    'safety_block'::text,
    'prescription'::text,
    'monitoring'::text,
    'unknown'::text
  ]));