import { useEffect, useState } from 'react';
import { useAccountStore, type ReachState } from '@/stores/accountStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { accountReachService } from '@/services/accountReachService';
import type { AccountRole } from '@/lib/accountRoles';

/**
 * Keeps the Reach of one workspace fresh. Mounted once per workspace (in the
 * layout); the header button and the Reach card read the result from
 * accountStore. Without a network the last known Reach is shown.
 */
export function useAccountReach(role: AccountRole): { reach: ReachState | null; loading: boolean } {
  const reach = useAccountStore((s) => s.reach[role]) ?? null;
  const isOnline = useOfflineStatus();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    setLoading(true);
    accountReachService.get(role)
      .then(async (current) => {
        // The server stores only the village id; the name is for display.
        if (cancelled || !current.is_set || !current.base_village_id || current.village_name) return;
        const name = await accountReachService.villageName(current.base_village_id);
        if (cancelled || !name) return;
        const latest = useAccountStore.getState().reach[role];
        if (latest && latest.base_village_id === current.base_village_id) {
          useAccountStore.getState().setReach(role, { ...latest, village_name: name });
        }
      })
      .catch(() => { /* the cached Reach stays on screen */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [role, isOnline]);

  return { reach, loading };
}
