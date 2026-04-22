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

    // PHASE 1B: Debounce invalidations per table to prevent thrash on bulk writes.
    // Drop explicit refetchQueries — React Query refetches automatically when consumers
    // are mounted and the query becomes stale via invalidateQueries.
    const debounceTimers: Partial<Record<RealtimeTable, NodeJS.Timeout>> = {};
    const DEBOUNCE_MS = 250;

    const flushInvalidate = (table: RealtimeTable) => {
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
    };

    const handlePayload = (table: RealtimeTable, _payload: any) => {
      if (debounceTimers[table]) clearTimeout(debounceTimers[table]!);
      debounceTimers[table] = setTimeout(() => flushInvalidate(table), DEBOUNCE_MS);
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
      // PHASE 1B: clear any pending debounced invalidations on unmount
      Object.values(debounceTimers).forEach((t) => t && clearTimeout(t));
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
        activeChannel = null;
      }
    };

    return cleanupRef.current;
  }, [tables, enabled, user?.id, tenant?.id, queryClient]);
}
