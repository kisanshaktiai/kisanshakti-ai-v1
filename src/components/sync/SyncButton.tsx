import { RefreshCw, WifiOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncService } from '@/services/syncService';
import { localDB } from '@/services/localDB';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export function SyncButton() {
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(0);
  const isOnline = useOfflineStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Check for pending changes
  useEffect(() => {
    const checkPendingChanges = async () => {
      const metadata = await localDB.getSyncMetadata();
      setPendingChanges(metadata.pendingChanges);
    };

    checkPendingChanges();
    const interval = setInterval(checkPendingChanges, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncSuccess(false);
    setSyncError(false);
    
    try {
      toast({
        title: t('sync.syncing'),
        description: t('sync.please_wait'),
        duration: 2000,
      });

      const result = await syncService.performSync(true);

      if (result.success) {
        console.log('🔄 [SyncButton] Invalidating all React Query caches');
        await queryClient.invalidateQueries();
        await queryClient.refetchQueries();

        setSyncSuccess(true);

        toast({
          title: t('sync.sync_complete'),
          description: result.message || t('sync.all_up_to_date'),
          duration: 3000,
        });

        setTimeout(() => setSyncSuccess(false), 2000);
        
        const metadata = await localDB.getSyncMetadata();
        setPendingChanges(metadata?.pendingChanges || 0);
      } else {
        setSyncError(true);
        toast({
          title: t('sync.sync_partial'),
          description: result.errors?.join(', ') || t('sync.some_data_failed'),
          variant: "destructive",
          duration: 4000,
        });
        setTimeout(() => setSyncError(false), 2000);
      }
    } catch (error) {
      setSyncError(true);
      console.error('❌ [SyncButton] Sync failed:', error);
      toast({
        title: t('sync.sync_failed'),
        description: t('sync.check_connection'),
        variant: "destructive",
        duration: 4000,
      });
      setTimeout(() => setSyncError(false), 2000);
    } finally {
      setSyncing(false);
    }
  };

  if (!isOnline) {
    return (
      <div className="relative">
        <Button 
          variant="outline" 
          size="icon" 
          disabled 
          className="relative bg-muted/50"
        >
          <WifiOff className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">{t('sync.offline')}</span>
        </Button>
        {pendingChanges > 0 && (
          <span className="absolute -top-1 -right-1 h-3 w-3 bg-warning rounded-full animate-pulse" />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={syncSuccess ? "default" : syncError ? "destructive" : "outline"}
            size="icon"
            disabled={syncing}
            className={cn(
              "relative transition-all duration-300",
              syncing && "bg-primary/10",
              syncSuccess && "bg-green-500 hover:bg-green-600",
              syncError && "bg-destructive hover:bg-destructive/90"
            )}
          >
            {/* Simplified icon with CSS transitions */}
            <div className="relative w-4 h-4">
              <RefreshCw 
                className={cn(
                  "h-4 w-4 absolute inset-0 transition-all duration-300",
                  syncing && "animate-spin opacity-100",
                  !syncing && "opacity-100"
                )}
              />
              {syncSuccess && (
                <CheckCircle2 
                  className="h-4 w-4 text-white absolute inset-0 animate-in zoom-in-50 duration-200" 
                />
              )}
              {syncError && (
                <AlertCircle 
                  className="h-4 w-4 text-white absolute inset-0 animate-in zoom-in-50 duration-200" 
                />
              )}
            </div>
            <span className="sr-only">{t('sync.sync_data')}</span>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => handleSync()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            <span>{t('sync.sync_data')}</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {pendingChanges > 0 
              ? t('sync.pending_changes', { count: pendingChanges })
              : t('sync.all_synced')
            }
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Pending changes indicator */}
      {pendingChanges > 0 && !syncing && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-warning text-warning-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1"
        >
          {pendingChanges}
        </motion.span>
      )}
      
      {/* Syncing pulse animation */}
      {syncing && (
        <motion.div
          className="absolute inset-0 rounded-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <div className="w-full h-full bg-primary rounded-md" />
        </motion.div>
      )}
    </div>
  );
}