-- ============================================================
-- 03-add-version-hash.sql
-- ORDER: 4 of 4. Apply AFTER 01 + CI-gate + 02.
-- DEPENDS ON: 01-add-audit-cols.sql
-- ROLLBACK:   03-add-version-hash-rollback.sql
-- POST-APPLY: 03-add-version-hash-post-apply-check.sql
-- DRAFT — DO NOT APPLY without product approval.
--
-- POLICY:
--   Identity columns (rule_id, hypothesis_id, observation_code) MUST NOT
--   appear in their own version_hash formula. Identity is the row key, not
--   its content. Including identity (a) breaks "same content => same hash"
--   equality and (b) causes every hash to churn when the Phase 9 lowercase
--   flip rewrites identities. Full audit trail (child rows, snapshot at
--   decision time) lives in ai_decision_log, not in version_hash. version_hash
--   is a fingerprint, not a snapshot.
--
--   Option (a) adopted: row-columns-only hash. Child-row changes do NOT bump
--   parent hash by design. If a stronger guarantee is ever needed, add it as
--   a separate, conscious decision rather than expanding these triggers.
--
--   md5 is sufficient for change-detection — it is not used as a security
--   primitive. Switching to sha256/pgcrypto is deferred.
-- ============================================================

-- ===== PRE-FLIGHT =====
-- SELECT count(*) FROM public.decision_rules;       -- expect ~1852
-- SELECT count(*) FROM public.hypothesis_master;    -- expect ~346
-- SELECT count(*) FROM public.observation_master;   -- expect ~2537
-- All three under 100k rows => single-statement backfill is safe.

BEGIN;

-- =========================================================
-- decision_rules
-- Verified columns; rule_id (identity) excluded by policy.
-- =========================================================
ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS version_hash text;

CREATE OR REPLACE FUNCTION public.refresh_decision_rule_version_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_hash := md5(
    coalesce(NEW.condition_code,'')        || '|' ||
    coalesce(NEW.action_text,'')           || '|' ||
    coalesce(NEW.action_type,'')           || '|' ||
    coalesce(NEW.farmer_safety_level,'')   || '|' ||
    coalesce(NEW.response_severity,'')     || '|' ||
    coalesce(NEW.rule_intent,'')           || '|' ||
    coalesce(NEW.conditions_json::text,'') || '|' ||
    coalesce(NEW.crop_code,'')             || '|' ||
    coalesce(NEW.growth_stage,'')
  );
  RETURN NEW;
END $$;

UPDATE public.decision_rules
   SET version_hash = md5(
     coalesce(condition_code,'')        || '|' ||
     coalesce(action_text,'')           || '|' ||
     coalesce(action_type,'')           || '|' ||
     coalesce(farmer_safety_level,'')   || '|' ||
     coalesce(response_severity,'')     || '|' ||
     coalesce(rule_intent,'')           || '|' ||
     coalesce(conditions_json::text,'') || '|' ||
     coalesce(crop_code,'')             || '|' ||
     coalesce(growth_stage,'')
   )
 WHERE version_hash IS NULL;

DROP TRIGGER IF EXISTS trg_decision_rules_version_hash ON public.decision_rules;
CREATE TRIGGER trg_decision_rules_version_hash
  BEFORE INSERT OR UPDATE ON public.decision_rules
  FOR EACH ROW EXECUTE FUNCTION public.refresh_decision_rule_version_hash();

CREATE INDEX IF NOT EXISTS idx_decision_rules_version_hash
  ON public.decision_rules(version_hash);

-- =========================================================
-- hypothesis_master
-- Verified columns (live schema 2026-06-17):
--   hypothesis_id, crop_group, hypothesis_type, canonical_group,
--   cause_name_en, cause_name_mr, cause_name_hi, biological_basis,
--   severity_model, version, engine_min_version, is_active,
--   created_at, updated_at
-- Excluded: hypothesis_id (identity policy); cause_name_* (display-only
-- translation, not engine input). Included: biological_basis (describes
-- the diagnostic mechanism the engine surfaces — decision-relevant).
-- Columns 'confidence_threshold' and 'description' do NOT exist in this
-- schema and are intentionally omitted.
-- =========================================================
ALTER TABLE public.hypothesis_master
  ADD COLUMN IF NOT EXISTS version_hash text;

CREATE OR REPLACE FUNCTION public.refresh_hypothesis_version_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_hash := md5(
    coalesce(NEW.crop_group,'')           || '|' ||
    coalesce(NEW.hypothesis_type,'')      || '|' ||
    coalesce(NEW.canonical_group,'')      || '|' ||
    coalesce(NEW.biological_basis,'')     || '|' ||
    coalesce(NEW.severity_model,'')       || '|' ||
    coalesce(NEW.version,'')              || '|' ||
    coalesce(NEW.engine_min_version,'')   || '|' ||
    coalesce(NEW.is_active::text,'')
  );
  RETURN NEW;
END $$;

UPDATE public.hypothesis_master
   SET version_hash = md5(
     coalesce(crop_group,'')           || '|' ||
     coalesce(hypothesis_type,'')      || '|' ||
     coalesce(canonical_group,'')      || '|' ||
     coalesce(biological_basis,'')     || '|' ||
     coalesce(severity_model,'')       || '|' ||
     coalesce(version,'')              || '|' ||
     coalesce(engine_min_version,'')   || '|' ||
     coalesce(is_active::text,'')
   )
 WHERE version_hash IS NULL;

DROP TRIGGER IF EXISTS trg_hypothesis_master_version_hash ON public.hypothesis_master;
CREATE TRIGGER trg_hypothesis_master_version_hash
  BEFORE INSERT OR UPDATE ON public.hypothesis_master
  FOR EACH ROW EXECUTE FUNCTION public.refresh_hypothesis_version_hash();

CREATE INDEX IF NOT EXISTS idx_hypothesis_master_version_hash
  ON public.hypothesis_master(version_hash);

-- =========================================================
-- observation_master
-- Verified columns (live schema 2026-06-17):
--   observation_code, description, is_diagnostic, symptom_category,
--   canonical_group, observation_category, affected_plant_part,
--   is_active, is_farmer_observable, crop_group, applicable_crop_groups,
--   observation_type, symptom_type, symptom_pattern, severity_level,
--   discriminator_score, frequency_score, clarity_score,
--   created_at, updated_at
-- Excluded: observation_code (identity policy); discriminator_score /
-- frequency_score / clarity_score (numeric tuning weights — change often
-- without changing semantic identity of the observation).
-- Included: description (the canonical semantic payload the reasoner
-- matches against; no separate canonical_label column exists).
-- Columns 'canonical_label' and 'clinical_signs' do NOT exist in this
-- schema and are intentionally omitted.
-- =========================================================
ALTER TABLE public.observation_master
  ADD COLUMN IF NOT EXISTS version_hash text;

CREATE OR REPLACE FUNCTION public.refresh_observation_version_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_hash := md5(
    coalesce(NEW.description,'')                 || '|' ||
    coalesce(NEW.symptom_category,'')            || '|' ||
    coalesce(NEW.canonical_group,'')             || '|' ||
    coalesce(NEW.observation_category,'')        || '|' ||
    coalesce(NEW.affected_plant_part,'')         || '|' ||
    coalesce(NEW.observation_type::text,'')      || '|' ||
    coalesce(NEW.symptom_type::text,'')          || '|' ||
    coalesce(NEW.symptom_pattern::text,'')       || '|' ||
    coalesce(NEW.severity_level::text,'')        || '|' ||
    coalesce(NEW.is_diagnostic::text,'')         || '|' ||
    coalesce(NEW.is_farmer_observable::text,'')  || '|' ||
    coalesce(NEW.is_active::text,'')             || '|' ||
    coalesce(NEW.crop_group,'')                  || '|' ||
    coalesce(array_to_string(NEW.applicable_crop_groups, ','), '')
  );
  RETURN NEW;
END $$;

UPDATE public.observation_master
   SET version_hash = md5(
     coalesce(description,'')                 || '|' ||
     coalesce(symptom_category,'')            || '|' ||
     coalesce(canonical_group,'')             || '|' ||
     coalesce(observation_category,'')        || '|' ||
     coalesce(affected_plant_part,'')         || '|' ||
     coalesce(observation_type::text,'')      || '|' ||
     coalesce(symptom_type::text,'')          || '|' ||
     coalesce(symptom_pattern::text,'')       || '|' ||
     coalesce(severity_level::text,'')        || '|' ||
     coalesce(is_diagnostic::text,'')         || '|' ||
     coalesce(is_farmer_observable::text,'')  || '|' ||
     coalesce(is_active::text,'')             || '|' ||
     coalesce(crop_group,'')                  || '|' ||
     coalesce(array_to_string(applicable_crop_groups, ','), '')
   )
 WHERE version_hash IS NULL;

DROP TRIGGER IF EXISTS trg_observation_master_version_hash ON public.observation_master;
CREATE TRIGGER trg_observation_master_version_hash
  BEFORE INSERT OR UPDATE ON public.observation_master
  FOR EACH ROW EXECUTE FUNCTION public.refresh_observation_version_hash();

CREATE INDEX IF NOT EXISTS idx_observation_master_version_hash
  ON public.observation_master(version_hash);

COMMIT;
