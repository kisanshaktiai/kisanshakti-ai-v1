-- ═══════════════════════════════════════════════════════════════════════════
-- 20261123190000_regulatory_list_gaps.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Fills gaps in public.chemical_regulatory_status found in the 2026-11-23
-- vision audit. General Scan (and the Decision Brain safety guardian) remove
-- any ingredient listed here as banned or restricted before the farmer sees it.
-- Compared against the CIB&RC list "Pesticides banned / refused registration /
-- restricted in use" (Pesticides (Prohibition) Order 2018 and later orders).
--
-- Added (INSERT only, 43 names; existing rows are never touched):
--   banned for manufacture, import and use — not yet listed (10)
--   withdrawn (7) and registration refused (18) — may not be sold or used, so
--     they are listed as 'banned' with the true reason in `reason`
--   restricted to one use that is not a general crop spray (4)
--   other names of rows already listed (4), for matching only
-- NOT added on purpose: mancozeb, malathion, oxyfluorfen — their restriction is
-- crop-specific; this table blocks an ingredient for every crop, so listing them
-- would remove legal, widely used products. Needs a crop-scoped rule (separate work).
--
-- Idempotent (ON CONFLICT on the unique chemical_name). No deletes, no updates.
-- No session state, no TEMP tables (SQL runner rule).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.chemical_regulatory_status (chemical_name, status, regulatory_body, reason, source_ref)
VALUES
  ('benomyl',               'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'Pesticides (Prohibition) Order 2018; added 2026-11-23 vision audit'),
  ('carbaryl',              'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'Pesticides (Prohibition) Order 2018; added 2026-11-23 vision audit'),
  ('diazinon',              'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'Pesticides (Prohibition) Order 2018; added 2026-11-23 vision audit'),
  ('fenthion',              'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'Pesticides (Prohibition) Order 2018; added 2026-11-23 vision audit'),
  ('dichlorvos',            'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'Pesticides (Prohibition) Order 2018, phase-out 2020; added 2026-11-23 vision audit'),
  ('calcium cyanide',       'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'CIB&RC banned list; added 2026-11-23 vision audit'),
  ('chlorobenzilate',       'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'CIB&RC banned list; added 2026-11-23 vision audit'),
  ('chlorfenvinphos',       'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'CIB&RC banned list; added 2026-11-23 vision audit'),
  ('copper acetoarsenite',  'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'CIB&RC banned list; added 2026-11-23 vision audit'),
  ('dibromochloropropane',  'banned', 'CIB&RC', 'Banned for manufacture, import and use', 'CIB&RC banned list; added 2026-11-23 vision audit'),

  ('dalapon',               'banned', 'CIB&RC', 'Withdrawn — no longer registered', 'CIB&RC withdrawn list; added 2026-11-23 vision audit'),
  ('ferbam',                'banned', 'CIB&RC', 'Withdrawn — no longer registered', 'CIB&RC withdrawn list; added 2026-11-23 vision audit'),
  ('formothion',            'banned', 'CIB&RC', 'Withdrawn — no longer registered', 'CIB&RC withdrawn list; added 2026-11-23 vision audit'),
  ('nickel chloride',       'banned', 'CIB&RC', 'Withdrawn — no longer registered', 'CIB&RC withdrawn list; added 2026-11-23 vision audit'),
  ('paradichlorobenzene',   'banned', 'CIB&RC', 'Withdrawn — no longer registered', 'CIB&RC withdrawn list; added 2026-11-23 vision audit'),
  ('simazine',              'banned', 'CIB&RC', 'Withdrawn — no longer registered', 'CIB&RC withdrawn list; added 2026-11-23 vision audit'),
  ('warfarin',              'banned', 'CIB&RC', 'Withdrawn — no longer registered', 'CIB&RC withdrawn list; added 2026-11-23 vision audit'),

  ('2,4,5-t',               'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('ammonium sulphamate',   'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('azinphos-ethyl',        'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('azinphos-methyl',       'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('binapacryl',            'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('calcium arsenate',      'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('carbophenothion',       'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('chinomethionate',       'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('dicrotophos',           'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('epn',                   'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('fentin acetate',        'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('fentin hydroxide',      'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('lead arsenate',         'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('leptophos',             'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('mephosfolan',           'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('mevinphos',             'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('disulfoton',            'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),
  ('vamidothion',           'banned', 'CIB&RC', 'Registration refused — never legal to use', 'CIB&RC refused-registration list; added 2026-11-23 vision audit'),

  ('trifluralin',           'restricted', 'CIB&RC', 'Use allowed in wheat only', 'Pesticides (Prohibition) Order 2018; added 2026-11-23 vision audit'),
  ('methyl bromide',        'restricted', 'CIB&RC', 'Fumigation by approved operators only', 'CIB&RC restricted list; added 2026-11-23 vision audit'),
  ('dazomet',               'restricted', 'CIB&RC', 'Not permitted on tea', 'CIB&RC restricted list; added 2026-11-23 vision audit'),
  ('fenitrothion',          'restricted', 'CIB&RC', 'Locust control and public health only', 'CIB&RC restricted list; added 2026-11-23 vision audit'),

  ('benzene hexachloride',  'banned', 'CIB&RC', 'Other name of BHC (already listed) — for matching', 'Alias; added 2026-11-23 vision audit'),
  ('hexachlorocyclohexane', 'banned', 'CIB&RC', 'Other name of BHC / lindane (already listed) — for matching', 'Alias; added 2026-11-23 vision audit'),
  ('quintozene',            'banned', 'CIB&RC', 'Other name of pentachloro nitrobenzene (already listed) — for matching', 'Alias; added 2026-11-23 vision audit'),
  ('parathion',             'banned', 'CIB&RC', 'Covers ethyl and methyl parathion (already listed) however the name is written', 'Alias; added 2026-11-23 vision audit')
ON CONFLICT (chemical_name) DO NOTHING;

-- POST-CHECK (read-only):
-- select status, count(*) from public.chemical_regulatory_status group by status;   -- banned 86, restricted 18, watch_list 8
-- ROLLBACK (only if needed): the 43 rows carry source_ref ending '2026-11-23 vision audit';
--   hand that filter to a reviewer — do not delete without review.
