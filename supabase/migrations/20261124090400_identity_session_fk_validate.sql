-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124090400_identity_session_fk_validate.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M1 — file 5 of 8: validate the session
-- foreign key that 20261124090300 added as NOT VALID.
--
-- Apply only after the orphan check at the end of 20261124090300 returned 0.
-- If an orphan exists this statement fails and changes nothing; the constraint
-- stays NOT VALID (still enforced for new sessions) until the orphan is reviewed.
-- Kept in its own file so that a failure here cannot roll back the columns and
-- constraints of the previous file.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_sessions VALIDATE CONSTRAINT user_sessions_account_fkey;

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'user_sessions_account_fkey validated' AS check_name, convalidated::text AS actual, 'true' AS expected
  FROM pg_constraint
 WHERE conrelid = 'public.user_sessions'::regclass AND conname = 'user_sessions_account_fkey';
