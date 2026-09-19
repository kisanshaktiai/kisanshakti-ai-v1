-- Farm Analytics: database single source of truth for cost of cultivation and
-- weekly expected yield (schema only — no data, no functions, no cron).
--
-- Forensic audit 2026-09-17 findings addressed at the schema level:
--   P0-3  farmer rows were unreadable under session-token auth (auth.uid() is NULL)
--   P0-4  cost/yield baselines lived as crop-name maps in code
--   P1    labor_rates / input_prices had no region hierarchy or source link
--   P1    yield_predictions had no weekly, factor or evidence columns
--
-- Additive only: nothing is dropped, deleted or rewritten. Existing auth.uid()
-- policies are left in place (inert under session auth). Safe for a SQL runner
-- with no session state between statements.

BEGIN;

-- 1. Standard per-acre cost components ------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_component_standard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code text NOT NULL,
  cultivation_method text,
  component text NOT NULL CHECK (component IN ('seed','fertiliser','plant_protection','irrigation','machinery_power','labour','other')),
  region_level text NOT NULL CHECK (region_level IN ('national','state','district','taluka','village')),
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
  source_type text NOT NULL CHECK (source_type IN ('cacp','state_agriculture_department','admin_entered','farmer_confirmed_aggregate')),
  knowledge_source_id uuid REFERENCES public.knowledge_sources(id),
  source_note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccs_region_shape CHECK (
       (region_level = 'national' AND state_id IS NULL AND district_id IS NULL AND taluka_id IS NULL AND village_id IS NULL)
    OR (region_level = 'state'    AND state_id IS NOT NULL AND district_id IS NULL AND taluka_id IS NULL AND village_id IS NULL)
    OR (region_level = 'district' AND district_id IS NOT NULL AND taluka_id IS NULL AND village_id IS NULL)
    OR (region_level = 'taluka'   AND taluka_id IS NOT NULL AND village_id IS NULL)
    OR (region_level = 'village'  AND village_id IS NOT NULL)),
  CONSTRAINT ccs_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);
COMMENT ON COLUMN public.cost_component_standard.cultivation_method IS 'NULL = applies to any cultivation method';
COMMENT ON COLUMN public.cost_component_standard.cost_basis IS 'Cost concept the figure represents, exactly as the source states it';

CREATE UNIQUE INDEX IF NOT EXISTS ccs_scope_uniq ON public.cost_component_standard (
  crop_code, coalesce(cultivation_method, '*'), component, region_level,
  coalesce(state_id,    '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(district_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(taluka_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(village_id,  '00000000-0000-0000-0000-000000000000'::uuid),
  effective_from);

-- 2. Labour wage: extend labor_rates with the region hierarchy -------------
ALTER TABLE public.labor_rates
  ADD COLUMN IF NOT EXISTS region_level text CHECK (region_level IN ('state','district','taluka','village')),
  ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id),
  ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES public.districts(id),
  ADD COLUMN IF NOT EXISTS taluka_id uuid REFERENCES public.talukas(id),
  ADD COLUMN IF NOT EXISTS village_id uuid REFERENCES public.villages(id),
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS source_type text CHECK (source_type IN ('state_wage_notification','state_agriculture_department','cacp','admin_entered','farmer_confirmed_aggregate')),
  ADD COLUMN IF NOT EXISTS knowledge_source_id uuid REFERENCES public.knowledge_sources(id);

-- 3. Input prices: link to master_products and state -----------------------
ALTER TABLE public.input_prices
  ADD COLUMN IF NOT EXISTS master_product_id uuid REFERENCES public.master_products(id),
  ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id),
  ADD COLUMN IF NOT EXISTS pack_size numeric,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS source_type text CHECK (source_type IN ('company_price_list','state_agriculture_department','admin_entered','farmer_confirmed_aggregate')),
  ADD COLUMN IF NOT EXISTS knowledge_source_id uuid REFERENCES public.knowledge_sources(id);

-- 4. Labour / machine norms per operation ----------------------------------
CREATE TABLE IF NOT EXISTS public.cultivation_operation_norm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_code text NOT NULL,
  cultivation_method text,
  task_type text NOT NULL,
  person_days_per_acre numeric CHECK (person_days_per_acre >= 0),
  machine_hours_per_acre numeric CHECK (machine_hours_per_acre >= 0),
  source_type text NOT NULL,
  knowledge_source_id uuid REFERENCES public.knowledge_sources(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
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
  region_level text NOT NULL CHECK (region_level IN ('national','state','district')),
  state_id uuid REFERENCES public.states(id),
  district_id uuid REFERENCES public.districts(id),
  yield_qtl_per_acre numeric NOT NULL CHECK (yield_qtl_per_acre > 0),
  yield_basis text NOT NULL,
  source_type text NOT NULL,
  knowledge_source_id uuid REFERENCES public.knowledge_sources(id),
  effective_from date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cyp_region_shape CHECK (
       (region_level = 'national' AND state_id IS NULL AND district_id IS NULL)
    OR (region_level = 'state'    AND state_id IS NOT NULL AND district_id IS NULL)
    OR (region_level = 'district' AND district_id IS NOT NULL))
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
  component text NOT NULL CHECK (component IN ('seed','fertiliser','plant_protection','irrigation','machinery_power','labour','other')),
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
  schedule_id, component,
  coalesce(schedule_task_id, '00000000-0000-0000-0000-000000000000'::uuid),
  expected_on);
CREATE INDEX IF NOT EXISTS lee_land_date_idx ON public.land_expense_estimate (land_id, expected_on);
CREATE INDEX IF NOT EXISTS lee_farmer_idx ON public.land_expense_estimate (farmer_id, status);

-- 8. Actuals: link confirmed money back to its estimate ---------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES public.land_expense_estimate(id),
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.crop_schedules(id),
  ADD COLUMN IF NOT EXISTS component text,
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
ALTER TABLE public.cost_component_standard   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultivation_operation_norm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_yield_potential      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_location_map       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.land_expense_estimate     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccs_public_read ON public.cost_component_standard;
CREATE POLICY ccs_public_read ON public.cost_component_standard FOR SELECT USING (is_active);
DROP POLICY IF EXISTS con_public_read ON public.cultivation_operation_norm;
CREATE POLICY con_public_read ON public.cultivation_operation_norm FOR SELECT USING (is_active);
DROP POLICY IF EXISTS cyp_public_read ON public.crop_yield_potential;
CREATE POLICY cyp_public_read ON public.crop_yield_potential FOR SELECT USING (is_active);
DROP POLICY IF EXISTS mlm_public_read ON public.market_location_map;
CREATE POLICY mlm_public_read ON public.market_location_map FOR SELECT USING (true);

-- Farmer-scoped reads use the session-token identity, as the rest of the app does.
DROP POLICY IF EXISTS lee_farmer_session_read ON public.land_expense_estimate;
CREATE POLICY lee_farmer_session_read ON public.land_expense_estimate FOR SELECT TO anon, authenticated
  USING (farmer_id = public.get_current_farmer_id() AND public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS ft_farmer_session_read ON public.financial_transactions;
CREATE POLICY ft_farmer_session_read ON public.financial_transactions FOR SELECT TO anon, authenticated
  USING (farmer_id = public.get_current_farmer_id() AND public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS yp_farmer_session_read ON public.yield_predictions;
CREATE POLICY yp_farmer_session_read ON public.yield_predictions FOR SELECT TO anon, authenticated
  USING (farmer_id = public.get_current_farmer_id() AND public.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS af_farmer_session_read ON public.analytics_forecasts;
CREATE POLICY af_farmer_session_read ON public.analytics_forecasts FOR SELECT TO anon, authenticated
  USING (farmer_id = public.get_current_farmer_id());

GRANT SELECT ON public.cost_component_standard, public.cultivation_operation_norm,
                public.crop_yield_potential, public.market_location_map TO anon, authenticated;
GRANT SELECT ON public.land_expense_estimate TO anon, authenticated;
GRANT SELECT ON public.analytics_forecasts TO anon;
GRANT ALL ON public.cost_component_standard, public.cultivation_operation_norm,
             public.crop_yield_potential, public.market_location_map,
             public.land_expense_estimate TO service_role;

COMMIT;
