-- Add read receipts and message metadata columns if they don't exist
ALTER TABLE community_messages 
ADD COLUMN IF NOT EXISTS read_by jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text',
ADD COLUMN IF NOT EXISTS is_ai_filtered boolean DEFAULT false;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_community_messages_farmer_id ON community_messages(farmer_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_community_id ON community_messages(community_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_created_at ON community_messages(created_at DESC);

-- Create storage bucket for community images
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-images', 'community-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for community images
CREATE POLICY "Authenticated users can upload community images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'community-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view community images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'community-images');

CREATE POLICY "Users can delete their own images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'community-images' AND owner = auth.uid());