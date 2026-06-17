-- Rollback for 02-stage-1-shadow-columns.sql
BEGIN;
DROP INDEX IF EXISTS public.hypothesis_master_hypothesis_id_lc_key;
DROP INDEX IF EXISTS public.decision_rules_rule_id_lc_key;
ALTER TABLE public.hypothesis_master DROP COLUMN IF EXISTS hypothesis_id_lc;
ALTER TABLE public.decision_rules    DROP COLUMN IF EXISTS rule_id_lc;
COMMIT;
