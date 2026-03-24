-- ═══════════════════════════════════════════════════════════════════════════
-- HYBRID DATABASE RULE STORAGE - Schema Enhancement
-- ═══════════════════════════════════════════════════════════════════════════
-- Enhances decision_rules table to support hybrid rule storage strategy
-- with multilingual responses, trigger keywords, and canonical groups.

-- Add new columns to decision_rules if they don't exist
ALTER TABLE public.decision_rules 
ADD COLUMN IF NOT EXISTS response_mr TEXT,
ADD COLUMN IF NOT EXISTS response_hi TEXT,
ADD COLUMN IF NOT EXISTS response_en TEXT,
ADD COLUMN IF NOT EXISTS trigger_keywords TEXT[],
ADD COLUMN IF NOT EXISTS alternatives JSONB,
ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT 'RECOMMEND',
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'CONDITIONAL',
ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 70,
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS canonical_group TEXT;

-- Add indexes for efficient rule loading
CREATE INDEX IF NOT EXISTS idx_decision_rules_crop_code 
ON public.decision_rules(crop_code);

CREATE INDEX IF NOT EXISTS idx_decision_rules_canonical_group 
ON public.decision_rules(canonical_group);

CREATE INDEX IF NOT EXISTS idx_decision_rules_is_active 
ON public.decision_rules(is_active);

CREATE INDEX IF NOT EXISTS idx_decision_rules_category 
ON public.decision_rules(category);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_decision_rules_active_crop_group 
ON public.decision_rules(is_active, crop_code, canonical_group) 
WHERE is_active = true;

-- Add comments for documentation
COMMENT ON COLUMN public.decision_rules.response_mr IS 'Marathi response template';
COMMENT ON COLUMN public.decision_rules.response_hi IS 'Hindi response template';
COMMENT ON COLUMN public.decision_rules.response_en IS 'English response template';
COMMENT ON COLUMN public.decision_rules.trigger_keywords IS 'Keywords that trigger this rule (multilingual)';
COMMENT ON COLUMN public.decision_rules.alternatives IS 'Alternative products/methods as JSON';
COMMENT ON COLUMN public.decision_rules.action_type IS 'BLOCK, WARN, RECOMMEND, DELAY, MONITOR';
COMMENT ON COLUMN public.decision_rules.canonical_group IS 'One of 13 canonical groups: crop_identity, growth_stage, observation, nutrient, pest, disease, weed, soil, weather, irrigation, fertilizer, cropping_system, risk_safety';