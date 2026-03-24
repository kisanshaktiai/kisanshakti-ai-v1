import { useEffect, useRef, useState } from 'react';
import { useRealtimeData } from './useRealtimeData';
import { useAuthStore } from '@/stores/authStore';

/**
 * Global real-time sync hook
 * Sets up real-time subscriptions for all critical tables
 * This should be used at the app level to ensure data stays synced
 * 
 * PERFORMANCE FIX: Delays subscription setup to avoid blocking initial load
 */
export function useGlobalRealtimeSync() {
  const { user } = useAuthStore();
  // CRITICAL FIX: Use useState instead of useRef so that the component re-renders
  // when the delay completes. useRef changes don't trigger re-renders.
  const [isReady, setIsReady] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // PERFORMANCE FIX: Delay real-time subscription by 5 seconds
  // Real-time sync is nice-to-have, not critical for initial load
  useEffect(() => {
    if (user?.id && !isReady) {
      timeoutRef.current = setTimeout(() => {
        setIsReady(true);
        console.log('🔄 [Global Realtime] Sync initialized for user:', user.id);
      }, 5000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [user?.id, isReady]);

  // Only enable real-time data after initialization delay
  useRealtimeData({
    tables: ['lands', 'crop_schedules', 'schedule_tasks'],
    enabled: !!user?.id && isReady,
  });
}
