-- Create social platform tables for farmer community

-- Community types enum
CREATE TYPE community_type AS ENUM ('state', 'crop', 'language', 'practice', 'market', 'problem_solving');

-- Post types enum
CREATE TYPE post_type AS ENUM ('text', 'image', 'video', 'poll');

-- Create communities table
CREATE TABLE IF NOT EXISTS public.communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  community_type community_type NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon_url TEXT,
  cover_image_url TEXT,
  state_code TEXT, -- For state communities
  crop_id UUID REFERENCES public.crops(id), -- For crop communities
  language_code TEXT, -- For language communities
  member_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES public.farmers(id)
);

-- Community members table
CREATE TABLE IF NOT EXISTS public.community_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member', 'expert')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  contribution_points INTEGER DEFAULT 0,
  UNIQUE(community_id, farmer_id)
);

-- Social posts table
CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  parent_post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE, -- For replies
  post_type post_type NOT NULL DEFAULT 'text',
  content TEXT,
  media_urls JSONB DEFAULT '[]',
  poll_options JSONB DEFAULT '[]', -- For polls
  hashtags TEXT[] DEFAULT '{}',
  is_expert_verified BOOLEAN DEFAULT false,
  is_success_story BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  language_code TEXT DEFAULT 'hi',
  translations JSONB DEFAULT '{}', -- Store translations
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Post interactions table
CREATE TABLE IF NOT EXISTS public.post_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('like', 'save', 'share', 'report')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, farmer_id, interaction_type)
);

-- Comments table
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  is_expert_comment BOOLEAN DEFAULT false,
  language_code TEXT DEFAULT 'hi',
  translations JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Poll votes table
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, farmer_id)
);

-- Farmer follows table
CREATE TABLE IF NOT EXISTS public.farmer_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Direct messages table
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT,
  original_language TEXT DEFAULT 'hi',
  translations JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group chats table
CREATE TABLE IF NOT EXISTS public.group_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES public.farmers(id),
  community_id UUID REFERENCES public.communities(id),
  member_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group chat members
CREATE TABLE IF NOT EXISTS public.group_chat_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_read_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(group_id, farmer_id)
);

-- Group messages
CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT,
  original_language TEXT DEFAULT 'hi',
  translations JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gamification: Achievements table
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  points_required INTEGER NOT NULL,
  badge_type TEXT NOT NULL CHECK (badge_type IN ('bronze', 'silver', 'gold', 'platinum')),
  category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Farmer achievements
CREATE TABLE IF NOT EXISTS public.farmer_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id),
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(farmer_id, achievement_id)
);

-- Farmer points and levels
CREATE TABLE IF NOT EXISTS public.farmer_gamification (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE UNIQUE,
  total_points INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  posts_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  likes_given INTEGER DEFAULT 0,
  likes_received INTEGER DEFAULT 0,
  helpful_answers INTEGER DEFAULT 0,
  weekly_points INTEGER DEFAULT 0,
  monthly_points INTEGER DEFAULT 0,
  state_rank INTEGER,
  crop_rank INTEGER,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leaderboards
CREATE TABLE IF NOT EXISTS public.leaderboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  leaderboard_type TEXT NOT NULL CHECK (leaderboard_type IN ('state', 'crop', 'overall', 'weekly', 'monthly')),
  reference_id TEXT, -- state_code or crop_id
  points INTEGER DEFAULT 0,
  rank INTEGER,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trending topics
CREATE TABLE IF NOT EXISTS public.trending_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id),
  hashtag TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  trending_score NUMERIC DEFAULT 0,
  state_code TEXT,
  language_code TEXT,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content moderation
CREATE TABLE IF NOT EXISTS public.content_moderation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'comment', 'message')),
  content_id UUID NOT NULL,
  reported_by UUID REFERENCES public.farmers(id),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
  reviewed_by UUID REFERENCES public.farmers(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Offline sync queue
CREATE TABLE IF NOT EXISTS public.offline_sync_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX idx_social_posts_farmer_id ON public.social_posts(farmer_id);
CREATE INDEX idx_social_posts_community_id ON public.social_posts(community_id);
CREATE INDEX idx_social_posts_created_at ON public.social_posts(created_at DESC);
CREATE INDEX idx_social_posts_hashtags ON public.social_posts USING GIN(hashtags);
CREATE INDEX idx_post_interactions_farmer_id ON public.post_interactions(farmer_id);
CREATE INDEX idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX idx_direct_messages_sender_receiver ON public.direct_messages(sender_id, receiver_id);
CREATE INDEX idx_community_members_farmer_id ON public.community_members(farmer_id);
CREATE INDEX idx_farmer_follows_follower ON public.farmer_follows(follower_id);
CREATE INDEX idx_farmer_follows_following ON public.farmer_follows(following_id);
CREATE INDEX idx_trending_topics_hashtag ON public.trending_topics(hashtag);
CREATE INDEX idx_leaderboards_type_rank ON public.leaderboards(leaderboard_type, rank);

-- Enable RLS
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Communities
CREATE POLICY "Anyone can view active communities" ON public.communities FOR SELECT USING (is_active = true);
CREATE POLICY "Farmers can create communities" ON public.communities FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Community creators can update" ON public.communities FOR UPDATE USING (auth.uid() = created_by);

-- Community members
CREATE POLICY "Anyone can view community members" ON public.community_members FOR SELECT USING (true);
CREATE POLICY "Farmers can join communities" ON public.community_members FOR INSERT WITH CHECK (auth.uid() = farmer_id);
CREATE POLICY "Members can leave communities" ON public.community_members FOR DELETE USING (auth.uid() = farmer_id);

-- Social posts
CREATE POLICY "Anyone can view published posts" ON public.social_posts FOR SELECT USING (is_published = true);
CREATE POLICY "Farmers can create posts" ON public.social_posts FOR INSERT WITH CHECK (auth.uid() = farmer_id);
CREATE POLICY "Authors can update their posts" ON public.social_posts FOR UPDATE USING (auth.uid() = farmer_id);
CREATE POLICY "Authors can delete their posts" ON public.social_posts FOR DELETE USING (auth.uid() = farmer_id);

-- Post interactions
CREATE POLICY "Anyone can view interactions" ON public.post_interactions FOR SELECT USING (true);
CREATE POLICY "Farmers can interact with posts" ON public.post_interactions FOR INSERT WITH CHECK (auth.uid() = farmer_id);
CREATE POLICY "Farmers can remove their interactions" ON public.post_interactions FOR DELETE USING (auth.uid() = farmer_id);

-- Comments
CREATE POLICY "Anyone can view comments" ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "Farmers can comment" ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = farmer_id);
CREATE POLICY "Authors can update comments" ON public.post_comments FOR UPDATE USING (auth.uid() = farmer_id);
CREATE POLICY "Authors can delete comments" ON public.post_comments FOR DELETE USING (auth.uid() = farmer_id);

-- Poll votes
CREATE POLICY "Anyone can view poll results" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "Farmers can vote" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = farmer_id);

-- Farmer follows
CREATE POLICY "Anyone can view follows" ON public.farmer_follows FOR SELECT USING (true);
CREATE POLICY "Farmers can follow others" ON public.farmer_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Farmers can unfollow" ON public.farmer_follows FOR DELETE USING (auth.uid() = follower_id);

-- Direct messages
CREATE POLICY "Users can view their messages" ON public.direct_messages FOR SELECT 
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send messages" ON public.direct_messages FOR INSERT 
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Senders can update messages" ON public.direct_messages FOR UPDATE 
  USING (auth.uid() = sender_id);

-- Group chats
CREATE POLICY "Members can view groups" ON public.group_chats FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = id AND farmer_id = auth.uid()));
CREATE POLICY "Farmers can create groups" ON public.group_chats FOR INSERT 
  WITH CHECK (auth.uid() = created_by);

-- Group members
CREATE POLICY "Members can view group members" ON public.group_chat_members FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_chat_members gcm WHERE gcm.group_id = group_chat_members.group_id AND gcm.farmer_id = auth.uid()));

-- Group messages
CREATE POLICY "Members can view group messages" ON public.group_messages FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = group_messages.group_id AND farmer_id = auth.uid()));
CREATE POLICY "Members can send messages" ON public.group_messages FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.group_chat_members WHERE group_id = group_messages.group_id AND farmer_id = auth.uid()));

-- Achievements
CREATE POLICY "Anyone can view achievements" ON public.achievements FOR SELECT USING (is_active = true);

-- Farmer achievements
CREATE POLICY "Anyone can view farmer achievements" ON public.farmer_achievements FOR SELECT USING (true);

-- Gamification
CREATE POLICY "Anyone can view gamification stats" ON public.farmer_gamification FOR SELECT USING (true);
CREATE POLICY "System can update gamification" ON public.farmer_gamification FOR ALL USING (true);

-- Leaderboards
CREATE POLICY "Anyone can view leaderboards" ON public.leaderboards FOR SELECT USING (true);

-- Trending topics
CREATE POLICY "Anyone can view trending topics" ON public.trending_topics FOR SELECT USING (true);

-- Content moderation
CREATE POLICY "Farmers can report content" ON public.content_moderation FOR INSERT 
  WITH CHECK (auth.uid() = reported_by);
CREATE POLICY "Moderators can view reports" ON public.content_moderation FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.community_members WHERE farmer_id = auth.uid() AND role IN ('admin', 'moderator')));

-- Offline sync
CREATE POLICY "Users can manage their sync queue" ON public.offline_sync_queue FOR ALL 
  USING (auth.uid() = farmer_id);

-- Functions for gamification
CREATE OR REPLACE FUNCTION update_farmer_points()
RETURNS TRIGGER AS $$
BEGIN
  -- Update points based on action
  IF TG_TABLE_NAME = 'social_posts' AND TG_OP = 'INSERT' THEN
    INSERT INTO farmer_gamification (farmer_id, posts_count, total_points)
    VALUES (NEW.farmer_id, 1, 10)
    ON CONFLICT (farmer_id) DO UPDATE
    SET posts_count = farmer_gamification.posts_count + 1,
        total_points = farmer_gamification.total_points + 10,
        last_activity_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_points_on_post
  AFTER INSERT ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION update_farmer_points();

-- Insert default communities
INSERT INTO public.communities (name, description, community_type, slug, state_code) VALUES
  ('Maharashtra Farmers', 'Community for farmers in Maharashtra', 'state', 'maharashtra-farmers', 'MH'),
  ('Punjab Farmers', 'Community for farmers in Punjab', 'state', 'punjab-farmers', 'PB'),
  ('Karnataka Farmers', 'Community for farmers in Karnataka', 'state', 'karnataka-farmers', 'KA'),
  ('Gujarat Farmers', 'Community for farmers in Gujarat', 'state', 'gujarat-farmers', 'GJ');

INSERT INTO public.communities (name, description, community_type, slug) VALUES
  ('Sugarcane Growers', 'Community for sugarcane farmers', 'crop', 'sugarcane-growers'),
  ('Rice Cultivators', 'Community for rice farmers', 'crop', 'rice-cultivators'),
  ('Cotton Farmers', 'Community for cotton growers', 'crop', 'cotton-farmers'),
  ('Organic Farming', 'Community for organic farming practices', 'practice', 'organic-farming'),
  ('Modern Tech Farming', 'Community for technology in farming', 'practice', 'modern-tech-farming'),
  ('Pest & Disease Help', 'Get help with pest and disease management', 'problem_solving', 'pest-disease-help'),
  ('Weather Alerts', 'Stay updated with weather conditions', 'problem_solving', 'weather-alerts'),
  ('Market Prices', 'Discuss market prices and trading', 'market', 'market-prices');

-- Insert default achievements
INSERT INTO public.achievements (name, description, points_required, badge_type, category) VALUES
  ('First Post', 'Create your first post', 0, 'bronze', 'posting'),
  ('Active Contributor', 'Create 10 posts', 100, 'silver', 'posting'),
  ('Community Leader', 'Create 50 posts', 500, 'gold', 'posting'),
  ('Helpful Farmer', 'Receive 100 likes', 100, 'silver', 'engagement'),
  ('Expert Advisor', 'Answer 50 questions', 500, 'gold', 'helping'),
  ('Social Butterfly', 'Follow 50 farmers', 50, 'bronze', 'social');