-- Phase 1: Make chat-attachments bucket public for persistent image access
UPDATE storage.buckets 
SET public = true 
WHERE name = 'chat-attachments';

-- Add RLS policy to ensure only authenticated users can upload to their own folder
-- First, drop existing policies if any
DROP POLICY IF EXISTS "Users can upload their own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view public chat attachments" ON storage.objects;

-- Create secure upload policy - users can only upload to their own folder
CREATE POLICY "Users can upload their own chat attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Create public read policy - anyone can view (bucket is public)
CREATE POLICY "Anyone can view public chat attachments"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

-- Create delete policy - users can delete their own files
CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Create update policy - users can update their own files
CREATE POLICY "Users can update their own chat attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-attachments' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);