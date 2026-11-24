import { useEffect } from 'react';
import { useProviderStore } from '@/stores/providerStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { providerWorkspaceService } from '@/services/providerWorkspaceService';
import type { AccountRole } from '@/lib/accountRoles';

/**
 * Whether the Provider Workspace (services, hours, equipment, nursery) is
 * switched on for this person's tenant. Asked from the server each time the
 * provider layout opens; the last answer is used until the new one arrives and
 * while there is no network. Always false outside the Provider workspace.
 */
export function useProviderFlag(role: AccountRole): boolean {
  const enabled = useProviderStore((s) => s.enabled);
  const isOnline = useOfflineStatus();

  useEffect(() => {
    if (role !== 'SERVICE_PROVIDER' || !isOnline) return;
    void providerWorkspaceService.refreshEnabled();
  }, [role, isOnline]);

  return role === 'SERVICE_PROVIDER' && enabled;
}
