-- Create the leave_community function
CREATE OR REPLACE FUNCTION public.leave_community(
  p_community_id UUID,
  p_farmer_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Check if member exists
  IF NOT EXISTS (
    SELECT 1 FROM community_members 
    WHERE community_id = p_community_id 
    AND farmer_id = p_farmer_id 
    AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not a member of this community'
    );
  END IF;

  -- Deactivate membership
  UPDATE community_members 
  SET 
    is_active = false,
    left_at = now(),
    updated_at = now()
  WHERE community_id = p_community_id 
  AND farmer_id = p_farmer_id;

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
    'message', 'Successfully left community'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.leave_community TO anon, authenticated;

-- Fix RLS policies for community_messages
DROP POLICY IF EXISTS "Anyone can view messages from joined communities" ON community_messages;
DROP POLICY IF EXISTS "Members can send messages to their communities" ON community_messages;

-- Create new permissive policies for community_messages
CREATE POLICY "Everyone can view community messages" ON community_messages
FOR SELECT USING (true);

CREATE POLICY "Everyone can create community messages" ON community_messages
FOR INSERT WITH CHECK (true);

CREATE POLICY "Everyone can update community messages" ON community_messages
FOR UPDATE USING (true);

-- Fix RLS policies for communities table
DROP POLICY IF EXISTS "Communities are viewable by everyone" ON communities;
CREATE POLICY "Everyone can view communities" ON communities
FOR SELECT USING (true);

-- Ensure community_members policies are correct
DROP POLICY IF EXISTS "Everyone can view community members" ON community_members;
CREATE POLICY "Everyone can view community members" ON community_members
FOR SELECT USING (true);

CREATE POLICY "Everyone can manage community members" ON community_members
FOR ALL USING (true);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_community_members_farmer_id ON community_members(farmer_id);
CREATE INDEX IF NOT EXISTS idx_community_members_community_id ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_community_id ON community_messages(community_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_farmer_id ON community_messages(farmer_id);