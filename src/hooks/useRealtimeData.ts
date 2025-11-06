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

    const channels = tables.map((table) => {
      const channel = supabase
        .channel(`realtime-${table}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: table,
          },
          (payload) => {
            console.log(`[Realtime] ${table} changed:`, payload);
            
            // Invalidate all relevant queries to trigger refetch
            switch (table) {
              case 'lands':
                queryClient.invalidateQueries({ queryKey: ['lands'] });
                queryClient.invalidateQueries({ queryKey: ['land'] });
                break;
              case 'crop_schedules':
                queryClient.invalidateQueries({ queryKey: ['schedules'] });
                queryClient.invalidateQueries({ queryKey: ['schedule'] });
                break;
              case 'schedule_tasks':
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                queryClient.invalidateQueries({ queryKey: ['schedules'] });
                break;
            }
          }
        )
        .subscribe((status) => {
          console.log(`[Realtime] ${table} subscription status:`, status);
        });

      return channel;
    });

    // Cleanup subscriptions on unmount
    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [tables, enabled, user?.id, queryClient]);
}
