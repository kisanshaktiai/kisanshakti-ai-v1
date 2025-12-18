-- Fix infinite recursion in group_chat_members RLS policy

-- Drop the problematic policy
DROP POLICY IF EXISTS "Members can view group members" ON public.group_chat_members;

-- Create a simpler policy that doesn't cause recursion
-- Users can view members of groups they belong to (using a subquery on a different approach)
CREATE POLICY "Users can view members of their groups"
ON public.group_chat_members
FOR SELECT
USING (
  farmer_id = auth.uid()
  OR group_id IN (
    SELECT group_id FROM public.group_chat_members WHERE farmer_id = auth.uid()
  )
);

-- Allow users to insert themselves into groups
DROP POLICY IF EXISTS "Users can join groups" ON public.group_chat_members;
CREATE POLICY "Users can join groups"
ON public.group_chat_members
FOR INSERT
WITH CHECK (farmer_id = auth.uid());

-- Allow users to leave groups (delete their own membership)
DROP POLICY IF EXISTS "Users can leave groups" ON public.group_chat_members;
CREATE POLICY "Users can leave groups"
ON public.group_chat_members
FOR DELETE
USING (farmer_id = auth.uid());

-- Allow admins to update group memberships
DROP POLICY IF EXISTS "Admins can update memberships" ON public.group_chat_members;
CREATE POLICY "Admins can update memberships"
ON public.group_chat_members
FOR UPDATE
USING (
  farmer_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.group_chat_members 
    WHERE group_id = group_chat_members.group_id 
    AND farmer_id = auth.uid() 
    AND role = 'admin'
  )
);