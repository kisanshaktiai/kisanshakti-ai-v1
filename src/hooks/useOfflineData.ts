import { useEffect } from 'react';
import { localDB } from '@/services/localDB';
import { syncService } from '@/services/syncService';
import { useAuthStore } from '@/stores/authStore';

/**
 * Hook to initialize offline data capabilities
 * - Initializes local database
 * - Sets up automatic sync
 */
export function useOfflineData() {
  const { user } = useAuthStore();

  useEffect(() => {
    const initializeOfflineData = async () => {
      try {
        // Initialize local database (this is tenant-scoped)
        await localDB.initialize();
        console.log('📦 [LocalDB] Tenant-isolated database initialized');

        // CRITICAL: Only sync if user is fully authenticated with tenant_id
        // This prevents premature sync attempts on app load
        if (user?.id && user?.tenantId && navigator.onLine) {
          console.log('🔄 [Sync] User authenticated - performing initial data sync...', {
            userId: user.id,
            tenantId: user.tenantId
          });
          await syncService.performSync(false);
        } else if (!user?.id) {
          console.log('⏸️ [Sync] Skipping sync - user not authenticated yet');
        } else if (!user?.tenantId) {
          console.error('❌ [Sync] Critical: User authenticated but missing tenant_id!');
        }
      } catch (error) {
        console.error('Failed to initialize offline data:', error);
      }
    };

    initializeOfflineData();
  }, [user?.id, user?.tenantId]);

  return {
    isOnline: syncService.isNetworkAvailable(),
    isSyncing: syncService.getSyncStatus(),
  };
}
