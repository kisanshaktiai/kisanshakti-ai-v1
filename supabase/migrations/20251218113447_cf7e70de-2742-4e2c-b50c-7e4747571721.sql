-- Fix post_likes and post_saves RLS policies to support custom header-based authentication

-- DROP existing policies on post_likes
DROP POLICY IF EXISTS "Users can manage their likes" ON public.post_likes;
DROP POLICY IF EXISTS "Users can view all likes" ON public.post_likes;

-- CREATE new policies for post_likes
CREATE POLICY "post_likes_select_all"
ON public.post_likes
FOR SELECT
USING (true);

CREATE POLICY "post_likes_insert_own"
ON public.post_likes
FOR INSERT
WITH CHECK (
  farmer_id = get_header_farmer_id()
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = auth.uid()
);

CREATE POLICY "post_likes_delete_own"
ON public.post_likes
FOR DELETE
USING (
  farmer_id = get_header_farmer_id()
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = auth.uid()
);

-- DROP existing policies on post_saves
DROP POLICY IF EXISTS "Users can manage their saves" ON public.post_saves;
DROP POLICY IF EXISTS "Users can view their saves" ON public.post_saves;

-- CREATE new policies for post_saves
CREATE POLICY "post_saves_select_own"
ON public.post_saves
FOR SELECT
USING (
  farmer_id = get_header_farmer_id()
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = auth.uid()
);

CREATE POLICY "post_saves_insert_own"
ON public.post_saves
FOR INSERT
WITH CHECK (
  farmer_id = get_header_farmer_id()
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = auth.uid()
);

CREATE POLICY "post_saves_delete_own"
ON public.post_saves
FOR DELETE
USING (
  farmer_id = get_header_farmer_id()
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = auth.uid()
);