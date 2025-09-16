import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { PostCard } from './PostCard';
import { Loader2, Users, Sparkles } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';

interface SocialFeedProps {
  searchQuery?: string;
  selectedCommunity?: string | null;
}

export function SocialFeed({ searchQuery = '', selectedCommunity = null }: SocialFeedProps) {
  const { user } = useAuthStore();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
    subscribeToNewPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('social_posts')
        .select(`
          *,
          farmer:farmers!social_posts_farmer_id_fkey(
            id,
            farmer_name,
            mobile_number
          ),
          community:communities(
            id,
            name,
            slug
          ),
          post_interactions!post_interactions_post_id_fkey(
            interaction_type,
            farmer_id
          ),
          post_comments!post_comments_post_id_fkey(
            id,
            content,
            farmer:farmers!post_comments_farmer_id_fkey(
              farmer_name
            ),
            created_at
          )
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToNewPosts = () => {
    const channel = supabase
      .channel('social-posts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_posts'
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleLike = async (postId: string) => {
    if (!user?.id) return;

    try {
      const { data: existing } = await supabase
        .from('post_interactions')
        .select()
        .eq('post_id', postId)
        .eq('farmer_id', user.id)
        .eq('interaction_type', 'like')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('post_interactions')
          .delete()
          .eq('id', existing.id);

        await supabase
          .from('social_posts')
          .update({ likes_count: posts.find(p => p.id === postId)?.likes_count - 1 })
          .eq('id', postId);
      } else {
        await supabase
          .from('post_interactions')
          .insert({
            post_id: postId,
            farmer_id: user.id,
            interaction_type: 'like'
          });

        await supabase
          .from('social_posts')
          .update({ likes_count: posts.find(p => p.id === postId)?.likes_count + 1 })
          .eq('id', postId);
      }

      fetchPosts();
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleShare = async (postId: string) => {
    if (!user?.id) return;

    try {
      await supabase
        .from('post_interactions')
        .insert({
          post_id: postId,
          farmer_id: user.id,
          interaction_type: 'share'
        });

      await supabase
        .from('social_posts')
        .update({ shares_count: posts.find(p => p.id === postId)?.shares_count + 1 })
        .eq('id', postId);

      fetchPosts();
    } catch (error) {
      console.error('Error sharing post:', error);
    }
  };

  const handleSave = async (postId: string) => {
    if (!user?.id) return;

    try {
      const { data: existing } = await supabase
        .from('post_interactions')
        .select()
        .eq('post_id', postId)
        .eq('farmer_id', user.id)
        .eq('interaction_type', 'save')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('post_interactions')
          .delete()
          .eq('id', existing.id);

        await supabase
          .from('social_posts')
          .update({ saves_count: posts.find(p => p.id === postId)?.saves_count - 1 })
          .eq('id', postId);
      } else {
        await supabase
          .from('post_interactions')
          .insert({
            post_id: postId,
            farmer_id: user.id,
            interaction_type: 'save'
          });

        await supabase
          .from('social_posts')
          .update({ saves_count: posts.find(p => p.id === postId)?.saves_count + 1 })
          .eq('id', postId);
      }

      fetchPosts();
    } catch (error) {
      console.error('Error toggling save:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 animate-pulse" />
            <div className="absolute inset-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-transparent animate-ping" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Loading posts</p>
            <p className="text-xs text-muted-foreground">Fetching latest updates...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const filteredPosts = posts.filter(post => {
    if (selectedCommunity) {
      return post.community?.id === selectedCommunity;
    }
    if (searchQuery) {
      return post.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
             post.farmer?.farmer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="relative">
      <ScrollArea className="h-[calc(100dvh-10rem)] md:h-[calc(100vh-12rem)]">
        <AnimatePresence mode="wait">
          {filteredPosts.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[50vh] px-4 py-16"
            >
              <motion.div 
                className="relative mb-6"
                animate={{ 
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.05, 1]
                }}
                transition={{ 
                  duration: 4,
                  repeat: Infinity,
                  repeatType: "reverse"
                }}
              >
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center backdrop-blur-sm">
                  <Sparkles className="w-10 h-10 text-primary/60" />
                </div>
              </motion.div>
              <div className="text-center space-y-2 max-w-sm">
                <h3 className="text-lg font-semibold text-foreground">No posts yet</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Be the first to share your farming experiences and connect with the community
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="posts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="divide-y divide-border/20 pb-20"
            >
              {filteredPosts.map((post, index) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    transition: { 
                      delay: index * 0.05,
                      duration: 0.3,
                      ease: "easeOut"
                    }
                  }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <PostCard
                    post={post}
                    onLike={() => handleLike(post.id)}
                    onShare={() => handleShare(post.id)}
                    onSave={() => handleSave(post.id)}
                    isLiked={post.post_interactions?.some(
                      (i: any) => i.farmer_id === user?.id && i.interaction_type === 'like'
                    )}
                    isSaved={post.post_interactions?.some(
                      (i: any) => i.farmer_id === user?.id && i.interaction_type === 'save'
                    )}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}