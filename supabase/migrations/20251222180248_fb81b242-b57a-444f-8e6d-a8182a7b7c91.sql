-- Add Intent-Aware Chat Columns for LLM Training
-- These columns enable tracking of farmer intent detection for model training

-- Add inferred_intent column for storing the detected farmer intent
ALTER TABLE public.ai_chat_messages 
ADD COLUMN IF NOT EXISTS inferred_intent TEXT;

-- Add intent_confidence for storing confidence score (0.0-1.0)
ALTER TABLE public.ai_chat_messages 
ADD COLUMN IF NOT EXISTS intent_confidence NUMERIC(4,3);

-- Add decision_brain_source flag to track if response came from Decision Brain
ALTER TABLE public.ai_chat_messages 
ADD COLUMN IF NOT EXISTS decision_brain_source BOOLEAN DEFAULT false;

-- Add actions_returned for training data - shows which actions were relevant
ALTER TABLE public.ai_chat_messages 
ADD COLUMN IF NOT EXISTS actions_returned JSONB;

-- Add actions_filtered_out for training data - shows which actions were not relevant
ALTER TABLE public.ai_chat_messages 
ADD COLUMN IF NOT EXISTS actions_filtered_out JSONB;

-- Create index on inferred_intent for faster training data queries
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_inferred_intent 
ON public.ai_chat_messages(inferred_intent) 
WHERE inferred_intent IS NOT NULL;

-- Create index on decision_brain_source for analytics
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_decision_brain 
ON public.ai_chat_messages(decision_brain_source) 
WHERE decision_brain_source = true;

-- Create composite index for LLM training data extraction
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_training 
ON public.ai_chat_messages(is_training_candidate, training_processed, created_at DESC)
WHERE is_training_candidate = true;

-- Comment on columns for documentation
COMMENT ON COLUMN public.ai_chat_messages.inferred_intent IS 'Farmer intent detected by symbolic classifier (WATER, NUTRIENT, PEST, etc.)';
COMMENT ON COLUMN public.ai_chat_messages.intent_confidence IS 'Confidence score of intent detection (0.0-1.0)';
COMMENT ON COLUMN public.ai_chat_messages.decision_brain_source IS 'True if response came from Decision Brain (not AI)';
COMMENT ON COLUMN public.ai_chat_messages.actions_returned IS 'Actions returned to farmer (for training intent-action mapping)';
COMMENT ON COLUMN public.ai_chat_messages.actions_filtered_out IS 'Actions filtered out by intent (for training intent-action mapping)';