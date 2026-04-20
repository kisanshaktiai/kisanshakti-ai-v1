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
 * Hook to subscribe to real-time updates from Supabase tables
 * Automatically invalidates React Query cache when data changes.
 * Adds exponential-backoff retry on CHANNEL_ERROR / TIMED_OUT.
 */
export function useRealtimeData({ tables, enabled = true }: UseRealtimeDataOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !user?.id) {
      console.log('🔕 [Realtime] Subscription disabled:', { enabled, userId: user?.id });
      return;
    }

    console.log('🔔 [Realtime] Setting up subscriptions for:', tables, 'tenant:', tenant?.id);

    const activeChannels = new Map<RealtimeTable, ReturnType<typeof supabase.channel>>();
    const retryTimers = new Map<RealtimeTable, NodeJS.Timeout>();
    const attempts = new Map<RealtimeTable, number>();

    const handlePayload = (table: RealtimeTable, payload: any) => {
      const recordId = payload.new?.id || payload.old?.id || 'unknown';
      console.log(`🔄 [Realtime] ${table} changed:`, payload.eventType, 'record:', recordId);

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

    const setupChannel = (table: RealtimeTable) => {
      const channelName = `realtime-${tenant?.id || 'default'}-${table}-${user.id}-${Date.now()}`;

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => handlePayload(table, payload)
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            attempts.set(table, 0);
            console.log(`✅ [Realtime] Subscribed to ${channelName}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            const attempt = attempts.get(table) || 0;
            console.warn(`⚠️ [Realtime] ${table} ${status}, attempt ${attempt + 1}`);
            const existing = activeChannels.get(table);
            if (existing) {
              supabase.removeChannel(existing);
              activeChannels.delete(table);
            }
            if (attempt < RETRY_DELAYS.length) {
              attempts.set(table, attempt + 1);
              const timer = setTimeout(() => setupChannel(table), RETRY_DELAYS[attempt]);
              retryTimers.set(table, timer);
            } else {
              console.warn(`⚠️ [Realtime] ${table} exhausted retries — query cache will rely on manual invalidation`);
            }
          }
        });

      activeChannels.set(table, channel);
    };

    tables.forEach(setupChannel);

    cleanupRef.current = () => {
      console.log('🔌 [Realtime] Cleaning up', activeChannels.size, 'subscriptions');
      retryTimers.forEach(clearTimeout);
      retryTimers.clear();
      activeChannels.forEach((ch) => supabase.removeChannel(ch));
      activeChannels.clear();
      attempts.clear();
    };

    return cleanupRef.current;
  }, [tables, enabled, user?.id, tenant?.id, queryClient]);
}
