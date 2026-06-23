CREATE TABLE IF NOT EXISTS public.ai_safety_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  trace_id text NOT NULL,
  tenant_id uuid,
  farmer_id uuid,
  session_id uuid,
  crop_code text,
  language text,
  intent text,
  reason text NOT NULL,
  emitted_rule_id text,
  fired_rule_ids text[] NOT NULL DEFAULT '{}',
  candidate_rule_ids text[] NOT NULL DEFAULT '{}',
  observations jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_safety_violations TO service_role;

ALTER TABLE public.ai_safety_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages safety violations"
  ON public.ai_safety_violations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_safety_violations_occurred_at
  ON public.ai_safety_violations (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_safety_violations_reason_time
  ON public.ai_safety_violations (reason, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_safety_violations_tenant_time
  ON public.ai_safety_violations (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_safety_violations_trace
  ON public.ai_safety_violations (trace_id);