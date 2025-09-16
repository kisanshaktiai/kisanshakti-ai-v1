-- First, ensure farmer_id and tenant_id columns are NOT NULL
-- We'll update any existing NULL values first (if any)
UPDATE public.social_posts 
SET farmer_id = '00000000-0000-0000-0000-000000000000'
WHERE farmer_id IS NULL;

UPDATE public.social_posts 
SET tenant_id = '00000000-0000-0000-0000-000000000000'
WHERE tenant_id IS NULL;

-- Now make the columns NOT NULL
ALTER TABLE public.social_posts 
ALTER COLUMN farmer_id SET NOT NULL;

ALTER TABLE public.social_posts 
ALTER COLUMN tenant_id SET NOT NULL;

-- Drop all existing policies for social_posts
DROP POLICY IF EXISTS "Users can create posts" ON public.social_posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.social_posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON public.social_posts;
DROP POLICY IF EXISTS "Users can view posts" ON public.social_posts;

-- Create helper function to get farmer_id from JWT
CREATE OR REPLACE FUNCTION public.get_jwt_farmer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'farmer_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

-- Create helper function to get tenant_id from JWT
CREATE OR REPLACE FUNCTION public.get_jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

-- Create helper function to check if user is a moderator
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'role')::text = 'moderator',
    false
  );
$$;

-- INSERT POLICY: Farmers can only create posts with their own farmer_id and tenant_id
-- They can post to either global community or their tenant's communities
CREATE POLICY "Farmers can create posts with proper isolation"
ON public.social_posts
FOR INSERT
WITH CHECK (
  -- Must be the farmer from JWT
  farmer_id = get_jwt_farmer_id()
  -- Must be from their tenant
  AND tenant_id = get_jwt_tenant_id()
  -- Can post to either global community or their tenant's communities
  AND (
    -- Global community (accessible to all tenants)
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = social_posts.community_id
      AND c.is_global = true
    )
    OR
    -- Tenant-specific community
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = social_posts.community_id
      AND c.tenant_id = get_jwt_tenant_id()
    )
  )
);

-- SELECT POLICY: View global posts + own tenant posts
CREATE POLICY "Farmers can view global and tenant posts"
ON public.social_posts
FOR SELECT
USING (
  -- Can see posts from global community
  EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = social_posts.community_id
    AND c.is_global = true
  )
  OR
  -- Can see posts from their own tenant
  tenant_id = get_jwt_tenant_id()
);

-- UPDATE POLICY: Farmers can update their own posts, moderators can update all
CREATE POLICY "Farmers update own posts, moderators update all"
ON public.social_posts
FOR UPDATE
USING (
  -- Either the farmer owns the post
  farmer_id = get_jwt_farmer_id()
  -- Or user is a moderator
  OR is_moderator()
)
WITH CHECK (
  -- For farmers, ensure they don't change farmer_id or tenant_id
  (
    farmer_id = get_jwt_farmer_id() 
    AND farmer_id = OLD.farmer_id 
    AND tenant_id = OLD.tenant_id
  )
  -- Moderators can update anything
  OR is_moderator()
);

-- DELETE POLICY: Farmers can delete their own posts, moderators can delete all
CREATE POLICY "Farmers delete own posts, moderators delete all"
ON public.social_posts
FOR DELETE
USING (
  -- Either the farmer owns the post
  farmer_id = get_jwt_farmer_id()
  -- Or user is a moderator
  OR is_moderator()
);

-- Ensure communities table has is_global column (add if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'communities' 
    AND column_name = 'is_global'
  ) THEN
    ALTER TABLE public.communities 
    ADD COLUMN is_global boolean DEFAULT false;
  END IF;
END $$;

-- Create a global community if it doesn't exist
INSERT INTO public.communities (
  id,
  name,
  description,
  type,
  is_global,
  tenant_id,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Global Farmer Community',
  'A global community for all farmers across all tenants to share knowledge and experiences',
  'global',
  true,
  '00000000-0000-0000-0000-000000000000', -- Use a placeholder tenant_id
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;