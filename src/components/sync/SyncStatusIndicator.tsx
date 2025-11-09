import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { localDB } from '@/services/localDB';
import { useAuthStore } from '@/stores/authStore';

export function SyncStatusIndicator() {
  const { user } = useAuthStore();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [dataCount, setDataCount] = useState({ lands: 0, schedules: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      
      try {
        // Get sync metadata
        const metadata = await localDB.getSyncMetadata();
        if (metadata?.lastSyncTime) {
          setLastSync(new Date(metadata.lastSyncTime));
        }
        
        // Get ONLY current farmer's data (with data isolation)
        const lands = await localDB.getLands(undefined, user.id);
        const schedules = await localDB.getAllSchedules(user.id);
        setDataCount({ lands: lands.length, schedules: schedules.length });
      } catch (error) {
        console.error('Error checking sync status:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [user?.id]);

  if (!user) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : dataCount.lands > 0 || dataCount.schedules > 0 ? (
        <CheckCircle className="h-3 w-3 text-green-500" />
      ) : (
        <AlertCircle className="h-3 w-3 text-yellow-500" />
      )}
      <span>
        {dataCount.lands} lands, {dataCount.schedules} schedules
      </span>
      {lastSync && (
        <span className="text-muted-foreground/70">
          • {lastSync.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
