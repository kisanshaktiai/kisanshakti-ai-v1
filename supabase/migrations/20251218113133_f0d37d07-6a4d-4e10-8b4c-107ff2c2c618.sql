-- Fix social_posts RLS policies to support custom header-based authentication
-- Posts are isolated by farmer_id and tenant_id for write operations
-- But visible to ALL authenticated users for read operations

-- Drop all existing INSERT policies that don't support header auth
DROP POLICY IF EXISTS "Farmers can create posts" ON public.social_posts;
DROP POLICY IF EXISTS "Farmers can create posts with proper isolation" ON public.social_posts;
DROP POLICY IF EXISTS "Create posts for own farmer account" ON public.social_posts;

-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Authors can update their posts" ON public.social_posts;
DROP POLICY IF EXISTS "Update own posts" ON public.social_posts;
DROP POLICY IF EXISTS "Farmers update own posts, moderators update all" ON public.social_posts;

-- Drop existing DELETE policies
DROP POLICY IF EXISTS "Authors can delete their posts" ON public.social_posts;
DROP POLICY IF EXISTS "Delete own posts" ON public.social_posts;
DROP POLICY IF EXISTS "Farmers delete own posts, moderators delete all" ON public.social_posts;

-- Drop existing SELECT policies that are restrictive
DROP POLICY IF EXISTS "Farmers can view global and tenant posts" ON public.social_posts;
DROP POLICY IF EXISTS "View global and same-tenant posts" ON public.social_posts;

-- Keep the simple "Anyone can view published posts" policy if it exists (it's good)

-- CREATE NEW POLICIES

-- SELECT: All published posts are visible to everyone in the same tenant
CREATE POLICY "social_posts_select_published"
ON public.social_posts
FOR SELECT
USING (
  is_published = true
  AND (
    -- Same tenant check using header auth
    tenant_id = get_header_tenant_id()
    OR tenant_id = get_jwt_tenant_id()
    -- Or if tenant_id matches the farmer's tenant
    OR tenant_id IN (
      SELECT f.tenant_id FROM farmers f 
      WHERE f.id = COALESCE(get_header_farmer_id(), get_jwt_farmer_id())
    )
  )
);

-- INSERT: Farmers can create posts with header-based auth
-- farmer_id and tenant_id must match the authenticated user
CREATE POLICY "social_posts_insert_own"
ON public.social_posts
FOR INSERT
WITH CHECK (
  -- farmer_id must match the authenticated farmer
  (
    farmer_id = get_header_farmer_id()
    OR farmer_id = get_jwt_farmer_id()
    OR farmer_id = auth.uid()
  )
  AND
  -- tenant_id must match the authenticated tenant
  (
    tenant_id = get_header_tenant_id()
    OR tenant_id = get_jwt_tenant_id()
    OR tenant_id IN (
      SELECT f.tenant_id FROM farmers f 
      WHERE f.id = COALESCE(get_header_farmer_id(), get_jwt_farmer_id(), auth.uid())
    )
  )
);

-- UPDATE: Farmers can only update their own posts
CREATE POLICY "social_posts_update_own"
ON public.social_posts
FOR UPDATE
USING (
  farmer_id = get_header_farmer_id()
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = auth.uid()
)
WITH CHECK (
  farmer_id = get_header_farmer_id()
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = auth.uid()
);

-- DELETE: Farmers can only delete their own posts
CREATE POLICY "social_posts_delete_own"
ON public.social_posts
FOR DELETE
USING (
  farmer_id = get_header_farmer_id()
  OR farmer_id = get_jwt_farmer_id()
  OR farmer_id = auth.uid()
);