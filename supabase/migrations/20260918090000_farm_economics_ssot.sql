-- Farm Analytics: database single source of truth for cost of cultivation and
-- weekly expected yield (schema + vocabulary only — no rates, costs, yields or
-- crop rows; no functions; no cron).
--
-- Forensic audit 2026-09-17 findings addressed at the schema level:
--   P0-3  farmer rows were unreadable under session-token auth (auth.uid() is NULL)
--   P0-4  cost/yield baselines lived as crop-name maps in code
--   P1    labor_rates / input_prices had no region hierarchy or source link
--   P1    yield_predictions had no weekly, factor or evidence columns
--
-- Conventions followed (verified against the live project 2026-09-19):
--   * region scope uses `scope_level`, as region_recommendation_scope does; only
--     `states` has a code column, so sub-state scopes reference district/taluka/
--     village uuids, which `lands` already carries
--   * who published a figure lives only in `knowledge_sources`; rows carry an
--     `origin` and a `knowledge_source_id`
--   * expense components use the codes the i18n bundles already translate
--     (analytics.financial.*) and are a lookup table, not a CHECK
--   * cultivation_method column name matches crop_schedules / fn_resolve_stage;
--     NULL = any method (cultivation_method_master is empty today, so no FK yet)
--   * every farmer-scoped read requires tenant + farmer + land ownership
--
-- Additive only: nothing is dropped, deleted or rewritten. Existing auth.uid()
-- policies are left in place (inert under session auth). Safe for a SQL runner
-- with no session state between statements.

BEGIN;

-- 0. Expense component vocabulary ------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_component_master (
  component_code text PRIMARY KEY,
  display_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.expense_component_master IS 'Cost-of-cultivation components. component_code = i18n key analytics.financial.<code>; labels come from i18n, never from this table.';

INSERT INTO public.expense_component_master (component_code, display_order) VALUES
  ('seeds', 1), ('fertilizers', 2), ('pesticides', 3), ('irrigation', 4),
  ('machinery', 5), ('labor', 6), ('other', 7)
ON CONFLICT (component_code) DO NOTHING;

-- Which component a schedule task's material and its labour fall under.
-- Bookkeeping classification (review in admin panel), not an agronomic figure.
CREATE TABLE IF NOT EXISTS public.expense_component_task_map (
  task_type text PRIMARY KEY,
  material_component text REFERENCES public.expense_component_master(component_code),
  labor_component text NOT NULL REFERENCES public.expense_component_master(component_code),
  is_active boolean NOT NULL DEFAULT true
);
COMMENT ON COLUMN public.expense_component_task_map.task_type IS 'Same vocabulary as schedule_tasks.task_type';
INSERT INTO public.expense_component_task_map (task_type, material_component, labor_component) VALUES
  ('sowing',             'seeds',       'labor'),
  ('nutrition',          'fertilizers', 'labor'),
  ('pest_management',    'pesticides',  'labor'),
  ('disease_management', 'pesticides',  'labor'),
  ('weed_management',    'pesticides',  'labor'),
  ('growth_regulation',  'pesticides',  'labor'),
  ('irrigation',         'irrigation',  'labor'),
  ('land_preparation',   'machinery',   'labor'),
  ('intercultural',      'machinery',   'labor'),
  ('harvest',            'machinery',   'labor'),
  ('post_harvest',       'other',       'labor'),
  ('monitoring',         NULL,          'labor'),
  ('advisory',           NULL,          'labor'),
  ('planning',           NULL,          'labor')
ON CONFLICT (task_type) DO NOTHING;

-- Product category → component (rows entered from the admin panel; ids differ per environment)
CREATE TABLE IF NOT EXISTS public.expense_component_product_category_map (
  master_product_category_id uuid PRIMARY KEY REFERENCES public.master_product_categories(id),
  component_code text NOT NULL REFERENCES public.expense_component_master(component_code)
);

-- 1. Standard per-acre cost components ------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_component_standard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code text NOT NULL,
  cultivation_method text,
  component_code text NOT NULL REFERENCES public.expense_component_master(component_code),
  scope_level text NOT NULL CHECK (scope_level IN ('national','state','district','taluka','village')),
  state_id uuid REFERENCES public.states(id),
  district_id uuid REFERENCES public.districts(id),
  taluka_id uuid REFERENCES public.talukas(id),
  village_id uuid REFERENCES public.villages(id),
  amount_per_acre numeric NOT NULL CHECK (amount_per_acre >= 0),
  currency_code text NOT NULL,
  cost_basis text NOT NULL,
  reference_season text,
  effective_from date NOT NULL,
  effective_to date,
  origin text NOT NULL CHECK (origin IN ('knowledge_source','admin_entered','farmer_confirmed_aggregate')),
  knowledge_source_id uuid REFERENCES public.knowledge_sources(id),
  source_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccs_origin_source CHECK (origin <> 'knowledge_source' OR knowledge_source_id IS NOT NULL),
  CONSTRAINT ccs_scope_shape CHECK (
       (scope_level = 'national' AND state_id IS NULL AND district_id IS NULL AND taluka_id IS NULL AND village_id IS NULL)
    OR (scope_level = 'state'    AND state_id IS NOT NULL AND district_id IS NULL AND taluka_id IS NULL AND village_id IS NULL)
    OR (scope_level = 'district' AND district_id IS NOT NULL AND taluka_id IS NULL AND village_id IS NULL)
    OR (scope_level = 'taluka'   AND taluka_id IS NOT NULL AND village_id IS NULL)
    OR (scope_level = 'village'  AND village_id IS NOT NULL)),
  CONSTRAINT ccs_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);
COMMENT ON COLUMN public.cost_component_standard.cultivation_method IS 'NULL = applies to any cultivation method';
COMMENT ON COLUMN public.cost_component_standard.cost_basis IS 'Cost concept the figure represents, exactly as the source states it';

CREATE UNIQUE INDEX IF NOT EXISTS ccs_scope_uniq ON public.cost_component_standard (
  crop_code, coalesce(cultivation_method, '*'), component_code, scope_level,
  coalesce(state_id,    '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(district_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(taluka_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(village_id,  '00000000-0000-0000-0000-000000000000'::uuid),
  effective_from);

-- 2. Labour wage: extend labor_rates with the region hierarchy and source link
ALTER TABLE public.labor_rates
  ADD COLUMN IF NOT EXISTS scope_level text CHECK (scope_level IN ('state','district','taluka','village')),
  ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id),
  ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES public.districts(id),
  ADD COLUMN IF NOT EXISTS taluka_id uuid REFERENCES public.talukas(id),
  ADD COLUMN IF NOT EXISTS village_id uuid REFERENCES public.villages(id),
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS origin text CHECK (origin IN ('knowledge_source','admin_entered','farmer_confirmed_aggregate')),
  ADD COLUMN IF NOT EXISTS knowledge_source_id uuid REFERENCES public.knowledge_sources(id),
  ADD COLUMN IF NOT EXISTS observation_count integer;
COMMENT ON COLUMN public.labor_rates.observation_count IS 'Only for origin = farmer_confirmed_aggregate: number of farmer confirmations behind the figure';

-- 3. Input prices: link to master_products, state and source ----------------
ALTER TABLE public.input_prices
  ADD COLUMN IF NOT EXISTS master_product_id uuid REFERENCES public.master_products(id),
  ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id),
  ADD COLUMN IF NOT EXISTS pack_size numeric,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS origin text CHECK (origin IN ('knowledge_source','admin_entered','farmer_confirmed_aggregate')),
  ADD COLUMN IF NOT EXISTS knowledge_source_id uuid REFERENCES public.knowledge_sources(id);

-- 4. Labour / machine norms per operation ----------------------------------
CREATE TABLE IF NOT EXISTS public.cultivation_operation_norm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code text NOT NULL,
  cultivation_method text,
  task_type text NOT NULL,
  person_days_per_acre numeric CHECK (person_days_per_acre >= 0),
  machine_hours_per_acre numeric CHECK (machine_hours_per_acre >= 0),
  origin text NOT NULL CHECK (origin IN ('knowledge_source','admin_entered','farmer_confirmed_aggregate')),
  knowledge_source_id uuid REFERENCES public.knowledge_sources(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT con_origin_source CHECK (origin <> 'knowledge_source' OR knowledge_source_id IS NOT NULL)
);
COMMENT ON COLUMN public.cultivation_operation_norm.task_type IS 'Same vocabulary as schedule_tasks.task_type';
CREATE UNIQUE INDEX IF NOT EXISTS con_scope_uniq ON public.cultivation_operation_norm (
  crop_code, coalesce(cultivation_method, '*'), task_type);

-- 5. Crop-level yield potential (used when the land has no variety) ---------
CREATE TABLE IF NOT EXISTS public.crop_yield_potential (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code text NOT NULL,
  cultivation_method text,
  water_regime text NOT NULL CHECK (water_regime IN ('irrigated','rainfed','any')),
  scope_level text NOT NULL CHECK (scope_level IN ('national','state','district')),
  state_id uuid REFERENCES public.states(id),
  district_id uuid REFERENCES public.districts(id),
  yield_qtl_per_acre numeric NOT NULL CHECK (yield_qtl_per_acre > 0),
  yield_basis text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('knowledge_source','admin_entered')),
  knowledge_source_id uuid REFERENCES public.knowledge_sources(id),
  effective_from date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cyp_origin_source CHECK (origin <> 'knowledge_source' OR knowledge_source_id IS NOT NULL),
  CONSTRAINT cyp_scope_shape CHECK (
       (scope_level = 'national' AND state_id IS NULL AND district_id IS NULL)
    OR (scope_level = 'state'    AND state_id IS NOT NULL AND district_id IS NULL)
    OR (scope_level = 'district' AND district_id IS NOT NULL))
);

-- 6. Stage yield sensitivity (values only with a source) -------------------
ALTER TABLE public.crop_stage_master
  ADD COLUMN IF NOT EXISTS yield_response_ky numeric CHECK (yield_response_ky >= 0),
  ADD COLUMN IF NOT EXISTS is_heat_critical boolean,
  ADD COLUMN IF NOT EXISTS heat_damage_threshold_c numeric,
  ADD COLUMN IF NOT EXISTS yield_sensitivity_source_id uuid REFERENCES public.knowledge_sources(id);

-- 7. Per-land expense estimates (estimates never go into financial_transactions)
CREATE TABLE IF NOT EXISTS public.land_expense_estimate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  land_id uuid NOT NULL REFERENCES public.lands(id),
  schedule_id uuid NOT NULL REFERENCES public.crop_schedules(id),
  schedule_task_id uuid REFERENCES public.schedule_tasks(id) ON DELETE SET NULL,
  component_code text NOT NULL REFERENCES public.expense_component_master(component_code),
  expected_on date NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency_code text NOT NULL,
  basis jsonb NOT NULL,
  status text NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated','confirmed','corrected','not_done','superseded')),
  financial_transaction_id uuid REFERENCES public.financial_transactions(id),
  engine_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS lee_scope_uniq ON public.land_expense_estimate (
  schedule_id, component_code,
  coalesce(schedule_task_id, '00000000-0000-0000-0000-000000000000'::uuid),
  expected_on);
CREATE INDEX IF NOT EXISTS lee_land_date_idx ON public.land_expense_estimate (land_id, expected_on);
CREATE INDEX IF NOT EXISTS lee_farmer_idx ON public.land_expense_estimate (farmer_id, status);

-- 8. Actuals: link confirmed money back to its estimate ---------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES public.land_expense_estimate(id),
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.crop_schedules(id),
  ADD COLUMN IF NOT EXISTS component_code text REFERENCES public.expense_component_master(component_code),
  ADD COLUMN IF NOT EXISTS entry_source text CHECK (entry_source IN ('farmer_confirmed','farmer_corrected','farmer_added','harvest_sale'));
CREATE INDEX IF NOT EXISTS idx_financial_transactions_land_schedule ON public.financial_transactions (land_id, schedule_id);

-- 9. Weekly explainable yield estimate: extend yield_predictions ------------
ALTER TABLE public.yield_predictions
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.crop_schedules(id),
  ADD COLUMN IF NOT EXISTS crop_code text,
  ADD COLUMN IF NOT EXISTS cultivation_method text,
  ADD COLUMN IF NOT EXISTS week_start date,
  ADD COLUMN IF NOT EXISTS area_acres numeric,
  ADD COLUMN IF NOT EXISTS potential_yield_per_acre numeric,
  ADD COLUMN IF NOT EXISTS potential_source jsonb,
  ADD COLUMN IF NOT EXISTS predicted_yield_low_per_acre numeric,
  ADD COLUMN IF NOT EXISTS predicted_yield_high_per_acre numeric,
  ADD COLUMN IF NOT EXISTS factors jsonb,
  ADD COLUMN IF NOT EXISTS evidence jsonb,
  ADD COLUMN IF NOT EXISTS explanation jsonb,
  ADD COLUMN IF NOT EXISTS gaps text[],
  ADD COLUMN IF NOT EXISTS computed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS yield_predictions_weekly_uniq
  ON public.yield_predictions (land_id, schedule_id, week_start);

-- 10. Mandi location → district (market_prices carries only a location text)
CREATE TABLE IF NOT EXISTS public.market_location_map (
  market_location text PRIMARY KEY,
  district_id uuid REFERENCES public.districts(id),
  state_id uuid REFERENCES public.states(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. Row-level security -----------------------------------------------------
-- Reference tables: public read, service-role write (as labor_rates / input_prices today)
ALTER TABLE public.expense_component_master               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_component_task_map             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_component_product_category_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_component_standard                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultivation_operation_norm             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_yield_potential                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_location_map                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.land_expense_estimate                  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecm_public_read ON public.expense_component_master;
CREATE POLICY ecm_public_read ON public.expense_component_master FOR SELECT USING (is_active);
DROP POLICY IF EXISTS ectm_public_read ON public.expense_component_task_map;
CREATE POLICY ectm_public_read ON public.expense_component_task_map FOR SELECT USING (is_active);
DROP POLICY IF EXISTS ecpcm_public_read ON public.expense_component_product_category_map;
CREATE POLICY ecpcm_public_read ON public.expense_component_product_category_map FOR SELECT USING (true);
DROP POLICY IF EXISTS ccs_public_read ON public.cost_component_standard;
CREATE POLICY ccs_public_read ON public.cost_component_standard FOR SELECT USING (is_active);
DROP POLICY IF EXISTS con_public_read ON public.cultivation_operation_norm;
CREATE POLICY con_public_read ON public.cultivation_operation_norm FOR SELECT USING (is_active);
DROP POLICY IF EXISTS cyp_public_read ON public.crop_yield_potential;
CREATE POLICY cyp_public_read ON public.crop_yield_potential FOR SELECT USING (is_active);
DROP POLICY IF EXISTS mlm_public_read ON public.market_location_map;
CREATE POLICY mlm_public_read ON public.market_location_map FOR SELECT USING (true);

-- Farmer rows: tenant + farmer + land isolation under session-token identity.
-- A land the farmer does not own (or a deleted land) is never readable.
DROP POLICY IF EXISTS lee_farmer_session_read ON public.land_expense_estimate;
CREATE POLICY lee_farmer_session_read ON public.land_expense_estimate FOR SELECT TO anon, authenticated
  USING (public.has_tenant_access(tenant_id)
     AND farmer_id = public.get_current_farmer_id()
     AND EXISTS (SELECT 1 FROM public.lands l
                  WHERE l.id = land_expense_estimate.land_id
                    AND l.farmer_id = public.get_current_farmer_id()
                    AND l.tenant_id = land_expense_estimate.tenant_id
                    AND l.deleted_at IS NULL));

DROP POLICY IF EXISTS ft_farmer_session_read ON public.financial_transactions;
CREATE POLICY ft_farmer_session_read ON public.financial_transactions FOR SELECT TO anon, authenticated
  USING (public.has_tenant_access(tenant_id)
     AND farmer_id = public.get_current_farmer_id()
     AND (land_id IS NULL OR EXISTS (SELECT 1 FROM public.lands l
                  WHERE l.id = financial_transactions.land_id
                    AND l.farmer_id = public.get_current_farmer_id()
                    AND l.deleted_at IS NULL)));

DROP POLICY IF EXISTS yp_farmer_session_read ON public.yield_predictions;
CREATE POLICY yp_farmer_session_read ON public.yield_predictions FOR SELECT TO anon, authenticated
  USING (public.has_tenant_access(tenant_id)
     AND farmer_id = public.get_current_farmer_id()
     AND EXISTS (SELECT 1 FROM public.lands l
                  WHERE l.id = yield_predictions.land_id
                    AND l.farmer_id = public.get_current_farmer_id()
                    AND l.deleted_at IS NULL));

DROP POLICY IF EXISTS af_farmer_session_read ON public.analytics_forecasts;
CREATE POLICY af_farmer_session_read ON public.analytics_forecasts FOR SELECT TO anon, authenticated
  USING (farmer_id = public.get_current_farmer_id()
     AND (land_id IS NULL OR EXISTS (SELECT 1 FROM public.lands l
                  WHERE l.id = analytics_forecasts.land_id
                    AND l.farmer_id = public.get_current_farmer_id()
                    AND l.deleted_at IS NULL)));

GRANT SELECT ON public.expense_component_master, public.expense_component_task_map,
                public.expense_component_product_category_map,
                public.cost_component_standard, public.cultivation_operation_norm,
                public.crop_yield_potential, public.market_location_map TO anon, authenticated;
GRANT SELECT ON public.land_expense_estimate TO anon, authenticated;
GRANT SELECT ON public.analytics_forecasts TO anon;
GRANT ALL ON public.expense_component_master, public.expense_component_task_map,
             public.expense_component_product_category_map,
             public.cost_component_standard, public.cultivation_operation_norm,
             public.crop_yield_potential, public.market_location_map,
             public.land_expense_estimate TO service_role;

COMMIT;
