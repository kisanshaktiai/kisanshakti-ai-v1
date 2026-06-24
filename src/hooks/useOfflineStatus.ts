import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { networkStatusService } from '@/services/networkStatusService';

/**
 * Hook to track online/offline status using centralized network service
 * 
 * Features:
 * - Reliable detection using navigator.onLine + verification
 * - No false positives from single network failures
 * - Quick recovery when connection is restored
 */
export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(networkStatusService.getStatus());
  const [hasShownToast, setHasShownToast] = useState(false);

  useEffect(() => {
    // Subscribe to network status changes
    const unsubscribe = networkStatusService.subscribe((online) => {
      setIsOnline(online);

      // Show toast when going offline
      if (!online) {
        setHasShownToast(true);
        toast({
          title: 'You are offline',
          description: 'Some features may be limited. Your changes will sync when connection is restored.',
          variant: 'destructive',
        });
      }

      // Show toast when coming back online (only if we previously showed offline toast)
      if (online && hasShownToast) {
        toast({
          title: 'Back online',
          description: 'Your connection has been restored. Syncing data...',
        });
      }
    });

    return unsubscribe;
  }, [hasShownToast]);

  return isOnline;
}
