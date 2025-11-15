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
        // Initialize local database
        await localDB.initialize();
        console.log('📦 Local database initialized');

        // If user is logged in, perform initial sync
        if (user?.id && navigator.onLine) {
          console.log('🔄 Performing initial data sync...');
          await syncService.performSync(false);
        }
      } catch (error) {
        console.error('Failed to initialize offline data:', error);
      }
    };

    initializeOfflineData();
  }, [user?.id]);

  return {
    isOnline: syncService.isNetworkAvailable(),
    isSyncing: syncService.getSyncStatus(),
  };
}
