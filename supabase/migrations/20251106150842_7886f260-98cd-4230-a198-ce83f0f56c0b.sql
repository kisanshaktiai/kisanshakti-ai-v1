-- Add comprehensive agriculture input tracking to crop_schedules
ALTER TABLE crop_schedules 
-- Yield and Revenue columns
ADD COLUMN IF NOT EXISTS expected_yield_quintals NUMERIC,
ADD COLUMN IF NOT EXISTS expected_yield_per_acre NUMERIC,
ADD COLUMN IF NOT EXISTS expected_market_price_per_quintal NUMERIC,
ADD COLUMN IF NOT EXISTS expected_gross_revenue NUMERIC,
ADD COLUMN IF NOT EXISTS expected_net_profit NUMERIC,
ADD COLUMN IF NOT EXISTS total_estimated_cost NUMERIC,

-- Organic farming inputs
ADD COLUMN IF NOT EXISTS organic_fertilizer_kg NUMERIC,
ADD COLUMN IF NOT EXISTS bio_fertilizer_units NUMERIC,
ADD COLUMN IF NOT EXISTS organic_manure_kg NUMERIC,
ADD COLUMN IF NOT EXISTS vermicompost_kg NUMERIC,
ADD COLUMN IF NOT EXISTS organic_input_details JSONB,

-- Pest management
ADD COLUMN IF NOT EXISTS pesticide_requirements JSONB,
ADD COLUMN IF NOT EXISTS insecticide_ml NUMERIC,
ADD COLUMN IF NOT EXISTS fungicide_gm NUMERIC,
ADD COLUMN IF NOT EXISTS herbicide_ml NUMERIC,
ADD COLUMN IF NOT EXISTS bio_pesticide_ml NUMERIC,

-- Growth enhancement
ADD COLUMN IF NOT EXISTS growth_regulators JSONB,
ADD COLUMN IF NOT EXISTS pgr_hormone_ml NUMERIC,

-- Product category references
ADD COLUMN IF NOT EXISTS recommended_products JSONB;

-- Add helpful comments
COMMENT ON COLUMN crop_schedules.expected_yield_quintals IS 'Total expected harvest in quintals (1 quintal = 100 kg)';
COMMENT ON COLUMN crop_schedules.expected_yield_per_acre IS 'Expected yield per acre for this crop';
COMMENT ON COLUMN crop_schedules.expected_market_price_per_quintal IS 'Current market price per quintal in local currency';
COMMENT ON COLUMN crop_schedules.expected_gross_revenue IS 'Total expected revenue = yield × market price';
COMMENT ON COLUMN crop_schedules.expected_net_profit IS 'Expected profit = revenue - total costs';
COMMENT ON COLUMN crop_schedules.total_estimated_cost IS 'Sum of all input costs for the season';

COMMENT ON COLUMN crop_schedules.organic_fertilizer_kg IS 'Total organic fertilizer needed in kg';
COMMENT ON COLUMN crop_schedules.bio_fertilizer_units IS 'Bio-fertilizer units (packets/bottles)';
COMMENT ON COLUMN crop_schedules.organic_manure_kg IS 'Organic manure quantity in kg';
COMMENT ON COLUMN crop_schedules.vermicompost_kg IS 'Vermicompost quantity in kg';
COMMENT ON COLUMN crop_schedules.organic_input_details IS 'Detailed organic input plan with types and timing';

COMMENT ON COLUMN crop_schedules.pesticide_requirements IS 'Detailed pesticide plan with product names, quantities, and timing';
COMMENT ON COLUMN crop_schedules.insecticide_ml IS 'Total insecticide needed in ml';
COMMENT ON COLUMN crop_schedules.fungicide_gm IS 'Total fungicide needed in grams';
COMMENT ON COLUMN crop_schedules.herbicide_ml IS 'Total herbicide needed in ml';
COMMENT ON COLUMN crop_schedules.bio_pesticide_ml IS 'Total bio-pesticide needed in ml';

COMMENT ON COLUMN crop_schedules.growth_regulators IS 'Growth regulators/hormones plan with products and timing';
COMMENT ON COLUMN crop_schedules.pgr_hormone_ml IS 'Total PGR/hormone quantity in ml';

COMMENT ON COLUMN crop_schedules.recommended_products IS 'Product recommendations mapped to product_categories with IDs, names, and quantities';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_crop_schedules_revenue 
ON crop_schedules(tenant_id, expected_gross_revenue) 
WHERE is_active = true AND expected_gross_revenue IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crop_schedules_organic 
ON crop_schedules(tenant_id, organic_fertilizer_kg) 
WHERE is_active = true AND organic_fertilizer_kg IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crop_schedules_recommended_products 
ON crop_schedules USING GIN(recommended_products) 
WHERE is_active = true;