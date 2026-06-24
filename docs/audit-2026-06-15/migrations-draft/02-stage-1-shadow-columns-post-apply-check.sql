-- Post-apply daily checks for 02-stage-1-shadow-columns.sql (run for 24h).

-- 1. No null shadow values (GENERATED columns guarantee, but verify).
SELECT count(*) AS null_rule_id_lc        FROM public.decision_rules    WHERE rule_id_lc IS NULL;
SELECT count(*) AS null_hypothesis_id_lc  FROM public.hypothesis_master WHERE hypothesis_id_lc IS NULL;

-- 2. Uniqueness preserved (collisions impossible by unique index, but verify counts).
SELECT count(DISTINCT rule_id_lc)        AS distinct_rule_lc,
       count(*)                          AS total_rules
  FROM public.decision_rules;
SELECT count(DISTINCT hypothesis_id_lc)  AS distinct_hyp_lc,
       count(*)                          AS total_hyp
  FROM public.hypothesis_master;

-- 3. Prefix consistency.
SELECT count(*) FILTER (WHERE rule_id_lc LIKE 'rule_%')        AS prefixed,
       count(*) FILTER (WHERE rule_id_lc NOT LIKE 'rule_%')    AS unprefixed
  FROM public.decision_rules;
SELECT count(*) FILTER (WHERE hypothesis_id_lc LIKE 'hyp_%')   AS prefixed,
       count(*) FILTER (WHERE hypothesis_id_lc NOT LIKE 'hyp_%') AS unprefixed
  FROM public.hypothesis_master;

-- 4. Any new rows in last 24h whose source id is still UPPER_SNAKE => CI lint failed.
SELECT rule_id, rule_id_lc, created_at
  FROM public.decision_rules
 WHERE created_at > now() - interval '24 hours'
   AND rule_id ~ '^[A-Z][A-Z0-9_]+$';
