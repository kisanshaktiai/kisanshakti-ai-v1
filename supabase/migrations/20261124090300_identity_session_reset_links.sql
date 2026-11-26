-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124090300_identity_session_reset_links.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M1 — file 4 of 8: tie sessions and PIN
-- reset codes to accounts.
--
-- user_sessions
--   + active_role       NULL on every existing row and treated as FARMER, so no
--                       live session changes meaning.
--   + role_verified_at  when the server last checked the membership for active_role.
--   + user_sessions_account_fkey: user_id → accounts(id), added NOT VALID. It is
--     checked for every new session from now on; existing rows are validated by the
--     next file (20261124090400), after the orphan count below is seen to be 0.
--     Must run after the backfill: from here on a session can only be created for an
--     id that has an account.
--
-- pin_reset_codes
--   + account_id (nullable) → accounts(id), so a person without a farmers row can
--     reset a PIN.
--   ! farmer_id loses its NOT NULL. This is the one change to an existing column in
--     the whole milestone and it is called out for review: the brief says "farmer_id
--     stays as it is", but farmer_id is NOT NULL today, so a reset row for a person
--     who is not a farmer could not be written at all. Its name, type and every
--     existing row stay as they are, and a CHECK keeps one of the two ids mandatory.
--     If you would rather keep NOT NULL, delete the three statements between the
--     (*) markers and the provider/customer PIN reset moves to a follow-up.
--
-- Safe to run twice. Plain statements, no session state.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS active_role text;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS role_verified_at timestamptz;

ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_active_role_fkey;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_active_role_fkey
  FOREIGN KEY (active_role) REFERENCES public.account_role_codes(code);

ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_account_fkey;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_account_fkey
  FOREIGN KEY (user_id) REFERENCES public.accounts(id) ON UPDATE CASCADE ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.pin_reset_codes ADD COLUMN IF NOT EXISTS account_id uuid;

ALTER TABLE public.pin_reset_codes DROP CONSTRAINT IF EXISTS pin_reset_codes_account_fkey;
ALTER TABLE public.pin_reset_codes ADD CONSTRAINT pin_reset_codes_account_fkey
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- (*) start: the reviewed exception described in the header ──────────────────
ALTER TABLE public.pin_reset_codes ALTER COLUMN farmer_id DROP NOT NULL;
ALTER TABLE public.pin_reset_codes DROP CONSTRAINT IF EXISTS pin_reset_codes_subject_chk;
ALTER TABLE public.pin_reset_codes ADD CONSTRAINT pin_reset_codes_subject_chk
  CHECK (farmer_id IS NOT NULL OR account_id IS NOT NULL);
-- (*) end ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pin_reset_codes_account
  ON public.pin_reset_codes (account_id, created_at DESC) WHERE account_id IS NOT NULL;

-- Orphan check (read-only). The next file may be applied only when `actual` is 0. ─
SELECT 'sessions whose user_id has no account' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM public.user_sessions s
 WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = s.user_id);
