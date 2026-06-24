-- Create audit logs table for AI Chat compliance tracking
-- This table stores complete turn-level audit data for debugging and compliance

CREATE TABLE IF NOT EXISTS public.ai_chat_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  farmer_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  trace_id TEXT,
  
  -- Original input
  farmer_message TEXT,
  detected_language TEXT CHECK (detected_language IN ('mr', 'hi', 'en')),
  
  -- NLU Output (Contract-compliant format)
  intent_label TEXT,
  observations JSONB DEFAULT '[]'::jsonb,
  nlu_confidence DECIMAL(4,3),
  
  -- Intent Lock
  locked_intent TEXT,
  allowed_scopes TEXT[],
  forbidden_actions TEXT[],
  
  -- Symbolic Decision
  symbolic_decision_id TEXT,
  rules_fired TEXT[] DEFAULT ARRAY[]::TEXT[],
  actions_returned JSONB DEFAULT '[]'::jsonb,
  actions_filtered_out JSONB DEFAULT '[]'::jsonb,
  
  -- Observation-to-Cause Mapping
  observation_mapping JSONB,
  
  -- Validation
  validation_passed BOOLEAN DEFAULT false,
  validation_errors TEXT[],
  
  -- Response
  response_source TEXT CHECK (response_source IN ('SYMBOLIC_TEMPLATE', 'LLM_FORMATTED', 'CLARIFICATION', 'ERROR')),
  response_language_match BOOLEAN,
  llm_model_used TEXT,
  
  -- Timing
  processing_time_ms INTEGER,
  
  -- Context
  agents_used TEXT[],
  land_id TEXT,
  crop_code TEXT,
  growth_stage TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON public.ai_chat_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_farmer ON public.ai_chat_audit_logs(farmer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.ai_chat_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_validation ON public.ai_chat_audit_logs(validation_passed);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.ai_chat_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_trace ON public.ai_chat_audit_logs(trace_id);

-- Enable RLS
ALTER TABLE public.ai_chat_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies - admin-only access for audit logs
CREATE POLICY "Admins can view all audit logs"
  ON public.ai_chat_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Service role can insert audit logs"
  ON public.ai_chat_audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.ai_chat_audit_logs IS 'Audit trail for AI Chat turns - tracks NLU output, intent locks, symbolic decisions, and validation results for compliance with "Symbolic Brain decides, AI only explains" architecture';