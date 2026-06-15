-- DRAFT — Stage 1 of phased lowercase migration. DO NOT APPLY yet.
-- Zero behavior change: adds generated lowercase shadow columns + unique indexes.

ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS rule_id_lc text
    GENERATED ALWAYS AS (
      'rule_' || lower(regexp_replace(rule_id, '^(RULE_)?', ''))
    ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS decision_rules_rule_id_lc_key
  ON public.decision_rules(rule_id_lc);

ALTER TABLE public.hypothesis_master
  ADD COLUMN IF NOT EXISTS hypothesis_id_lc text
    GENERATED ALWAYS AS (
      'hyp_' || lower(regexp_replace(hypothesis_id, '^(HYP_)?', ''))
    ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS hypothesis_master_hypothesis_id_lc_key
  ON public.hypothesis_master(hypothesis_id_lc);

-- Rollback:
-- DROP INDEX IF EXISTS public.decision_rules_rule_id_lc_key;
-- ALTER TABLE public.decision_rules DROP COLUMN IF EXISTS rule_id_lc;
-- DROP INDEX IF EXISTS public.hypothesis_master_hypothesis_id_lc_key;
-- ALTER TABLE public.hypothesis_master DROP COLUMN IF EXISTS hypothesis_id_lc;
