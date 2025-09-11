-- Drop existing tables if they exist to rebuild with proper structure
DROP TABLE IF EXISTS public.post_saves CASCADE;
DROP TABLE IF EXISTS public.post_shares CASCADE;
DROP TABLE IF EXISTS public.post_likes CASCADE;
DROP TABLE IF EXISTS public.post_polls CASCADE;
DROP TABLE IF EXISTS public.poll_votes CASCADE;
DROP TABLE IF EXISTS public.followers CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.message_translations CASCADE;
DROP TABLE IF EXISTS public.user_points CASCADE;
DROP TABLE IF EXISTS public.user_badges CASCADE;
DROP TABLE IF EXISTS public.trending_topics CASCADE;
DROP TABLE IF EXISTS public.content_reports CASCADE;
DROP TABLE IF EXISTS public.offline_sync_queue CASCADE;

-- Create ENUM types if not exists
DO $$ BEGIN
    CREATE TYPE post_status AS ENUM ('draft', 'published', 'moderated', 'deleted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Post Likes Table
CREATE TABLE public.post_likes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(post_id, farmer_id)
);

-- Post Saves Table
CREATE TABLE public.post_saves (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    folder TEXT DEFAULT 'general',
    UNIQUE(post_id, farmer_id)
);

-- Post Shares Table
CREATE TABLE public.post_shares (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    share_type TEXT DEFAULT 'internal', -- internal, whatsapp, facebook, etc
    shared_to_community_id UUID REFERENCES communities(id),
    share_message TEXT,
    shared_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Post Polls Table (for poll posts)
CREATE TABLE public.post_polls (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- [{id, text, votes}]
    end_date TIMESTAMP WITH TIME ZONE,
    allow_multiple BOOLEAN DEFAULT false,
    is_anonymous BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Poll Votes Table
CREATE TABLE public.poll_votes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    poll_id UUID NOT NULL REFERENCES post_polls(id) ON DELETE CASCADE,
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    option_ids JSONB NOT NULL, -- array of option ids
    voted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(poll_id, farmer_id)
);

-- Followers Table
CREATE TABLE public.followers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    followed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- Messages Table (Direct Messages)
CREATE TABLE public.messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    original_language TEXT DEFAULT 'en',
    media_urls JSONB,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Message Translations Table
CREATE TABLE public.message_translations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    language_code TEXT NOT NULL,
    translated_content TEXT NOT NULL,
    translation_provider TEXT DEFAULT 'google',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(message_id, language_code)
);

-- User Points Table (Gamification)
CREATE TABLE public.user_points (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    points_type TEXT NOT NULL, -- post, comment, like, share, help, verify
    points INTEGER NOT NULL,
    description TEXT,
    reference_id UUID, -- post_id, comment_id, etc
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User Badges Table
CREATE TABLE public.user_badges (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    badge_name TEXT NOT NULL,
    badge_type TEXT NOT NULL, -- bronze, silver, gold, platinum
    badge_category TEXT NOT NULL, -- contributor, helper, expert, leader
    badge_icon_url TEXT,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(farmer_id, badge_name)
);

-- Trending Topics Table
CREATE TABLE public.trending_topics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    hashtag TEXT NOT NULL,
    post_count INTEGER DEFAULT 0,
    engagement_score INTEGER DEFAULT 0,
    region TEXT,
    crop_id UUID REFERENCES crops(id),
    trending_since TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Content Reports Table (for moderation)
CREATE TABLE public.content_reports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    content_type TEXT NOT NULL, -- post, comment, message
    content_id UUID NOT NULL,
    reported_by UUID NOT NULL REFERENCES farmers(id),
    report_reason TEXT NOT NULL,
    report_details TEXT,
    status TEXT DEFAULT 'pending', -- pending, reviewed, resolved, dismissed
    moderator_id UUID,
    moderator_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Offline Sync Queue Table
CREATE TABLE public.offline_sync_queue (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- create_post, like, comment, etc
    payload JSONB NOT NULL,
    synced BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    synced_at TIMESTAMP WITH TIME ZONE
);

-- Add missing columns to social_posts if they don't exist
ALTER TABLE public.social_posts 
ADD COLUMN IF NOT EXISTS status post_status DEFAULT 'published',
ADD COLUMN IF NOT EXISTS language_code TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS translations JSONB,
ADD COLUMN IF NOT EXISTS location_data JSONB,
ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'approved';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_posts_farmer ON social_posts(farmer_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_community ON social_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_hashtags ON social_posts USING GIN(hashtags);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers(following_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_user_points_farmer ON user_points(farmer_id);
CREATE INDEX IF NOT EXISTS idx_trending_topics_hashtag ON trending_topics(hashtag);
CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_farmer ON offline_sync_queue(farmer_id, synced);

-- Enable RLS on all tables
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Post Likes
CREATE POLICY "Users can view all likes" ON post_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage their likes" ON post_likes FOR ALL USING (auth.uid() = farmer_id);

-- Post Saves
CREATE POLICY "Users can view their saves" ON post_saves FOR SELECT USING (auth.uid() = farmer_id);
CREATE POLICY "Users can manage their saves" ON post_saves FOR ALL USING (auth.uid() = farmer_id);

-- Post Shares
CREATE POLICY "Users can view shares" ON post_shares FOR SELECT USING (true);
CREATE POLICY "Users can create shares" ON post_shares FOR INSERT WITH CHECK (auth.uid() = farmer_id);

-- Polls
CREATE POLICY "Users can view polls" ON post_polls FOR SELECT USING (true);
CREATE POLICY "Post owner can manage polls" ON post_polls FOR ALL 
USING (EXISTS (SELECT 1 FROM social_posts WHERE social_posts.id = post_polls.post_id AND social_posts.farmer_id = auth.uid()));

-- Poll Votes
CREATE POLICY "Users can view poll results" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "Users can manage their votes" ON poll_votes FOR ALL USING (auth.uid() = farmer_id);

-- Followers
CREATE POLICY "Users can view followers" ON followers FOR SELECT USING (true);
CREATE POLICY "Users can manage their follows" ON followers FOR ALL USING (auth.uid() = follower_id);

-- Messages
CREATE POLICY "Users can view their messages" ON messages FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send messages" ON messages FOR INSERT 
WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can update their messages" ON messages FOR UPDATE 
USING (auth.uid() = receiver_id);

-- Message Translations
CREATE POLICY "Users can view translations" ON message_translations FOR SELECT 
USING (EXISTS (SELECT 1 FROM messages WHERE messages.id = message_translations.message_id 
AND (messages.sender_id = auth.uid() OR messages.receiver_id = auth.uid())));

-- User Points
CREATE POLICY "Users can view all points" ON user_points FOR SELECT USING (true);
CREATE POLICY "System can manage points" ON user_points FOR INSERT WITH CHECK (true);

-- User Badges
CREATE POLICY "Users can view all badges" ON user_badges FOR SELECT USING (true);
CREATE POLICY "System can manage badges" ON user_badges FOR INSERT WITH CHECK (true);

-- Trending Topics
CREATE POLICY "Users can view trending" ON trending_topics FOR SELECT USING (true);

-- Content Reports
CREATE POLICY "Users can create reports" ON content_reports FOR INSERT WITH CHECK (auth.uid() = reported_by);
CREATE POLICY "Users can view their reports" ON content_reports FOR SELECT USING (auth.uid() = reported_by);

-- Offline Sync Queue
CREATE POLICY "Users can manage their queue" ON offline_sync_queue FOR ALL USING (auth.uid() = farmer_id);

-- Functions for engagement and gamification
CREATE OR REPLACE FUNCTION calculate_engagement_score(post_id UUID)
RETURNS INTEGER AS $$
DECLARE
    score INTEGER := 0;
    likes_count INTEGER;
    comments_count INTEGER;
    shares_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO likes_count FROM post_likes WHERE post_likes.post_id = $1;
    SELECT COUNT(*) INTO comments_count FROM post_comments WHERE post_comments.post_id = $1;
    SELECT COUNT(*) INTO shares_count FROM post_shares WHERE post_shares.post_id = $1;
    
    score := (likes_count * 1) + (comments_count * 3) + (shares_count * 5);
    
    UPDATE social_posts SET engagement_score = score WHERE id = $1;
    
    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Function to award points
CREATE OR REPLACE FUNCTION award_points(farmer_id UUID, points_type TEXT, points INTEGER, description TEXT, reference_id UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_points (farmer_id, points_type, points, description, reference_id)
    VALUES ($1, $2, $3, $4, $5);
    
    -- Check for badge eligibility
    PERFORM check_badge_eligibility($1);
END;
$$ LANGUAGE plpgsql;

-- Function to check badge eligibility
CREATE OR REPLACE FUNCTION check_badge_eligibility(farmer_id UUID)
RETURNS VOID AS $$
DECLARE
    total_points INTEGER;
BEGIN
    SELECT SUM(points) INTO total_points FROM user_points WHERE user_points.farmer_id = $1;
    
    -- Award badges based on points
    IF total_points >= 100 AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_badges.farmer_id = $1 AND badge_name = 'contributor_bronze') THEN
        INSERT INTO user_badges (farmer_id, badge_name, badge_type, badge_category)
        VALUES ($1, 'contributor_bronze', 'bronze', 'contributor');
    END IF;
    
    IF total_points >= 500 AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_badges.farmer_id = $1 AND badge_name = 'contributor_silver') THEN
        INSERT INTO user_badges (farmer_id, badge_name, badge_type, badge_category)
        VALUES ($1, 'contributor_silver', 'silver', 'contributor');
    END IF;
    
    IF total_points >= 1000 AND NOT EXISTS (SELECT 1 FROM user_badges WHERE user_badges.farmer_id = $1 AND badge_name = 'contributor_gold') THEN
        INSERT INTO user_badges (farmer_id, badge_name, badge_type, badge_category)
        VALUES ($1, 'contributor_gold', 'gold', 'contributor');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update engagement score
CREATE OR REPLACE FUNCTION update_engagement_score_trigger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_engagement_score(NEW.post_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_engagement_on_like
AFTER INSERT OR DELETE ON post_likes
FOR EACH ROW EXECUTE FUNCTION update_engagement_score_trigger();

CREATE TRIGGER update_engagement_on_comment
AFTER INSERT OR DELETE ON post_comments
FOR EACH ROW EXECUTE FUNCTION update_engagement_score_trigger();

CREATE TRIGGER update_engagement_on_share
AFTER INSERT ON post_shares
FOR EACH ROW EXECUTE FUNCTION update_engagement_score_trigger();