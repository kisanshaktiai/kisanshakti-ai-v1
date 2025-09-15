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
  BookOpen, Zap, Plus, Star, Shield, Hash, Flame,
  Award, Crown, Heart, ArrowRight, Circle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
          <AnimatePresence mode="wait">
            <TabsContent value="all" className="mt-2">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3 pb-4"
              >
                {filteredCommunities.map((community, index) => (
                  <motion.div
                    key={community.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0,
                      transition: { delay: index * 0.05 }
                    }}
                  >
                    <ModernCommunityCard
                      community={community}
                      isJoined={joinedCommunities.includes(community.id)}
                      onJoin={() => handleJoinCommunity(community.id)}
                      onLeave={() => handleLeaveCommunity(community.id)}
                      onClick={() => {
                        if (onCommunitySelect) {
                          onCommunitySelect(community.id);
                        } else {
                          navigate(`/app/community/${community.id}/chat`);
                        }
                      }}
                      icon={getIcon(community.community_type)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </TabsContent>
          </AnimatePresence>
          
          <TabsContent value="state" className="mt-2">
            <motion.div className="space-y-3 pb-4">
              {filterByType('state').map((community, index) => (
                <motion.div
                  key={community.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    transition: { delay: index * 0.05 }
                  }}
                >
                  <ModernCommunityCard
                    community={community}
                    isJoined={joinedCommunities.includes(community.id)}
                    onJoin={() => handleJoinCommunity(community.id)}
                    onLeave={() => handleLeaveCommunity(community.id)}
                    onClick={() => navigate(`/app/community/${community.id}/chat`)}
                    icon={getIcon('state')}
                  />
                </motion.div>
              ))}
            </motion.div>
          </TabsContent>
          
          <TabsContent value="crop" className="mt-2">
            <motion.div className="space-y-3 pb-4">
              {filterByType('crop').map((community, index) => (
                <motion.div
                  key={community.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    transition: { delay: index * 0.05 }
                  }}
                >
                  <ModernCommunityCard
                    community={community}
                    isJoined={joinedCommunities.includes(community.id)}
                    onJoin={() => handleJoinCommunity(community.id)}
                    onLeave={() => handleLeaveCommunity(community.id)}
                    onClick={() => navigate(`/app/community/${community.id}/chat`)}
                    icon={getIcon('crop')}
                  />
                </motion.div>
              ))}
            </motion.div>
          </TabsContent>
          
          <TabsContent value="practice" className="mt-2">
            <motion.div className="space-y-3 pb-4">
              {filterByType('practice').map((community, index) => (
                <motion.div
                  key={community.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    transition: { delay: index * 0.05 }
                  }}
                >
                  <ModernCommunityCard
                    community={community}
                    isJoined={joinedCommunities.includes(community.id)}
                    onJoin={() => handleJoinCommunity(community.id)}
                    onLeave={() => handleLeaveCommunity(community.id)}
                    onClick={() => navigate(`/app/community/${community.id}/chat`)}
                    icon={getIcon('practice')}
                  />
                </motion.div>
              ))}
            </motion.div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function ModernCommunityCard({ community, isJoined, onJoin, onLeave, icon, onClick }: any) {
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
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="relative"
    >
      <Card 
        className={cn(
          "group relative overflow-hidden cursor-pointer",
          "bg-gradient-to-br from-card/80 via-card/60 to-card/40",
          "backdrop-blur-xl border-border/30",
          "transition-all duration-500",
          "hover:shadow-2xl hover:shadow-primary/10",
          "hover:border-primary/30",
          isJoined && "ring-1 ring-primary/20 bg-gradient-to-br from-primary/5 via-card/60 to-card/40"
        )}
        onClick={onClick}
      >
        {/* Premium animated background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-0 group-hover:opacity-100 transition-all duration-700" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
        
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4 flex-1">
              {/* Ultra Modern Icon Container */}
              <motion.div 
                className="relative"
                whileHover={{ rotate: [0, -5, 5, 0] }}
                transition={{ duration: 0.5 }}
              >
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center",
                  "bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10",
                  "shadow-lg group-hover:shadow-xl group-hover:shadow-primary/20",
                  "transition-all duration-300 group-hover:scale-110",
                  "relative overflow-hidden"
                )}>
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10 text-primary">{icon}</div>
                </div>
                {isJoined && (
                  <>
                    <motion.div 
                      className="absolute -top-1 -right-1"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500 }}
                    >
                      <div className="relative">
                        <div className="w-4 h-4 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-background shadow-lg" />
                        <div className="absolute inset-0 w-4 h-4 bg-green-500 rounded-full animate-ping" />
                      </div>
                    </motion.div>
                  </>
                )}
              </motion.div>
              
              <div className="flex-1 min-w-0 space-y-3">
                {/* Premium Community Name */}
                <div>
                  <h3 className={cn(
                    "font-bold text-lg truncate",
                    "bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent",
                    "group-hover:from-primary group-hover:to-accent",
                    "transition-all duration-500"
                  )}>
                    {community.name}
                  </h3>
                  <p className="text-sm text-muted-foreground/80 mt-1 line-clamp-2 leading-relaxed">
                    {community.description || 'Connect with farmers and share knowledge'}
                  </p>
                </div>
                
                {/* Ultra Modern Stats Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gradient-to-r from-muted/50 to-muted/30 backdrop-blur-sm">
                    <Circle className="w-2 h-2 fill-green-500 text-green-500 animate-pulse" />
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">{community.member_count || 0}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gradient-to-r from-muted/50 to-muted/30 backdrop-blur-sm">
                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">{community.post_count || 0}</span>
                  </div>
                </div>

                {/* Premium Badges Row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {community.is_verified && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.1 }}
                    >
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-gradient-to-r from-blue-500/20 to-blue-600/20 text-blue-600 border-blue-500/30">
                        <Shield className="w-3 h-3 mr-0.5" />
                        Verified
                      </Badge>
                    </motion.div>
                  )}
                  
                  {(community.trending_score > 50 || Math.random() > 0.7) && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.2 }}
                    >
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-600 border-orange-500/30">
                        <Flame className="w-3 h-3 mr-0.5 animate-pulse" />
                        Hot
                      </Badge>
                    </motion.div>
                  )}
                  
                  {Math.random() > 0.5 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.3 }}
                    >
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-600 border-purple-500/30">
                        <Crown className="w-3 h-3 mr-0.5" />
                        Premium
                      </Badge>
                    </motion.div>
                  )}
                </div>
                
                {/* Trending Tags */}
                {community.tags && community.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {community.tags.slice(0, 3).map((tag: string, index: number) => (
                      <motion.span 
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-muted/60 to-muted/40 text-muted-foreground font-medium"
                      >
                        #{tag}
                      </motion.span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Ultra Modern Action Button */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                size="sm"
                variant={isJoined ? "outline" : "default"}
                onClick={handleAction}
                disabled={isJoining}
                className={cn(
                  "relative min-w-[90px] h-10 font-semibold",
                  "transition-all duration-500",
                  "shadow-lg hover:shadow-xl",
                  isJoined 
                    ? "bg-card/50 border-success/30 text-success hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30" 
                    : "bg-gradient-to-r from-primary via-primary/90 to-primary/80 hover:from-primary/90 hover:via-primary/80 hover:to-primary/70 text-primary-foreground border-0 shadow-primary/25"
                )}
              >
                {isJoining ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                  />
                ) : (
                  <span className="flex items-center gap-1.5">
                    {isJoined ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Joined</span>
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4" />
                        <span>Join</span>
                      </>
                    )}
                  </span>
                )}
              </Button>
            </motion.div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}