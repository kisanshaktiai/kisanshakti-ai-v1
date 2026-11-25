import { useEffect, useState } from 'react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { farmServicesService, isFarmServicesRemembered } from '@/services/farmServicesService';

/**
 * Whether "services near me" is switched on for this farmer's tenant. Asked
 * from the server when online; the last answer is used until then and while
 * there is no network, so the entry never flickers.
 */
export function useFarmServicesFlag(): boolean {
  const isOnline = useOfflineStatus();
  const [enabled, setEnabled] = useState<boolean>(() => isFarmServicesRemembered());

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    farmServicesService.enabled().then((value) => { if (!cancelled) setEnabled(value); });
    return () => { cancelled = true; };
  }, [isOnline]);

  return enabled;
}
