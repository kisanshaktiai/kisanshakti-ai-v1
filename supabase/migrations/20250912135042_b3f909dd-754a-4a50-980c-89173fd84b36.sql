-- Drop existing RLS policies that use auth.uid()
DROP POLICY IF EXISTS "Users can join communities" ON community_members;
DROP POLICY IF EXISTS "Users can leave communities" ON community_members;
DROP POLICY IF EXISTS "Users can update own membership" ON community_members;
DROP POLICY IF EXISTS "Everyone can view community members" ON community_members;

-- Create new RLS policies for custom farmer auth
-- Since we're using custom auth, we'll make these more permissive
-- and handle auth checks in the application layer

-- Allow all authenticated operations on community_members
CREATE POLICY "Allow all operations on community_members" ON community_members
FOR ALL USING (true) WITH CHECK (true);

-- Update the join_community function to not rely on auth.uid()
CREATE OR REPLACE FUNCTION public.join_community(
  p_community_id UUID,
  p_farmer_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_member_id UUID;
BEGIN
  -- Validate inputs
  IF p_community_id IS NULL OR p_farmer_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid community or farmer ID'
    );
  END IF;

  -- Check if farmer exists
  IF NOT EXISTS (SELECT 1 FROM farmers WHERE id = p_farmer_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Farmer not found'
    );
  END IF;

  -- Check if community exists
  IF NOT EXISTS (SELECT 1 FROM communities WHERE id = p_community_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Community not found'
    );
  END IF;

  -- Check if already a member
  SELECT id INTO v_member_id
  FROM community_members 
  WHERE community_id = p_community_id 
  AND farmer_id = p_farmer_id
  LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    -- Update existing membership to active
    UPDATE community_members
    SET 
      is_active = true,
      joined_at = CASE 
        WHEN is_active = false THEN now()
        ELSE joined_at
      END,
      updated_at = now()
    WHERE id = v_member_id;
  ELSE
    -- Insert new membership
    INSERT INTO community_members (
      community_id,
      farmer_id,
      role,
      is_active,
      joined_at,
      created_at,
      updated_at
    ) VALUES (
      p_community_id,
      p_farmer_id,
      'member',
      true,
      now(),
      now(),
      now()
    );
  END IF;

  -- Update community member count
  UPDATE communities 
  SET 
    member_count = (
      SELECT COUNT(DISTINCT farmer_id) 
      FROM community_members 
      WHERE community_id = p_community_id 
      AND is_active = true
    ),
    updated_at = now()
  WHERE id = p_community_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully joined community'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to join community: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create leave community function
CREATE OR REPLACE FUNCTION public.leave_community(
  p_community_id UUID,
  p_farmer_id UUID
) RETURNS JSONB AS $$
BEGIN
  -- Validate inputs
  IF p_community_id IS NULL OR p_farmer_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid community or farmer ID'
    );
  END IF;

  -- Update membership to inactive
  UPDATE community_members
  SET 
    is_active = false,
    updated_at = now()
  WHERE community_id = p_community_id 
  AND farmer_id = p_farmer_id
  AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not a member of this community'
    );
  END IF;

  -- Update community member count
  UPDATE communities 
  SET 
    member_count = GREATEST(0, (
      SELECT COUNT(DISTINCT farmer_id) 
      FROM community_members 
      WHERE community_id = p_community_id 
      AND is_active = true
    )),
    updated_at = now()
  WHERE id = p_community_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully left community'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to leave community: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update community_messages RLS policies for custom auth
DROP POLICY IF EXISTS "Anyone can view messages" ON community_messages;
DROP POLICY IF EXISTS "Members can send messages" ON community_messages;

-- Allow all operations on community_messages (auth handled in app)
CREATE POLICY "Allow all operations on community_messages" ON community_messages
FOR ALL USING (true) WITH CHECK (true);

-- Ensure indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_community_members_unique 
ON community_members(community_id, farmer_id);

CREATE INDEX IF NOT EXISTS idx_community_members_active 
ON community_members(farmer_id, is_active) 
WHERE is_active = true;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.join_community TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_community TO anon, authenticated;