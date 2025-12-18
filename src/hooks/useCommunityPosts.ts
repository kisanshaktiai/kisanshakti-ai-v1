import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';
import { useEffect } from 'react';

// Types matching the database schema
export interface SocialPost {
  id: string;
  farmer_id: string;
  tenant_id: string;
  content: string | null;
  language_code: string | null;
  media_urls: any | null;
  hashtags: string[] | null;
  post_type: string;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  saves_count: number | null;
  views_count: number | null;
  is_published: boolean | null;
  status: string | null;
  translations: any | null;
  metadata: any | null;
  location_data: any | null;
  created_at: string | null;
  updated_at: string | null;
  // Joined data
  farmer?: {
    id: string;
    farmer_name: string | null;
    farmer_code: string | null;
    location: string | null;
    is_verified: boolean | null;
  } | null;
}

export interface CreatePostInput {
  content: string;
  language_code: string;
  media_urls?: string[];
  hashtags?: string[];
  post_type?: string;
  location_data?: any;
}

// Fetch posts with farmer details
export function useCommunityPosts(options?: {
  filterByUser?: boolean;
  viewLanguage?: string;
}) {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['community-posts', tenant?.id, options?.filterByUser, user?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        console.log('[Community] No tenant ID available');
        return [];
      }

      // Use supabaseWithAuth to set custom headers for RLS
      const authClient = supabaseWithAuth(user?.id, tenant.id);
      
      let queryBuilder = authClient
        .from('social_posts')
        .select(`
          *,
          farmer:farmers!social_posts_farmer_id_fkey (
            id,
            farmer_name,
            farmer_code,
            location,
            is_verified
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter by current user if requested
      if (options?.filterByUser && user?.id) {
        queryBuilder = queryBuilder.eq('farmer_id', user.id);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        console.error('[Community] Error fetching posts:', error);
        throw error;
      }

      console.log('[Community] Fetched posts:', data?.length || 0);
      return (data || []) as unknown as SocialPost[];
    },
    enabled: !!tenant?.id,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Set up realtime subscription
  useEffect(() => {
    if (!tenant?.id) return;

    console.log('[Community] Setting up realtime subscription');
    
    const channel = supabase
      .channel(`community-posts-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'social_posts',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          console.log('[Community] Realtime event:', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['community-posts'] });
        }
      )
      .subscribe();

    return () => {
      console.log('[Community] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, queryClient]);

  return query;
}

// Create a new post
export function useCreatePost() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePostInput) => {
      if (!user?.id || !tenant?.id) {
        throw new Error('User or tenant not available');
      }

      console.log('[Community] Creating post with auth headers:', {
        farmerId: user.id,
        tenantId: tenant.id,
        contentLength: input.content.length,
      });

      // Extract hashtags from content if not provided
      const hashtagsFromContent = input.content.match(/#[\w\u0900-\u097F]+/g)?.map(tag => tag.slice(1)) || [];
      const allHashtags = [...new Set([...(input.hashtags || []), ...hashtagsFromContent])];

      // Use supabaseWithAuth to set custom headers for RLS
      const authClient = supabaseWithAuth(user.id, tenant.id);

      const { data, error } = await authClient
        .from('social_posts')
        .insert({
          farmer_id: user.id,
          tenant_id: tenant.id,
          content: input.content,
          language_code: input.language_code,
          media_urls: input.media_urls ? { images: input.media_urls } : null,
          hashtags: allHashtags.length > 0 ? allHashtags : null,
          post_type: input.post_type || (input.media_urls?.length ? 'image' : 'text'),
          location_data: input.location_data,
          is_published: true,
          status: 'published',
          likes_count: 0,
          comments_count: 0,
          shares_count: 0,
          saves_count: 0,
          views_count: 0,
        } as any)
        .select()
        .single();

      if (error) {
        console.error('[Community] Error creating post:', error);
        throw error;
      }

      console.log('[Community] Post created:', data.id);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      toast.success('Post shared with the community!');
    },
    onError: (error) => {
      console.error('[Community] Create post error:', error);
      toast.error('Failed to create post. Please try again.');
    },
  });
}

// Like/Unlike a post
export function useLikePost() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      if (!user?.id || !tenant?.id) {
        throw new Error('User not authenticated');
      }

      // Use supabaseWithAuth for RLS
      const authClient = supabaseWithAuth(user.id, tenant.id);

      if (isLiked) {
        // Unlike - remove from post_likes
        const { error } = await authClient
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('farmer_id', user.id);

        if (error) throw error;

        // Decrement likes_count manually
        const { data: post } = await authClient
          .from('social_posts')
          .select('likes_count')
          .eq('id', postId)
          .single();

        if (post) {
          await authClient
            .from('social_posts')
            .update({ likes_count: Math.max(0, (post.likes_count || 1) - 1) })
            .eq('id', postId);
        }
      } else {
        // Like - add to post_likes
        const { error } = await authClient
          .from('post_likes')
          .insert({
            post_id: postId,
            farmer_id: user.id,
          });

        if (error) throw error;

        // Increment likes_count manually
        const { data: post } = await authClient
          .from('social_posts')
          .select('likes_count')
          .eq('id', postId)
          .single();

        if (post) {
          await authClient
            .from('social_posts')
            .update({ likes_count: (post.likes_count || 0) + 1 })
            .eq('id', postId);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['user-post-likes'] });
    },
  });
}

// Save/Unsave a post
export function useSavePost() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, isSaved }: { postId: string; isSaved: boolean }) => {
      if (!user?.id || !tenant?.id) {
        throw new Error('User not authenticated');
      }

      // Use supabaseWithAuth for RLS
      const authClient = supabaseWithAuth(user.id, tenant.id);

      if (isSaved) {
        // Unsave - remove from post_saves
        const { error } = await authClient
          .from('post_saves')
          .delete()
          .eq('post_id', postId)
          .eq('farmer_id', user.id);

        if (error) throw error;
      } else {
        // Save - add to post_saves
        const { error } = await authClient
          .from('post_saves')
          .insert({
            post_id: postId,
            farmer_id: user.id,
          });

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['user-saved-posts'] });
      toast.success(variables.isSaved ? 'Post removed from saved' : 'Post saved!');
    },
  });
}

// Get user's liked post IDs
export function useUserLikedPosts() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['user-post-likes', user?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return [];

      const authClient = supabaseWithAuth(user.id, tenant.id);
      const { data, error } = await authClient
        .from('post_likes')
        .select('post_id')
        .eq('farmer_id', user.id);

      if (error) throw error;
      return data.map(item => item.post_id);
    },
    enabled: !!user?.id && !!tenant?.id,
  });
}

// Get user's saved post IDs
export function useUserSavedPosts() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['user-saved-posts', user?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return [];

      const authClient = supabaseWithAuth(user.id, tenant.id);
      const { data, error } = await authClient
        .from('post_saves')
        .select('post_id')
        .eq('farmer_id', user.id);

      if (error) throw error;
      return data.map(item => item.post_id);
    },
    enabled: !!user?.id && !!tenant?.id,
  });
}

// Fetch saved posts with full details
export function useSavedPostsFull() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['saved-posts-full', user?.id, tenant?.id],
    queryFn: async () => {
      if (!user?.id || !tenant?.id) return [];

      const authClient = supabaseWithAuth(user.id, tenant.id);

      // First get saved post IDs
      const { data: savedPosts, error: savedError } = await authClient
        .from('post_saves')
        .select('post_id')
        .eq('farmer_id', user.id)
        .order('saved_at', { ascending: false });

      if (savedError) throw savedError;
      if (!savedPosts?.length) return [];

      const postIds = savedPosts.map(s => s.post_id);

      // Then fetch the actual posts
      const { data, error } = await authClient
        .from('social_posts')
        .select(`
          *,
          farmer:farmers!social_posts_farmer_id_fkey (
            id,
            farmer_name,
            farmer_code,
            location,
            is_verified
          )
        `)
        .in('id', postIds);

      if (error) throw error;
      
      return (data || []) as unknown as SocialPost[];
    },
    enabled: !!user?.id && !!tenant?.id,
  });
}
