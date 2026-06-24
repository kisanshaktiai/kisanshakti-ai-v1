-- Create a security definer function to check group membership without recursion
CREATE OR REPLACE FUNCTION public.is_group_member(_farmer_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_chat_members
    WHERE farmer_id = _farmer_id AND group_id = _group_id
  )
$$;

-- Create a security definer function to get user's group IDs
CREATE OR REPLACE FUNCTION public.get_user_group_ids(_farmer_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT group_id FROM public.group_chat_members WHERE farmer_id = _farmer_id
$$;

-- Drop and recreate the SELECT policy without recursion
DROP POLICY IF EXISTS "Users can view members of their groups" ON public.group_chat_members;
CREATE POLICY "Users can view members of their groups"
ON public.group_chat_members
FOR SELECT
USING (
  farmer_id = auth.uid()
  OR group_id IN (SELECT public.get_user_group_ids(auth.uid()))
);

-- Fix the UPDATE policy to avoid recursion
DROP POLICY IF EXISTS "Admins can update memberships" ON public.group_chat_members;
CREATE POLICY "Admins can update memberships"
ON public.group_chat_members
FOR UPDATE
USING (farmer_id = auth.uid());