-- Add missing columns for condition_code and scientific_basis
-- These are required by loader.ts to reconstruct rule conditions at runtime

ALTER TABLE public.decision_rules 
ADD COLUMN IF NOT EXISTS condition_code text;

ALTER TABLE public.decision_rules 
ADD COLUMN IF NOT EXISTS scientific_basis text;

-- Create index for faster rule lookups by category
CREATE INDEX IF NOT EXISTS idx_decision_rules_category_active 
ON public.decision_rules(category, is_active);

-- Create index for crop_code lookups
CREATE INDEX IF NOT EXISTS idx_decision_rules_crop_code 
ON public.decision_rules(crop_code);