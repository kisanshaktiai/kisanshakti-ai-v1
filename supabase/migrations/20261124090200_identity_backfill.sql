-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124090200_identity_backfill.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M1 — file 3 of 8: give every existing
-- farmer an account (same id) and an ACTIVE FARMER role.
--
-- Runs AFTER 20261124090100 on purpose: from that file on, every new farmers row
-- is linked by trigger, so no farmer can fall between the trigger and this file.
--
-- It calls the same function the insert trigger calls, so the backfill and the
-- trigger cannot disagree. Nothing in farmers is touched: no row is rewritten,
-- no id changes. The credential stays in farmers.pin_hash (single copy), so the
-- accounts rows created here have no pin_hash.
--
-- A farmer with no tenant or no mobile number gets no account; it is recorded in
-- account_link_conflicts and reported below. (Read-only check on 2026-11-24:
-- 28 farmers, 0 with a NULL tenant, 0 with a NULL mobile number, 0 duplicate
-- tenant + mobile pairs.)
--
-- Safe to run twice: a farmer that already has a live FARMER role is skipped.
-- Plain statements, no session state.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT public.link_farmer_account(f.id, f.tenant_id, f.mobile_number::text, 'BACKFILL')
  FROM public.farmers f
 WHERE NOT EXISTS (SELECT 1 FROM public.account_roles r
                    WHERE r.account_id = f.id AND r.role = 'FARMER' AND r.status <> 'REVOKED');

-- Verification (read-only). Proof the backfill covered every farmer, required
-- before the cutover file may be applied. ─────────────────────────────────────
SELECT 'farmers' AS check_name, count(*)::text AS actual, 'n' AS expected FROM public.farmers
UNION ALL
SELECT 'farmers with an account of the same id and an ACTIVE FARMER role', count(*)::text, 'n (same as farmers)'
  FROM public.farmers f
  JOIN public.accounts a ON a.id = f.id AND a.tenant_id = f.tenant_id AND a.mobile_number = f.mobile_number::text AND a.status = 'ACTIVE'
  JOIN public.account_roles r ON r.account_id = a.id AND r.role = 'FARMER' AND r.status = 'ACTIVE'
UNION ALL
SELECT 'accounts holding a pin_hash (single copy: must be none yet)', count(*)::text, '0'
  FROM public.accounts WHERE pin_hash IS NOT NULL
UNION ALL
SELECT 'open link conflicts (each one is a farmer to review)', count(*)::text, '0'
  FROM public.account_link_conflicts WHERE resolved_at IS NULL
UNION ALL
SELECT 'identity integrity gaps', count(*)::text, '0'
  FROM public.v_identity_integrity_gaps;
