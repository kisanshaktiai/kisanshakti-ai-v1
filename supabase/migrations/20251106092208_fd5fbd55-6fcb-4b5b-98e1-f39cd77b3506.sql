-- Add calculated quantity fields to crop_schedules table
-- This tracks the AI-calculated seed, fertilizer, and water requirements

ALTER TABLE crop_schedules 
ADD COLUMN IF NOT EXISTS seed_quantity_kg NUMERIC,
ADD COLUMN IF NOT EXISTS total_water_requirement_liters NUMERIC,
ADD COLUMN IF NOT EXISTS fertilizer_n_kg NUMERIC,
ADD COLUMN IF NOT EXISTS fertilizer_p_kg NUMERIC,
ADD COLUMN IF NOT EXISTS fertilizer_k_kg NUMERIC,
ADD COLUMN IF NOT EXISTS calculated_for_area_acres NUMERIC;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_crop_schedules_land_active 
ON crop_schedules(land_id, is_active) 
WHERE is_active = true;

COMMENT ON COLUMN crop_schedules.seed_quantity_kg IS 'AI-calculated seed quantity in kg, scaled to land size';
COMMENT ON COLUMN crop_schedules.total_water_requirement_liters IS 'Total water needed for season in liters';
COMMENT ON COLUMN crop_schedules.fertilizer_n_kg IS 'Total nitrogen to apply in kg';
COMMENT ON COLUMN crop_schedules.fertilizer_p_kg IS 'Total phosphorus to apply in kg';
COMMENT ON COLUMN crop_schedules.fertilizer_k_kg IS 'Total potassium to apply in kg';
COMMENT ON COLUMN crop_schedules.calculated_for_area_acres IS 'Land area in acres used for calculations (for validation)';