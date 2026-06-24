
CREATE TABLE IF NOT EXISTS public.analytics_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL,
  tenant_id uuid,
  land_id uuid,
  scope text NOT NULL DEFAULT 'land',
  forecast_month date NOT NULL,
  generated_for_month date NOT NULL,
  crop text,
  area_acres numeric,
  projected_revenue numeric NOT NULL DEFAULT 0,
  projected_expense numeric NOT NULL DEFAULT 0,
  projected_profit numeric NOT NULL DEFAULT 0,
  expected_yield_quintals numeric,
  market_price_used numeric,
  confidence numeric,
  ai_reasoning text,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_forecasts_land_uniq
  ON public.analytics_forecasts(farmer_id, land_id, forecast_month, scope)
  WHERE land_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS analytics_forecasts_farm_uniq
  ON public.analytics_forecasts(farmer_id, forecast_month, scope)
  WHERE land_id IS NULL;

CREATE INDEX IF NOT EXISTS analytics_forecasts_farmer_idx ON public.analytics_forecasts(farmer_id, forecast_month);
CREATE INDEX IF NOT EXISTS analytics_forecasts_land_idx ON public.analytics_forecasts(land_id, forecast_month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_forecasts TO authenticated;
GRANT ALL ON public.analytics_forecasts TO service_role;

ALTER TABLE public.analytics_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farmers read own forecasts"
  ON public.analytics_forecasts
  FOR SELECT
  TO authenticated
  USING (farmer_id = auth.uid());

CREATE POLICY "farmers insert own forecasts"
  ON public.analytics_forecasts
  FOR INSERT
  TO authenticated
  WITH CHECK (farmer_id = auth.uid());

CREATE POLICY "farmers update own forecasts"
  ON public.analytics_forecasts
  FOR UPDATE
  TO authenticated
  USING (farmer_id = auth.uid())
  WITH CHECK (farmer_id = auth.uid());

CREATE POLICY "service role manages forecasts"
  ON public.analytics_forecasts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.touch_analytics_forecasts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_analytics_forecasts_updated_at ON public.analytics_forecasts;
CREATE TRIGGER trg_analytics_forecasts_updated_at
  BEFORE UPDATE ON public.analytics_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.touch_analytics_forecasts_updated_at();
