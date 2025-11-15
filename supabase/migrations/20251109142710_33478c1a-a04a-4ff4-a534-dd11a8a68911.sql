-- Phase 3: AI Training Data Pipeline Schema Updates

-- Update ai_training_context table to support farmer-specific training
ALTER TABLE ai_training_context 
ADD COLUMN IF NOT EXISTS farmer_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES ai_chat_messages(id),
ADD COLUMN IF NOT EXISTS success_metrics jsonb;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ai_training_context_farmer_id ON ai_training_context(farmer_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_context_message_id ON ai_training_context(message_id);

-- Add feedback columns to ai_chat_messages if not exists
ALTER TABLE ai_chat_messages
ADD COLUMN IF NOT EXISTS feedback_rating integer CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
ADD COLUMN IF NOT EXISTS feedback_text text,
ADD COLUMN IF NOT EXISTS feedback_timestamp timestamptz,
ADD COLUMN IF NOT EXISTS is_training_candidate boolean DEFAULT false;

-- Create index for training data queries
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_training ON ai_chat_messages(is_training_candidate, feedback_rating) 
WHERE is_training_candidate = true AND feedback_rating >= 4;

-- Enable RLS on ai_training_context if not already enabled
ALTER TABLE ai_training_context ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ai_training_context
DROP POLICY IF EXISTS "Users can view their own training context" ON ai_training_context;
CREATE POLICY "Users can view their own training context" 
ON ai_training_context 
FOR SELECT 
USING (
  farmer_id = auth.uid() OR
  farmer_id IS NULL -- Allow viewing generic training data
);

DROP POLICY IF EXISTS "Service role can manage training context" ON ai_training_context;
CREATE POLICY "Service role can manage training context" 
ON ai_training_context 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add comment to document the schema
COMMENT ON COLUMN ai_training_context.farmer_id IS 'Reference to the farmer whose interaction generated this training data';
COMMENT ON COLUMN ai_training_context.message_id IS 'Reference to the specific chat message used for training';
COMMENT ON COLUMN ai_training_context.success_metrics IS 'JSON object containing success metrics like yield_increase, cost_reduction, satisfaction_score, etc.';
COMMENT ON COLUMN ai_chat_messages.feedback_rating IS 'User feedback rating from 1 (worst) to 5 (best)';
COMMENT ON COLUMN ai_chat_messages.feedback_text IS 'Optional text feedback from user explaining why they liked/disliked the response';
COMMENT ON COLUMN ai_chat_messages.is_training_candidate IS 'Flag indicating this message is suitable for training data collection';