import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { MapPin, Wheat, Languages, Users, Search, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
    // Get farmer ID from session
    const session = localStorage.getItem('farmSession');
    if (session) {
      const sessionData = JSON.parse(session);
      setFarmerId(sessionData.farmerId);
      fetchJoinedCommunities(sessionData.farmerId);
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
      const { error } = await supabase
        .from('community_members')
        .insert({
          community_id: communityId,
          farmer_id: farmerId,
          role: 'member'
        });

      if (error) throw error;

      setJoinedCommunities([...joinedCommunities, communityId]);
      toast({
        title: "Success!",
        description: "You've joined the community"
      });
    } catch (error) {
      console.error('Error joining community:', error);
      toast({
        title: "Error",
        description: "Failed to join community. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleLeaveCommunity = async (communityId: string) => {
    if (!farmerId) return;

    try {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', communityId)
        .eq('farmer_id', farmerId);

      if (error) throw error;

      setJoinedCommunities(joinedCommunities.filter(id => id !== communityId));
      toast({
        title: "Left community",
        description: "You've left the community"
      });
    } catch (error) {
      console.error('Error leaving community:', error);
      toast({
        title: "Error",
        description: "Failed to leave community",
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
  return (
    <Card className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="font-medium">{community.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{community.description}</p>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="secondary" className="text-xs">
                {community.member_count || 0} members
              </Badge>
              <Badge variant="outline" className="text-xs">
                {community.post_count || 0} posts
              </Badge>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant={isJoined ? "outline" : "default"}
          onClick={(e) => {
            e.stopPropagation();
            isJoined ? onLeave() : onJoin();
          }}
        >
          {isJoined ? "Leave" : "Join"}
        </Button>
      </div>
    </Card>
  );
}