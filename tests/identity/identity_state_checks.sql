-- ═══════════════════════════════════════════════════════════════════════════
-- tests/identity/identity_state_checks.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Runs on a migrated database AFTER portal_replay.sql. portal_replay.sql proves the
-- portals see no difference; this file proves every replayed write left a correct
-- account and FARMER role (invariant C) and nothing else.
-- Every line is: PASS|FAIL | check | actual | expected.
--
-- Replay arithmetic: 6 farmers before the migrations; +1 R02, +1 R03, +1 R04 (no
-- mobile), -1 R14 (R02 deleted), +1 R15, +50 R19, +50 R23, +1 R24, -2 R34 (tenant C)
-- = 108 farmers, 107 of them with a mobile number.
-- ═══════════════════════════════════════════════════════════════════════════
\set QUIET on
\pset format unaligned
\pset tuples_only on

CREATE OR REPLACE FUNCTION public.chk(p_name text, p_actual text, p_expected text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_actual IS NOT DISTINCT FROM p_expected THEN 'PASS' ELSE 'FAIL' END
         || ' | ' || p_name || ' | actual: ' || coalesce(p_actual, '(null)') || ' | expected: ' || coalesce(p_expected, '(null)') $$;

SELECT chk('S01 farmers after the replay', (SELECT count(*)::text FROM farmers), '108');
SELECT chk('S02 farmers with an ACTIVE account of the same id, same tenant, same mobile and an ACTIVE FARMER role',
  (SELECT count(*)::text FROM farmers f
     JOIN accounts a ON a.id = f.id AND a.tenant_id = f.tenant_id AND a.mobile_number = f.mobile_number::text AND a.status = 'ACTIVE'
     JOIN account_roles r ON r.account_id = a.id AND r.tenant_id = a.tenant_id AND r.role = 'FARMER' AND r.status = 'ACTIVE'), '107');
SELECT chk('S03 integrity gaps: only the farmer inserted without a mobile number (R04)',
  (SELECT coalesce(string_agg(gap || ':' || coalesce(farmer_id::text, account_id::text), ',' ORDER BY gap), '(none)') FROM v_identity_integrity_gaps),
  'FARMER_WITHOUT_ACCOUNT:aaaaaaaa-1000-0000-0000-000000000503');
SELECT chk('S04 open link conflicts: the same farmer, reason NULL_MOBILE',
  (SELECT coalesce(string_agg(reason || ':' || farmer_id, ',' ORDER BY reason), '(none)') FROM account_link_conflicts WHERE resolved_at IS NULL),
  'NULL_MOBILE:aaaaaaaa-1000-0000-0000-000000000503');
SELECT chk('S05 deleted farmer (R02, R14): account kept, CLOSED, carrying the number it had after R10',
  (SELECT status || ' ' || mobile_number FROM accounts WHERE id = 'aaaaaaaa-1000-0000-0000-000000000501'), 'CLOSED 0000000599');
SELECT chk('S06 deleted farmer: FARMER role kept and REVOKED',
  (SELECT status FROM account_roles WHERE account_id = 'aaaaaaaa-1000-0000-0000-000000000501' AND role = 'FARMER'), 'REVOKED');
SELECT chk('S07 same person created again (R15): own ACTIVE account under the new farmers id',
  (SELECT a.status || ' ' || a.mobile_number || ' ' || r.status FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER'
    WHERE a.id = 'aaaaaaaa-1000-0000-0000-000000000507'), 'ACTIVE 0000000599 ACTIVE');
SELECT chk('S08 statements that failed in the replay (R01, R05, R06, R07) left no account',
  (SELECT count(*)::text FROM accounts WHERE id IN ('aaaaaaaa-1000-0000-0000-000000000500', 'aaaaaaaa-1000-0000-0000-000000000504',
     'aaaaaaaa-1000-0000-0000-000000000505', 'aaaaaaaa-1000-0000-0000-000000000506')), '0');
SELECT chk('S09 failed 50-row batch (R20) and denied batch (R22) left no account',
  (SELECT count(*)::text FROM accounts WHERE mobile_number BETWEEN '0000002001' AND '0000003050'), '0');
SELECT chk('S10 50-row batch by the tenant admin (R19): 50 accounts, 50 ACTIVE FARMER roles from the trigger',
  (SELECT count(*) || '/' || count(*) FILTER (WHERE r.status = 'ACTIVE' AND r.source = 'FARMER_TRIGGER')
     FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER'
    WHERE a.tenant_id = '11111111-1111-1111-1111-111111111111' AND a.mobile_number BETWEEN '0000001001' AND '0000001050'), '50/50');
SELECT chk('S11 50-row batch by the service role (R23): 50 accounts, 50 ACTIVE FARMER roles from the trigger',
  (SELECT count(*) || '/' || count(*) FILTER (WHERE r.status = 'ACTIVE' AND r.source = 'FARMER_TRIGGER')
     FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER'
    WHERE a.tenant_id = '22222222-2222-2222-2222-222222222222' AND a.mobile_number BETWEEN '0000004001' AND '0000004050'), '50/50');
SELECT chk('S12 farmers that existed before the migrations carry source BACKFILL (4 left after tenant C was deleted)',
  (SELECT count(*)::text FROM account_roles WHERE role = 'FARMER' AND source = 'BACKFILL' AND status = 'ACTIVE'), '4');
SELECT chk('S13 farmer-app registration (R24): account and role exist, credential stays on farmers only',
  (SELECT a.status || ' ' || r.status || ' account_pin=' || (a.pin_hash IS NOT NULL) || ' farmer_pin=' || left(f.pin_hash, 4)
     FROM accounts a JOIN account_roles r ON r.account_id = a.id AND r.role = 'FARMER' JOIN farmers f ON f.id = a.id
    WHERE a.id = 'aaaaaaaa-2000-0000-0000-000000000700'), 'ACTIVE ACTIVE account_pin=false farmer_pin=7b7b');
SELECT chk('S14 single copy: no account holds a pin_hash', (SELECT count(*)::text FROM accounts WHERE pin_hash IS NOT NULL), '0');
SELECT chk('S15 tenant C deleted (R34): its accounts and roles went with it, as its farmers did',
  (SELECT (SELECT count(*) FROM accounts WHERE tenant_id = '33333333-3333-3333-3333-333333333333') || '/' ||
          (SELECT count(*) FROM account_roles WHERE tenant_id = '33333333-3333-3333-3333-333333333333')), '0/0');
SELECT chk('S16 every session belongs to an account',
  (SELECT count(*)::text FROM user_sessions s WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = s.user_id)), '0');
SELECT chk('S17 sessions written by today''s auth core have a NULL active_role (treated as FARMER)',
  (SELECT count(*) || ' sessions, ' || count(*) FILTER (WHERE active_role IS NULL) || ' NULL' FROM user_sessions), '5 sessions, 5 NULL');
SELECT chk('S18 PIN reset row written by today''s auth core: farmer_id set, account_id NULL',
  (SELECT (farmer_id IS NOT NULL) || '/' || (account_id IS NULL) FROM pin_reset_codes), 'true/true');
SELECT chk('S19 accounts in total: 107 linked farmers + 1 CLOSED account of the deleted farmer',
  (SELECT count(*) || ' (' || count(*) FILTER (WHERE status = 'CLOSED') || ' closed)' FROM accounts), '108 (1 closed)');
SELECT chk('S20 no account, role or session crosses tenants',
  (SELECT count(*)::text FROM account_roles r JOIN accounts a ON a.id = r.account_id WHERE r.tenant_id <> a.tenant_id), '0');
