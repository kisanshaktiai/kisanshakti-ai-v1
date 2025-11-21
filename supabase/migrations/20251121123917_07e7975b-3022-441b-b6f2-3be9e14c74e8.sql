-- ============================================
-- PHASE 5: STORAGE SERVICE - FEATURE COMPLETENESS (FIXED)
-- ============================================
-- Drop existing policies and recreate with proper configuration

-- ============================================
-- 1. DROP EXISTING STORAGE POLICIES (IF ANY)
-- ============================================

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

DROP POLICY IF EXISTS "Farmers can view their own land images" ON storage.objects;
DROP POLICY IF EXISTS "Farmers can upload land images" ON storage.objects;
DROP POLICY IF EXISTS "Farmers can update their land images" ON storage.objects;
DROP POLICY IF EXISTS "Farmers can delete their land images" ON storage.objects;

DROP POLICY IF EXISTS "Users can view their own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their chat attachments" ON storage.objects;

DROP POLICY IF EXISTS "Farmers can view their own soil reports" ON storage.objects;
DROP POLICY IF EXISTS "Farmers can upload soil reports" ON storage.objects;
DROP POLICY IF EXISTS "Farmers can delete their soil reports" ON storage.objects;

DROP POLICY IF EXISTS "Social post images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload social post images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own social post images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own social post images" ON storage.objects;

-- ============================================
-- 2. CREATE/UPDATE STORAGE BUCKETS
-- ============================================

-- Profile Avatars (Public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Land/Farm Images (Private - farmer only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'land-images',
  'land-images',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
) ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];

-- Chat Attachments (Private - user only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  20971520, -- 20MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'image/heic']
) ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'image/heic'];

-- Soil Report Documents (Private - farmer only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'soil-reports',
  'soil-reports',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
) ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

-- Community/Social Posts (Public within tenant)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-posts',
  'social-posts',
  true,
  15728640, -- 15MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
) ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];

-- ============================================
-- 3. CREATE STORAGE RLS POLICIES - AVATARS
-- ============================================

CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- 4. CREATE STORAGE RLS POLICIES - LAND IMAGES
-- ============================================

CREATE POLICY "Farmers can view their own land images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'land-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Farmers can upload land images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'land-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Farmers can update their land images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'land-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Farmers can delete their land images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'land-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- 5. CREATE STORAGE RLS POLICIES - CHAT ATTACHMENTS
-- ============================================

CREATE POLICY "Users can view their own chat attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their chat attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- 6. CREATE STORAGE RLS POLICIES - SOIL REPORTS
-- ============================================

CREATE POLICY "Farmers can view their own soil reports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'soil-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Farmers can upload soil reports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'soil-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Farmers can delete their soil reports"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'soil-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- 7. CREATE STORAGE RLS POLICIES - SOCIAL POSTS
-- ============================================

CREATE POLICY "Social post images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'social-posts');

CREATE POLICY "Users can upload social post images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'social-posts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own social post images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'social-posts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own social post images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'social-posts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- 8. CREATE HELPER FUNCTIONS FOR STORAGE
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_storage_usage(user_id TEXT)
RETURNS TABLE (
  bucket_name TEXT,
  file_count BIGINT,
  total_size_bytes BIGINT,
  total_size_mb NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bucket_id as bucket_name,
    COUNT(*) as file_count,
    SUM(COALESCE((metadata->>'size')::bigint, 0)) as total_size_bytes,
    ROUND(SUM(COALESCE((metadata->>'size')::bigint, 0)) / 1048576.0, 2) as total_size_mb
  FROM storage.objects
  WHERE (storage.foldername(name))[1] = user_id
  GROUP BY bucket_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_storage_usage IS 'Get storage usage statistics for a specific user across all buckets';