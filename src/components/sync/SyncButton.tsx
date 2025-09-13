import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncService } from '@/services/syncService';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const isOnline = useOfflineStatus();

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncService.performSync(true);
    } finally {
      setSyncing(false);
    }
  };

  if (!isOnline) {
    return (
      <Button variant="outline" size="icon" disabled className="relative">
        <WifiOff className="h-4 w-4" />
        <span className="sr-only">Offline</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleSync}
      disabled={syncing}
      className="relative"
    >
      <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
      <span className="sr-only">Sync data</span>
    </Button>
  );
}