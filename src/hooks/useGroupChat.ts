import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';

export interface GroupMessage {
  id: string;
  group_id: string;
  farmer_id: string;
  content: string;
  message_type: 'text' | 'voice' | 'image' | 'system';
  metadata: any;
  created_at: string;
  updated_at: string;
  // Joined data
  farmer?: {
    id: string;
    farmer_name: string | null;
  } | null;
}

// Fetch messages for a group
export function useGroupMessages(groupId: string | null) {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['group-messages', groupId],
    queryFn: async () => {
      if (!groupId || !tenant?.id) return [];

      const authClient = supabaseWithAuth(user?.id, tenant.id);
      
      const { data, error } = await authClient
        .from('group_chat_messages')
        .select(`
          *,
          farmer:farmers!group_chat_messages_farmer_id_fkey (
            id,
            farmer_name
          )
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('[GroupChat] Error fetching messages:', error);
        // Return empty array on error to prevent crash
        return [];
      }

      return (data || []) as unknown as GroupMessage[];
    },
    enabled: !!groupId && !!tenant?.id,
    staleTime: 10000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!groupId) return;

    console.log('[GroupChat] Setting up realtime for group:', groupId);
    
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_chat_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          console.log('[GroupChat] New message received:', payload);
          queryClient.invalidateQueries({ queryKey: ['group-messages', groupId] });
        }
      )
      .subscribe();

    return () => {
      console.log('[GroupChat] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [groupId, queryClient]);

  return query;
}

// Send a message
export function useSendGroupMessage() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      groupId, 
      content, 
      messageType = 'text',
      metadata = null
    }: { 
      groupId: string; 
      content: string;
      messageType?: 'text' | 'voice' | 'image' | 'system';
      metadata?: any;
    }) => {
      if (!user?.id || !tenant?.id) {
        throw new Error('User not authenticated');
      }

      const authClient = supabaseWithAuth(user.id, tenant.id);

      const { data, error } = await authClient
        .from('group_chat_messages')
        .insert({
          group_id: groupId,
          farmer_id: user.id,
          content,
          message_type: messageType,
          metadata,
        })
        .select()
        .single();

      if (error) {
        console.error('[GroupChat] Error sending message:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-messages', variables.groupId] });
    },
    onError: (error) => {
      console.error('[GroupChat] Send message error:', error);
      toast.error('Failed to send message. Please try again.');
    },
  });
}

// Create a welcome message when group chat is opened
export function useCreateWelcomeMessage() {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ groupId, groupName }: { groupId: string; groupName: string }) => {
      if (!tenant?.id) return null;

      const authClient = supabaseWithAuth(user?.id, tenant.id);

      // Check if welcome message already exists
      const { data: existing } = await authClient
        .from('group_chat_messages')
        .select('id')
        .eq('group_id', groupId)
        .eq('message_type', 'system')
        .limit(1);

      if (existing && existing.length > 0) {
        return null; // Welcome message already exists
      }

      // Create welcome message
      const { data, error } = await authClient
        .from('group_chat_messages')
        .insert({
          group_id: groupId,
          farmer_id: user?.id || '00000000-0000-0000-0000-000000000000',
          content: `Welcome to ${groupName} discussion! Share your experiences and tips with fellow farmers.`,
          message_type: 'system',
          metadata: { isWelcome: true },
        })
        .select()
        .single();

      if (error) {
        console.error('[GroupChat] Error creating welcome message:', error);
        return null;
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['group-messages', variables.groupId] });
    },
  });
}
