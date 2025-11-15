import { useEffect } from 'react';
import { useRealtimeData } from './useRealtimeData';
import { useAuthStore } from '@/stores/authStore';

/**
 * Global real-time sync hook
 * Sets up real-time subscriptions for all critical tables
 * This should be used at the app level to ensure data stays synced
 */
export function useGlobalRealtimeSync() {
  const { user } = useAuthStore();

  // Subscribe to real-time updates for all critical tables
  useRealtimeData({
    tables: ['lands', 'crop_schedules', 'schedule_tasks'],
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (user?.id) {
      console.log('🔄 [Global Realtime] Sync initialized for user:', user.id);
    }
  }, [user?.id]);
}
