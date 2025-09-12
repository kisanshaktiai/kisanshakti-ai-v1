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
  BookOpen, Zap
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
      className="group relative overflow-hidden p-4 cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] border-border/50"
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative flex items-start justify-between">
        <div className="flex gap-3 flex-1">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              {icon}
            </div>
            {isJoined && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {community.name}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {community.description || 'Join this community to connect with others'}
            </p>
            
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge variant="secondary" className="text-xs bg-secondary/50">
                <Users className="w-3 h-3 mr-1" />
                {community.member_count || 0} members
              </Badge>
              <Badge variant="outline" className="text-xs">
                <MessageSquare className="w-3 h-3 mr-1" />
                {community.post_count || 0} posts
              </Badge>
              {community.is_verified && (
                <Badge variant="default" className="text-xs bg-primary/10 text-primary">
                  <Check className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              )}
              {community.trending_score > 50 && (
                <Badge variant="destructive" className="text-xs bg-orange-500/10 text-orange-600">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Trending
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <Button
          size="sm"
          variant={isJoined ? "outline" : "default"}
          onClick={handleAction}
          disabled={isJoining}
          className={cn(
            "min-w-[80px] transition-all",
            isJoined ? "hover:bg-destructive hover:text-destructive-foreground hover:border-destructive" : ""
          )}
        >
          {isJoining ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            isJoined ? "Leave" : "Join"
          )}
        </Button>
      </div>
    </Card>
  );
}