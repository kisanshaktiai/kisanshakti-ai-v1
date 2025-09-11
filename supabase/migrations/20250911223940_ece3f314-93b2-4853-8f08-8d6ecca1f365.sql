-- Drop existing RLS policies on community_members if they exist
DROP POLICY IF EXISTS "Users can join communities" ON public.community_members;
DROP POLICY IF EXISTS "Users can leave communities" ON public.community_members;
DROP POLICY IF EXISTS "Users can view community memberships" ON public.community_members;

-- Create proper RLS policies for community_members
CREATE POLICY "Users can view community memberships" 
  ON public.community_members 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can join communities" 
  ON public.community_members 
  FOR INSERT 
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND farmer_id = auth.uid()::text::uuid
    AND role = 'member'
  );

CREATE POLICY "Users can update their own membership" 
  ON public.community_members 
  FOR UPDATE 
  USING (farmer_id = auth.uid()::text::uuid);

CREATE POLICY "Users can leave communities" 
  ON public.community_members 
  FOR DELETE 
  USING (farmer_id = auth.uid()::text::uuid);