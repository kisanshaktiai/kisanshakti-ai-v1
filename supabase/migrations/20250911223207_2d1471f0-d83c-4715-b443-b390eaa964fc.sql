-- Create posts table for community posts
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  post_type VARCHAR(50) DEFAULT 'general',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on posts table
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- RLS policies for posts
CREATE POLICY "Anyone can view posts" ON public.posts 
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own posts" ON public.posts 
  FOR INSERT WITH CHECK (auth.uid() = farmer_id);

CREATE POLICY "Users can update their own posts" ON public.posts 
  FOR UPDATE USING (auth.uid() = farmer_id);

CREATE POLICY "Users can delete their own posts" ON public.posts 
  FOR DELETE USING (auth.uid() = farmer_id);

-- Add location column to farmers table
ALTER TABLE public.farmers 
ADD COLUMN IF NOT EXISTS location TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_posts_community_id ON public.posts(community_id);
CREATE INDEX IF NOT EXISTS idx_posts_farmer_id ON public.posts(farmer_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);