import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

export interface CommunityGroup {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  community_id: string | null;
  member_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_member?: boolean;
}

export interface CropGroup {
  id: string;
  group_key: string;
  group_name: string;
  group_name_hi: string | null;
  group_name_mr: string | null;
  description: string | null;
  group_icon: string;
  display_order: number;
  is_active: boolean;
}

// Fetch all available groups (predefined crop groups + user-created groups)
export const useCommunityGroups = () => {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['community-groups', user?.id],
    queryFn: async () => {
      // Fetch crop groups (predefined) — select * to include all group_name_<lang> columns
      const { data: cropGroups, error: cropError } = await supabase
        .from('crop_groups')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (cropError) {
        console.error('[Groups] Error fetching crop groups:', cropError);
      }

      // Fetch user-created groups
      const { data: userGroups, error: userError } = await supabase
        .from('group_chats')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (userError) {
        console.error('[Groups] Error fetching user groups:', userError);
      }

      // Fetch user's group memberships
      let membershipIds: string[] = [];
      if (user?.id) {
        const { data: memberships } = await supabase
          .from('group_chat_members')
          .select('group_id')
          .eq('farmer_id', user.id);
        
        membershipIds = memberships?.map(m => m.group_id) || [];
      }

      // Transform and combine
      const transformedUserGroups: CommunityGroup[] = (userGroups || []).map(g => ({
        ...g,
        is_member: membershipIds.includes(g.id)
      }));

      return {
        cropGroups: (cropGroups || []) as CropGroup[],
        userGroups: transformedUserGroups,
        membershipIds
      };
    },
    enabled: true
  });
};

// Fetch groups the user has joined
export const useMyGroups = () => {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ['my-groups', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('group_chat_members')
        .select(`
          group_id,
          role,
          joined_at,
          group:group_chats(*)
        `)
        .eq('farmer_id', user.id);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });
};

// Create a new group
export const useCreateGroup = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (input: { 
      name: string; 
      description?: string;
      avatar_url?: string;
    }) => {
      if (!user?.id) throw new Error('Must be logged in');

      // Create the group
      const { data: group, error: groupError } = await supabase
        .from('group_chats')
        .insert({
          name: input.name,
          description: input.description || null,
          avatar_url: input.avatar_url || null,
          created_by: user.id,
          member_count: 1,
          is_active: true
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add creator as admin member
      const { error: memberError } = await supabase
        .from('group_chat_members')
        .insert({
          group_id: group.id,
          farmer_id: user.id,
          role: 'admin'
        });

      if (memberError) throw memberError;

      return group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      queryClient.invalidateQueries({ queryKey: ['my-groups'] });
      toast.success('Group created successfully! 🎉');
    },
    onError: (error) => {
      console.error('Error creating group:', error);
      toast.error('Failed to create group');
    }
  });
};

// Join a group
export const useJoinGroup = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (groupId: string) => {
      if (!user?.id) throw new Error('Must be logged in');

      // Check if already a member
      const { data: existing } = await supabase
        .from('group_chat_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('farmer_id', user.id)
        .maybeSingle();

      if (existing) {
        throw new Error('Already a member');
      }

      // Join the group
      const { error } = await supabase
        .from('group_chat_members')
        .insert({
          group_id: groupId,
          farmer_id: user.id,
          role: 'member'
        });

      if (error) throw error;

      // Update member count manually
      const { data: group } = await supabase
        .from('group_chats')
        .select('member_count')
        .eq('id', groupId)
        .single();

      if (group) {
        await supabase
          .from('group_chats')
          .update({ member_count: (group.member_count || 0) + 1 })
          .eq('id', groupId);
      }

      return { groupId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      queryClient.invalidateQueries({ queryKey: ['my-groups'] });
      toast.success('Joined group successfully! 🎉');
    },
    onError: (error: any) => {
      if (error.message === 'Already a member') {
        toast.info('You are already a member of this group');
      } else {
        console.error('Error joining group:', error);
        toast.error('Failed to join group');
      }
    }
  });
};

// Leave a group
export const useLeaveGroup = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (groupId: string) => {
      if (!user?.id) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('group_chat_members')
        .delete()
        .eq('group_id', groupId)
        .eq('farmer_id', user.id);

      if (error) throw error;

      // Decrement member count manually
      const { data: group } = await supabase
        .from('group_chats')
        .select('member_count')
        .eq('id', groupId)
        .single();

      if (group) {
        await supabase
          .from('group_chats')
          .update({ member_count: Math.max(0, (group.member_count || 1) - 1) })
          .eq('id', groupId);
      }

      return { groupId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      queryClient.invalidateQueries({ queryKey: ['my-groups'] });
      toast.success('Left group');
    },
    onError: (error) => {
      console.error('Error leaving group:', error);
      toast.error('Failed to leave group');
    }
  });
};
