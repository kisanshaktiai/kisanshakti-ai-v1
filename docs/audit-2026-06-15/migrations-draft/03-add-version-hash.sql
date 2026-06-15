-- DRAFT — DO NOT APPLY without product approval.
-- Additive: adds version_hash to symbolic-core tables to pin decisions to a version.

ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS version_hash text;
ALTER TABLE public.hypothesis_master
  ADD COLUMN IF NOT EXISTS version_hash text;
ALTER TABLE public.observation_master
  ADD COLUMN IF NOT EXISTS version_hash text;

-- One-time backfill: hash of canonical columns
UPDATE public.decision_rules
   SET version_hash = md5(coalesce(rule_id,'') || '|' ||
                          coalesce(condition_code,'') || '|' ||
                          coalesce(action_text,'') || '|' ||
                          coalesce(action_type,'') || '|' ||
                          coalesce(farmer_safety_level,'') || '|' ||
                          coalesce(conditions_json::text,''))
 WHERE version_hash IS NULL;

UPDATE public.hypothesis_master
   SET version_hash = md5(coalesce(hypothesis_id,'') || '|' ||
                          coalesce(name,'') || '|' ||
                          coalesce(crop_code,''))
 WHERE version_hash IS NULL;

UPDATE public.observation_master
   SET version_hash = md5(coalesce(observation_code,'') || '|' ||
                          coalesce(canonical_label,''))
 WHERE version_hash IS NULL;

-- Trigger to refresh on UPDATE
CREATE OR REPLACE FUNCTION public.refresh_version_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_hash := md5(row_to_json(NEW)::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_decision_rules_version_hash ON public.decision_rules;
CREATE TRIGGER trg_decision_rules_version_hash
  BEFORE UPDATE ON public.decision_rules
  FOR EACH ROW EXECUTE FUNCTION public.refresh_version_hash();

-- Rollback:
-- ALTER TABLE public.decision_rules DROP COLUMN IF EXISTS version_hash;
-- ALTER TABLE public.hypothesis_master DROP COLUMN IF EXISTS version_hash;
-- ALTER TABLE public.observation_master DROP COLUMN IF EXISTS version_hash;
-- DROP FUNCTION IF EXISTS public.refresh_version_hash();
