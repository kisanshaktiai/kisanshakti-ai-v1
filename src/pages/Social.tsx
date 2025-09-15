import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Home, 
  Users, 
  MessageSquare, 
  Trophy, 
  TrendingUp,
  Search,
  Plus,
  Bell,
  Filter,
  Hash
} from 'lucide-react';
import { SocialFeed } from '@/components/social/SocialFeed';
import { Communities } from '@/components/social/Communities';
import { Messages } from '@/components/social/Messages';
import { Leaderboard } from '@/components/social/Leaderboard';
import { TrendingTopics } from '@/components/social/TrendingTopics';
import { CreatePost } from '@/components/social/CreatePost';
import { NotificationCenter } from '@/components/social/NotificationCenter';
import { useAuthStore } from '@/stores/authStore';
import { useTenantStore } from '@/stores/tenantStore';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export default function Social() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { tenant } = useTenantStore();
  const [activeTab, setActiveTab] = useState('feed');
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch user's badges and points
  const { data: userStats } = useQuery({
    queryKey: ['userStats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const [pointsRes, badgesRes] = await Promise.all([
        supabase
          .from('user_points')
          .select('points')
          .eq('farmer_id', user.id),
        supabase
          .from('user_badges')
          .select('*')
          .eq('farmer_id', user.id)
      ]);

      const totalPoints = pointsRes.data?.reduce((sum, p) => sum + p.points, 0) || 0;
      
      return {
        points: totalPoints,
        badges: badgesRes.data || [],
        level: Math.floor(totalPoints / 100) + 1
      };
    },
    enabled: !!user?.id
  });

  // Fetch unread messages count
  const { data: unreadMessages } = useQuery({
    queryKey: ['unreadMessages', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false);
      
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  useEffect(() => {
    if (unreadMessages) {
      setUnreadCount(unreadMessages);
    }
  }, [unreadMessages]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('social-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`
        },
        () => {
          setUnreadCount(prev => prev + 1);
          toast({
            title: 'New Message',
            description: 'You have received a new message',
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_likes'
        },
        (payload) => {
          // Check if the like is for user's post
          toast({
            title: 'Post Liked',
            description: 'Someone liked your post',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, toast]);

  const tabConfig = [
    { id: 'feed', label: 'Feed', icon: Home },
    { id: 'communities', label: 'Communities', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare, badge: unreadCount },
    { id: 'leaderboard', label: 'Rankings', icon: Trophy },
    { id: 'trending', label: 'Trending', icon: TrendingUp },
  ];

  return (
    <div className="bg-background">
      {/* Ultra Modern Mobile-First Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-b from-card/95 via-card/85 to-card/0 backdrop-blur-2xl">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-accent/20 flex items-center justify-center shadow-lg">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                Community Hub
              </h1>
              {userStats && (
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge className="h-5 px-2 text-[10px] bg-gradient-to-r from-primary/20 to-accent/20 text-primary border-primary/30">
                    Lvl {userStats.level}
                  </Badge>
                  <Badge variant="outline" className="h-5 px-2 text-[10px]">
                    {userStats.points} pts
                  </Badge>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative hover:bg-primary/10 transition-colors"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-lg">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
            
            <Button
              size="icon"
              onClick={() => setShowCreatePost(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Modern Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search communities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 bg-muted/50 border-border/50 focus:border-primary/50 transition-all"
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-primary/10"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Modern Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start px-2 h-12 bg-transparent rounded-none border-b-0">
            {tabConfig.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="relative data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary rounded-none flex-1 transition-all"
                >
                  <Icon className="h-4 w-4 mr-1.5" />
                  <span className="text-xs font-medium">{tab.label}</span>
                  {tab.badge && tab.badge > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-1 h-4 px-1 min-w-[16px] text-[10px]"
                    >
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto">
        <Tabs value={activeTab} className="w-full">
          <TabsContent value="feed" className="mt-0">
            <SocialFeed 
              searchQuery={searchQuery}
              selectedCommunity={selectedCommunity}
            />
          </TabsContent>

          <TabsContent value="communities" className="mt-0 px-2">
            <Communities />
          </TabsContent>

          <TabsContent value="messages" className="mt-0">
            <Messages />
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-0">
            <Leaderboard />
          </TabsContent>

          <TabsContent value="trending" className="mt-0">
            <TrendingTopics />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Post Modal */}
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

      {/* Notifications Panel */}
      {showNotifications && (
        <NotificationCenter
          onClose={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}