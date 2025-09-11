import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { PostCard } from './PostCard';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-12rem)]">
      <div className="divide-y">
        {posts.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-muted-foreground">No posts yet. Be the first to share!</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
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
          ))
        )}
      </div>
    </ScrollArea>
  );
}