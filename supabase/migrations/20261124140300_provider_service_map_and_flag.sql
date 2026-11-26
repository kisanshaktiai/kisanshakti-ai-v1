-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124140300_provider_service_map_and_flag.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Provider Workspace, part A, file 4 of 4 — the Service Map (D11) and the flag.
--
-- The Service Map connects a crop-schedule activity (schedule_tasks.task_type,
-- the canonical code, never a title or a keyword) to the service families that
-- can do it. Mapping to a FAMILY means every service under it qualifies.
--
--   service_map_activities   one row per activity code: mapped, or deliberately not
--   task_type_service_map    activity code → service category
--
-- All 19 codes the constraint schedule_tasks_task_type_check allows are listed
-- (17 are in use today; gap_filling and residue_management are allowed but have
-- no task yet).
--   MAPPED (16):   land_preparation, seed_treatment, nursery, sowing, gap_filling,
--                  nutrition, micronutrient, irrigation, weed_management,
--                  intercultural, pest_management, disease_management,
--                  growth_regulation, harvest, post_harvest, residue_management
--   UNMAPPED (3):  monitoring, planning, advisory — the farmer does these himself
--                  or with the app's own advice; no button is shown for them.
--
-- ▶ FLAGGED FOR THE PRODUCT OWNER'S EDIT: the two INSERTs are a starter mapping.
--
-- Also adds the feature flag provider_workspace, default OFF.
-- Adds two tables, rows and one flag only.  Safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.service_map_activities (
  task_type   text PRIMARY KEY CHECK (task_type ~ '^[a-z][a-z0-9_]{1,47}$'),
  is_mapped   boolean NOT NULL,
  note_en     text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.service_map_activities IS
  'Every crop-schedule activity code, and whether the Service Map offers providers for it. is_mapped = false is a decision, not an omission.';

CREATE TABLE IF NOT EXISTS public.task_type_service_map (
  task_type               text NOT NULL REFERENCES public.service_map_activities(task_type) ON UPDATE CASCADE,
  category_code           text NOT NULL REFERENCES public.service_categories(code) ON UPDATE CASCADE,
  includes_nursery_stock  boolean NOT NULL DEFAULT false,
  sort_order              integer NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_type, category_code)
);
COMMENT ON TABLE public.task_type_service_map IS
  'Service Map: which service categories can do a crop-schedule activity. A family code covers all services under it. includes_nursery_stock also offers nursery stock for the crop.';

INSERT INTO public.service_map_activities (task_type, is_mapped, note_en) VALUES
  ('land_preparation',   true,  NULL),
  ('seed_treatment',     true,  NULL),
  ('nursery',            true,  NULL),
  ('sowing',             true,  NULL),
  ('gap_filling',        true,  'Allowed by the constraint; no task uses it yet.'),
  ('nutrition',          true,  NULL),
  ('micronutrient',      true,  NULL),
  ('irrigation',         true,  NULL),
  ('weed_management',    true,  NULL),
  ('intercultural',      true,  NULL),
  ('pest_management',    true,  NULL),
  ('disease_management', true,  NULL),
  ('growth_regulation',  true,  NULL),
  ('harvest',            true,  NULL),
  ('post_harvest',       true,  NULL),
  ('residue_management', true,  'Allowed by the constraint; no task uses it yet.'),
  ('monitoring',         false, 'Done by the farmer; no provider is offered.'),
  ('planning',           false, 'Done by the farmer; no provider is offered.'),
  ('advisory',           false, 'The app''s own advice; no provider is offered.')
ON CONFLICT (task_type) DO NOTHING;

INSERT INTO public.task_type_service_map (task_type, category_code, includes_nursery_stock, sort_order) VALUES
  ('land_preparation',   'LAND_PREP',               false, 10),
  ('land_preparation',   'MACHINERY_HIRE',          false, 20),
  ('seed_treatment',     'SEED_TREATMENT_SERVICE',  false, 10),
  ('nursery',            'NURSERY',                 true,  10),
  ('sowing',             'SOWING_PLANTING',         true,  10),
  ('sowing',             'GENERAL_LABOUR',          false, 20),
  ('gap_filling',        'MANUAL_TRANSPLANTING',    true,  10),
  ('gap_filling',        'SEEDLING_SUPPLY',         true,  20),
  ('nutrition',          'FERTILISER_APPLICATION',  false, 10),
  ('nutrition',          'FERTIGATION_SERVICE',     false, 20),
  ('nutrition',          'SOIL_TESTING',            false, 30),
  ('micronutrient',      'SPRAY_MANUAL',            false, 10),
  ('micronutrient',      'SPRAY_POWER',             false, 20),
  ('micronutrient',      'SPRAY_TRACTOR',           false, 30),
  ('micronutrient',      'SPRAY_DRONE',             false, 40),
  ('micronutrient',      'TISSUE_TESTING',          false, 50),
  ('irrigation',         'IRRIGATION',              false, 10),
  ('weed_management',    'WEEDING_MANUAL',          false, 10),
  ('weed_management',    'WEEDING_POWER',           false, 20),
  ('weed_management',    'SPRAY_MANUAL',            false, 30),
  ('weed_management',    'SPRAY_POWER',             false, 40),
  ('weed_management',    'SPRAY_TRACTOR',           false, 50),
  ('intercultural',      'INTERCULTURE',            false, 10),
  ('intercultural',      'GENERAL_LABOUR',          false, 20),
  ('pest_management',    'SPRAY_MANUAL',            false, 10),
  ('pest_management',    'SPRAY_POWER',             false, 20),
  ('pest_management',    'SPRAY_TRACTOR',           false, 30),
  ('pest_management',    'SPRAY_BLOWER',            false, 40),
  ('pest_management',    'SPRAY_DRONE',             false, 50),
  ('pest_management',    'SCOUTING_IPM',            false, 60),
  ('disease_management', 'SPRAY_MANUAL',            false, 10),
  ('disease_management', 'SPRAY_POWER',             false, 20),
  ('disease_management', 'SPRAY_TRACTOR',           false, 30),
  ('disease_management', 'SPRAY_BLOWER',            false, 40),
  ('disease_management', 'SPRAY_DRONE',             false, 50),
  ('disease_management', 'SCOUTING_IPM',            false, 60),
  ('growth_regulation',  'SPRAY_MANUAL',            false, 10),
  ('growth_regulation',  'SPRAY_POWER',             false, 20),
  ('growth_regulation',  'SPRAY_TRACTOR',           false, 30),
  ('growth_regulation',  'SPRAY_DRONE',             false, 40),
  ('harvest',            'HARVESTING',              false, 10),
  ('harvest',            'TRANSPORT',               false, 20),
  ('post_harvest',       'POST_HARVEST',            false, 10),
  ('post_harvest',       'TRANSPORT',               false, 20),
  ('residue_management', 'RESIDUE',                 false, 10)
ON CONFLICT (task_type, category_code) DO NOTHING;

ALTER TABLE public.service_map_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_type_service_map  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_map_activities_read" ON public.service_map_activities;
CREATE POLICY "service_map_activities_read" ON public.service_map_activities FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "task_type_service_map_read_active" ON public.task_type_service_map;
CREATE POLICY "task_type_service_map_read_active" ON public.task_type_service_map FOR SELECT TO anon, authenticated USING (is_active = true);
REVOKE ALL ON public.service_map_activities, public.task_type_service_map FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_map_activities, public.task_type_service_map TO anon, authenticated;
GRANT ALL ON public.service_map_activities, public.task_type_service_map TO service_role;

-- ── feature flag, default OFF ───────────────────────────────────────────────
INSERT INTO public.feature_flags
  (flag_name, description, is_enabled, rollout_percentage, flag_type, flag_status, default_value)
SELECT 'provider_workspace',
       'Provider Workspace: a service provider''s business profile, services and rates, working hours, equipment and nursery store. Default OFF: the Provider Workspace stays the empty shell. Turn on per tenant with target_tenants. Needs multi_role_identity on for the same tenant.',
       false, 0, 'release', 'active', 'false'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name = 'provider_workspace');

-- Verification (read-only) ────────────────────────────────────────────────────
SELECT 'activity codes: mapped / unmapped' AS check_name,
       count(*) FILTER (WHERE is_mapped) || ' / ' || count(*) FILTER (WHERE NOT is_mapped) AS actual, '16 / 3' AS expected
  FROM public.service_map_activities;
SELECT 'mapped codes with no map row, or unmapped codes with one' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM public.service_map_activities a
 WHERE a.is_mapped <> EXISTS (SELECT 1 FROM public.task_type_service_map m WHERE m.task_type = a.task_type AND m.is_active);
SELECT 'provider_workspace flag' AS check_name,
       'enabled=' || is_enabled || ' rollout=' || rollout_percentage AS actual, 'enabled=false rollout=0' AS expected
  FROM public.feature_flags WHERE flag_name = 'provider_workspace';
