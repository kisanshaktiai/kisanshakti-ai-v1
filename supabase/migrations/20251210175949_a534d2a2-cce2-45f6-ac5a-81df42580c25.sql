-- Drop ALL chat-attachments policies first
DROP POLICY IF EXISTS "Users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public read chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view public chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own chat attachments" ON storage.objects;

-- Create simplified policies using split_part for path matching
-- Path structure: userId/sessionId/filename.jpg

CREATE POLICY "chat_attachments_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = split_part(name, '/', 1)
);

CREATE POLICY "chat_attachments_select_policy"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attachments_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = split_part(name, '/', 1)
);

CREATE POLICY "chat_attachments_update_policy"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = split_part(name, '/', 1)
);