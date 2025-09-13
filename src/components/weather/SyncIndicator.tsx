import React from 'react';
import { Check, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SyncIndicatorProps {
  lastSyncTime: Date | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  isSyncing: boolean;
  onSync: () => void;
  className?: string;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({
  lastSyncTime,
  syncStatus,
  isSyncing,
  onSync,
  className
}) => {
  const getStatusIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    if (isSyncing) return 'Syncing...';
    if (!lastSyncTime) return 'Never synced';
    
    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return '✓ just now';
    if (minutes < 60) return `✓ ${minutes}m ago`;
    if (minutes < 1440) return `✓ ${Math.floor(minutes / 60)}h ago`;
    
    return `✓ ${format(lastSyncTime, 'MMM d, h:mm a')}`;
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center gap-2 text-sm">
        {getStatusIcon()}
        <span className={cn(
          'font-medium',
          syncStatus === 'success' && 'text-green-600',
          syncStatus === 'error' && 'text-destructive',
          syncStatus === 'syncing' && 'text-primary',
          syncStatus === 'idle' && 'text-muted-foreground'
        )}>
          {getStatusText()}
        </span>
      </div>
      
      <Button
        onClick={onSync}
        disabled={isSyncing}
        size="sm"
        variant="ghost"
        className="h-8 px-2"
      >
        <RefreshCw className={cn(
          'h-4 w-4',
          isSyncing && 'animate-spin'
        )} />
      </Button>
    </div>
  );
};