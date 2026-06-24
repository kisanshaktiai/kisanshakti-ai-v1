-- Fix 3: Normalize crop_code to UPPERCASE across the three SSOT tables so that
-- case-sensitive JOIN/lookups stop silently missing 884/10920/552 rows.
-- Pre-flight: zero unique-key collisions verified.

UPDATE public.decision_rules
SET crop_code = UPPER(crop_code)
WHERE crop_code <> UPPER(crop_code);

UPDATE public.intent_observation_mapping
SET crop_code = UPPER(crop_code)
WHERE crop_code <> UPPER(crop_code);

UPDATE public.crop_vocabulary
SET crop_code = UPPER(crop_code)
WHERE crop_code <> UPPER(crop_code);