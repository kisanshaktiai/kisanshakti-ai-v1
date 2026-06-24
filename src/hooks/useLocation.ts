/**
 * @deprecated Use useUnifiedLocation instead
 * This hook is maintained for backward compatibility only.
 */

import { useUnifiedLocation } from './useUnifiedLocation';

export const useLocation = () => {
  const {
    gpsLocation,
    fetchGPSLocation,
    startGPSTracking,
    stopGPSTracking,
    getFormattedLocation,
    loading,
    error
  } = useUnifiedLocation({ loadGPS: true });
  
  return {
    location: gpsLocation,
    isLoading: loading.gps,
    error,
    fetchLocation: fetchGPSLocation,
    startTracking: startGPSTracking,
    stopTracking: stopGPSTracking,
    getFormattedLocation
  };
};
