import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';

type RealtimeTable = 'lands' | 'crop_schedules' | 'schedule_tasks';

interface UseRealtimeDataOptions {
  tables: RealtimeTable[];
  enabled?: boolean;
}

const RETRY_DELAYS = [2000, 5000, 10000];

/**
 * Hook to subscribe to real-time updates from Supabase tables.
 * PERF: Consolidates all requested tables into a SINGLE channel with multiple
 *   `.on('postgres_changes', ...)` handlers — reduces 3 channels → 1.
 * Stable channel name keyed by `${tenantId}:${userId}` so re-renders don't
 *   create orphan channels.
 */
export function useRealtimeData({ tables, enabled = true }: UseRealtimeDataOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !user?.id) return;

    const tenantKey = tenant?.id || 'default';
    const channelName = `realtime:${tenantKey}:${user.id}`;
    let attempts = 0;
    let retryTimer: NodeJS.Timeout | null = null;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    const handlePayload = (table: RealtimeTable, payload: any) => {
      switch (table) {
        case 'lands':
          queryClient.invalidateQueries({ queryKey: ['lands'] });
          queryClient.invalidateQueries({ queryKey: ['land'] });
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
    };

    const setupChannel = () => {
      let channel = supabase.channel(channelName);
      tables.forEach((table) => {
        channel = channel.on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table },
          (payload) => handlePayload(table, payload)
        );
      });

      activeChannel = channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          attempts = 0;
          console.log(`✅ [Realtime] Subscribed: ${channelName} (${tables.length} tables)`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`⚠️ [Realtime] ${status} on ${channelName}, attempt ${attempts + 1}`);
          if (activeChannel) {
            supabase.removeChannel(activeChannel);
            activeChannel = null;
          }
          if (attempts < RETRY_DELAYS.length) {
            const delay = RETRY_DELAYS[attempts];
            attempts += 1;
            retryTimer = setTimeout(setupChannel, delay);
          } else {
            console.warn(`⚠️ [Realtime] ${channelName} retries exhausted`);
          }
        }
      });
    };

    setupChannel();

    cleanupRef.current = () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
        activeChannel = null;
      }
    };

    return cleanupRef.current;
  }, [tables, enabled, user?.id, tenant?.id, queryClient]);
}
