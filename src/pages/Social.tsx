import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SocialFeed } from '@/components/social/SocialFeed';
import { Communities } from '@/components/social/Communities';
import { Messages } from '@/components/social/Messages';
import { Leaderboard } from '@/components/social/Leaderboard';
import { UserProfile } from '@/components/social/UserProfile';
import { CreatePost } from '@/components/social/CreatePost';
import { TrendingTopics } from '@/components/social/TrendingTopics';
import { Button } from '@/components/ui/button';
import { Plus, Users, MessageSquare, Trophy, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Social() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('feed');
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [gamificationStats, setGamificationStats] = useState<any>(null);

  useEffect(() => {
    if (user?.id) {
      fetchUserProfile();
      fetchGamificationStats();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    try {
      const { data: farmer } = await supabase
        .from('farmers')
        .select('*')
        .eq('id', user?.id)
        .single();
      
      setUserProfile(farmer);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchGamificationStats = async () => {
    try {
      const { data, error } = await supabase
        .from('farmer_gamification')
        .select('*')
        .eq('farmer_id', user?.id)
        .maybeSingle();

      if (!error && data) {
        setGamificationStats(data);
      } else if (!data) {
        // Create initial gamification entry
        const { data: newStats } = await supabase
          .from('farmer_gamification')
          .insert({
            farmer_id: user?.id,
            total_points: 0,
            current_level: 1
          })
          .select()
          .single();
        setGamificationStats(newStats);
      }
    } catch (error) {
      console.error('Error fetching gamification stats:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      {/* Header with User Stats */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Farmer Community</h1>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Level {gamificationStats?.current_level || 1}</span>
                  <span>{gamificationStats?.total_points || 0} Points</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreatePost(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Post
            </Button>
          </div>
        </div>
      </div>

      {/* Trending Topics */}
      <div className="px-4 py-2 border-b">
        <TrendingTopics />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="w-full rounded-none border-b bg-background">
          <TabsTrigger value="feed" className="flex-1 gap-2">
            <TrendingUp className="w-4 h-4" />
            Feed
          </TabsTrigger>
          <TabsTrigger value="communities" className="flex-1 gap-2">
            <Users className="w-4 h-4" />
            Communities
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex-1 gap-2">
            <MessageSquare className="w-4 h-4" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex-1 gap-2">
            <Trophy className="w-4 h-4" />
            Rankings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="mt-0">
          <SocialFeed />
        </TabsContent>

        <TabsContent value="communities" className="mt-0">
          <Communities />
        </TabsContent>

        <TabsContent value="messages" className="mt-0">
          <Messages />
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-0">
          <Leaderboard />
        </TabsContent>
      </Tabs>

      {/* Create Post Dialog */}
      {showCreatePost && (
        <CreatePost 
          onClose={() => setShowCreatePost(false)}
          onPostCreated={() => {
            setShowCreatePost(false);
            toast({
              title: "Post created!",
              description: "Your post has been shared with the community."
            });
          }}
        />
      )}
    </div>
  );
}