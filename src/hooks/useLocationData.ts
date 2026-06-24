/**
 * @deprecated Use useUnifiedLocation instead
 * This hook is maintained for backward compatibility only.
 * 
 * Migration:
 * - import { useUnifiedLocation } from '@/hooks/useUnifiedLocation'
 * - const { states, districts, loadDistricts, ... } = useUnifiedLocation()
 */

import { useUnifiedLocation } from './useUnifiedLocation';

export function useLocationData() {
  const { 
    states, 
    districts, 
    talukas, 
    villages,
    loadDistricts,
    loadTalukas,
    loadVillages,
    loading,
    error
  } = useUnifiedLocation();
  
  return {
    states,
    districts,
    talukas,
    villages,
    loadDistricts,
    loadTalukas,
    loadVillages,
    loading,
    errors: {
      states: error,
      districts: error,
      talukas: error,
      villages: error
    }
  };
}
