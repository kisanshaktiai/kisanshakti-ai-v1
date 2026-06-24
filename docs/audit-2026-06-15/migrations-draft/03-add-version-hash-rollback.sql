-- Rollback for 03-add-version-hash.sql
BEGIN;

DROP TRIGGER IF EXISTS trg_observation_master_version_hash ON public.observation_master;
DROP TRIGGER IF EXISTS trg_hypothesis_master_version_hash  ON public.hypothesis_master;
DROP TRIGGER IF EXISTS trg_decision_rules_version_hash     ON public.decision_rules;

DROP FUNCTION IF EXISTS public.refresh_observation_version_hash();
DROP FUNCTION IF EXISTS public.refresh_hypothesis_version_hash();
DROP FUNCTION IF EXISTS public.refresh_decision_rule_version_hash();

DROP INDEX IF EXISTS public.idx_observation_master_version_hash;
DROP INDEX IF EXISTS public.idx_hypothesis_master_version_hash;
DROP INDEX IF EXISTS public.idx_decision_rules_version_hash;

ALTER TABLE public.observation_master DROP COLUMN IF EXISTS version_hash;
ALTER TABLE public.hypothesis_master  DROP COLUMN IF EXISTS version_hash;
ALTER TABLE public.decision_rules     DROP COLUMN IF EXISTS version_hash;

COMMIT;
