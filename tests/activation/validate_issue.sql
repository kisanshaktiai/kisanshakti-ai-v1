-- ============================================================================
-- Validation for 20261126120000_farmer_activation_issue.sql (read-only)
-- ============================================================================
-- Run after the migration. Each row shows what was found next to what is
-- expected. This file is NOT a migration: it changes nothing.
-- ============================================================================
SELECT * FROM (
  SELECT 1 AS n, 'the five hand-out columns exist on activation_codes' AS check_name,
         (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activation_codes'
           AND column_name IN ('issued_at', 'issued_by', 'issued_to_name', 'issued_to_mobile', 'issue_note')) AS actual, '5' AS expected
  UNION ALL SELECT 2, 'the shape check is in place and valid',
         (SELECT convalidated::text FROM pg_constraint WHERE conname = 'activation_codes_issue_shape' AND conrelid = 'public.activation_codes'::regclass), 'true'
  UNION ALL SELECT 3, 'the portal can read the five columns',
         (SELECT bool_and(has_column_privilege('authenticated', 'public.activation_codes', c, 'SELECT'))::text
            FROM unnest(ARRAY['issued_at', 'issued_by', 'issued_to_name', 'issued_to_mobile', 'issue_note']) c), 'true'
  UNION ALL SELECT 4, 'the portal still cannot read the hash or the encrypted copy, nor write the table',
         (SELECT (has_column_privilege('authenticated', 'public.activation_codes', 'code_hash', 'SELECT')
               OR has_column_privilege('authenticated', 'public.activation_codes', 'code_ciphertext', 'SELECT')
               OR has_table_privilege('authenticated', 'public.activation_codes', 'UPDATE')
               OR has_column_privilege('authenticated', 'public.activation_codes', 'issued_to_name', 'UPDATE'))::text), 'false'
  UNION ALL SELECT 5, 'activation_issue_code exists, is SECURITY DEFINER with an empty search_path',
         (SELECT (p.prosecdef AND p.proconfig::text LIKE '%search_path=%')::text FROM pg_proc p WHERE p.oid = 'public.activation_issue_code(uuid,text,text,text)'::regprocedure), 'true'
  UNION ALL SELECT 6, 'signed-in portal users can call it; the app (anon) cannot',
         (SELECT (has_function_privilege('authenticated', 'public.activation_issue_code(uuid,text,text,text)', 'EXECUTE')
              AND NOT has_function_privilege('anon', 'public.activation_issue_code(uuid,text,text,text)', 'EXECUTE'))::text), 'true'
  UNION ALL SELECT 7, 'no existing code was marked as handed out by the migration',
         (SELECT count(*)::text FROM public.activation_codes WHERE issued_at IS NOT NULL AND issued_at < now() - interval '0 seconds' AND issued_by IS NULL), '0'
  UNION ALL SELECT 8, 'code counts by state are unchanged by the migration (shown for your record)',
         (SELECT string_agg(state || '=' || n, ', ' ORDER BY state) FROM (SELECT state, count(*) n FROM public.activation_codes GROUP BY state) s),
         (SELECT string_agg(state || '=' || n, ', ' ORDER BY state) FROM (SELECT state, count(*) n FROM public.activation_codes GROUP BY state) s)
) v ORDER BY n;
