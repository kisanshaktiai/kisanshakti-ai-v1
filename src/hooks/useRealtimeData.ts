import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';

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

  useEffect(() => {
    if (!enabled || !user?.id) return;

    console.log('[Realtime] Setting up real-time subscriptions for:', tables);

    const channels = tables.map((table) => {
      const channel = supabase
        .channel(`realtime-${table}-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: table,
          },
          (payload) => {
            console.log(`[Realtime] ${table} changed:`, payload.eventType, payload);
            
            // Invalidate all relevant queries to trigger immediate refetch
            switch (table) {
              case 'lands':
                queryClient.invalidateQueries({ queryKey: ['lands'] });
                queryClient.invalidateQueries({ queryKey: ['land'] });
                // Also refetch to ensure UI updates immediately
                queryClient.refetchQueries({ queryKey: ['lands'] });
                break;
              case 'crop_schedules':
                queryClient.invalidateQueries({ queryKey: ['schedules'] });
                queryClient.invalidateQueries({ queryKey: ['schedule'] });
                queryClient.refetchQueries({ queryKey: ['schedules'] });
                break;
              case 'schedule_tasks':
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                queryClient.invalidateQueries({ queryKey: ['schedules'] });
                queryClient.refetchQueries({ queryKey: ['tasks'] });
                break;
            }
          }
        )
        .subscribe((status) => {
          console.log(`[Realtime] ${table} subscription status:`, status);
          if (status === 'SUBSCRIBED') {
            console.log(`✅ [Realtime] Successfully subscribed to ${table}`);
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`❌ [Realtime] Error subscribing to ${table}`);
          }
        });

      return channel;
    });

    // Cleanup subscriptions on unmount
    return () => {
      console.log('[Realtime] Cleaning up subscriptions');
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [tables, enabled, user?.id, queryClient]);
}
