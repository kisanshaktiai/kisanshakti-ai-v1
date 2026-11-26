-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124090700_identity_config_seeds.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M1 — file 8 of 8: the Reach policy row.
--
-- system_config's real shape (read 2026-11-24): (config_key text UNIQUE,
-- config_value jsonb NOT NULL, description text). Policies that belong together
-- are already stored as one JSON object per key (crop_cycle_auto_close_policy,
-- vision_diagnosis_policy, yield_model_policy), so the Reach policy follows that.
--
-- Starter values from the brief, to be edited as data, never as code:
--   radius 5 to 100 km in steps of 5, default 25; Reach changes 3 per 7 days per account.
--
-- ON CONFLICT DO NOTHING: a value already edited in the database is never overwritten.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'account_reach_policy',
  '{"radius_min_km": 5, "radius_max_km": 100, "radius_step_km": 5, "radius_default_km": 25, "change_limit_count": 3, "change_limit_window_days": 7}'::jsonb,
  'Reach settings for Service Provider and Customer accounts. radius_min_km / radius_max_km / radius_step_km: allowed radius values in km (max minus min must be a multiple of step). radius_default_km: value pre-selected on first set-up (must be an allowed value). change_limit_count / change_limit_window_days: how many Reach changes one account may make inside the window, counted across both roles; the first set-up of a role is not counted. Read by account_reach_policy(); an incomplete or incoherent value disables set_account_reach() until corrected.'
)
ON CONFLICT (config_key) DO NOTHING;

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'account_reach_policy readable and coherent' AS check_name, count(*)::text AS actual, '1' AS expected
  FROM public.account_reach_policy();
