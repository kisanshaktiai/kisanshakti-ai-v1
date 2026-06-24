-- Rollback for 01-add-audit-cols.sql
BEGIN;

DROP TRIGGER IF EXISTS trg_advisory_audit_log_no_update ON public.advisory_audit_log;
DROP TRIGGER IF EXISTS trg_rcm_updated_at         ON public.rule_conflict_matrix;
DROP TRIGGER IF EXISTS trg_hrm_updated_at         ON public.hypothesis_rule_mapping;
DROP TRIGGER IF EXISTS trg_hyp_metrics_updated_at ON public.hypothesis_metrics;

DROP FUNCTION IF EXISTS public.advisory_audit_log_no_update();
DROP FUNCTION IF EXISTS public.audit_set_updated_at();

ALTER TABLE public.rule_conflict_matrix    DROP CONSTRAINT IF EXISTS rule_conflict_matrix_audit_ordering_chk;
ALTER TABLE public.hypothesis_rule_mapping DROP CONSTRAINT IF EXISTS hypothesis_rule_mapping_audit_ordering_chk;
ALTER TABLE public.hypothesis_metrics      DROP CONSTRAINT IF EXISTS hypothesis_metrics_audit_ordering_chk;

ALTER TABLE public.advisory_audit_log      DROP COLUMN IF EXISTS created_at;
ALTER TABLE public.rule_conflict_matrix    DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.hypothesis_rule_mapping DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.hypothesis_metrics      DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;

COMMIT;
