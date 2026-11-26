import { useCallback, useEffect, useState } from 'react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useProviderRequestsStore } from '@/stores/providerRequestsStore';
import { providerRequestsService, type ProviderInbox } from '@/services/providerRequestsService';

/** How often the inbox is read again while the workspace is open and on screen. */
const REFRESH_MS = 60_000;

/**
 * The provider's requests. With poll on (the workspace shell) they are read
 * when the workspace opens and again every minute while the app is on screen
 * and online, so a new request shows as a mark on the navigation without the
 * provider doing anything. With poll off (a screen inside the shell, the
 * Customer workspace, the Provider Workspace switched off) nothing is read
 * until the screen calls reload().
 */
export function useProviderRequestsInbox(poll: boolean): {
  inbox: ProviderInbox | null;
  error: unknown;
  reload: () => Promise<void>;
} {
  const inbox = useProviderRequestsStore((s) => s.inbox);
  const isOnline = useOfflineStatus();
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      await providerRequestsService.inbox();
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    if (!poll || !isOnline) return;
    void reload();
    const again = () => { if (document.visibilityState === 'visible') void reload(); };
    const timer = window.setInterval(again, REFRESH_MS);
    document.addEventListener('visibilitychange', again);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', again); };
  }, [poll, isOnline, reload]);

  return { inbox, error, reload };
}
