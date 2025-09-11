import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, MapPin, Sprout, BookOpen, TrendingUp, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

export function Communities() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [communities, setCommunities] = useState<any[]>([]);
  const [joinedCommunities, setJoinedCommunities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommunities();
    fetchJoinedCommunities();
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

  const fetchJoinedCommunities = async () => {
    if (!user?.id) return;

    try {
      const { data } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('farmer_id', user.id)
        .eq('is_active', true);

      setJoinedCommunities(data?.map(m => m.community_id) || []);
    } catch (error) {
      console.error('Error fetching joined communities:', error);
    }
  };

  const handleJoinCommunity = async (communityId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('community_members')
        .insert({
          community_id: communityId,
          farmer_id: user.id
        });

      if (error) throw error;

      setJoinedCommunities([...joinedCommunities, communityId]);
      
      toast({
        title: "Joined community!",
        description: "You are now part of this community."
      });

      // Update member count
      const community = communities.find(c => c.id === communityId);
      if (community) {
        await supabase
          .from('communities')
          .update({ member_count: (community.member_count || 0) + 1 })
          .eq('id', communityId);
      }
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
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', communityId)
        .eq('farmer_id', user.id);

      if (error) throw error;

      setJoinedCommunities(joinedCommunities.filter(id => id !== communityId));
      
      toast({
        title: "Left community",
        description: "You have left this community."
      });

      // Update member count
      const community = communities.find(c => c.id === communityId);
      if (community) {
        await supabase
          .from('communities')
          .update({ member_count: Math.max(0, (community.member_count || 0) - 1) })
          .eq('id', communityId);
      }
    } catch (error) {
      console.error('Error leaving community:', error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'state': return <MapPin className="w-4 h-4" />;
      case 'crop': return <Sprout className="w-4 h-4" />;
      case 'practice': return <BookOpen className="w-4 h-4" />;
      case 'market': return <TrendingUp className="w-4 h-4" />;
      case 'problem_solving': return <AlertCircle className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const filterByType = (type?: string) => {
    if (!type) return communities;
    return communities.filter(c => c.community_type === type);
  };

  return (
    <div className="p-4">
      <Tabs defaultValue="all">
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
          <TabsTrigger value="state" className="flex-1">State</TabsTrigger>
          <TabsTrigger value="crop" className="flex-1">Crop</TabsTrigger>
          <TabsTrigger value="practice" className="flex-1">Practice</TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[calc(100vh-16rem)] mt-4">
          <TabsContent value="all" className="space-y-3 mt-0">
            {filterByType().map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                isJoined={joinedCommunities.includes(community.id)}
                onJoin={() => handleJoinCommunity(community.id)}
                onLeave={() => handleLeaveCommunity(community.id)}
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
                icon={getIcon(community.community_type)}
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
                icon={getIcon(community.community_type)}
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
                icon={getIcon(community.community_type)}
              />
            ))}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function CommunityCard({ community, isJoined, onJoin, onLeave, icon }: any) {
  return (
    <Card className="p-4">
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
          onClick={isJoined ? onLeave : onJoin}
        >
          {isJoined ? "Leave" : "Join"}
        </Button>
      </div>
    </Card>
  );
}