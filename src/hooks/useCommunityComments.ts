import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';

export interface PostComment {
  id: string;
  post_id: string;
  farmer_id: string;
  tenant_id: string | null;
  parent_id: string | null;
  content: string;
  is_deleted: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  farmer?: {
    id: string;
    farmer_name: string | null;
    is_verified: boolean | null;
  } | null;
}

export function usePostComments(postId: string | null) {
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['post-comments', postId],
    queryFn: async () => {
      if (!postId || !user?.id || !tenant?.id) return [] as PostComment[];
      const authClient = supabaseWithAuth(user.id, tenant.id);
      const { data, error } = await authClient
        .from('post_comments' as any)
        .select(`
          *,
          farmer:farmers!post_comments_farmer_id_fkey (
            id, farmer_name, is_verified
          )
        `)
        .eq('post_id', postId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as PostComment[];
    },
    enabled: !!postId && !!user?.id && !!tenant?.id,
  });
}

export function useCreateComment() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      postId,
      content,
      parentId,
    }: {
      postId: string;
      content: string;
      parentId?: string;
    }) => {
      if (!user?.id || !tenant?.id) throw new Error('Not authenticated');
      const authClient = supabaseWithAuth(user.id, tenant.id);
      const { data, error } = await authClient
        .from('post_comments' as any)
        .insert({
          post_id: postId,
          farmer_id: user.id,
          tenant_id: tenant.id,
          content: content.trim(),
          parent_id: parentId || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['post-comments', vars.postId] });
      qc.invalidateQueries({ queryKey: ['community-posts'] });
    },
    onError: () => toast.error('Failed to post comment'),
  });
}

export function useReportPost() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ postId, reason }: { postId: string; reason: string }) => {
      if (!user?.id || !tenant?.id) throw new Error('Not authenticated');
      const authClient = supabaseWithAuth(user.id, tenant.id);
      const { error } = await authClient
        .from('post_reports' as any)
        .insert({
          post_id: postId,
          farmer_id: user.id,
          tenant_id: tenant.id,
          reason,
          status: 'pending',
        } as any);
      if (error && !`${error.message}`.includes('duplicate')) throw error;
    },
    onSuccess: () => toast.success('Post reported. Thank you for keeping the community safe.'),
    onError: () => toast.error('Failed to report post'),
  });
}
