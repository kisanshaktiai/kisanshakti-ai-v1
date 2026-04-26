import { RefreshCw, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useSyncMetadata } from '@/hooks/useSyncMetadata';
import { useSyncAction } from '@/hooks/useSyncAction';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

/**
 * 2030-ready unified sync button — inline dropdown (no bottom sheet).
 * Merges old SyncButton + ConnectionStatusIcon into a single header control.
 */
export function UnifiedSyncButton() {
  const { t } = useTranslation();
  const isOnline = useOfflineStatus();
  const { lastSyncTime, pendingChanges } = useSyncMetadata();
  const { handleSync, syncing, syncSuccess, syncError } = useSyncAction();

  const formatLastSync = (ts: number | null) => {
    if (!ts) return t('sync.never_synced', 'Never');
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('sync.just_now', 'Just now');
    if (minutes < 60) return `${minutes}m ago`;
    return format(ts, 'MMM d, h:mm a');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={syncing}
          aria-label={t('sync.sync_data', 'Sync data')}
          className={cn(
            'relative shrink-0 h-9 w-9 rounded-full flex items-center justify-center',
            'bg-card/80 border border-border/60 shadow-sm',
            'hover:bg-accent/50 active:scale-95 transition-all',
            syncSuccess && 'border-success/60 bg-success/10',
            syncError && 'border-destructive/60 bg-destructive/10'
          )}
        >
          {syncSuccess ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : syncError ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <RefreshCw
              className={cn('h-4 w-4 text-foreground', syncing && 'animate-spin text-primary')}
            />
          )}
          {pendingChanges > 0 && !syncing && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-warning text-warning-foreground text-[9px] font-bold rounded-full flex items-center justify-center border border-card">
              {pendingChanges > 9 ? '9+' : pendingChanges}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuItem onClick={() => handleSync(false)} disabled={syncing || !isOnline}>
          <RefreshCw className="mr-2 h-4 w-4" />
          <span>{t('sync.quick_sync', 'Quick sync')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSync(true)} disabled={syncing || !isOnline}>
          <Database className="mr-2 h-4 w-4" />
          <span>{t('sync.full_reload', 'Full reload')}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('common.connection', 'Connection')}</span>
            <span
              className={cn(
                'font-medium',
                isOnline ? 'text-success' : 'text-muted-foreground'
              )}
            >
              {isOnline ? t('common.online', 'Online') : t('common.offline', 'Offline')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('sync.last_synced', 'Last synced')}</span>
            <span className="font-medium text-foreground">{formatLastSync(lastSyncTime)}</span>
          </div>
          {pendingChanges > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('sync.pending', 'Pending')}</span>
              <span className="font-medium text-primary">{pendingChanges}</span>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
