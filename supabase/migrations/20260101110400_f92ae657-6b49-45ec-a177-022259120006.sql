-- Add columns for backdated schedule consent and multi-crop support
ALTER TABLE crop_schedules 
ADD COLUMN IF NOT EXISTS backdated_consent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS backdated_consent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS intercrop_name text,
ADD COLUMN IF NOT EXISTS intercrop_variety text,
ADD COLUMN IF NOT EXISTS intercrop_sowing_date date,
ADD COLUMN IF NOT EXISTS intercrop_area_percent numeric DEFAULT 0;

-- Add comment to document the backdated consent columns
COMMENT ON COLUMN crop_schedules.backdated_consent IS 'User acknowledged responsibility for backdated schedule';
COMMENT ON COLUMN crop_schedules.backdated_consent_at IS 'Timestamp when user gave backdated consent';
COMMENT ON COLUMN crop_schedules.intercrop_name IS 'Name of intercrop grown with major crop';
COMMENT ON COLUMN crop_schedules.intercrop_variety IS 'Variety of the intercrop';
COMMENT ON COLUMN crop_schedules.intercrop_sowing_date IS 'Sowing date for intercrop';
COMMENT ON COLUMN crop_schedules.intercrop_area_percent IS 'Percentage of land area used for intercrop';