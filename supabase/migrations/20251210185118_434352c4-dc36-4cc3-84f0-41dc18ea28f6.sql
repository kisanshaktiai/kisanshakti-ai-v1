-- Drop existing RLS policies for chat-attachments that use auth.uid()
DROP POLICY IF EXISTS "chat_attachments_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_delete_policy" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their chat attachments" ON storage.objects;

-- Create new RLS policies for chat-attachments using custom auth headers (x-farmer-id)
-- IMPORTANT: This app uses custom auth (mobile+PIN) not Supabase Auth, so auth.uid() is NULL

-- Helper function to get farmer_id from custom request headers
CREATE OR REPLACE FUNCTION public.get_request_farmer_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    current_setting('request.headers', true)::json->>'x-farmer-id',
    ''
  );
$$;

-- INSERT: Allow uploads when x-farmer-id header matches the first folder in path
CREATE POLICY "chat_attachments_insert_custom_auth"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments' 
  AND (
    -- Custom auth: check x-farmer-id header
    public.get_request_farmer_id() = split_part(name, '/', 1)
    OR
    -- Fallback: Supabase auth if available
    (auth.uid() IS NOT NULL AND (auth.uid())::text = split_part(name, '/', 1))
  )
);

-- SELECT: Public bucket - allow all reads (bucket is marked as public)
CREATE POLICY "chat_attachments_select_public"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

-- UPDATE: Allow updates when x-farmer-id header matches path owner
CREATE POLICY "chat_attachments_update_custom_auth"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'chat-attachments'
  AND (
    public.get_request_farmer_id() = split_part(name, '/', 1)
    OR
    (auth.uid() IS NOT NULL AND (auth.uid())::text = split_part(name, '/', 1))
  )
);

-- DELETE: Allow deletes when x-farmer-id header matches path owner
CREATE POLICY "chat_attachments_delete_custom_auth"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-attachments'
  AND (
    public.get_request_farmer_id() = split_part(name, '/', 1)
    OR
    (auth.uid() IS NOT NULL AND (auth.uid())::text = split_part(name, '/', 1))
  )
);