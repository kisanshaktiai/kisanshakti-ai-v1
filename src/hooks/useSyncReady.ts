import { useState, useEffect } from 'react';
import { localDB } from '@/services/localDB';

/**
 * Hook to check if initial sync is complete
 * Ensures queries don't run before data is available in localDB
 */
export function useSyncReady() {
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    const checkSyncStatus = async () => {
      try {
        // Check if we have sync metadata (means DB is initialized)
        const metadata = await localDB.getSyncMetadata();
        
        // Consider sync ready if:
        // 1. lastSyncTime exists (at least one sync completed), OR
        // 2. We're still within first 10 seconds of app load (give sync time to complete)
        const hasCompletedSync = metadata?.lastSyncTime && metadata.lastSyncTime > 0;
        
        if (hasCompletedSync) {
          console.log('✅ [useSyncReady] Initial sync completed at:', new Date(metadata.lastSyncTime));
          setSyncReady(true);
        } else {
          // Wait a bit for initial sync to complete
          console.log('⏳ [useSyncReady] Waiting for initial sync...');
          setTimeout(() => {
            setSyncReady(true);
          }, 3000); // 3 second grace period
        }
      } catch (error) {
        console.error('❌ [useSyncReady] Failed to check sync status:', error);
        // Fail open - don't block queries indefinitely
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
  }, [syncReady]);

  return syncReady;
}
