
ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS anchor_type text,
  ADD COLUMN IF NOT EXISTS anchor_stage text,
  ADD COLUMN IF NOT EXISTS gdd_target numeric,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trigger_rule_id text,
  ADD COLUMN IF NOT EXISTS projected_date date,
  ADD COLUMN IF NOT EXISTS adjustment_reason text,
  ADD COLUMN IF NOT EXISTS rule_ids text[],
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS source_refs jsonb;

ALTER TABLE public.crop_stage_master
  ADD COLUMN IF NOT EXISTS is_moisture_critical boolean,
  ADD COLUMN IF NOT EXISTS kc_coefficient numeric;

CREATE TABLE IF NOT EXISTS public.schedule_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL,
  task_id uuid,
  run_at timestamptz NOT NULL DEFAULT now(),
  change_type text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  evidence jsonb,
  engine_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_adjustments_schedule ON public.schedule_adjustments(schedule_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_adjustments_task ON public.schedule_adjustments(task_id);

GRANT SELECT ON public.schedule_adjustments TO anon, authenticated;
GRANT ALL ON public.schedule_adjustments TO service_role;
ALTER TABLE public.schedule_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farmers read own schedule adjustments"
ON public.schedule_adjustments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.crop_schedules cs
  WHERE cs.id = schedule_adjustments.schedule_id
    AND cs.farmer_id = public.get_current_farmer_id()
));

CREATE POLICY "Service role manages schedule adjustments"
ON public.schedule_adjustments FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.input_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL,
  product_name text NOT NULL,
  price numeric NOT NULL,
  unit text NOT NULL,
  state text,
  source text NOT NULL,
  effective_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_input_prices_lookup ON public.input_prices(lower(product_code), state, effective_date DESC) WHERE is_active;

GRANT SELECT ON public.input_prices TO anon, authenticated;
GRANT ALL ON public.input_prices TO service_role;
ALTER TABLE public.input_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Input prices are public reference data" ON public.input_prices FOR SELECT USING (true);
CREATE POLICY "Service role manages input prices" ON public.input_prices FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.labor_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  operation_type text,
  skill_tier text,
  season text,
  daily_wage numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  source text NOT NULL,
  effective_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_labor_rates_lookup ON public.labor_rates(lower(state), operation_type, effective_date DESC) WHERE is_active;

GRANT SELECT ON public.labor_rates TO anon, authenticated;
GRANT ALL ON public.labor_rates TO service_role;
ALTER TABLE public.labor_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Labor rates are public reference data" ON public.labor_rates FOR SELECT USING (true);
CREATE POLICY "Service role manages labor rates" ON public.labor_rates FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
