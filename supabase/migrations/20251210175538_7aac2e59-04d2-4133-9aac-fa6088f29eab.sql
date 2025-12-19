-- Update chat-attachments bucket to allow video and audio mime types
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
  'image/jpeg', 
  'image/jpg', 
  'image/png', 
  'image/webp', 
  'image/heic',
  'application/pdf',
  'video/webm',
  'video/mp4',
  'video/quicktime',
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/wav'
]
WHERE name = 'chat-attachments';