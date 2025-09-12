-- Add read receipts and message metadata columns if they don't exist
ALTER TABLE community_messages 
ADD COLUMN IF NOT EXISTS read_by jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text',
ADD COLUMN IF NOT EXISTS is_ai_filtered boolean DEFAULT false;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_community_messages_farmer_id ON community_messages(farmer_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_community_id ON community_messages(community_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_created_at ON community_messages(created_at DESC);

-- Add a function to mark messages as read
CREATE OR REPLACE FUNCTION mark_message_as_read(
  p_message_id uuid,
  p_farmer_id uuid
) RETURNS void AS $$
BEGIN
  UPDATE community_messages
  SET read_by = jsonb_build_array(
    SELECT DISTINCT jsonb_array_elements(
      CASE 
        WHEN read_by IS NULL THEN '[]'::jsonb
        ELSE read_by
      END || jsonb_build_array(to_jsonb(p_farmer_id))
    )
  )
  WHERE id = p_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;