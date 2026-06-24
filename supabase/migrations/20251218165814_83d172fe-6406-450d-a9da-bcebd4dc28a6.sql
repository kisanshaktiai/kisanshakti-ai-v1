-- Create post_reactions table for emoji reactions (helpful, tried, thanks)
CREATE TABLE IF NOT EXISTS public.post_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('helpful', 'tried', 'thanks')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, farmer_id, reaction_type)
);

-- Create group_chat_messages table for real-time group chat
CREATE TABLE IF NOT EXISTS public.group_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'image', 'system')),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add reaction counts to social_posts
ALTER TABLE public.social_posts 
ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tried_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS thanks_count INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for post_reactions
CREATE POLICY "Anyone can view reactions" ON public.post_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can add reactions" ON public.post_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete own reactions" ON public.post_reactions FOR DELETE USING (farmer_id = (current_setting('request.headers', true)::json->>'x-farmer-id')::uuid);

-- RLS policies for group_chat_messages
CREATE POLICY "Group members can view messages" ON public.group_chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send messages" ON public.group_chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own messages" ON public.group_chat_messages FOR UPDATE USING (farmer_id = (current_setting('request.headers', true)::json->>'x-farmer-id')::uuid);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_farmer_id ON public.post_reactions(farmer_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_group_id ON public.group_chat_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_created_at ON public.group_chat_messages(created_at DESC);

-- Enable realtime for group_chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_chat_messages;