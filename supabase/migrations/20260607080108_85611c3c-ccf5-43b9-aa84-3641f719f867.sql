
INSERT INTO public.observation_intent_master
  (intent_code, intent_description, intent_category, is_active,
   allowed_observation_groups, requires_crop_context, requires_stage_context,
   routing_target, is_biological, clarification_mode, max_clarification_rounds)
VALUES
  ('NEXT_CROP_RECOMMENDATION',
   'Farmer is asking which crop to grow next on a field (typically empty/post-harvest). Routes to symbolic decision brain for rotation-aware crop selection.',
   'ESTABLISHMENT',
   true,
   '{}',
   false,
   false,
   'SYMBOLIC_BRAIN',
   false,
   'DIRECT',
   1)
ON CONFLICT (intent_code) DO UPDATE
SET intent_description = EXCLUDED.intent_description,
    intent_category    = EXCLUDED.intent_category,
    requires_crop_context = EXCLUDED.requires_crop_context,
    requires_stage_context = EXCLUDED.requires_stage_context,
    routing_target = EXCLUDED.routing_target,
    is_biological = EXCLUDED.is_biological,
    clarification_mode = EXCLUDED.clarification_mode,
    is_active = true,
    updated_at = now();
