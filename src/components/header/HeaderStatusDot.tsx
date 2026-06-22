import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useSyncMetadata } from '@/hooks/useSyncMetadata';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

/**
 * Always-visible online status dot for the top bar.
 * Tap → popover with Online/Offline + last sync + pending count.
 */
export function HeaderStatusDot() {
  const isOnline = useOfflineStatus();
  const { lastSyncTime, pendingChanges, syncInProgress } = useSyncMetadata();
  const { t } = useTranslation();

  const dotColor = syncInProgress
    ? 'bg-warning'
    : isOnline
    ? 'bg-success'
    : 'bg-muted-foreground';

  const statusText = syncInProgress
    ? t('sync.syncing', 'Syncing')
    : isOnline
    ? t('common.online', 'Online')
    : t('common.offline', 'Offline');

  const formatLastSync = (ts: number | null) => {
    if (!ts) return t('sync.never_synced', 'Never');
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('sync.just_now', 'Just now');
    if (minutes < 60) return `${minutes}m ago`;
    return format(ts, 'MMM d, h:mm a');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={statusText}
          className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center hover:bg-accent/40 active:scale-95 transition-all relative"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75',
                dotColor,
                isOnline && !syncInProgress && 'motion-safe:animate-ping'
              )}
            />
            <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', dotColor)} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              {t('common.connection', 'Connection')}
            </span>
            <span
              className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                isOnline ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
              )}
            >
              {statusText}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('sync.last_synced', 'Last synced')}</span>
            <span className="font-medium text-foreground">{formatLastSync(lastSyncTime)}</span>
          </div>
          {pendingChanges > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t('sync.pending', 'Pending')}</span>
              <span className="font-medium text-primary">{pendingChanges}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
