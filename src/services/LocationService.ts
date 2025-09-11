import { supabase } from '@/integrations/supabase/client';

export interface LocationData {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}

class LocationService {
  private static instance: LocationService;
  private watchId: number | null = null;
  private currentLocation: LocationData | null = null;
  private locationUpdateCallbacks: Set<(location: LocationData) => void> = new Set();
  private permissionStatus: PermissionState = 'prompt';
  private readonly LOCATION_CACHE_KEY = 'app_cached_location';
  private readonly LOCATION_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  private isRequestingPermission = false;

  private constructor() {
    this.loadCachedLocation();
  }

  static getInstance(): LocationService {
    if (!LocationService.instance) {
      LocationService.instance = new LocationService();
    }
    return LocationService.instance;
  }

  // Load cached location from localStorage
  private loadCachedLocation(): void {
    try {
      const cached = localStorage.getItem(this.LOCATION_CACHE_KEY);
      if (cached) {
        const locationData = JSON.parse(cached) as LocationData;
        const age = Date.now() - locationData.timestamp;
        
        // Use cached location if it's less than cache duration old
        if (age < this.LOCATION_CACHE_DURATION) {
          this.currentLocation = locationData;
          console.log('Loaded cached location:', locationData);
        } else {
          console.log('Cached location expired');
          localStorage.removeItem(this.LOCATION_CACHE_KEY);
        }
      }
    } catch (error) {
      console.error('Error loading cached location:', error);
    }
  }

  // Save location to localStorage
  private saveLocationToCache(location: LocationData): void {
    try {
      localStorage.setItem(this.LOCATION_CACHE_KEY, JSON.stringify(location));
    } catch (error) {
      console.error('Error saving location to cache:', error);
    }
  }

  // Request location permission
  async requestLocationPermission(): Promise<PermissionState> {
    if (this.isRequestingPermission) {
      return this.permissionStatus;
    }

    this.isRequestingPermission = true;

    try {
      if ('permissions' in navigator && 'query' in navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        this.permissionStatus = permission.state;
        
        permission.addEventListener('change', () => {
          this.permissionStatus = permission.state;
          console.log('Location permission changed:', permission.state);
        });

        return permission.state;
      }
      
      // Fallback: Try to get location to trigger permission prompt
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            this.permissionStatus = 'granted';
            resolve('granted');
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              this.permissionStatus = 'denied';
              resolve('denied');
            } else {
              this.permissionStatus = 'prompt';
              resolve('prompt');
            }
          },
          { timeout: 5000 }
        );
      });
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return 'prompt';
    } finally {
      this.isRequestingPermission = false;
    }
  }

  // Get current location with high accuracy
  async getCurrentLocation(forceRefresh = false): Promise<LocationData | null> {
    // Return cached location if available and not forcing refresh
    if (!forceRefresh && this.currentLocation) {
      const age = Date.now() - this.currentLocation.timestamp;
      if (age < 60000) { // If location is less than 1 minute old
        console.log('Returning recent cached location');
        return this.currentLocation;
      }
    }

    if (!('geolocation' in navigator)) {
      console.error('Geolocation not supported');
      return null;
    }

    // Check permission first
    if (this.permissionStatus === 'denied') {
      console.error('Location permission denied');
      return this.currentLocation; // Return cached location if available
    }

    return new Promise((resolve) => {
      const options: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const locationData: LocationData = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now()
          };

          // Reverse geocode to get address
          await this.reverseGeocode(locationData);
          
          this.currentLocation = locationData;
          this.saveLocationToCache(locationData);
          this.notifyLocationUpdate(locationData);
          
          console.log('Got new location:', locationData);
          resolve(locationData);
        },
        (error) => {
          console.error('Error getting location:', error);
          resolve(this.currentLocation); // Return cached location on error
        },
        options
      );
    });
  }

  // Start watching location in background
  startLocationTracking(): void {
    if (this.watchId !== null) {
      console.log('Location tracking already active');
      return;
    }

    if (!('geolocation' in navigator)) {
      console.error('Geolocation not supported');
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 10000 // Accept cached position up to 10 seconds old
    };

    this.watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const locationData: LocationData = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };

        // Only update if location has changed significantly (more than 100 meters)
        if (this.hasLocationChangedSignificantly(locationData)) {
          await this.reverseGeocode(locationData);
          this.currentLocation = locationData;
          this.saveLocationToCache(locationData);
          this.notifyLocationUpdate(locationData);
          console.log('Location updated:', locationData);
        }
      },
      (error) => {
        console.error('Location tracking error:', error);
      },
      options
    );

    console.log('Started location tracking');
  }

  // Stop watching location
  stopLocationTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      console.log('Stopped location tracking');
    }
  }

  // Check if location has changed significantly
  private hasLocationChangedSignificantly(newLocation: LocationData): boolean {
    if (!this.currentLocation) return true;
    
    const distance = this.calculateDistance(
      this.currentLocation.lat,
      this.currentLocation.lon,
      newLocation.lat,
      newLocation.lon
    );
    
    return distance > 100; // More than 100 meters
  }

  // Calculate distance between two coordinates in meters
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Reverse geocode to get address
  private async reverseGeocode(location: LocationData): Promise<void> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lon}&zoom=10&addressdetails=1`
      );
      
      if (response.ok) {
        const data = await response.json();
        location.address = data.display_name;
        location.city = data.address?.city || data.address?.town || data.address?.village || data.address?.county;
        location.state = data.address?.state;
        location.country = data.address?.country;
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
    }
  }

  // Subscribe to location updates
  subscribeToLocationUpdates(callback: (location: LocationData) => void): () => void {
    this.locationUpdateCallbacks.add(callback);
    
    // Send current location immediately if available
    if (this.currentLocation) {
      callback(this.currentLocation);
    }
    
    // Return unsubscribe function
    return () => {
      this.locationUpdateCallbacks.delete(callback);
    };
  }

  // Notify all subscribers of location update
  private notifyLocationUpdate(location: LocationData): void {
    this.locationUpdateCallbacks.forEach(callback => {
      callback(location);
    });
  }

  // Get cached location
  getCachedLocation(): LocationData | null {
    return this.currentLocation;
  }

  // Get formatted location string
  getFormattedLocation(): string {
    if (!this.currentLocation) return 'Location not available';
    
    if (this.currentLocation.city && this.currentLocation.state) {
      return `${this.currentLocation.city}, ${this.currentLocation.state}`;
    } else if (this.currentLocation.city) {
      return this.currentLocation.city;
    } else if (this.currentLocation.state) {
      return this.currentLocation.state;
    } else {
      return `${this.currentLocation.lat.toFixed(2)}°N, ${this.currentLocation.lon.toFixed(2)}°E`;
    }
  }

  // Check if location permission is granted
  async isLocationPermissionGranted(): Promise<boolean> {
    if (this.permissionStatus === 'granted') return true;
    
    const status = await this.requestLocationPermission();
    return status === 'granted';
  }
}

export default LocationService.getInstance();