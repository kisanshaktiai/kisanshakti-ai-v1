import { useState, useEffect } from 'react';
import LocationService from '@/services/LocationService';
import { useToast } from '@/hooks/use-toast';

export const useLocationPermission = () => {
  const [permissionStatus, setPermissionStatus] = useState<PermissionState>('prompt');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    if ('permissions' in navigator && 'query' in navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionStatus(permission.state);
        
        permission.addEventListener('change', () => {
          setPermissionStatus(permission.state);
        });
      } catch (error) {
        console.error('Error checking permission status:', error);
      }
    }
  };

  const requestPermission = async () => {
    setIsLoading(true);
    try {
      const status = await LocationService.requestLocationPermission();
      setPermissionStatus(status);
      
      if (status === 'granted') {
        toast({
          title: "Location Access Granted",
          description: "You can now get accurate weather and agricultural insights for your location.",
        });
        
        // Start location tracking after permission is granted
        LocationService.startLocationTracking();
        
        // Get initial location
        await LocationService.getCurrentLocation(true);
      } else if (status === 'denied') {
        toast({
          title: "Location Access Denied",
          description: "Please enable location access in your device settings for better experience.",
          variant: "destructive",
        });
      }
      
      return status;
    } catch (error) {
      console.error('Error requesting permission:', error);
      toast({
        title: "Error",
        description: "Failed to request location permission. Please try again.",
        variant: "destructive",
      });
      return 'prompt';
    } finally {
      setIsLoading(false);
    }
  };

  return {
    permissionStatus,
    requestPermission,
    isLoading,
  };
};