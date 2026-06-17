-- ============================================================
-- 02-stage-1-shadow-columns.sql
-- ORDER: 3 of 4 (apply AFTER 01 + CI-gate live).
-- DEPENDS ON: 01-add-audit-cols.sql (ordering only).
-- BLOCKED BY: CI lint not yet enforcing UPPER-rule_id rejection (see CI-gate.md).
-- ROLLBACK:   02-stage-1-shadow-columns-rollback.sql
-- POST-APPLY: 02-stage-1-shadow-columns-post-apply-check.sql
-- DRAFT — DO NOT APPLY without product approval.
-- ============================================================

-- ===== PRE-FLIGHT: collision check — MUST return 0 rows for both =====
-- WITH proposed AS (
--   SELECT rule_id,
--     'rule_' || lower(regexp_replace(rule_id, '^(rule_|RULE_)', '', 'i')) AS lc
--   FROM public.decision_rules
-- )
-- SELECT lc, count(*), array_agg(rule_id) FROM proposed GROUP BY lc HAVING count(*) > 1;
--
-- WITH proposed AS (
--   SELECT hypothesis_id,
--     'hyp_' || lower(regexp_replace(hypothesis_id, '^(hyp_|HYP_)', '', 'i')) AS lc
--   FROM public.hypothesis_master
-- )
-- SELECT lc, count(*), array_agg(hypothesis_id) FROM proposed GROUP BY lc HAVING count(*) > 1;

BEGIN;

-- Case-insensitive prefix strip ('i' flag) prevents double-prefix on already-lowercase outliers.
-- STORED is required because we index the column for uniqueness.
-- Authoring contract: NEW rule_id values must be inserted WITHOUT a 'rule_' prefix;
-- this shadow column adds it. Enforced upstream by CI lint (see CI-gate.md).
ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS rule_id_lc text
    GENERATED ALWAYS AS (
      'rule_' || lower(regexp_replace(rule_id, '^(rule_|RULE_)', '', 'i'))
    ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS decision_rules_rule_id_lc_key
  ON public.decision_rules(rule_id_lc);

ALTER TABLE public.hypothesis_master
  ADD COLUMN IF NOT EXISTS hypothesis_id_lc text
    GENERATED ALWAYS AS (
      'hyp_' || lower(regexp_replace(hypothesis_id, '^(hyp_|HYP_)', '', 'i'))
    ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS hypothesis_master_hypothesis_id_lc_key
  ON public.hypothesis_master(hypothesis_id_lc);

-- In-transaction sanity assert. If any collision slipped past pre-flight,
-- this raises and aborts the whole transaction (rolling back column adds).
DO $$
DECLARE
  dup_rules int;
  dup_hyp   int;
BEGIN
  SELECT count(*) INTO dup_rules FROM (
    SELECT rule_id_lc FROM public.decision_rules GROUP BY rule_id_lc HAVING count(*)>1
  ) s;
  SELECT count(*) INTO dup_hyp FROM (
    SELECT hypothesis_id_lc FROM public.hypothesis_master GROUP BY hypothesis_id_lc HAVING count(*)>1
  ) s;
  IF dup_rules > 0 OR dup_hyp > 0 THEN
    RAISE EXCEPTION 'Lowercase ID collisions detected (rules=%, hypotheses=%) — abort.',
                    dup_rules, dup_hyp;
  END IF;
END $$;

COMMIT;

-- ===== VERIFICATION (run after COMMIT) =====
-- SELECT count(*) FROM public.decision_rules    WHERE rule_id_lc IS NULL;          -- expect 0
-- SELECT count(*) FROM public.hypothesis_master WHERE hypothesis_id_lc IS NULL;    -- expect 0
-- SELECT rule_id, rule_id_lc FROM public.decision_rules LIMIT 20;
-- SELECT hypothesis_id, hypothesis_id_lc FROM public.hypothesis_master LIMIT 20;
-- SELECT count(*) FILTER (WHERE rule_id_lc LIKE 'rule_%')    AS prefixed,
--        count(*) FILTER (WHERE rule_id_lc NOT LIKE 'rule_%') AS unprefixed
--   FROM public.decision_rules;   -- expect prefixed=1852, unprefixed=0
