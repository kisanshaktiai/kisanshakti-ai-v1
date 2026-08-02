CREATE INDEX IF NOT EXISTS idx_dr_crop_lower_active ON public.decision_rules (lower(crop_code), is_active);

DROP INDEX IF EXISTS public.idx_decision_rules_conditions_json;
DROP INDEX IF EXISTS public.idx_decision_rules_observable;
DROP INDEX IF EXISTS public.idx_decision_rules_visual_markers;
DROP INDEX IF EXISTS public.idx_dr_ndvi;
DROP INDEX IF EXISTS public.idx_decision_rules_crop_tags;
DROP INDEX IF EXISTS public.idx_dr_required_obs_category;
DROP INDEX IF EXISTS public.idx_dr_required_plant_part;
DROP INDEX IF EXISTS public.idx_decision_rules_crop_code_active;
DROP INDEX IF EXISTS public.idx_decision_rules_crop_group_active;
DROP INDEX IF EXISTS public.idx_decision_rules_ipm_level;
DROP INDEX IF EXISTS public.idx_dr_proactive_crop_priority;
DROP INDEX IF EXISTS public.idx_decision_rules_proactive;
DROP INDEX IF EXISTS public.idx_decision_rules_bee_toxicity;