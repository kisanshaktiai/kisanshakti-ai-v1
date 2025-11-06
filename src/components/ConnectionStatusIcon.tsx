import { useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { localDB } from '@/services/localDB';
import { format } from 'date-fns';
import { useEffect } from 'react';

export function ConnectionStatusIcon() {
  const isOnline = useOfflineStatus();
  const [syncMetadata, setSyncMetadata] = useState<{
    lastSyncTime: number | null;
    pendingChanges: number;
    syncInProgress: boolean;
  }>({
    lastSyncTime: null,
    pendingChanges: 0,
    syncInProgress: false,
  });

  useEffect(() => {
    const loadMetadata = async () => {
      const metadata = await localDB.getSyncMetadata();
      setSyncMetadata(metadata);
    };

    loadMetadata();
    const interval = setInterval(loadMetadata, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    if (syncMetadata.syncInProgress) return 'bg-yellow-500';
    if (!isOnline) return 'bg-muted-foreground';
    return 'bg-green-500';
  };

  const getStatusIcon = () => {
    if (syncMetadata.syncInProgress) {
      return <RefreshCw className="h-4 w-4 text-yellow-600 animate-spin" />;
    }
    if (!isOnline) {
      return <WifiOff className="h-4 w-4 text-muted-foreground" />;
    }
    return <Wifi className="h-4 w-4 text-green-600" />;
  };

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return 'Never synced';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return format(timestamp, 'MMM d, h:mm a');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          {getStatusIcon()}
          {/* Status dot */}
          <span className={`absolute top-1 right-1 h-2 w-2 rounded-full ${getStatusColor()} ${isOnline && !syncMetadata.syncInProgress ? 'animate-pulse' : ''}`} />
          {/* Pending changes badge */}
          {syncMetadata.pendingChanges > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              {syncMetadata.pendingChanges}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Connection Status</span>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="text-sm font-medium">
                {syncMetadata.syncInProgress ? 'Syncing' : isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last synced:</span>
              <span className="font-medium">{formatLastSync(syncMetadata.lastSyncTime)}</span>
            </div>
            
            {syncMetadata.pendingChanges > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending changes:</span>
                <span className="font-medium text-primary">{syncMetadata.pendingChanges}</span>
              </div>
            )}
          </div>

          {!isOnline && syncMetadata.pendingChanges > 0 && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              Changes will sync automatically when you're back online
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
