
-- agricultural_decisions
CREATE TABLE IF NOT EXISTS public.agricultural_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id text NOT NULL,
  session_id text,
  farmer_id uuid,
  tenant_id uuid,
  land_id uuid,
  nlu_output jsonb,
  fused_intelligence jsonb,
  diagnostic_state jsonb,
  decision_output jsonb,
  safety_verification jsonb,
  status text,
  action_type text,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agdec_session ON public.agricultural_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_agdec_farmer ON public.agricultural_decisions(farmer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agdec_tenant ON public.agricultural_decisions(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agdec_decision_id ON public.agricultural_decisions(decision_id);
GRANT SELECT ON public.agricultural_decisions TO authenticated;
GRANT ALL ON public.agricultural_decisions TO service_role;
ALTER TABLE public.agricultural_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Farmers read own decisions" ON public.agricultural_decisions;
CREATE POLICY "Farmers read own decisions" ON public.agricultural_decisions FOR SELECT TO authenticated USING (farmer_id = auth.uid());
DROP POLICY IF EXISTS "Service role manages decisions" ON public.agricultural_decisions;
CREATE POLICY "Service role manages decisions" ON public.agricultural_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- scheduled_followups
CREATE TABLE IF NOT EXISTS public.scheduled_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  decision_id text,
  farmer_id uuid,
  day smallint NOT NULL CHECK (day IN (3,7,14)),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','COMPLETED','CANCELLED')),
  delivered_at timestamptz,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sfu_due ON public.scheduled_followups(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sfu_farmer ON public.scheduled_followups(farmer_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sfu_decision ON public.scheduled_followups(decision_id);
GRANT SELECT ON public.scheduled_followups TO authenticated;
GRANT ALL ON public.scheduled_followups TO service_role;
ALTER TABLE public.scheduled_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Farmers read own followups" ON public.scheduled_followups;
CREATE POLICY "Farmers read own followups" ON public.scheduled_followups FOR SELECT TO authenticated USING (farmer_id = auth.uid());
DROP POLICY IF EXISTS "Service role manages followups" ON public.scheduled_followups;
CREATE POLICY "Service role manages followups" ON public.scheduled_followups FOR ALL TO service_role USING (true) WITH CHECK (true);

-- confidence_adjustments
CREATE TABLE IF NOT EXISTS public.confidence_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pest_disease_code text NOT NULL,
  original_avg_confidence numeric,
  actual_accuracy numeric,
  calibration_factor numeric,
  adjustment_direction text CHECK (adjustment_direction IN ('INCREASE','DECREASE','NONE')),
  sample_size integer,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_confadj_code ON public.confidence_adjustments(pest_disease_code, effective_from DESC);
GRANT SELECT ON public.confidence_adjustments TO authenticated;
GRANT ALL ON public.confidence_adjustments TO service_role;
ALTER TABLE public.confidence_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read confidence adjustments" ON public.confidence_adjustments;
CREATE POLICY "Authenticated read confidence adjustments" ON public.confidence_adjustments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role manages confidence adjustments" ON public.confidence_adjustments;
CREATE POLICY "Service role manages confidence adjustments" ON public.confidence_adjustments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- efficacy_updates
CREATE TABLE IF NOT EXISTS public.efficacy_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_code text NOT NULL,
  pest_disease_code text NOT NULL,
  crop_code text,
  crop_stage text,
  previous_efficacy numeric,
  new_efficacy numeric,
  sample_size integer,
  confidence text CHECK (confidence IN ('HIGH','MODERATE','LOW')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_effup_treatment ON public.efficacy_updates(treatment_code, pest_disease_code, updated_at DESC);
GRANT SELECT ON public.efficacy_updates TO authenticated;
GRANT ALL ON public.efficacy_updates TO service_role;
ALTER TABLE public.efficacy_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read efficacy updates" ON public.efficacy_updates;
CREATE POLICY "Authenticated read efficacy updates" ON public.efficacy_updates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role manages efficacy updates" ON public.efficacy_updates;
CREATE POLICY "Service role manages efficacy updates" ON public.efficacy_updates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Cause-named alias guard — NOT VALID so 13 legacy rows are not rejected (audited separately for cleanup)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'observation_aliases_no_cause_named_alias') THEN
    ALTER TABLE public.observation_aliases
      ADD CONSTRAINT observation_aliases_no_cause_named_alias
      CHECK (alias_code !~* '_DEFICIENCY_' AND alias_code !~* '_TOXICITY_' AND alias_code !~* '_CAUSE_')
      NOT VALID;
  END IF;
END $$;

-- Hot-path indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_dr_crop_active ON public.decision_rules(crop_code, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_dr_condition_code ON public.decision_rules(condition_code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_iom_intent_crop_stage ON public.intent_observation_mapping(intent_code, crop_code, growth_stage) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_om_active ON public.observation_master(observation_code) WHERE is_active = true;
