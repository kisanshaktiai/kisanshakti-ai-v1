-- Enhanced Community Features Tables

-- Add new columns to communities table if not exists
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS moderator_ids UUID[] DEFAULT '{}';
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS rules TEXT;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS pinned_posts UUID[] DEFAULT '{}';
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS trending_score INTEGER DEFAULT 0;

-- Create community messages table for real-time chat
CREATE TABLE IF NOT EXISTS public.community_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'voice', 'document', 'poll')),
    attachments JSONB DEFAULT '[]',
    parent_message_id UUID REFERENCES community_messages(id) ON DELETE CASCADE,
    reactions JSONB DEFAULT '{}',
    is_pinned BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMP WITH TIME ZONE,
    translation_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create community polls table
CREATE TABLE IF NOT EXISTS public.community_polls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    message_id UUID REFERENCES community_messages(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    votes JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE,
    allow_multiple BOOLEAN DEFAULT false,
    is_anonymous BOOLEAN DEFAULT false,
    created_by UUID REFERENCES farmers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create community member activity table for gamification
CREATE TABLE IF NOT EXISTS public.community_member_activity (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT now(),
    badges JSONB DEFAULT '[]',
    level INTEGER DEFAULT 1,
    total_messages INTEGER DEFAULT 0,
    helpful_answers INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(community_id, farmer_id)
);

-- Create community events table
CREATE TABLE IF NOT EXISTS public.community_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    location TEXT,
    is_online BOOLEAN DEFAULT false,
    meeting_link TEXT,
    attendees UUID[] DEFAULT '{}',
    created_by UUID REFERENCES farmers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create community moderation logs
CREATE TABLE IF NOT EXISTS public.community_moderation (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    moderator_id UUID REFERENCES farmers(id),
    action_type TEXT NOT NULL,
    target_user_id UUID REFERENCES farmers(id),
    target_message_id UUID REFERENCES community_messages(id),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_messages_community_id ON community_messages(community_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_farmer_id ON community_messages(farmer_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_parent ON community_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_created_at ON community_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_member_activity_farmer ON community_member_activity(farmer_id);
CREATE INDEX IF NOT EXISTS idx_community_member_activity_points ON community_member_activity(points DESC);

-- Enable Row Level Security
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_member_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_moderation ENABLE ROW LEVEL SECURITY;

-- Create policies for community_messages
CREATE POLICY "Anyone can view community messages" 
  ON community_messages FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can create community messages" 
  ON community_messages FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update their own messages" 
  ON community_messages FOR UPDATE 
  USING (farmer_id = (SELECT id FROM farmers WHERE farmers.id = community_messages.farmer_id));

CREATE POLICY "Users can delete their own messages" 
  ON community_messages FOR DELETE 
  USING (farmer_id = (SELECT id FROM farmers WHERE farmers.id = community_messages.farmer_id));

-- Create policies for community_polls
CREATE POLICY "Anyone can view polls" 
  ON community_polls FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can create polls" 
  ON community_polls FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Anyone can update polls (for voting)" 
  ON community_polls FOR UPDATE 
  USING (true);

-- Create policies for community_member_activity
CREATE POLICY "Anyone can view member activity" 
  ON community_member_activity FOR SELECT 
  USING (true);

CREATE POLICY "System can manage member activity" 
  ON community_member_activity FOR ALL 
  USING (true);

-- Create policies for community_events
CREATE POLICY "Anyone can view events" 
  ON community_events FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can create events" 
  ON community_events FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Event creators can update their events" 
  ON community_events FOR UPDATE 
  USING (created_by = (SELECT id FROM farmers WHERE farmers.id = community_events.created_by));

-- Create policies for community_moderation
CREATE POLICY "Moderators can view moderation logs" 
  ON community_moderation FOR SELECT 
  USING (true);

CREATE POLICY "Moderators can create moderation logs" 
  ON community_moderation FOR INSERT 
  WITH CHECK (true);

-- Create function to update trending scores
CREATE OR REPLACE FUNCTION update_community_trending_score()
RETURNS void AS $$
BEGIN
  UPDATE communities
  SET trending_score = (
    SELECT COUNT(*)
    FROM community_messages
    WHERE community_messages.community_id = communities.id
    AND community_messages.created_at > now() - interval '24 hours'
  ) + (
    SELECT COALESCE(COUNT(*), 0) * 2
    FROM community_members
    WHERE community_members.community_id = communities.id
    AND community_members.joined_at > now() - interval '24 hours'
  );
END;
$$ LANGUAGE plpgsql;

-- Create function to award points for activities
CREATE OR REPLACE FUNCTION award_activity_points(
  p_community_id UUID,
  p_farmer_id UUID,
  p_activity_type TEXT,
  p_points INTEGER
)
RETURNS void AS $$
BEGIN
  INSERT INTO community_member_activity (
    community_id,
    farmer_id,
    activity_type,
    points,
    last_active
  )
  VALUES (
    p_community_id,
    p_farmer_id,
    p_activity_type,
    p_points,
    now()
  )
  ON CONFLICT (community_id, farmer_id)
  DO UPDATE SET
    points = community_member_activity.points + p_points,
    last_active = now(),
    total_messages = CASE 
      WHEN p_activity_type = 'message' THEN community_member_activity.total_messages + 1
      ELSE community_member_activity.total_messages
    END,
    helpful_answers = CASE 
      WHEN p_activity_type = 'helpful_answer' THEN community_member_activity.helpful_answers + 1
      ELSE community_member_activity.helpful_answers
    END,
    level = CASE 
      WHEN community_member_activity.points + p_points >= 1000 THEN 5
      WHEN community_member_activity.points + p_points >= 500 THEN 4
      WHEN community_member_activity.points + p_points >= 200 THEN 3
      WHEN community_member_activity.points + p_points >= 50 THEN 2
      ELSE 1
    END;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to award points on message creation
CREATE OR REPLACE FUNCTION award_message_points()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM award_activity_points(NEW.community_id, NEW.farmer_id, 'message', 5);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_award_message_points
AFTER INSERT ON community_messages
FOR EACH ROW
EXECUTE FUNCTION award_message_points();

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE community_member_activity;