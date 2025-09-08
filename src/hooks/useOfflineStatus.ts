import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: 'Back online',
        description: 'Your connection has been restored',
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: 'You are offline',
        description: 'Some features may be limited',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}