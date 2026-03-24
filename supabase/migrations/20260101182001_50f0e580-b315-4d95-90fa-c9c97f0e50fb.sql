-- Add columns for 2nd and 3rd intercrop support in crop_schedules table
ALTER TABLE crop_schedules 
ADD COLUMN IF NOT EXISTS intercrop_2_name text,
ADD COLUMN IF NOT EXISTS intercrop_2_variety text,
ADD COLUMN IF NOT EXISTS intercrop_2_area_percent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS intercrop_2_sowing_date date,
ADD COLUMN IF NOT EXISTS intercrop_3_name text,
ADD COLUMN IF NOT EXISTS intercrop_3_variety text,
ADD COLUMN IF NOT EXISTS intercrop_3_area_percent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS intercrop_3_sowing_date date;

-- Add index for multi-crop queries
CREATE INDEX IF NOT EXISTS idx_crop_schedules_intercrops 
ON crop_schedules (land_id, intercrop_name, intercrop_2_name, intercrop_3_name) 
WHERE is_active = true;

-- Add comment for documentation
COMMENT ON COLUMN crop_schedules.intercrop_2_name IS 'Second intercrop/companion crop name';
COMMENT ON COLUMN crop_schedules.intercrop_3_name IS 'Third intercrop/companion crop name';