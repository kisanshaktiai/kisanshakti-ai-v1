import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { syncService } from '@/services/syncService';
import { localDB } from '@/services/localDB';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useTranslation } from 'react-i18next';
import { IconTile, sectionCardClass } from '@/components/profile/SettingsList';
import { cn } from '@/lib/utils';

export function SyncStatus() {
  const { t, i18n } = useTranslation();
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
    if (!timestamp) return t('sync.never_synced');
    const diff = Date.now() - timestamp;
    if (diff < 60000) return t('sync.just_now');
    if (diff < 3600000) return t('sync.minutes_ago', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('sync.hours_ago', { count: Math.floor(diff / 3600000) });
    // date-fns has no Marathi locale; the platform formatter speaks every app language
    try {
      return new Intl.DateTimeFormat(`${(i18n.language || 'en').split('-')[0]}-IN`, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  };

  return (
    <div className={cn(sectionCardClass, 'px-4 py-3')}>
      <div className="flex min-h-[40px] items-center gap-3">
        {/* Left: Status */}
        <IconTile icon={isOnline ? Wifi : WifiOff} tone={isOnline ? 'success' : 'destructive'} />
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-semibold leading-snug text-foreground">
              {isOnline ? t('common.online') : t('common.offline')}
            </span>
            {/* Pending badge */}
            {syncMetadata.pendingChanges > 0 && (
              <Badge variant="outline" className="border-warning/50 bg-warning/15 px-2 py-0.5 text-xs text-foreground hover:bg-warning/15">
                {syncMetadata.pendingChanges} {t('sync.pending')}
              </Badge>
            )}
          </span>
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
            {syncMetadata.lastSyncTime
              ? `${t('sync.last_synced')}: ${formatLastSync(syncMetadata.lastSyncTime)}`
              : formatLastSync(null)}
          </span>
        </div>

        {/* Right: Sync button */}
        <Button
          onClick={handleManualSync}
          disabled={!isOnline || syncMetadata.syncInProgress}
          variant="surface"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          aria-label={t('sync.sync_now')}
        >
          <RefreshCw 
            className={cn(
              "!h-5 !w-5 text-primary",
              (syncMetadata.syncInProgress || (syncProgress > 0 && syncProgress < 100)) && "animate-spin"
            )}
          />
        </Button>
      </div>
      
      {/* Progress bar */}
      {syncProgress > 0 && (
        <Progress value={syncProgress} className="h-1.5 mt-3 bg-muted" />
      )}
    </div>
  );
}
