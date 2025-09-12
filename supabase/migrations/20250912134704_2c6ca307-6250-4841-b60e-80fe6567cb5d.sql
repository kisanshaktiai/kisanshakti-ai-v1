-- Fix the existing policies issue first
DROP POLICY IF EXISTS "Anyone can view community members" ON community_members;

-- Create the proper join community function
CREATE OR REPLACE FUNCTION public.join_community(
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

  -- Insert new membership
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

-- Create policy with new name
CREATE POLICY "Everyone can view community members" ON community_members
FOR SELECT USING (true);

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.join_community TO anon, authenticated;