import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
  Users, MessageSquare, Calendar, MapPin, Settings, 
  Share2, ArrowLeft, Bell, UserPlus, Shield, Edit,
  Hash, TrendingUp, Activity, Star, Award, Info
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { PostCard } from './PostCard';
import { format } from 'date-fns';

interface Member {
  id: string;
  farmer_id: string;
  role: string;
  joined_at: string;
  farmer: {
    name: string;
    location?: string;
  };
  is_online?: boolean;
}

interface CommunityPost {
  id: string;
  content: string;
  created_at: string;
  farmer: {
    name: string;
  };
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
}

export function CommunityPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  
  const [community, setCommunity] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (id) {
      fetchCommunityDetails();
      checkMembership();
      subscribeToRealtime();
    }
  }, [id, user]);

  const fetchCommunityDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setCommunity(data);

      // Fetch members
      const { data: membersData } = await supabase
        .from('community_members')
        .select(`
          *,
          farmer:farmers!community_members_farmer_id_fkey (
            farmer_name
          )
        `)
        .eq('community_id', id)
        .eq('is_active', true);

      if (membersData) {
        const formattedMembers = membersData.map(m => ({
          ...m,
          farmer: {
            name: m.farmer?.farmer_name || 'Unknown',
            location: null // Location not available yet
          }
        }));
        setMembers(formattedMembers);
        
        // Calculate online members (simulated)
        setOnlineCount(Math.floor(formattedMembers.length * 0.3));
      }

      // Since posts table was just created, it might be empty
      // We'll handle it gracefully
      setPosts([]);
    } catch (error) {
      console.error('Error fetching community:', error);
      toast({
        title: "Error",
        description: "Failed to load community details",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const checkMembership = async () => {
    if (!user?.id || !id) return;

    try {
      const { data, error } = await supabase
        .from('community_members')
        .select('id')
        .eq('community_id', id)
        .eq('farmer_id', user.id)
        .eq('is_active', true)
        .single();

      setIsJoined(!!data);
    } catch (error) {
      setIsJoined(false);
    }
  };

  const handleJoinCommunity = async () => {
    if (!user?.id) {
      toast({
        title: "Authentication required",
        description: "Please login to join this community",
        variant: "destructive"
      });
      return;
    }

    try {
      // Get the current user session to ensure we have the right auth context
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Session expired",
          description: "Please login again",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('community_members')
        .insert({
          community_id: id,
          farmer_id: user.id,
          role: 'member'
        });

      if (error) throw error;

      setIsJoined(true);
      toast({
        title: "Welcome!",
        description: "You've joined the community"
      });
      
      // Refresh members list
      fetchCommunityDetails();
    } catch (error) {
      console.error('Error joining community:', error);
      toast({
        title: "Error",
        description: "Failed to join community",
        variant: "destructive"
      });
    }
  };

  const handleLeaveCommunity = async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('farmer_id', user.id);

      if (error) throw error;

      setIsJoined(false);
      toast({
        title: "Left community",
        description: "You've left the community"
      });
      
      // Refresh members list
      fetchCommunityDetails();
    } catch (error) {
      console.error('Error leaving community:', error);
      toast({
        title: "Error",
        description: "Failed to leave community",
        variant: "destructive"
      });
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.trim() || !user?.id) return;

    try {
      const { error } = await supabase
        .from('posts')
        .insert({
          content: newPost,
          farmer_id: user.id,
          community_id: id,
          post_type: 'community'
        });

      if (error) throw error;

      setNewPost('');
      toast({
        title: "Posted!",
        description: "Your post has been shared"
      });
      
      // Refresh posts
      fetchCommunityDetails();
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        title: "Error",
        description: "Failed to create post",
        variant: "destructive"
      });
    }
  };

  const handleLikePost = (postId: string) => {
    // Implement like functionality
    console.log('Like post:', postId);
  };

  const handleSharePost = (postId: string) => {
    // Implement share functionality
    console.log('Share post:', postId);
  };

  const handleSavePost = (postId: string) => {
    // Implement save functionality
    console.log('Save post:', postId);
  };

  const subscribeToRealtime = () => {
    const channel = supabase
      .channel(`community-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_members',
          filter: `community_id=eq.${id}`
        },
        () => {
          fetchCommunityDetails();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: `community_id=eq.${id}`
        },
        () => {
          fetchCommunityDetails();
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineMembers = Object.keys(state).length;
        setOnlineCount(onlineMembers);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading community...</p>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Community not found</p>
        <Button onClick={() => navigate('/app/social')}>Back to Social</Button>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 space-y-4">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/app/social')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">{community.name}</h1>
              <p className="text-muted-foreground mt-1">{community.description}</p>
              
              <div className="flex items-center gap-4 mt-4">
                <Badge variant="secondary">
                  <Users className="w-3 h-3 mr-1" />
                  {members.length} members
                </Badge>
                <Badge variant="outline" className="text-success">
                  <Activity className="w-3 h-3 mr-1" />
                  {onlineCount} online
                </Badge>
                <Badge variant="outline">
                  <MessageSquare className="w-3 h-3 mr-1" />
                  {posts.length} posts
                </Badge>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!isJoined ? (
              <Button onClick={handleJoinCommunity}>
                <UserPlus className="w-4 h-4 mr-2" />
                Join Community
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleLeaveCommunity}>
                  Leave
                </Button>
                <Button variant="ghost" size="icon">
                  <Bell className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Share2 className="w-5 h-5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Main Content */}
      {!isJoined ? (
        <Card className="p-12">
          <div className="text-center space-y-4">
            <Shield className="w-16 h-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Join to participate</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Join this community to view posts, chat with members, and participate in discussions.
            </p>
            <Button onClick={handleJoinCommunity} size="lg">
              <UserPlus className="w-4 h-4 mr-2" />
              Join Community
            </Button>
          </div>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="chat">
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="feed">
              <Hash className="w-4 h-4 mr-2" />
              Feed
            </TabsTrigger>
            <TabsTrigger value="members">
              <Users className="w-4 h-4 mr-2" />
              Members
            </TabsTrigger>
            <TabsTrigger value="about">
              <Info className="w-4 h-4 mr-2" />
              About
            </TabsTrigger>
          </TabsList>

          {/* Chat Tab */}
          <TabsContent value="chat">
            <Card className="flex items-center justify-center py-12">
              <div className="text-center space-y-4 max-w-md">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground" />
                <h3 className="text-lg font-semibold">Join the conversation</h3>
                <p className="text-sm text-muted-foreground">
                  Connect with other farmers in real-time chat
                </p>
                <Button 
                  onClick={() => navigate(`/app/community/${id}/chat`)}
                  className="bg-gradient-to-r from-primary to-primary/80"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Open Chat Room
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Feed Tab */}
          <TabsContent value="feed" className="space-y-4">
            <Card className="p-4">
              <Textarea
                placeholder="Share something with the community..."
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                className="min-h-[100px]"
              />
              <div className="flex justify-end mt-2">
                <Button 
                  onClick={handleCreatePost}
                  disabled={!newPost.trim()}
                >
                  Post
                </Button>
              </div>
            </Card>

            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={{
                      id: post.id,
                      content: post.content,
                      created_at: post.created_at,
                      farmer_id: '',
                      farmer: post.farmer,
                      likes_count: post.likes_count,
                      comments_count: post.comments_count,
                      shares_count: 0,
                      is_liked: post.is_liked,
                      media_urls: [],
                      post_type: 'community'
                    }}
                    onLike={() => handleLikePost(post.id)}
                    onShare={() => handleSharePost(post.id)}
                    onSave={() => handleSavePost(post.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <Card>
              <ScrollArea className="h-[600px]">
                <div className="p-4 space-y-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {member.farmer.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div>
                          <p className="font-medium text-foreground">{member.farmer.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {member.farmer.location && (
                              <>
                                <MapPin className="w-3 h-3" />
                                <span>{member.farmer.location}</span>
                              </>
                            )}
                            {member.role === 'admin' && (
                              <Badge variant="secondary" className="text-xs">Admin</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {member.is_online && (
                          <div className="w-2 h-2 bg-success rounded-full" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          Joined {format(new Date(member.joined_at), 'MMM yyyy')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>

          {/* About Tab */}
          <TabsContent value="about">
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Description</h3>
                  <p className="text-muted-foreground">{community.description}</p>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Community Type</h3>
                  <Badge variant="outline">{community.community_type}</Badge>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Created</h3>
                  <p className="text-muted-foreground">
                    {format(new Date(community.created_at), 'MMMM d, yyyy')}
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Statistics</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-primary">{members.length}</p>
                      <p className="text-sm text-muted-foreground">Members</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-primary">{posts.length}</p>
                      <p className="text-sm text-muted-foreground">Posts</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-primary">{onlineCount}</p>
                      <p className="text-sm text-muted-foreground">Online</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}