import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';

export type ReactionType = 'helpful' | 'tried' | 'thanks';

interface ReactionCounts {
  helpful: number;
  tried: number;
  thanks: number;
}

// Fetch reaction counts for a post
export function usePostReactionCounts(postId: string) {
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['post-reaction-counts', postId],
    queryFn: async (): Promise<ReactionCounts> => {
      if (!tenant?.id) return { helpful: 0, tried: 0, thanks: 0 };

      const authClient = supabaseWithAuth(user?.id, tenant.id);
      
      const { data, error } = await authClient
        .from('post_reactions')
        .select('reaction_type')
        .eq('post_id', postId);

      if (error) throw error;

      const counts: ReactionCounts = { helpful: 0, tried: 0, thanks: 0 };
      data?.forEach((r: { reaction_type: ReactionType }) => {
        if (counts[r.reaction_type] !== undefined) {
          counts[r.reaction_type]++;
        }
      });

      return counts;
    },
    enabled: !!postId && !!tenant?.id,
    staleTime: 30000,
  });
}

// Fetch user's reactions for multiple posts
export function useUserReactions() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['user-reactions', user?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return {};

      const authClient = supabaseWithAuth(user.id, tenant.id);
      
      const { data, error } = await authClient
        .from('post_reactions')
        .select('post_id, reaction_type')
        .eq('farmer_id', user.id);

      if (error) throw error;

      // Group reactions by post_id
      const userReactions: Record<string, ReactionType[]> = {};
      data?.forEach((r: { post_id: string; reaction_type: ReactionType }) => {
        if (!userReactions[r.post_id]) {
          userReactions[r.post_id] = [];
        }
        userReactions[r.post_id].push(r.reaction_type);
      });

      return userReactions;
    },
    enabled: !!user?.id && !!tenant?.id,
  });
}

// Add/remove a reaction
export function useToggleReaction() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      postId, 
      reactionType, 
      hasReaction 
    }: { 
      postId: string; 
      reactionType: ReactionType; 
      hasReaction: boolean;
    }) => {
      if (!user?.id || !tenant?.id) {
        throw new Error('User not authenticated');
      }

      const authClient = supabaseWithAuth(user.id, tenant.id);

      if (hasReaction) {
        // Remove reaction
        const { error } = await authClient
          .from('post_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('farmer_id', user.id)
          .eq('reaction_type', reactionType);

        if (error) throw error;

        // Update count on social_posts
        const countColumn = `${reactionType}_count`;
        const { data: post } = await authClient
          .from('social_posts')
          .select(countColumn)
          .eq('id', postId)
          .single();

        if (post) {
          await authClient
            .from('social_posts')
            .update({ [countColumn]: Math.max(0, ((post as any)[countColumn] || 1) - 1) })
            .eq('id', postId);
        }
      } else {
        // Add reaction
        const { error } = await authClient
          .from('post_reactions')
          .insert({
            post_id: postId,
            farmer_id: user.id,
            reaction_type: reactionType,
          });

        if (error) throw error;

        // Update count on social_posts
        const countColumn = `${reactionType}_count`;
        const { data: post } = await authClient
          .from('social_posts')
          .select(countColumn)
          .eq('id', postId)
          .single();

        if (post) {
          await authClient
            .from('social_posts')
            .update({ [countColumn]: ((post as any)[countColumn] || 0) + 1 })
            .eq('id', postId);
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['post-reaction-counts', variables.postId] });
      queryClient.invalidateQueries({ queryKey: ['user-reactions'] });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
  });
}
