import { RefreshCw, WifiOff, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncService } from '@/services/syncService';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { localDB } from '@/services/localDB';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export function SyncButton() {
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

  const handleSync = async (forceFull: boolean = false) => {
    setSyncing(true);
    setSyncSuccess(false);
    setSyncError(false);
    
    try {
      // Show appropriate toast based on sync type
      toast({
        title: forceFull ? "🔄 Full sync starting..." : "🔄 Syncing data...",
        description: forceFull 
          ? "Clearing local data and reloading from server..." 
          : "Please wait while we update your data",
        duration: 2000,
      });

      // If force full sync, clear local DB first
      if (forceFull) {
        console.log('🗑️ [SyncButton] Force full sync - clearing local DB');
        await localDB.forceClearAndReload();
        
        // Also reset headers state to force re-authentication check
        const { resetHeadersState } = await import('@/integrations/supabase/client');
        resetHeadersState();
        console.log('🔄 [SyncButton] Reset headers state for clean reload');
      }

      const result = await syncService.performSync(!forceFull); // Pass forceRefresh flag
      
      if (result.success) {
        // Invalidate all cached queries to force UI refresh
        console.log('🔄 [SyncButton] Invalidating all React Query caches');
        await queryClient.invalidateQueries();
        
        // Refetch all active queries
        await queryClient.refetchQueries();
        
        // Show success animation
        setSyncSuccess(true);
        
        toast({
          title: "✅ Sync complete!",
          description: forceFull 
            ? "All data reloaded from server - please refresh if needed" 
            : (result.message || "All data is up to date"),
          duration: 3000,
        });

        // For full sync, suggest page reload after a delay
        if (forceFull) {
          setTimeout(() => {
            toast({
              title: "💡 Tip",
              description: "For best results, refresh the page after full sync",
              action: (
                <Button
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  Refresh Now
                </Button>
              ),
            });
          }, 2000);
        }

        // Reset success state after animation
        setTimeout(() => setSyncSuccess(false), 2000);
        
        // Update pending changes count
        const metadata = await localDB.getSyncMetadata();
        setPendingChanges(metadata?.pendingChanges || 0);
      } else {
        setSyncError(true);
        toast({
          title: "⚠️ Sync partially completed",
          description: result.errors?.join(', ') || "Some data could not be synced",
          variant: "destructive",
          duration: 4000,
        });
        setTimeout(() => setSyncError(false), 2000);
      }
    } catch (error) {
      setSyncError(true);
      console.error('❌ [SyncButton] Sync failed:', error);
      toast({
        title: "❌ Sync failed",
        description: "Please check your connection and try again",
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
          <span className="sr-only">Offline</span>
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
            <span className="sr-only">Sync data</span>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => handleSync(false)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            <span>Quick Sync</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => handleSync(true)}>
            <Database className="mr-2 h-4 w-4" />
            <span>Full Reload from Server</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {pendingChanges > 0 
              ? `${pendingChanges} pending change${pendingChanges > 1 ? 's' : ''}`
              : 'All data synced'
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