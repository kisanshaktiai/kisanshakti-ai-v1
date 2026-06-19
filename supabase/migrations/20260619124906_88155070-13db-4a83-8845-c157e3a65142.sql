-- Scope A: lowercase code mismatches that break decision-brain joins
-- 39 rows across 3 small tables. Zero FK risk (no FK from these PKs).

UPDATE public.cultural_strategies
   SET crop_code = lower(crop_code)
 WHERE crop_code ~ '[A-Z]';

UPDATE public.emergency_observation_codes
   SET observation_code = lower(observation_code)
 WHERE observation_code ~ '[A-Z]';

UPDATE public.observation_differential_questions
   SET observation_code = lower(observation_code)
 WHERE observation_code ~ '[A-Z]';

-- Future-proof: prevent regression. Use CHECK (not trigger) — these columns
-- are pure code identifiers, not time-dependent.
ALTER TABLE public.cultural_strategies
  DROP CONSTRAINT IF EXISTS cultural_strategies_crop_code_lower_ck,
  ADD  CONSTRAINT cultural_strategies_crop_code_lower_ck
       CHECK (crop_code = lower(crop_code));

ALTER TABLE public.emergency_observation_codes
  DROP CONSTRAINT IF EXISTS emergency_obs_code_lower_ck,
  ADD  CONSTRAINT emergency_obs_code_lower_ck
       CHECK (observation_code = lower(observation_code));

ALTER TABLE public.observation_differential_questions
  DROP CONSTRAINT IF EXISTS odq_observation_code_lower_ck,
  ADD  CONSTRAINT odq_observation_code_lower_ck
       CHECK (observation_code = lower(observation_code));