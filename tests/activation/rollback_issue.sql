-- ============================================================================
-- Rollback for 20261126120000_farmer_activation_issue.sql
-- ============================================================================
-- This file is NOT a migration. Run it by hand only to back the hand-out
-- feature out. It removes the function and takes the portal's read right on
-- the five columns away. It does NOT drop the columns: they may hold the
-- tenant's record of who received which code, and nothing is ever deleted.
-- The tenant portal's Share button stops working after this.
-- ============================================================================
DROP FUNCTION IF EXISTS public.activation_issue_code(uuid, text, text, text);
REVOKE SELECT (issued_at, issued_by, issued_to_name, issued_to_mobile, issue_note)
  ON public.activation_codes FROM authenticated;

-- Verification (read-only): expected  true | false
SELECT to_regprocedure('public.activation_issue_code(uuid,text,text,text)') IS NULL AS function_removed,
       has_column_privilege('authenticated', 'public.activation_codes', 'issued_to_name', 'SELECT') AS portal_can_read_recipient;
