-- Fix community members table and add proper constraints
-- First, check if we need to add missing columns or fix constraints

-- Ensure community_members table has proper structure
ALTER TABLE community_members 
ALTER COLUMN role SET DEFAULT 'member';

-- Add ON CONFLICT handling for duplicate memberships
CREATE UNIQUE INDEX IF NOT EXISTS unique_community_membership 
ON community_members(community_id, farmer_id) 
WHERE is_active = true;

-- Update community_members to ensure proper data types
ALTER TABLE community_members 
ALTER COLUMN joined_at SET DEFAULT now();

-- Create or replace function to handle community join with proper error handling
CREATE OR REPLACE FUNCTION join_community(
  p_community_id UUID,
  p_farmer_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM community_members 
    WHERE community_id = p_community_id 
    AND farmer_id = p_farmer_id 
    AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already a member of this community'
    );
  END IF;

  -- Insert new membership or reactivate existing
  INSERT INTO community_members (
    community_id,
    farmer_id,
    role,
    is_active,
    joined_at
  ) VALUES (
    p_community_id,
    p_farmer_id,
    'member',
    true,
    now()
  )
  ON CONFLICT (community_id, farmer_id) 
  DO UPDATE SET
    is_active = true,
    joined_at = CASE 
      WHEN community_members.is_active = false THEN now()
      ELSE community_members.joined_at
    END,
    updated_at = now();

  -- Update community member count
  UPDATE communities 
  SET member_count = (
    SELECT COUNT(*) 
    FROM community_members 
    WHERE community_id = p_community_id 
    AND is_active = true
  )
  WHERE id = p_community_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully joined community'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix RLS policies for community_members
DROP POLICY IF EXISTS "Farmers can join communities" ON community_members;
DROP POLICY IF EXISTS "Farmers can leave communities" ON community_members;
DROP POLICY IF EXISTS "Farmers can view community members" ON community_members;

-- Allow authenticated users to join communities
CREATE POLICY "Users can join communities" ON community_members
FOR INSERT WITH CHECK (
  farmer_id = (
    SELECT id FROM farmers 
    WHERE auth.uid() = farmers.id
  )
);

-- Allow users to leave their own communities
CREATE POLICY "Users can leave communities" ON community_members
FOR DELETE USING (
  farmer_id = (
    SELECT id FROM farmers 
    WHERE auth.uid() = farmers.id
  )
);

-- Allow users to update their own memberships
CREATE POLICY "Users can update own membership" ON community_members
FOR UPDATE USING (
  farmer_id = (
    SELECT id FROM farmers 
    WHERE auth.uid() = farmers.id
  )
);

-- Allow all to view community members
CREATE POLICY "Anyone can view community members" ON community_members
FOR SELECT USING (true);

-- Fix community_messages table structure
ALTER TABLE community_messages
ALTER COLUMN message_type SET DEFAULT 'text',
ALTER COLUMN reactions SET DEFAULT '{}',
ALTER COLUMN is_pinned SET DEFAULT false,
ALTER COLUMN is_verified SET DEFAULT false,
ALTER COLUMN is_edited SET DEFAULT false,
ALTER COLUMN translation_data SET DEFAULT '{}',
ALTER COLUMN metadata SET DEFAULT '{}';

-- Ensure proper indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_messages_community_id 
ON community_messages(community_id);

CREATE INDEX IF NOT EXISTS idx_community_messages_farmer_id 
ON community_messages(farmer_id);

CREATE INDEX IF NOT EXISTS idx_community_members_farmer_id 
ON community_members(farmer_id);

CREATE INDEX IF NOT EXISTS idx_community_members_community_id 
ON community_members(community_id);

-- Add trigger to update community post count
CREATE OR REPLACE FUNCTION update_community_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities 
    SET post_count = post_count + 1
    WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities 
    SET post_count = GREATEST(0, post_count - 1)
    WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_community_post_count_trigger ON community_messages;
CREATE TRIGGER update_community_post_count_trigger
AFTER INSERT OR DELETE ON community_messages
FOR EACH ROW EXECUTE FUNCTION update_community_post_count();