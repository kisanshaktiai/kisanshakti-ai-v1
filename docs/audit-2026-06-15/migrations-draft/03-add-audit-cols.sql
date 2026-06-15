-- DRAFT — DO NOT APPLY without product approval.
-- Additive: fills audit-column gaps identified in 03-schema-gaps.md.

ALTER TABLE public.hypothesis_metrics
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.hypothesis_rule_mapping
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.rule_conflict_matrix
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.advisory_audit_log
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_hyp_metrics_updated_at ON public.hypothesis_metrics;
CREATE TRIGGER trg_hyp_metrics_updated_at
  BEFORE UPDATE ON public.hypothesis_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_hrm_updated_at ON public.hypothesis_rule_mapping;
CREATE TRIGGER trg_hrm_updated_at
  BEFORE UPDATE ON public.hypothesis_rule_mapping
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_rcm_updated_at ON public.rule_conflict_matrix;
CREATE TRIGGER trg_rcm_updated_at
  BEFORE UPDATE ON public.rule_conflict_matrix
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rollback:
-- ALTER TABLE public.hypothesis_metrics DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
-- (etc., plus DROP TRIGGER statements)
