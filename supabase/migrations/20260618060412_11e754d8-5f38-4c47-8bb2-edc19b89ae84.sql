-- Task 2: Case-insensitive observation lookup RPC for the symbolic brain.
-- Defends against any future casing drift on intent_observation_mapping.
CREATE OR REPLACE FUNCTION public.fn_observations_for_intent_ci(
  p_intent_code   text,
  p_crop_code     text,
  p_growth_stage  text DEFAULT NULL
) RETURNS TABLE (observation_code text, confidence_rank int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT iom.observation_code, iom.confidence_rank
    FROM public.intent_observation_mapping iom
   WHERE iom.is_active = true
     AND UPPER(iom.intent_code)   = UPPER(p_intent_code)
     AND LOWER(iom.crop_code)     = LOWER(p_crop_code)
     AND (p_growth_stage IS NULL OR LOWER(iom.growth_stage) = LOWER(p_growth_stage))
   ORDER BY iom.confidence_rank ASC, iom.observation_code ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_observations_for_intent_ci(text, text, text)
  TO authenticated, service_role, anon;

-- Task 7: response_source classifier on ai_chat_messages so the dashboard can
-- track whether the symbolic brain (not the LLM) actually produced advisories.
ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS response_source text;

COMMENT ON COLUMN public.ai_chat_messages.response_source IS
  'One of: symbolic_rule_fired | symbolic_clarification | symbolic_empty_fallback | llm_general_knowledge | llm_translation_only';

-- Task 6 (minimal): persist clarification ConversationContext between turns.
ALTER TABLE public.ai_chat_sessions
  ADD COLUMN IF NOT EXISTS conversation_state jsonb NOT NULL DEFAULT '{}'::jsonb;