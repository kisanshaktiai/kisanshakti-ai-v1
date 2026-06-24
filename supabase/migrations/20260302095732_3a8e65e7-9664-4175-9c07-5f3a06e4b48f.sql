-- FIX 6 (v6.1): Add missing columns to treatment_outcomes table
-- These columns are referenced by the feedback recording code but don't exist,
-- causing silent errors every turn.

ALTER TABLE treatment_outcomes ADD COLUMN IF NOT EXISTS crop_code TEXT;
ALTER TABLE treatment_outcomes ADD COLUMN IF NOT EXISTS crop_stage TEXT;
ALTER TABLE treatment_outcomes ADD COLUMN IF NOT EXISTS rule_id TEXT;
ALTER TABLE treatment_outcomes ADD COLUMN IF NOT EXISTS days_since_sowing INTEGER;

COMMENT ON COLUMN treatment_outcomes.crop_code IS 'Crop code from decision_rules (e.g. sc, cotton, rice)';
COMMENT ON COLUMN treatment_outcomes.crop_stage IS 'Growth stage when treatment was applied';
COMMENT ON COLUMN treatment_outcomes.rule_id IS 'Rule ID that generated the treatment recommendation';
COMMENT ON COLUMN treatment_outcomes.days_since_sowing IS 'Days after sowing when treatment applied';