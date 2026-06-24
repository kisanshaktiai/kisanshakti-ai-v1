import { useEffect, useState } from 'react';
import { localDB } from '@/services/localDB';

export interface SyncMetadata {
  lastSyncTime: number | null;
  pendingChanges: number;
  syncInProgress: boolean;
}

/**
 * Single source of truth for sync metadata.
 * Polls localDB every 5s. Shared across header status dot and sync button.
 */
export function useSyncMetadata(): SyncMetadata {
  const [metadata, setMetadata] = useState<SyncMetadata>({
    lastSyncTime: null,
    pendingChanges: 0,
    syncInProgress: false,
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const m = await localDB.getSyncMetadata();
        if (mounted) setMetadata(m);
      } catch {
        /* noop */
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return metadata;
}
