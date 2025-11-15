import { useState, useEffect } from 'react';
import { localDB } from '@/services/localDB';
import { useAuthStore } from '@/stores/authStore';

/**
 * Hook to check if initial sync is complete
 * Ensures queries don't run before data is available in localDB
 * 
 * IMPROVED: Now checks for actual data, not just sync timestamp
 */
export function useSyncReady() {
  const [syncReady, setSyncReady] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    const checkSyncStatus = async () => {
      if (!user?.id) {
        console.log('⚠️ [useSyncReady] No user, not ready');
        setSyncReady(false);
        return;
      }

      try {
        const metadata = await localDB.getSyncMetadata();
        
        // ✅ NEW: Check if data actually exists, not just sync time
        const lands = await localDB.getLands();
        const schedules = await localDB.getAllSchedules();
        
        // Consider sync ready if:
        // 1. Initial sync completed (lastSyncTime exists), AND
        // 2. User has data OR at least 5 seconds have passed (grace period for new users)
        
        const hasData = lands.length > 0 || schedules.length > 0;
        const syncCompleted = metadata?.lastSyncTime !== null && metadata?.lastSyncTime !== undefined;
        const gracePeriodPassed = Date.now() - (metadata?.lastSchemaCheck || Date.now()) > 5000;
        
        const isReady = syncCompleted && (hasData || gracePeriodPassed);
        
        console.log('🔄 [useSyncReady] Status:', {
          hasData,
          syncCompleted,
          gracePeriodPassed,
          isReady,
          landsCount: lands.length,
          schedulesCount: schedules.length,
          lastSyncTime: metadata?.lastSyncTime ? new Date(metadata.lastSyncTime).toLocaleString() : 'Never',
        });
        
        setSyncReady(isReady);
      } catch (error) {
        console.error('❌ [useSyncReady] Failed to check sync status:', error);
        // Fail open after grace period - don't block queries indefinitely
        setSyncReady(true);
      }
    };

    checkSyncStatus();
    
    // Re-check every 2 seconds until ready
    const interval = setInterval(() => {
      if (!syncReady) {
        checkSyncStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [user?.id, syncReady]);

  return syncReady;
}
