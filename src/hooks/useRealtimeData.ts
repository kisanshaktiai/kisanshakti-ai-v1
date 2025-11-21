import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';

type RealtimeTable = 'lands' | 'crop_schedules' | 'schedule_tasks';

interface UseRealtimeDataOptions {
  tables: RealtimeTable[];
  enabled?: boolean;
}

/**
 * Hook to subscribe to real-time updates from Supabase tables
 * Automatically invalidates React Query cache when data changes
 */
export function useRealtimeData({ tables, enabled = true }: UseRealtimeDataOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { tenant } = useTenant();

  useEffect(() => {
    // Don't subscribe if disabled or no auth context
    if (!enabled || !user?.id) {
      console.log('🔕 [Realtime] Subscription disabled:', { enabled, userId: user?.id });
      return;
    }

    console.log('🔔 [Realtime] Setting up subscriptions for:', tables, 'tenant:', tenant?.id);

    const channels = tables.map((table) => {
      // Create tenant-specific channel name for better isolation
      const channelName = `realtime-${tenant?.id || 'default'}-${table}-${user.id}`;
      
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: table,
          },
          (payload) => {
            const recordId = (payload.new as any)?.id || (payload.old as any)?.id || 'unknown';
            console.log(`🔄 [Realtime] ${table} changed:`, payload.eventType, 'record:', recordId);
            
            // Invalidate all relevant queries to trigger immediate refetch
            switch (table) {
              case 'lands':
                queryClient.invalidateQueries({ queryKey: ['lands'] });
                queryClient.invalidateQueries({ queryKey: ['land'] });
                // Also refetch to ensure UI updates immediately
                queryClient.refetchQueries({ queryKey: ['lands'] });
                console.log('✅ [Realtime] Invalidated and refetched lands cache');
                break;
              case 'crop_schedules':
                queryClient.invalidateQueries({ queryKey: ['schedules'] });
                queryClient.invalidateQueries({ queryKey: ['schedule'] });
                queryClient.refetchQueries({ queryKey: ['schedules'] });
                console.log('✅ [Realtime] Invalidated and refetched schedules cache');
                break;
              case 'schedule_tasks':
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                queryClient.invalidateQueries({ queryKey: ['schedules'] });
                queryClient.refetchQueries({ queryKey: ['tasks'] });
                console.log('✅ [Realtime] Invalidated and refetched tasks cache');
                break;
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`✅ [Realtime] Successfully subscribed to ${channelName}`);
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`❌ [Realtime] Error subscribing to ${channelName}`);
          } else if (status === 'TIMED_OUT') {
            console.warn(`⏱️ [Realtime] Subscription timed out for ${channelName}`);
          } else {
            console.log(`📡 [Realtime] ${channelName} status:`, status);
          }
        });

      return channel;
    });

    // Cleanup subscriptions on unmount
    return () => {
      console.log('🔌 [Realtime] Cleaning up', channels.length, 'subscriptions');
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [tables, enabled, user?.id, tenant?.id, queryClient]);
}
