-- DIRECT CONTEXT GRAPH: DB-owned intent → rule-category scope
-- This table is routing metadata only. It contains no farmer language or agronomic thresholds.
CREATE TABLE IF NOT EXISTS public.direct_intent_rule_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_code text NOT NULL,
  rule_category text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_intent_rule_scope_uq UNIQUE (intent_code, rule_category)
);

CREATE INDEX IF NOT EXISTS idx_direct_intent_rule_scope_active
  ON public.direct_intent_rule_scope (intent_code, priority)
  WHERE is_active = true;

ALTER TABLE public.direct_intent_rule_scope ENABLE ROW LEVEL SECURITY;

INSERT INTO public.direct_intent_rule_scope
  (intent_code, rule_category, priority, source, notes)
VALUES
  ('CROP_MATURITY_QUERY', 'harvest', 10, 'DB_AUTHORED_ROUTING', 'Direct harvest/maturity knowledge and context rules'),
  ('HARVEST_TIMING', 'harvest', 10, 'DB_AUTHORED_ROUTING', 'Direct harvest timing knowledge and context rules'),
  ('FERTILIZER_SCHEDULE', 'nutrition', 10, 'DB_AUTHORED_ROUTING', 'Direct nutrient/fertilizer guidance scope'),
  ('IPM_STRATEGY_QUERY', 'ipm', 10, 'DB_AUTHORED_ROUTING', 'Direct IPM guidance scope'),
  ('IPM_STRATEGY_QUERY', 'pest', 20, 'DB_AUTHORED_ROUTING', 'Direct pest guidance scope'),
  ('PLANTING_METHOD_QUERY', 'planting_practice', 10, 'DB_AUTHORED_ROUTING', 'Direct planting-method guidance scope'),
  ('SEED_SELECTION', 'planting_material', 10, 'DB_AUTHORED_ROUTING', 'Direct seed-selection guidance scope'),
  ('VARIETY_SELECTION_QUERY', 'planting_material', 10, 'DB_AUTHORED_ROUTING', 'Direct variety-selection guidance scope'),
  ('NEXT_CROP_RECOMMENDATION', 'crop_rotation', 10, 'DB_AUTHORED_ROUTING', 'Direct next-crop guidance scope'),
  ('ORGANIC_FARMING_QUERY', 'organic', 10, 'DB_AUTHORED_ROUTING', 'Direct organic-management guidance scope'),
  ('ORGANIC_FARMING_QUERY', 'management', 20, 'DB_AUTHORED_ROUTING', 'Direct integrated management guidance scope'),
  ('PROACTIVE_SCHEDULE_QUERY', 'management', 10, 'DB_AUTHORED_ROUTING', 'Direct schedule context scope'),
  ('BEST_PRACTICE_GENERAL', 'management', 10, 'DB_AUTHORED_ROUTING', 'Direct best-practice guidance scope'),
  ('INTERCROPPING_QUERY', 'management', 10, 'DB_AUTHORED_ROUTING', 'Direct intercrop management scope'),
  ('SEASONAL_TRANSITION_ALERT', 'weather', 10, 'DB_AUTHORED_ROUTING', 'Direct seasonal/weather scope'),
  ('POST_HARVEST_HANDLING', 'harvest', 10, 'DB_AUTHORED_ROUTING', 'Direct post-harvest handling scope'),
  ('DOSAGE_CALCULATION_QUERY', 'safety', 10, 'DB_AUTHORED_ROUTING', 'Direct product/dose safety scope'),
  ('PHI_SAFETY_QUERY', 'safety', 10, 'DB_AUTHORED_ROUTING', 'Direct pre-harvest safety scope'),
  ('RESISTANCE_MANAGEMENT_QUERY', 'resistance_mgmt', 10, 'DB_AUTHORED_ROUTING', 'Direct resistance-management scope'),
  ('SPRAY_TIMING_QUERY', 'application_timing', 10, 'DB_AUTHORED_ROUTING', 'Direct application-timing scope'),
  ('SOIL_HEALTH_RESTORATION', 'soil', 10, 'DB_AUTHORED_ROUTING', 'Direct soil-management scope'),
  ('SOIL_TESTING_QUERY', 'soil', 10, 'DB_AUTHORED_ROUTING', 'Direct soil-testing scope'),
  ('SOIL_TYPE_MANAGEMENT', 'soil', 10, 'DB_AUTHORED_ROUTING', 'Direct soil-type management scope'),
  ('IRRIGATION_METHOD_SELECTION', 'irrigation', 10, 'DB_AUTHORED_ROUTING', 'Direct irrigation-method scope'),
  ('IRRIGATION_QUERY', 'irrigation', 10, 'DB_AUTHORED_ROUTING', 'Direct irrigation guidance scope'),
  ('IRRIGATION_SCHEDULING_QUERY', 'irrigation', 10, 'DB_AUTHORED_ROUTING', 'Direct irrigation-schedule scope')
ON CONFLICT (intent_code, rule_category) DO UPDATE
SET priority = EXCLUDED.priority,
    is_active = true,
    source = EXCLUDED.source,
    notes = EXCLUDED.notes,
    updated_at = now();

COMMENT ON TABLE public.direct_intent_rule_scope IS
  'DB-owned routing scope for the direct/context graph. No farmer vocabulary or agronomic thresholds.';
