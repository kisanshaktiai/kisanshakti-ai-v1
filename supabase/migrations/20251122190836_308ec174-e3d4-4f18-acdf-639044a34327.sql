-- Create helper function to extract farmer_id from custom header
CREATE OR REPLACE FUNCTION public.get_farmer_id_from_header()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-farmer-id', '')::uuid;
$$;

-- Drop existing avatar policies if they exist
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- Create new RLS policies for avatars bucket using custom header
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'avatars' 
  AND public.get_farmer_id_from_header() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_farmer_id_from_header()::text
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO public
USING (
  bucket_id = 'avatars' 
  AND public.get_farmer_id_from_header() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_farmer_id_from_header()::text
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND public.get_farmer_id_from_header() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_farmer_id_from_header()::text
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO public
USING (
  bucket_id = 'avatars' 
  AND public.get_farmer_id_from_header() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_farmer_id_from_header()::text
);