import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Crown,
  Sparkles,
  Leaf,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useSyncMetadata } from '@/hooks/useSyncMetadata';
import { useSyncAction } from '@/hooks/useSyncAction';
import { cn } from '@/lib/utils';

/**
 * StatusPill — single header surface that consolidates:
 *  - Subscription chip (plan + days remaining + warning)
 *  - Online/offline status dot
 *  - Sync action (quick sync / full reload) + last-sync + pending count
 *
 * Replaces SubscriptionHeaderChip + HeaderStatusDot + UnifiedSyncButton.
 * Static label (no rotation). Tap → popover with full details and actions.
 */
export function StatusPill() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    data,
    planName,
    daysRemaining,
    isInGracePeriod,
    subscriptionStatus,
    isLoading,
  } = useSubscriptionContext();
  const isOnline = useOfflineStatus();
  const { lastSyncTime, pendingChanges, syncInProgress } = useSyncMetadata();
  const { handleSync, syncing, syncSuccess, syncError } = useSyncAction();

  const [loadTimeoutHit, setLoadTimeoutHit] = useState(false);
  useEffect(() => {
    if (!isLoading || data) {
      setLoadTimeoutHit(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimeoutHit(true), 3000);
    return () => clearTimeout(timer);
  }, [isLoading, data]);

  if (isLoading && !data && !loadTimeoutHit) {
    return <div className="h-9 w-28 rounded-full bg-muted/40 animate-pulse" />;
  }

  const effectivePlan = data ? planName : 'Free';
  const isExpired = data ? subscriptionStatus === 'expired' || !data.valid : false;
  const isExpiringSoon =
    !!data && subscriptionStatus === 'active' && daysRemaining > 0 && daysRemaining <= 7;
  const isWarn = isExpired || isInGracePeriod || isExpiringSoon;

  const tier =
    effectivePlan === 'AI PRO' ? 'pro' : effectivePlan === 'Shakti' ? 'shakti' : 'free';
  const PlanIcon = tier === 'pro' ? Crown : tier === 'shakti' ? Sparkles : Leaf;

  // Trigger label: plan name ONLY (no days) to keep header compact.
  // Days/grace details live in the popover.
  const daysText =
    !!data && daysRemaining > 0
      ? isInGracePeriod
        ? `Grace ${daysRemaining}d`
        : `${daysRemaining}d`
      : null;
  const planLabel = isExpired
    ? 'Expired'
    : effectivePlan === 'AI PRO'
    ? 'Pro'
    : effectivePlan;
  const showDays = !isExpired && !!daysText;

  const innerTone = isExpired
    ? 'bg-destructive text-destructive-foreground'
    : isInGracePeriod || isExpiringSoon
    ? 'bg-warning text-warning-foreground'
    : tier === 'pro'
    ? 'bg-warning text-warning-foreground'
    : tier === 'shakti'
    ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground'
    : 'bg-success text-success-foreground';

  const dotColor = syncing || syncInProgress
    ? 'bg-warning'
    : isOnline
    ? 'bg-success'
    : 'bg-muted-foreground';

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
          aria-label={`${planLabel}${showDays ? ' · ' + daysText : ''} · ${
            isOnline ? 'Online' : 'Offline'
          }`}
          className={cn(
            'relative shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full',
            'font-semibold text-[10px] leading-none transition-all',
            'shadow-sm active:scale-95 hover:brightness-105',
            innerTone
          )}
        >
          {syncSuccess ? (
            <CheckCircle2 className="w-3 h-3 shrink-0" />
          ) : syncError ? (
            <AlertCircle className="w-3 h-3 shrink-0" />
          ) : isWarn ? (
            <AlertTriangle className="w-3 h-3 shrink-0" />
          ) : (
            <PlanIcon className="w-3 h-3 shrink-0" />
          )}
          <span className="whitespace-nowrap">{planLabel}</span>

          {/* Live status dot — pulses when online & idle */}
          <span className="relative flex h-2 w-2 ml-0.5">
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75',
                dotColor,
                isOnline && !syncing && !syncInProgress && 'motion-safe:animate-ping'
              )}
            />
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor)} />
          </span>
          {pendingChanges > 0 && !syncing && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-card text-foreground border border-border text-[9px] font-bold rounded-full flex items-center justify-center">
              {pendingChanges > 9 ? '9+' : pendingChanges}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-72 p-0 overflow-hidden">
        {/* Subscription block */}
        <button
          onClick={() => navigate('/app/subscription')}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-3 text-left hover:brightness-105 transition',
            innerTone
          )}
        >
          <PlanIcon className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold leading-tight">{planLabel}</div>
            <div className="text-[11px] opacity-90">
              {isExpired
                ? t('common.subscription.expired_tap_renew', 'Tap to renew')
                : showDays
                ? isInGracePeriod
                  ? t('common.subscription.grace_period', 'Grace period · {{d}} days left', { d: daysRemaining })
                  : t('common.subscription.days_remaining', '{{d}} days remaining', { d: daysRemaining })
                : t('common.subscription.tap_to_manage', 'Tap to manage plan')}
            </div>
          </div>
        </button>

        {/* Connection + sync status */}
        <div className="px-4 py-3 space-y-2 border-t border-border/60 bg-card">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>{t('common.connection', 'Connection')}</span>
            </div>
            <span
              className={cn(
                'font-medium px-2 py-0.5 rounded-full text-[11px]',
                isOnline ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
              )}
            >
              {isOnline
                ? t('common.online', 'Online')
                : t('common.offline', 'Offline')}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t('sync.last_synced', 'Last synced')}
            </span>
            <span className="font-medium text-foreground">
              {formatLastSync(lastSyncTime)}
            </span>
          </div>
          {pendingChanges > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t('sync.pending', 'Pending')}
              </span>
              <span className="font-medium text-primary">{pendingChanges}</span>
            </div>
          )}
        </div>

        {/* Sync actions */}
        <div className="p-2 border-t border-border/60 bg-card space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-9"
            onClick={() => handleSync(false)}
            disabled={syncing || !isOnline}
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', syncing && 'animate-spin text-primary')}
            />
            <span>{t('sync.quick_sync', 'Quick sync')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start h-9"
            onClick={() => handleSync(true)}
            disabled={syncing || !isOnline}
          >
            <Database className="mr-2 h-4 w-4" />
            <span>{t('sync.full_reload', 'Full reload')}</span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
