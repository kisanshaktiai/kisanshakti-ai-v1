import { useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useProviderStore } from '@/stores/providerStore';
import { serviceIcon } from '@/lib/providerIcons';

/**
 * Pictures for the service catalogue, from the catalogue already in the
 * provider store. Returns a function: give it a family or service code (and
 * the family code when known) and it gives the icon to draw. Reads nothing
 * from the network; before the catalogue is there it gives the built-in
 * family picture, and the screen redraws by itself once the catalogue arrives.
 */
export function useServiceIcons(): (code: string | null | undefined, familyCode?: string | null) => LucideIcon {
  const categories = useProviderStore((s) => s.catalogue?.categories);
  return useCallback(
    (code: string | null | undefined, familyCode?: string | null) => serviceIcon(categories, code, familyCode),
    [categories],
  );
}
