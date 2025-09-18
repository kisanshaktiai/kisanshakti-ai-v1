-- Add missing columns to ai_chat_messages table for world-class chat storage
ALTER TABLE public.ai_chat_messages 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'error')),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
ADD COLUMN IF NOT EXISTS error_details JSONB,
ADD COLUMN IF NOT EXISTS word_count INTEGER,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES ai_chat_messages(id),
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS ip_address INET;

-- Create indexes for optimal query performance (10M+ users)
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_id ON ai_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_tenant_farmer ON ai_chat_messages(tenant_id, farmer_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_created_at ON ai_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_status ON ai_chat_messages(status) WHERE status = 'error';
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_feedback ON ai_chat_messages(feedback_rating) WHERE feedback_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_language ON ai_chat_messages(language);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_metadata ON ai_chat_messages USING GIN(metadata);

-- Add trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_ai_chat_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ai_chat_messages_updated_at ON ai_chat_messages;
CREATE TRIGGER trigger_update_ai_chat_messages_updated_at
  BEFORE UPDATE ON ai_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_chat_messages_updated_at();

-- Add composite index for AI training queries
CREATE INDEX IF NOT EXISTS idx_ai_chat_training ON ai_chat_messages(tenant_id, created_at, role, language);

-- Ensure RLS is enabled for security
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;