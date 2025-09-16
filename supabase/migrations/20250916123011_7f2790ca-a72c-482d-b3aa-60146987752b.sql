-- Add tenant_id to social_posts table for multi-tenant support
ALTER TABLE public.social_posts 
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_social_posts_tenant_id ON public.social_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_community_tenant ON public.social_posts(community_id, tenant_id);

-- Add is_global flag to communities table
ALTER TABLE public.communities 
ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- Create global community if it doesn't exist
INSERT INTO public.communities (id, name, slug, description, is_global, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Global Community',
  'global',
  'A space for all farmers across all organizations to connect and share',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Update RLS policies for social_posts
DROP POLICY IF EXISTS "Users can view all published posts" ON public.social_posts;
DROP POLICY IF EXISTS "Users can create their own posts" ON public.social_posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON public.social_posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.social_posts;
DROP POLICY IF EXISTS "View global and same-tenant posts" ON public.social_posts;
DROP POLICY IF EXISTS "Create posts for own farmer account" ON public.social_posts;
DROP POLICY IF EXISTS "Update own posts" ON public.social_posts;
DROP POLICY IF EXISTS "Delete own posts" ON public.social_posts;
DROP POLICY IF EXISTS "Moderators can manage all posts" ON public.social_posts;

-- New RLS policies for multi-tenant posts using custom farmer authentication
CREATE POLICY "View global and same-tenant posts" 
ON public.social_posts 
FOR SELECT 
USING (
  is_published = true 
  AND (
    tenant_id IS NULL -- Global posts
    OR tenant_id IN (
      SELECT tenant_id 
      FROM public.farmers 
      WHERE id = get_jwt_farmer_id()
    ) -- Same tenant posts
  )
);

CREATE POLICY "Create posts for own farmer account" 
ON public.social_posts 
FOR INSERT 
WITH CHECK (
  farmer_id = get_jwt_farmer_id()
  AND (
    tenant_id IS NULL -- Can create global posts
    OR tenant_id IN (
      SELECT tenant_id 
      FROM public.farmers 
      WHERE id = get_jwt_farmer_id()
    ) -- Can create tenant posts
  )
);

CREATE POLICY "Update own posts" 
ON public.social_posts 
FOR UPDATE 
USING (farmer_id = get_jwt_farmer_id())
WITH CHECK (farmer_id = get_jwt_farmer_id());

CREATE POLICY "Delete own posts" 
ON public.social_posts 
FOR DELETE 
USING (farmer_id = get_jwt_farmer_id());

-- Add moderator role support
CREATE POLICY "Moderators can manage all posts" 
ON public.social_posts 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 
    FROM public.farmers f
    WHERE f.id = get_jwt_farmer_id() 
    AND f.role = 'moderator'
  )
);

-- Update RLS for communities
DROP POLICY IF EXISTS "Anyone can view active communities" ON public.communities;
DROP POLICY IF EXISTS "View global and same-tenant communities" ON public.communities;

CREATE POLICY "View global and same-tenant communities" 
ON public.communities 
FOR SELECT 
USING (
  is_active = true 
  AND (
    is_global = true -- Global communities
    OR tenant_id IN (
      SELECT tenant_id 
      FROM public.farmers 
      WHERE id = get_jwt_farmer_id()
    ) -- Same tenant communities
  )
);