-- 20261005174000_private_chat_attachments.sql
UPDATE storage.buckets
SET public = false
WHERE id = 'chat-attachments';

DROP POLICY IF EXISTS "chat_attachments_select_public" ON storage.objects;

-- Keep the existing custom farmer-auth insert/update/delete policies.
-- Replace bucket-wide public read with path-bound reads.
CREATE POLICY "chat_attachments_select_custom_auth"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'chat-attachments'
  AND (
    get_request_farmer_id() = split_part(name, '/', 1)
    OR (
      auth.uid() IS NOT NULL
      AND auth.uid()::text = split_part(name, '/', 1)
    )
  )
);
