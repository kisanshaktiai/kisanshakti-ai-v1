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
  Hash, TrendingUp, Activity, Star, Award
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
    avatar_url?: string;
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
    avatar_url?: string;
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
  const [isMember, setIsMember] = useState(false);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('feed');
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (id) {
      fetchCommunityDetails();
      fetchMembers();
      fetchPosts();
      checkMembership();
      subscribeToRealtime();
    }
  }, [id, user]);

  const subscribeToRealtime = () => {
    // Subscribe to community posts
    const postsChannel = supabase
      .channel(`community-posts-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_posts',
          filter: `community_id=eq.${id}`
        },
        (payload) => {
          fetchPosts();
          toast({
            title: "New post",
            description: "Someone posted in the community"
          });
        }
      )
      .subscribe();

    // Subscribe to member changes
    const membersChannel = supabase
      .channel(`community-members-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_members',
          filter: `community_id=eq.${id}`
        },
        () => {
          fetchMembers();
          fetchCommunityDetails();
        }
      )
      .subscribe();

    // Track online presence
    const presenceChannel = supabase
      .channel(`community-presence-${id}`)
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setOnlineCount(Object.keys(state).length);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && user?.id) {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(presenceChannel);
    };
  };

  const fetchCommunityDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setCommunity(data);
    } catch (error) {
      console.error('Error fetching community:', error);
      toast({
        title: "Error",
        description: "Failed to load community details",
        variant: "destructive"
      });
    }
  };

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('community_members')
        .select(`
          *,
          farmer:farmers(farmer_name, mobile_number, metadata)
        `)
        .eq('community_id', id)
        .eq('is_active', true)
        .order('joined_at', { ascending: false });

      if (error) throw error;
      
      // Transform data to match Member interface
      const transformedMembers = data?.map(member => ({
        ...member,
        farmer: {
          name: member.farmer?.farmer_name || 'Unknown Farmer',
          avatar_url: undefined,
          location: typeof member.farmer?.metadata === 'object' && member.farmer?.metadata !== null 
            ? (member.farmer.metadata as any).location || 'Location not specified'
            : 'Location not specified'
        }
      })) || [];
      
      setMembers(transformedMembers);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('social_posts')
        .select(`
          *,
          farmer:farmers(farmer_name, metadata),
          post_likes(id, farmer_id),
          post_comments(id)
        `)
        .eq('community_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const postsWithCounts = data?.map(post => ({
        id: post.id,
        content: post.content || '',
        created_at: post.created_at || new Date().toISOString(),
        farmer: {
          name: post.farmer?.farmer_name || 'Unknown Farmer',
          avatar_url: undefined
        },
        likes_count: post.post_likes?.length || 0,
        comments_count: post.post_comments?.length || 0,
        is_liked: post.post_likes?.some((like: any) => like.farmer_id === user?.id) || false
      })) || [];

      setPosts(postsWithCounts);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkMembership = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('community_members')
        .select('role')
        .eq('community_id', id)
        .eq('farmer_id', user.id)
        .eq('is_active', true)
        .single();

      if (data) {
        setIsMember(true);
        setMemberRole(data.role);
      }
    } catch (error) {
      console.error('Error checking membership:', error);
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
      const { error } = await supabase
        .from('community_members')
        .insert({
          community_id: id,
          farmer_id: user.id,
          role: 'member'
        });

      if (error) throw error;

      setIsMember(true);
      setMemberRole('member');
      fetchMembers();
      fetchCommunityDetails();
      
      toast({
        title: "Welcome!",
        description: `You've joined ${community?.name}`
      });
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

      setIsMember(false);
      setMemberRole(null);
      fetchMembers();
      fetchCommunityDetails();
      
      toast({
        title: "Left community",
        description: `You've left ${community?.name}`
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

  const handleCreatePost = async () => {
    if (!newPost.trim() || !user?.id) return;

    try {
      const { error } = await supabase
        .from('social_posts')
        .insert({
          content: newPost,
          farmer_id: user.id,
          community_id: id,
          post_type: 'text'
        });

      if (error) throw error;

      setNewPost('');
      fetchPosts();
      
      toast({
        title: "Posted!",
        description: "Your post has been shared with the community"
      });
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        title: "Error",
        description: "Failed to create post",
        variant: "destructive"
      });
    }
  };

  const handleInviteMember = () => {
    // TODO: Implement invite functionality
    toast({
      title: "Coming soon",
      description: "Invite functionality will be available soon"
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold mb-2">Community not found</h2>
        <Button onClick={() => navigate('/app/social')}>
          Back to Communities
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/app/social')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <div className="flex gap-2">
              {isMember ? (
                <>
                  {memberRole === 'admin' && (
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleInviteMember}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleLeaveCommunity}>
                    Leave
                  </Button>
                </>
              ) : (
                <Button onClick={handleJoinCommunity}>
                  Join Community
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-10 w-10 text-primary" />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">{community.name}</h1>
                {community.is_verified && (
                  <Badge variant="default" className="gap-1">
                    <Shield className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </div>
              
              <p className="text-muted-foreground mb-4">{community.description}</p>
              
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{community.member_count || 0}</span>
                  <span className="text-muted-foreground">members</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-success" />
                  <span className="font-medium text-success">{onlineCount}</span>
                  <span className="text-muted-foreground">online now</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{community.post_count || 0}</span>
                  <span className="text-muted-foreground">posts</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Created {format(new Date(community.created_at), 'MMM yyyy')}
                  </span>
                </div>
                
                {community.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{community.location}</span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 mt-4">
                {community.tags?.map((tag: string) => (
                  <Badge key={tag} variant="secondary">
                    <Hash className="h-3 w-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="space-y-4">
          {isMember && (
            <Card>
              <CardContent className="p-4">
                <Textarea
                  placeholder="Share something with the community..."
                  value={newPost}
                  onChange={(e) => setNewPost(e.target.value)}
                  className="mb-3"
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button 
                    onClick={handleCreatePost}
                    disabled={!newPost.trim()}
                  >
                    Post to Community
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {posts.length > 0 ? (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLike={() => {}}
                  onShare={() => {}}
                  onSave={() => {}}
                  isLiked={post.is_liked || false}
                  isSaved={false}
                />
              ))
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No posts yet. Be the first to share!</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Community Members</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.farmer?.avatar_url} />
                          <AvatarFallback>
                            {member.farmer?.name?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{member.farmer?.name}</p>
                            {member.role === 'admin' && (
                              <Badge variant="default" className="text-xs">
                                Admin
                              </Badge>
                            )}
                            {member.role === 'moderator' && (
                              <Badge variant="secondary" className="text-xs">
                                Moderator
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {member.farmer?.location || 'Location not specified'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Joined {format(new Date(member.joined_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardContent className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No upcoming events</h3>
              <p className="text-muted-foreground">Community events will appear here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle>About This Community</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2">Description</h4>
                <p className="text-muted-foreground">{community.description}</p>
              </div>
              
              {community.rules && (
                <div>
                  <h4 className="font-semibold mb-2">Community Rules</h4>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {community.rules.map((rule: string, index: number) => (
                      <li key={index}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <h4 className="font-semibold mb-2">Statistics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Growth Rate</span>
                    </div>
                    <p className="text-2xl font-bold">+12%</p>
                    <p className="text-xs text-muted-foreground">This month</p>
                  </div>
                  
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-muted-foreground">Activity Score</span>
                    </div>
                    <p className="text-2xl font-bold">8.5/10</p>
                    <p className="text-xs text-muted-foreground">Very active</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-2">Top Contributors</h4>
                <div className="space-y-2">
                  {members.slice(0, 3).map((member, index) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <Award className={`h-5 w-5 ${
                        index === 0 ? 'text-yellow-500' : 
                        index === 1 ? 'text-gray-400' : 
                        'text-orange-500'
                      }`} />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.farmer?.avatar_url} />
                        <AvatarFallback>
                          {member.farmer?.name?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{member.farmer?.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}