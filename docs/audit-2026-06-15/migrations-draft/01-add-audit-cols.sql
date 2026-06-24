-- ============================================================
-- 01-add-audit-cols.sql
-- ORDER: 1 of 4. Apply first.
-- DEPENDS ON: nothing.
-- BLOCKED BY: nothing.
-- ROLLBACK:   01-add-audit-cols-rollback.sql
-- POST-APPLY: 01-add-audit-cols-post-apply-check.sql
-- DRAFT — DO NOT APPLY without product approval.
-- ============================================================

-- ===== PRE-FLIGHT (copy-paste; verify before BEGIN) =====
-- SELECT count(*) FROM public.hypothesis_metrics;       -- expect ~67
-- SELECT count(*) FROM public.hypothesis_rule_mapping;  -- expect ~1810
-- SELECT count(*) FROM public.rule_conflict_matrix;     -- expect 0
-- SELECT count(*) FROM public.advisory_audit_log;       -- expect 0
-- SELECT proname FROM pg_proc
--   WHERE proname='audit_set_updated_at'
--     AND pronamespace='public'::regnamespace;          -- expect 0 rows
-- SELECT relation::regclass, mode FROM pg_locks
--  WHERE relation IN (
--    'public.hypothesis_metrics'::regclass,
--    'public.hypothesis_rule_mapping'::regclass,
--    'public.rule_conflict_matrix'::regclass,
--    'public.advisory_audit_log'::regclass
--  ) AND mode LIKE '%Exclusive%';                       -- expect 0 rows

BEGIN;

-- Specifically named function — avoids collision with any future generic set_updated_at().
CREATE OR REPLACE FUNCTION public.audit_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ---- Small tables: one-liner is safe ----
ALTER TABLE public.hypothesis_metrics
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.hypothesis_rule_mapping
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.rule_conflict_matrix
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---- advisory_audit_log: two-step pattern (empty today, but discipline) ----
ALTER TABLE public.advisory_audit_log
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.advisory_audit_log
   SET created_at = COALESCE(generated_at, now())
 WHERE created_at IS NULL;

ALTER TABLE public.advisory_audit_log
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

-- ---- updated_at >= created_at safety net ----
ALTER TABLE public.hypothesis_metrics
  ADD CONSTRAINT hypothesis_metrics_audit_ordering_chk
  CHECK (updated_at >= created_at);

ALTER TABLE public.hypothesis_rule_mapping
  ADD CONSTRAINT hypothesis_rule_mapping_audit_ordering_chk
  CHECK (updated_at >= created_at);

ALTER TABLE public.rule_conflict_matrix
  ADD CONSTRAINT rule_conflict_matrix_audit_ordering_chk
  CHECK (updated_at >= created_at);

-- ---- updated_at triggers ----
DROP TRIGGER IF EXISTS trg_hyp_metrics_updated_at ON public.hypothesis_metrics;
CREATE TRIGGER trg_hyp_metrics_updated_at
  BEFORE UPDATE ON public.hypothesis_metrics
  FOR EACH ROW EXECUTE FUNCTION public.audit_set_updated_at();

DROP TRIGGER IF EXISTS trg_hrm_updated_at ON public.hypothesis_rule_mapping;
CREATE TRIGGER trg_hrm_updated_at
  BEFORE UPDATE ON public.hypothesis_rule_mapping
  FOR EACH ROW EXECUTE FUNCTION public.audit_set_updated_at();

DROP TRIGGER IF EXISTS trg_rcm_updated_at ON public.rule_conflict_matrix;
CREATE TRIGGER trg_rcm_updated_at
  BEFORE UPDATE ON public.rule_conflict_matrix
  FOR EACH ROW EXECUTE FUNCTION public.audit_set_updated_at();

-- ---- advisory_audit_log: append-only enforcement ----
CREATE OR REPLACE FUNCTION public.advisory_audit_log_no_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'advisory_audit_log is append-only; UPDATE not permitted (id=%)', OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_advisory_audit_log_no_update ON public.advisory_audit_log;
CREATE TRIGGER trg_advisory_audit_log_no_update
  BEFORE UPDATE ON public.advisory_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.advisory_audit_log_no_update();

COMMIT;
