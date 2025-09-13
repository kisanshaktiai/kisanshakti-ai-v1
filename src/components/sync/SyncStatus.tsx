import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Wifi, WifiOff, Check, AlertCircle, Clock } from 'lucide-react';
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
    <Card className="p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Offline</span>
              </>
            )}
          </div>
          
          {syncMetadata.pendingChanges > 0 && (
            <Badge variant="secondary" className="text-xs">
              {syncMetadata.pendingChanges} pending
            </Badge>
          )}
        </div>

        {/* Sync Button and Status */}
        <div className="space-y-2">
          <Button
            onClick={handleManualSync}
            disabled={!isOnline || syncMetadata.syncInProgress}
            className="w-full"
            variant="outline"
            size="sm"
          >
            <RefreshCw 
              className={cn(
                "h-4 w-4 mr-2",
                syncMetadata.syncInProgress && "animate-spin"
              )}
            />
            {syncMetadata.syncInProgress ? 'Syncing...' : 'Sync Now'}
          </Button>

          {syncProgress > 0 && (
            <Progress value={syncProgress} className="h-2" />
          )}
        </div>

        {/* Last Sync Info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Last synced: {formatLastSync(syncMetadata.lastSyncTime)}</span>
        </div>

        {/* Sync Indicator Messages */}
        {!isOnline && (
          <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
            <span className="text-xs text-yellow-800 dark:text-yellow-400">
              Working offline. Changes will sync when connected.
            </span>
          </div>
        )}

        {syncMetadata.pendingChanges > 0 && isOnline && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-500" />
            <span className="text-xs text-blue-800 dark:text-blue-400">
              {syncMetadata.pendingChanges} changes waiting to sync
            </span>
          </div>
        )}

        {syncMetadata.lastSyncTime && syncMetadata.pendingChanges === 0 && isOnline && (
          <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md">
            <Check className="h-4 w-4 text-green-600 dark:text-green-500" />
            <span className="text-xs text-green-800 dark:text-green-400">
              All data synced
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}