import { useState, useEffect } from 'react';
import LocationService, { LocationData } from '@/services/LocationService';

export const useLocation = () => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load cached location immediately
    const cached = LocationService.getCachedLocation();
    if (cached) {
      setLocation(cached);
    }

    // Subscribe to location updates
    const unsubscribe = LocationService.subscribeToLocationUpdates((newLocation) => {
      setLocation(newLocation);
      setError(null);
    });

    // Get fresh location in background
    fetchLocation();

    return () => {
      unsubscribe();
    };
  }, []);

  const fetchLocation = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const locationData = await LocationService.getCurrentLocation(forceRefresh);
      if (locationData) {
        setLocation(locationData);
      } else if (!location) {
        setError('Unable to get location');
      }
    } catch (err) {
      console.error('Error fetching location:', err);
      setError('Failed to get location');
    } finally {
      setIsLoading(false);
    }
  };

  const startTracking = () => {
    LocationService.startLocationTracking();
  };

  const stopTracking = () => {
    LocationService.stopLocationTracking();
  };

  const getFormattedLocation = () => {
    return LocationService.getFormattedLocation();
  };

  return {
    location,
    isLoading,
    error,
    fetchLocation,
    startTracking,
    stopTracking,
    getFormattedLocation,
  };
};