-- Layer 6: Add gate_decisions column to audit log
ALTER TABLE public.ai_chat_audit_logs
  ADD COLUMN IF NOT EXISTS gate_decisions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_chat_audit_logs.gate_decisions IS
  'JSONB record of each safety-gate decision (CONFIDENCE_GATE, CLARIFICATION_GATE, NDVI_SANITY_GATE, STAGE_GATE, FOLIAR_SAFETY_GATE) with mode, input snapshot and outcome.';