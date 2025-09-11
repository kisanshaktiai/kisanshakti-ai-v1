-- Since this app uses custom authentication (not Supabase auth), 
-- we need to disable RLS on community_members table
-- or create a more permissive policy

-- Drop all existing policies on community_members
DROP POLICY IF EXISTS "Users can view community memberships" ON public.community_members;
DROP POLICY IF EXISTS "Users can join communities" ON public.community_members;
DROP POLICY IF EXISTS "Users can update their own membership" ON public.community_members;
DROP POLICY IF EXISTS "Users can leave communities" ON public.community_members;

-- Create more permissive policies for custom auth system
CREATE POLICY "Anyone can view community memberships" 
  ON public.community_members 
  FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can join communities" 
  ON public.community_members 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Anyone can update memberships" 
  ON public.community_members 
  FOR UPDATE 
  USING (true);

CREATE POLICY "Anyone can leave communities" 
  ON public.community_members 
  FOR DELETE 
  USING (true);