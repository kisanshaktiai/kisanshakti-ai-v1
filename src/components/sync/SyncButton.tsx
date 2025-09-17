import { RefreshCw, WifiOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncService } from '@/services/syncService';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { localDB } from '@/services/localDB';

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

  const handleSync = async () => {
    setSyncing(true);
    setSyncSuccess(false);
    setSyncError(false);
    
    try {
      // Start sync animation
      toast({
        title: "🔄 Syncing data...",
        description: "Please wait while we update your data",
        duration: 2000,
      });

      const result = await syncService.performSync(true);
      
      if (result.success) {
        // Invalidate all cached queries to force UI refresh
        await queryClient.invalidateQueries();
        
        // Clear and refresh local cache
        await queryClient.refetchQueries();
        
        // Show success animation
        setSyncSuccess(true);
        
        toast({
          title: "✅ Sync complete!",
          description: result.message || "All data is up to date",
          duration: 3000,
        });

        // Reset success state after animation
        setTimeout(() => setSyncSuccess(false), 2000);
        
        // Update pending changes count
        const metadata = await localDB.getSyncMetadata();
        setPendingChanges(metadata.pendingChanges);
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
      toast({
        title: "❌ Sync failed",
        description: "Please check your connection and try again",
        variant: "destructive",
        duration: 4000,
      });
      setTimeout(() => setSyncError(false), 2000);
    } finally {
      setSyncing(false);
      // Force a final UI refresh
      window.location.reload();
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
      <Button
        variant={syncSuccess ? "default" : syncError ? "destructive" : "outline"}
        size="icon"
        onClick={handleSync}
        disabled={syncing}
        className={cn(
          "relative transition-all duration-300",
          syncing && "bg-primary/10",
          syncSuccess && "bg-green-500 hover:bg-green-600",
          syncError && "bg-destructive hover:bg-destructive/90"
        )}
      >
        <AnimatePresence mode="wait">
          {syncing ? (
            <motion.div
              key="syncing"
              initial={{ scale: 0, rotate: 0 }}
              animate={{ scale: 1, rotate: 360 }}
              exit={{ scale: 0, rotate: 0 }}
              transition={{
                rotate: {
                  duration: 1,
                  repeat: Infinity,
                  ease: "linear"
                },
                scale: {
                  duration: 0.2
                }
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </motion.div>
          ) : syncSuccess ? (
            <motion.div
              key="success"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.3, type: "spring" }}
            >
              <CheckCircle2 className="h-4 w-4 text-white" />
            </motion.div>
          ) : syncError ? (
            <motion.div
              key="error"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.3, type: "spring" }}
            >
              <AlertCircle className="h-4 w-4 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.2 }}
            >
              <RefreshCw className="h-4 w-4" />
            </motion.div>
          )}
        </AnimatePresence>
        <span className="sr-only">Sync data</span>
      </Button>
      
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