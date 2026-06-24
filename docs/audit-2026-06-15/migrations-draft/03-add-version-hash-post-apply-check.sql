-- Post-apply daily checks for 03-add-version-hash.sql (run for 24h).

-- 1. No null hashes after backfill + trigger install.
SELECT count(*) AS null_dr  FROM public.decision_rules     WHERE version_hash IS NULL;
SELECT count(*) AS null_hyp FROM public.hypothesis_master  WHERE version_hash IS NULL;
SELECT count(*) AS null_obs FROM public.observation_master WHERE version_hash IS NULL;

-- 2. Hash distribution sanity (expect distinct_hashes ~ total_rows; small dup count is OK
--    for genuinely-identical rule payloads, but a huge collision would indicate a formula bug).
SELECT count(*) AS total, count(DISTINCT version_hash) AS distinct_hashes FROM public.decision_rules;
SELECT count(*) AS total, count(DISTINCT version_hash) AS distinct_hashes FROM public.hypothesis_master;
SELECT count(*) AS total, count(DISTINCT version_hash) AS distinct_hashes FROM public.observation_master;

-- 3. Trigger invocation counts.
SELECT funcname, calls FROM pg_stat_user_functions
 WHERE funcname IN (
   'refresh_decision_rule_version_hash',
   'refresh_hypothesis_version_hash',
   'refresh_observation_version_hash'
 );

-- 4. Spot-check semantics (run manually in a staging tx; do NOT run in prod):
--    BEGIN;
--      SELECT version_hash FROM public.decision_rules WHERE rule_id = '<pick one>';
--      UPDATE public.decision_rules SET action_text = action_text || ' '
--       WHERE rule_id = '<pick one>';
--      SELECT version_hash FROM public.decision_rules WHERE rule_id = '<pick one>';
--      -- hash MUST differ
--    ROLLBACK;
