import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(true); // Start optimistic
  const [hasShownToast, setHasShownToast] = useState(false);

  useEffect(() => {
    // Verify actual connectivity with a quick test
    const checkConnectivity = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        await fetch('/manifest.json', { 
          method: 'HEAD',
          cache: 'no-cache',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        setIsOnline(true);
      } catch {
        setIsOnline(false);
      }
    };

    // Initial check
    checkConnectivity();

    const handleOnline = () => {
      setIsOnline(true);
      if (hasShownToast) {
        toast({
          title: 'Back online',
          description: 'Your connection has been restored',
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setHasShownToast(true);
      toast({
        title: 'You are offline',
        description: 'Some features may be limited',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 5 minutes (reduced battery drain for mobile)
    const interval = setInterval(checkConnectivity, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [hasShownToast]);

  return isOnline;
}