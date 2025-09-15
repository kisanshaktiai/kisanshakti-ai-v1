import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  MapPin, Wheat, Languages, Users, Search, Activity,
  MessageSquare, Check, TrendingUp, Globe, Sparkles, 
  BookOpen, Zap, Plus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CommunitiesProps {
  onCommunitySelect?: (id: string) => void;
}

export function Communities({ onCommunitySelect }: CommunitiesProps = {}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<any[]>([]);
  const [joinedCommunities, setJoinedCommunities] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [onlineMembers, setOnlineMembers] = useState<{ [key: string]: number }>({});
  const [farmerId, setFarmerId] = useState<string | null>(null);

  useEffect(() => {
    // Get farmer ID from auth storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const authData = JSON.parse(authStorage);
      const sessionData = authData?.state?.session;
      if (sessionData?.farmerId) {
        setFarmerId(sessionData.farmerId);
        fetchJoinedCommunities(sessionData.farmerId);
      }
    }
    fetchCommunities();
  }, []);

  const fetchCommunities = async () => {
    try {
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .eq('is_active', true)
        .order('member_count', { ascending: false });

      if (error) throw error;
      setCommunities(data || []);
    } catch (error) {
      console.error('Error fetching communities:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchJoinedCommunities = async (farmerId: string) => {
    try {
      const { data, error } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('farmer_id', farmerId)
        .eq('is_active', true);

      if (error) throw error;
      setJoinedCommunities(data?.map(m => m.community_id) || []);
    } catch (error) {
      console.error('Error fetching joined communities:', error);
    }
  };

  const handleJoinCommunity = async (communityId: string) => {
    if (!farmerId) {
      toast({
        title: "Authentication required",
        description: "Please login to join communities",
        variant: "destructive"
      });
      return;
    }

    try {
      // Use the database function for safer join operation
      const { data, error } = await supabase
        .rpc('join_community' as any, {
          p_community_id: communityId,
          p_farmer_id: farmerId
        }) as { data: any; error: any };

      if (error) throw error;

      if (data?.success) {
        setJoinedCommunities([...joinedCommunities, communityId]);
        
        // Update local community member count
        setCommunities(prev => prev.map(c => 
          c.id === communityId 
            ? { ...c, member_count: (c.member_count || 0) + 1 }
            : c
        ));
        
        toast({
          title: "Welcome!",
          description: "You've successfully joined the community"
        });
      } else {
        toast({
          title: "Already a member",
          description: data?.error || "You're already part of this community",
          variant: "default"
        });
      }
    } catch (error: any) {
      console.error('Error joining community:', error);
      toast({
        title: "Failed to join",
        description: error?.message || "Unable to join community. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleLeaveCommunity = async (communityId: string) => {
    if (!farmerId) return;

    try {
      // Use the leave_community function
      const { data, error } = await supabase
        .rpc('leave_community' as any, {
          p_community_id: communityId,
          p_farmer_id: farmerId
        }) as { data: any; error: any };

      if (error) throw error;

      if (data?.success) {
        setJoinedCommunities(joinedCommunities.filter(id => id !== communityId));
        
        // Update local community member count
        setCommunities(prev => prev.map(c => 
          c.id === communityId 
            ? { ...c, member_count: Math.max(0, (c.member_count || 0) - 1) }
            : c
        ));
        
        toast({
          title: "Left community",
          description: "You've successfully left the community"
        });
      } else {
        toast({
          title: "Error",
          description: data?.error || "Failed to leave community",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error leaving community:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to leave community",
        variant: "destructive"
      });
    }
  };

  const filterByType = (type: string) => {
    return communities.filter(c => c.community_type === type);
  };

  const filteredCommunities = searchQuery
    ? communities.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : communities;

  const getIcon = (type: string) => {
    switch(type) {
      case 'state': return <MapPin className="w-4 h-4 text-primary" />;
      case 'crop': return <Wheat className="w-4 h-4 text-success" />;
      case 'language': return <Languages className="w-4 h-4 text-accent" />;
      default: return <Users className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search communities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="state">State</TabsTrigger>
          <TabsTrigger value="crop">Crop</TabsTrigger>
          <TabsTrigger value="practice">Practice</TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[500px] mt-4">
          <TabsContent value="all" className="space-y-3 mt-0">
            {filteredCommunities.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                isJoined={joinedCommunities.includes(community.id)}
                onJoin={() => handleJoinCommunity(community.id)}
                onLeave={() => handleLeaveCommunity(community.id)}
                onClick={() => {
                  if (onCommunitySelect) {
                    onCommunitySelect(community.id);
                  } else {
                    navigate(`/app/community-chat/${community.id}`);
                  }
                }}
                icon={getIcon(community.community_type)}
              />
            ))}
          </TabsContent>
          
          <TabsContent value="state" className="space-y-3 mt-0">
            {filterByType('state').map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                isJoined={joinedCommunities.includes(community.id)}
                onJoin={() => handleJoinCommunity(community.id)}
                onLeave={() => handleLeaveCommunity(community.id)}
                onClick={() => navigate(`/app/community-chat/${community.id}`)}
                icon={getIcon('state')}
              />
            ))}
          </TabsContent>
          
          <TabsContent value="crop" className="space-y-3 mt-0">
            {filterByType('crop').map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                isJoined={joinedCommunities.includes(community.id)}
                onJoin={() => handleJoinCommunity(community.id)}
                onLeave={() => handleLeaveCommunity(community.id)}
                onClick={() => navigate(`/app/community-chat/${community.id}`)}
                icon={getIcon('crop')}
              />
            ))}
          </TabsContent>
          
          <TabsContent value="practice" className="space-y-3 mt-0">
            {filterByType('practice').map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                isJoined={joinedCommunities.includes(community.id)}
                onJoin={() => handleJoinCommunity(community.id)}
                onLeave={() => handleLeaveCommunity(community.id)}
                onClick={() => navigate(`/app/community-chat/${community.id}`)}
                icon={getIcon('practice')}
              />
            ))}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function CommunityCard({ community, isJoined, onJoin, onLeave, icon, onClick }: any) {
  const [isJoining, setIsJoining] = useState(false);
  
  const handleAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsJoining(true);
    try {
      if (isJoined) {
        await onLeave();
      } else {
        await onJoin();
      }
    } finally {
      setIsJoining(false);
    }
  };
  
  return (
    <Card 
      className="group relative overflow-hidden cursor-pointer transition-all duration-500 hover:shadow-2xl hover:scale-[1.01] border-border/30 bg-gradient-to-br from-card to-card/50"
      onClick={onClick}
    >
      {/* Premium gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* Animated border gradient */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-700 -z-10" />
      
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-4 flex-1">
            {/* Modern icon container */}
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/10 to-accent/10 flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-lg">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                {icon}
              </div>
              {isJoined && (
                <>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background animate-pulse shadow-lg shadow-green-500/50" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-ping" />
                </>
              )}
            </div>
            
            <div className="flex-1 min-w-0 space-y-3">
              {/* Community name with gradient hover */}
              <div>
                <h3 className="font-bold text-lg text-foreground truncate group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-accent group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                  {community.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {community.description || 'Join this community to connect with like-minded farmers'}
                </p>
              </div>
              
              {/* Enhanced stats badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs bg-gradient-to-r from-secondary/60 to-secondary/40 border-secondary/30 backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
                  <Users className="w-3 h-3 mr-1" />
                  <span className="font-semibold">{community.member_count || 0}</span>
                  <span className="opacity-75 ml-1">members</span>
                </Badge>
                
                <Badge variant="outline" className="text-xs bg-background/50 backdrop-blur-sm">
                  <MessageSquare className="w-3 h-3 mr-1 text-primary" />
                  <span className="font-semibold">{community.post_count || 0}</span>
                  <span className="opacity-75 ml-1">posts</span>
                </Badge>
                
                {community.is_verified && (
                  <Badge className="text-xs bg-gradient-to-r from-blue-500/10 to-blue-600/10 text-blue-600 border-blue-500/30">
                    <Check className="w-3 h-3 mr-1" />
                    Verified
                  </Badge>
                )}
                
                {community.trending_score > 50 && (
                  <Badge className="text-xs bg-gradient-to-r from-orange-500/10 to-red-500/10 text-orange-600 border-orange-500/30 animate-pulse">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Trending
                  </Badge>
                )}
                
                {/* New activity indicator */}
                {community.last_activity && (
                  <Badge variant="outline" className="text-xs border-yellow-500/30 bg-yellow-500/5">
                    <Sparkles className="w-3 h-3 mr-1 text-yellow-500" />
                    Active now
                  </Badge>
                )}
              </div>
              
              {/* Tags */}
              {community.tags && community.tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {community.tags.slice(0, 3).map((tag: string, index: number) => (
                    <span 
                      key={index}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Modern action button */}
          <Button
            size="sm"
            variant={isJoined ? "outline" : "default"}
            onClick={handleAction}
            disabled={isJoining}
            className={cn(
              "min-w-[85px] h-9 font-semibold transition-all duration-300 shadow-lg",
              isJoined 
                ? "border-border/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive hover:scale-105" 
                : "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 hover:scale-105 hover:shadow-xl hover:shadow-primary/25"
            )}
          >
            {isJoining ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                {isJoined ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Joined
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Join
                  </>
                )}
              </span>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}