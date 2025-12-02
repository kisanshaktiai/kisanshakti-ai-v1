-- Add new columns for LLM training data collection to ai_chat_messages table
ALTER TABLE ai_chat_messages
  ADD COLUMN conversation_quality_score DECIMAL(3,2),
  ADD COLUMN human_verified BOOLEAN DEFAULT false,
  ADD COLUMN correction_notes TEXT,
  ADD COLUMN domain_tags TEXT[],
  ADD COLUMN complexity_level TEXT,
  ADD COLUMN conversation_turn_number INTEGER,
  ADD COLUMN off_topic BOOLEAN DEFAULT false,
  ADD COLUMN training_processed BOOLEAN DEFAULT false,
  ADD COLUMN preprocessed_content TEXT,
  ADD COLUMN excluded_reason TEXT,
  ADD COLUMN agricultural_accuracy DECIMAL(3,2);

-- Add check constraints
ALTER TABLE ai_chat_messages
  ADD CONSTRAINT complexity_level_check 
    CHECK (complexity_level IN ('simple', 'medium', 'complex') OR complexity_level IS NULL),
  ADD CONSTRAINT conversation_quality_score_check 
    CHECK (conversation_quality_score >= 0.0 AND conversation_quality_score <= 1.0),
  ADD CONSTRAINT agricultural_accuracy_check 
    CHECK (agricultural_accuracy >= 0.0 AND agricultural_accuracy <= 1.0);

-- Create indexes for efficient training data queries
CREATE INDEX idx_ai_chat_messages_quality_score 
  ON ai_chat_messages(conversation_quality_score) 
  WHERE conversation_quality_score IS NOT NULL;

CREATE INDEX idx_ai_chat_messages_human_verified 
  ON ai_chat_messages(human_verified) 
  WHERE human_verified = true;

CREATE INDEX idx_ai_chat_messages_domain_tags 
  ON ai_chat_messages USING GIN(domain_tags);

CREATE INDEX idx_ai_chat_messages_training_composite 
  ON ai_chat_messages(is_training_candidate, human_verified, feedback_rating);

-- Update existing rows: Set conversation turn numbers
WITH ranked_messages AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as turn_num
  FROM ai_chat_messages
)
UPDATE ai_chat_messages 
SET conversation_turn_number = ranked_messages.turn_num
FROM ranked_messages
WHERE ai_chat_messages.id = ranked_messages.id;

-- Mark off-topic messages (non-agricultural content)
UPDATE ai_chat_messages
SET off_topic = true
WHERE (
  LOWER(content) ~* '(buy|purchase|sell).*(car|vehicle|phone|laptop|computer|movie|film|game|video|music|song|restaurant|hotel|travel|vacation|flight|ticket)'
  OR LOWER(content) ~* '(recommend|suggestion).*(movie|film|series|show|game|restaurant|hotel|place to visit)'
  OR LOWER(content) ~* 'how to (cook|bake|make|prepare).*(recipe|dish|food|meal|breakfast|lunch|dinner)'
)
AND LOWER(content) !~* '(crop|farm|agricult|plant|soil|seed|fertiliz|pest|irrigat|harvest|land|weather|rain)';

-- Set excluded reasons for empty or error messages
UPDATE ai_chat_messages
SET excluded_reason = 'empty_content'
WHERE (content IS NULL OR TRIM(content) = '' OR LENGTH(content) < 5)
  AND excluded_reason IS NULL;

UPDATE ai_chat_messages
SET excluded_reason = 'error_message'
WHERE error_details IS NOT NULL
  AND excluded_reason IS NULL;

UPDATE ai_chat_messages
SET excluded_reason = 'off_topic'
WHERE off_topic = true
  AND excluded_reason IS NULL;

-- Initialize training_processed flag for all existing messages
UPDATE ai_chat_messages
SET training_processed = false
WHERE training_processed IS NULL;

-- Add comments to table explaining the new columns
COMMENT ON COLUMN ai_chat_messages.conversation_quality_score IS 'ML quality score (0-1) for training data selection';
COMMENT ON COLUMN ai_chat_messages.human_verified IS 'Expert agricultural verification for training data';
COMMENT ON COLUMN ai_chat_messages.correction_notes IS 'Expert notes on what was wrong and how to correct';
COMMENT ON COLUMN ai_chat_messages.domain_tags IS 'Agricultural topic tags: fertilizer, pest_control, irrigation, etc.';
COMMENT ON COLUMN ai_chat_messages.complexity_level IS 'Query difficulty: simple, medium, or complex';
COMMENT ON COLUMN ai_chat_messages.conversation_turn_number IS 'Message sequence number in conversation';
COMMENT ON COLUMN ai_chat_messages.off_topic IS 'Flag for non-agricultural conversations';
COMMENT ON COLUMN ai_chat_messages.training_processed IS 'Indicates if preprocessed and added to training dataset';
COMMENT ON COLUMN ai_chat_messages.preprocessed_content IS 'Cleaned content ready for model training';
COMMENT ON COLUMN ai_chat_messages.excluded_reason IS 'Why message was excluded from training';
COMMENT ON COLUMN ai_chat_messages.agricultural_accuracy IS 'Scientific accuracy score (0-1) of agricultural advice';