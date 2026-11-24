-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124100100_identity_feature_flag.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M2 — file 2 of 2: the feature flag.
--
-- One row in public.feature_flags, default OFF, in the same shape the repo already
-- uses (see 20260830_stage_evidence_authority_p1.sql). It is read on the server by
-- _shared/featureFlags.ts isFlagEnabled(), with the tenant as context:
--   OFF for everyone  : is_enabled = false (this seed)
--   ON for one tenant : is_enabled = true and the tenant id in target_tenants
--   ON for everyone   : is_enabled = true and rollout_percentage = 100
--
-- While it is OFF the auth core refuses every new action (role registration, add
-- role, switch workspace, account PIN reset) and does not look at accounts for
-- login, so farmer login behaves exactly as before. The farmer client cannot read
-- feature_flags (admin-only policies), so the auth core reports the flag to the
-- client as `multiRole` in the reply of the existing `lookup` action.
--
-- Never overwrites a row that already exists.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.feature_flags
  (flag_name, description, is_enabled, rollout_percentage, flag_type, flag_status, default_value)
SELECT 'multi_role_identity',
       'Farmer app multi-role identity (Farmer / Service Provider / Customer): role registration, adding a role, workspace switch and login for people without a farmers row. Default OFF: only farmer login and registration are served. Turn on per tenant with target_tenants, or for everyone with rollout_percentage = 100.',
       false, 0, 'release', 'active', 'false'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name = 'multi_role_identity');

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'multi_role_identity flag' AS check_name,
       'enabled=' || is_enabled || ' rollout=' || rollout_percentage || ' tenants=' || coalesce(array_length(target_tenants, 1), 0) AS actual,
       'enabled=false rollout=0 tenants=0' AS expected
  FROM public.feature_flags WHERE flag_name = 'multi_role_identity';
