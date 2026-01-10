import { useEffect, useState } from 'react';
import { localDB } from '@/services/localDB';
import { syncService } from '@/services/syncService';
import { useAuthStore } from '@/stores/authStore';
import { networkStatusService } from '@/services/networkStatusService';

/**
 * Hook to initialize offline data capabilities
 * - Initializes local database
 * - Sets up automatic sync when online
 * - Provides real-time sync status
 */
export function useOfflineData() {
  const { user } = useAuthStore();
  const [isOnline, setIsOnline] = useState(networkStatusService.getStatus());
  const [isSyncing, setIsSyncing] = useState(false);

  // Subscribe to network status changes
  useEffect(() => {
    const unsubscribe = networkStatusService.subscribe((online) => {
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  // Initialize local database and sync
  useEffect(() => {
    const initializeOfflineData = async () => {
      try {
        // Initialize local database first (this is tenant-scoped)
        await localDB.initialize();
        console.log('📦 [LocalDB] Tenant-isolated database initialized');

        // CRITICAL: Only sync if user is fully authenticated with tenant_id
        // AND we're online - prevents "Failed to fetch" errors
        if (user?.id && user?.tenantId && isOnline) {
          console.log('🔄 [Sync] User authenticated and online - performing initial data sync...', {
            userId: user.id,
            tenantId: user.tenantId
          });
          setIsSyncing(true);
          try {
            await syncService.performSync(false);
          } catch (syncError) {
            console.warn('⚠️ [Sync] Initial sync failed, will retry later:', syncError);
          } finally {
            setIsSyncing(false);
          }
        } else if (!user?.id) {
          console.log('⏸️ [Sync] Skipping sync - user not authenticated yet');
        } else if (!user?.tenantId) {
          console.warn('⚠️ [Sync] User authenticated but missing tenant_id');
        } else if (!isOnline) {
          console.log('📴 [Sync] Skipping sync - device is offline');
        }
      } catch (error) {
        console.error('Failed to initialize offline data:', error);
      }
    };

    initializeOfflineData();
  }, [user?.id, user?.tenantId, isOnline]);

  // Trigger sync when coming back online
  useEffect(() => {
    if (isOnline && user?.id && user?.tenantId) {
      console.log('🌐 [Sync] Device came online, triggering sync...');
      setIsSyncing(true);
      syncService.performSync(false)
        .catch((error) => console.warn('⚠️ [Sync] Reconnection sync failed:', error))
        .finally(() => setIsSyncing(false));
    }
  }, [isOnline, user?.id, user?.tenantId]);

  return {
    isOnline,
    isSyncing,
  };
}
