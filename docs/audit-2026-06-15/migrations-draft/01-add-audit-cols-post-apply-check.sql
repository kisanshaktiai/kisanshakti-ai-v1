-- Post-apply daily checks for 01-add-audit-cols.sql (run for 24h after deploy).

-- 1. Trigger invocation counts. Expect calls > 0 once writes occur.
SELECT funcname, calls
  FROM pg_stat_user_functions
 WHERE funcname IN ('audit_set_updated_at','advisory_audit_log_no_update');

-- 2. Confirm new audit columns are populated.
SELECT created_at, updated_at FROM public.hypothesis_metrics      ORDER BY updated_at DESC LIMIT 5;
SELECT created_at, updated_at FROM public.hypothesis_rule_mapping ORDER BY updated_at DESC LIMIT 5;
SELECT created_at, updated_at FROM public.rule_conflict_matrix    ORDER BY updated_at DESC LIMIT 5;

-- 3. Constraint violations (expect 0).
SELECT count(*) AS bad_hyp_metrics
  FROM public.hypothesis_metrics WHERE updated_at < created_at;
SELECT count(*) AS bad_hrm
  FROM public.hypothesis_rule_mapping WHERE updated_at < created_at;
SELECT count(*) AS bad_rcm
  FROM public.rule_conflict_matrix WHERE updated_at < created_at;

-- 4. Any UPDATE attempt on advisory_audit_log should appear in application error logs
--    as: 'advisory_audit_log is append-only; UPDATE not permitted'. Grep edge-function
--    logs for that string. Any hit indicates a code-side bug to investigate.
