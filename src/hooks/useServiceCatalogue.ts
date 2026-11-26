import { useEffect, useState } from 'react';
import { useProviderStore } from '@/stores/providerStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { providerWorkspaceService, type ProviderCatalogue } from '@/services/providerWorkspaceService';
import { providerErrorMessage } from '@/lib/providerText';

/**
 * The service catalogue (kinds of work, units, plant kinds, payment methods)
 * for the farmer's side. Read once per session and kept in the provider store;
 * no provider session is needed, the lookup tables are public to read.
 */
export function useServiceCatalogue(): { catalogue: ProviderCatalogue | null; error: string | null } {
  const catalogue = useProviderStore((s) => s.catalogue);
  const isOnline = useOfflineStatus();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (catalogue || !isOnline) return;
    let cancelled = false;
    providerWorkspaceService.loadCatalogue().catch((e) => { if (!cancelled) setError(providerErrorMessage(e)); });
    return () => { cancelled = true; };
  }, [catalogue, isOnline]);

  return { catalogue, error };
}
