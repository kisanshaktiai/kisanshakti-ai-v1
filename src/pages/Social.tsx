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
import { cn } from '@/lib/utils';
import { SocialFeed } from '@/components/social/SocialFeed';
import { Communities } from '@/components/social/Communities';
import { Messages } from '@/components/social/Messages';
import { Leaderboard } from '@/components/social/Leaderboard';
import { TrendingTopics } from '@/components/social/TrendingTopics';
import { CreatePost } from '@/components/social/CreatePost';
import { NotificationCenter } from '@/components/social/NotificationCenter';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export default function Social() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { tenant } = useTenant();
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-muted/20">
      {/* Mobile-First Modern Header - Fixed at Top */}
      <div className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border/50">
        {/* Compact Mobile Header */}
        <div className="flex items-center justify-between px-4 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-accent/20 flex items-center justify-center shadow-lg shadow-primary/20 flex-shrink-0">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent truncate">
                Community
              </h1>
              {userStats && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge className="h-4 px-1.5 text-[9px] md:text-[10px] bg-gradient-to-r from-primary/20 to-accent/20 text-primary border-primary/30">
                    Lvl {userStats.level}
                  </Badge>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] md:text-[10px]">
                    {userStats.points} pts
                  </Badge>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative h-9 w-9 md:h-10 md:w-10 rounded-xl hover:bg-primary/10 transition-all duration-300"
            >
              <Bell className="h-4 w-4 md:h-5 md:w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 md:h-4 md:w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] md:text-[10px] font-bold flex items-center justify-center shadow-lg animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
            
            <Button
              size="icon"
              onClick={() => setShowCreatePost(true)}
              className="h-9 w-9 md:h-10 md:w-10 rounded-xl bg-gradient-to-r from-primary via-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300"
            >
              <Plus className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </div>
        </div>

        {/* Mobile-Optimized Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search communities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 h-10 rounded-xl bg-gradient-to-br from-muted/50 via-muted/30 to-muted/20 border-border/50 focus:border-primary/50 placeholder:text-muted-foreground/50 transition-all duration-300"
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg hover:bg-primary/10 transition-all duration-300"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile-First Tab Navigation - No Horizontal Scroll */}
        <div className="w-full bg-gradient-to-b from-card/50 to-transparent">
          <div className="grid grid-cols-5 md:flex md:justify-center md:gap-2 px-2">
            {tabConfig.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 py-2.5 md:py-3 md:px-4 transition-all duration-300",
                    "hover:bg-primary/5 rounded-xl",
                    isActive && "bg-gradient-to-br from-primary/10 to-primary/5"
                  )}
                >
                  <div className={cn(
                    "relative p-1.5 md:p-0 rounded-lg transition-all duration-300",
                    isActive && "bg-gradient-to-br from-primary/20 to-primary/10 md:bg-transparent"
                  )}>
                    <Icon className={cn(
                      "h-4 w-4 md:h-4 md:w-4 transition-colors duration-300",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )} />
                    {tab.badge && tab.badge > 0 && (
                      <span className="absolute -top-1 -right-1 h-3 w-3 md:h-3.5 md:w-3.5 rounded-full bg-destructive text-destructive-foreground text-[8px] md:text-[9px] font-bold flex items-center justify-center shadow-md">
                        {tab.badge > 9 ? '9+' : tab.badge}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] md:text-xs font-medium transition-colors duration-300",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {tab.label}
                  </span>
                  {isActive && (
                    <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full md:hidden" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area - Optimized for Mobile */}
      <div className="w-full max-w-7xl mx-auto">
        <div className="min-h-[calc(100vh-180px)]">
          {/* Feed Tab */}
          {activeTab === 'feed' && (
            <div className="animate-fade-in">
              <SocialFeed 
                searchQuery={searchQuery}
                selectedCommunity={selectedCommunity}
              />
            </div>
          )}

          {/* Communities Tab */}
          {activeTab === 'communities' && (
            <div className="animate-fade-in px-4 py-4">
              <Communities />
            </div>
          )}

          {/* Messages Tab */}
          {activeTab === 'messages' && (
            <div className="animate-fade-in">
              <Messages />
            </div>
          )}

          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && (
            <div className="animate-fade-in px-4 py-4">
              <Leaderboard />
            </div>
          )}

          {/* Trending Tab */}
          {activeTab === 'trending' && (
            <div className="animate-fade-in px-4 py-4">
              <TrendingTopics />
            </div>
          )}
        </div>
      </div>

      {/* Create Post Modal - Mobile Optimized */}
      {showCreatePost && (
        <CreatePost
          onClose={() => setShowCreatePost(false)}
          onPostCreated={() => {
            setShowCreatePost(false);
            toast({
              title: "Success! 🎉",
              description: "Your post has been shared with the community.",
              className: "bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30"
            });
          }}
        />
      )}

      {/* Notifications Panel - Mobile Slide-in */}
      {showNotifications && (
        <NotificationCenter
          onClose={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}