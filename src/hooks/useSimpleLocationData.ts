/**
 * @deprecated Use useUnifiedLocation instead
 * This hook is maintained for backward compatibility only.
 */

import { useUnifiedLocation } from './useUnifiedLocation';

export function useSimpleLocationData() {
  const { 
    states, 
    districts, 
    talukas, 
    villages,
    loadDistricts,
    loadTalukas,
    loadVillages,
    loading
  } = useUnifiedLocation({ showToasts: true });
  
  return {
    states,
    districts,
    talukas,
    villages,
    loadDistricts,
    loadTalukas,
    loadVillages,
    loading: loading.states || loading.districts || loading.talukas || loading.villages
  };
}
