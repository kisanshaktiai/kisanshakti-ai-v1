import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  User, Trophy, Award, MapPin, Calendar, Edit, 
  MessageSquare, Users, Wheat, TrendingUp 
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface UserProfileProps {
  userId?: string;
  isOwnProfile?: boolean;
}

export function UserProfile({ userId, isOwnProfile = false }: UserProfileProps) {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchProfile();
      fetchStats();
      fetchPosts();
      fetchAchievements();
    }
  }, [userId]);

  const fetchProfile = async () => {
    try {
      const { data } = await supabase
        .from('farmers')
        .select('*')
        .eq('id', userId)
        .single();
      
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await supabase
        .from('farmer_gamification')
        .select('*')
        .eq('farmer_id', userId)
        .maybeSingle();
      
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    try {
      const { data } = await supabase
        .from('social_posts')
        .select('*')
        .eq('farmer_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  };

  const fetchAchievements = async () => {
    try {
      const { data } = await supabase
        .from('farmer_achievements')
        .select(`
          *,
          achievement:achievements(*)
        `)
        .eq('farmer_id', userId);
      
      setAchievements(data || []);
    } catch (error) {
      console.error('Error fetching achievements:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground">Profile not found</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="text-2xl">
                <User className="w-10 h-10" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold">{profile.farmer_name || 'Farmer'}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {profile.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="secondary">
                  <Trophy className="w-3 h-3 mr-1" />
                  Level {stats?.current_level || 1}
                </Badge>
                <Badge variant="outline">
                  {stats?.total_points || 0} Points
                </Badge>
              </div>
            </div>
          </div>
          {isOwnProfile && (
            <Button variant="outline" size="sm">
              <Edit className="w-4 h-4 mr-2" />
              Edit Profile
            </Button>
          )}
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{posts.length}</p>
              <p className="text-sm text-muted-foreground">Posts</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Wheat className="w-5 h-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Communities</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{achievements.length}</p>
              <p className="text-sm text-muted-foreground">Achievements</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="posts" className="flex-1">Posts</TabsTrigger>
          <TabsTrigger value="achievements" className="flex-1">Achievements</TabsTrigger>
          <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => (
              <Card key={post.id} className="p-4">
                <p className="text-sm">{post.content}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                </p>
              </Card>
            ))
          ) : (
            <Card className="p-6">
              <p className="text-center text-muted-foreground">No posts yet</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="achievements" className="space-y-4">
          {achievements.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {achievements.map((item) => (
                <Card key={item.id} className="p-4 text-center">
                  <Award className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="font-medium text-sm">{item.achievement?.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(item.earned_at), { addSuffix: true })}
                  </p>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6">
              <p className="text-center text-muted-foreground">No achievements yet</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <TrendingUp className="w-5 h-5" />
              <p>Activity feed coming soon</p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}