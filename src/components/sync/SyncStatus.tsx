import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { syncService } from '@/services/syncService';
import { localDB } from '@/services/localDB';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function SyncStatus() {
  const [syncMetadata, setSyncMetadata] = useState({
    lastSyncTime: null as number | null,
    pendingChanges: 0,
    syncInProgress: false,
  });
  const [syncProgress, setSyncProgress] = useState(0);
  const isOnline = useOfflineStatus();

  useEffect(() => {
    // Load initial sync metadata
    loadSyncMetadata();

    // Update metadata every 30 seconds
    const interval = setInterval(loadSyncMetadata, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadSyncMetadata = async () => {
    const metadata = await localDB.getSyncMetadata();
    setSyncMetadata(metadata);
  };

  const handleManualSync = async () => {
    setSyncProgress(0);
    const progressInterval = setInterval(() => {
      setSyncProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      await syncService.performSync(true);
      setSyncProgress(100);
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => setSyncProgress(0), 1000);
      loadSyncMetadata();
    }
  };

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return 'Never synced';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    
    return format(new Date(timestamp), 'MMM d, h:mm a');
  };

  return (
    <Card className="p-3 bg-card/60 backdrop-blur-xl border-border/40">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Status */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isOnline ? (
            <Wifi className="h-3.5 w-3.5 text-success shrink-0" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-destructive shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium block truncate">
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {formatLastSync(syncMetadata.lastSyncTime)}
            </span>
          </div>
        </div>

        {/* Middle: Pending badge */}
        {syncMetadata.pendingChanges > 0 && (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
            {syncMetadata.pendingChanges}
          </Badge>
        )}

        {/* Right: Sync button */}
        <Button
          onClick={handleManualSync}
          disabled={!isOnline || syncMetadata.syncInProgress}
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
        >
          <RefreshCw 
            className={cn(
              "h-3.5 w-3.5",
              syncMetadata.syncInProgress && "animate-spin"
            )}
          />
        </Button>
      </div>
      
      {/* Progress bar */}
      {syncProgress > 0 && (
        <Progress value={syncProgress} className="h-1 mt-2" />
      )}
    </Card>
  );
}