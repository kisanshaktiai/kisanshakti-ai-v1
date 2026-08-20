ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS trigger_class text NOT NULL DEFAULT 'OBSERVATION';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_rules_trigger_class_chk'
  ) THEN
    ALTER TABLE public.decision_rules
      ADD CONSTRAINT decision_rules_trigger_class_chk
      CHECK (trigger_class IN ('OBSERVATION','CONTEXT_SCHEDULE','CONTEXT_BLOCK'));
  END IF;
END $$;

UPDATE public.decision_rules
SET trigger_class = 'CONTEXT_SCHEDULE'
WHERE rule_id IN (
  'RICE_NUTR_N_BASAL_001','RICE_NUTR_N_TOP1_001','RICE_NUTR_N_TOP2_001',
  'RICE_NUTR_LCC_001','RICE_NUTR_ORGANIC_001'
);

UPDATE public.decision_rules
SET trigger_class = 'CONTEXT_BLOCK'
WHERE rule_id = 'RICE_NUTR_LATE_N_BLOCK_001';

CREATE INDEX IF NOT EXISTS idx_dr_trigger_class_active
  ON public.decision_rules (trigger_class, is_active);