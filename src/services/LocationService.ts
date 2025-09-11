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
  district?: string;
  source?: 'gps' | 'village' | 'taluka' | 'district' | 'state' | 'default';
  approximateArea?: string;
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
      // Try to get location from user profile
      return await this.getLocationFromUserProfile();
    }

    // Check permission first
    if (this.permissionStatus === 'denied') {
      console.error('Location permission denied, trying user profile');
      // Try to get location from user profile
      return await this.getLocationFromUserProfile();
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
            timestamp: Date.now(),
            source: 'gps'
          };

          // Reverse geocode to get address
          await this.reverseGeocode(locationData);
          
          this.currentLocation = locationData;
          this.saveLocationToCache(locationData);
          this.notifyLocationUpdate(locationData);
          
          console.log('Got GPS location:', locationData);
          resolve(locationData);
        },
        async (error) => {
          console.warn('GPS location error:', error.message);
          // Try to get location from user profile
          const profileLocation = await this.getLocationFromUserProfile();
          if (profileLocation) {
            resolve(profileLocation);
          } else {
            // Return default location if all methods fail
            const defaultLocation: LocationData = {
              lat: 18.5204,
              lon: 73.8567,
              accuracy: 100,
              timestamp: Date.now(),
              city: 'Pune',
              state: 'Maharashtra',
              country: 'India',
              district: 'Pune',
              source: 'default'
            };
            this.currentLocation = defaultLocation;
            this.saveLocationToCache(defaultLocation);
            resolve(defaultLocation);
          }
        },
        options
      );
    });
  }

  // Geocode address to get coordinates with improved pincode and village handling
  async geocodeAddress(addressParts: {
    village?: string;
    taluka?: string;
    district?: string;
    state?: string;
    pincode?: string;
    country?: string;
  }): Promise<LocationData | null> {
    // Check cache first
    const cacheKey = `geocoded_${addressParts.pincode || addressParts.village}_${addressParts.taluka}_${addressParts.district}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        const age = Date.now() - cachedData.timestamp;
        if (age < 7 * 24 * 60 * 60 * 1000) { // 7 days
          console.log('Using cached geocoded location');
          return cachedData;
        }
      } catch (error) {
        console.error('Error parsing cached geocode:', error);
      }
    }

    // Build search queries with fallback hierarchy
    const queries = [];
    const { village, taluka, district, state, pincode, country = 'India' } = addressParts;

    // Priority 1: Try pincode first (most accurate for India)
    if (pincode && pincode.match(/^\d{6}$/)) {
      queries.push({
        query: `${pincode}, India`,
        source: 'village' as const,
        approximateArea: village || taluka || district
      });
    }

    // Priority 2: Village with district (skip taluka for better results)
    if (village && district && state) {
      const cleanVillage = village.replace(/\s*(village|gram|gaon|pur|pura|wadi|nagar)\s*$/i, '').trim();
      queries.push({
        query: `${cleanVillage}, ${district} District, ${state}, India`,
        source: 'village' as const,
        approximateArea: village
      });
    }

    // Priority 3: Full address with all components
    if (village && taluka && district && state) {
      queries.push({
        query: `${village}, ${taluka} Taluka, ${district} District, ${state}, India`,
        source: 'village' as const,
        approximateArea: village
      });
    }

    // Priority 4: Taluka with district
    if (taluka && district && state) {
      const cleanTaluka = taluka.replace(/\s*(taluka|tehsil|block)\s*$/i, '').trim();
      queries.push({
        query: `${cleanTaluka} Taluka, ${district} District, ${state}, India`,
        source: 'taluka' as const,
        approximateArea: taluka
      });
    }

    // Priority 5: District headquarters
    if (district && state) {
      queries.push({
        query: `${district} District Headquarters, ${state}, India`,
        source: 'district' as const,
        approximateArea: district
      });
    }

    // Priority 6: State capital
    if (state) {
      queries.push({
        query: `${state} Capital, India`,
        source: 'state' as const,
        approximateArea: state
      });
    }

    // Try each query in order
    for (const { query, source, approximateArea } of queries) {
      try {
        console.log(`Geocoding: ${query}`);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=3&countrycodes=in&addressdetails=1`
        );

        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            // Try to find the best match
            let bestResult = data[0];
            
            // If searching by pincode, try to find exact match
            if (pincode && query.includes(pincode)) {
              for (const result of data) {
                if (result.display_name && result.display_name.includes(pincode)) {
                  bestResult = result;
                  break;
                }
              }
            }
            
            const locationData: LocationData = {
              lat: parseFloat(bestResult.lat),
              lon: parseFloat(bestResult.lon),
              accuracy: source === 'village' ? 500 : source === 'taluka' ? 1000 : source === 'district' ? 5000 : 10000,
              timestamp: Date.now(),
              address: bestResult.display_name,
              city: taluka || district,
              state: state,
              country: country,
              district: district,
              source: source,
              approximateArea: approximateArea
            };

            // Cache the result
            localStorage.setItem(cacheKey, JSON.stringify(locationData));
            console.log(`Geocoded to ${source} level:`, locationData);
            return locationData;
          }
        }
      } catch (error) {
        console.error(`Geocoding error for ${query}:`, error);
      }
    }

    return null;
  }

  // Get location from user profile
  async getLocationFromUserProfile(): Promise<LocationData | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No authenticated user');
        return null;
      }

      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('village, taluka, district, state, pincode')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      console.log('User profile location data:', profile);

      // Try to geocode the address
      const geocoded = await this.geocodeAddress({
        village: profile.village,
        taluka: profile.taluka,
        district: profile.district,
        state: profile.state,
        pincode: profile.pincode,
        country: 'India'
      });

      if (geocoded) {
        this.currentLocation = geocoded;
        this.saveLocationToCache(geocoded);
        this.notifyLocationUpdate(geocoded);
        return geocoded;
      }

      return null;
    } catch (error) {
      console.error('Error getting location from profile:', error);
      return null;
    }
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
        location.district = data.address?.state_district || data.address?.district;
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
    
    let formatted = '';
    
    if (this.currentLocation.approximateArea) {
      formatted = this.currentLocation.approximateArea;
      if (this.currentLocation.district && this.currentLocation.district !== this.currentLocation.approximateArea) {
        formatted += `, ${this.currentLocation.district}`;
      }
    } else if (this.currentLocation.city && this.currentLocation.state) {
      formatted = `${this.currentLocation.city}, ${this.currentLocation.state}`;
    } else if (this.currentLocation.city) {
      formatted = this.currentLocation.city;
    } else if (this.currentLocation.state) {
      formatted = this.currentLocation.state;
    } else {
      formatted = `${this.currentLocation.lat.toFixed(2)}°N, ${this.currentLocation.lon.toFixed(2)}°E`;
    }

    // Add source indicator
    if (this.currentLocation.source && this.currentLocation.source !== 'gps') {
      const sourceLabel = {
        'village': 'Village',
        'taluka': 'Taluka',
        'district': 'District',
        'state': 'State',
        'default': 'Default'
      }[this.currentLocation.source];
      formatted += ` (${sourceLabel} Location)`;
    }

    return formatted;
  }

  // Get location accuracy text
  getLocationAccuracyText(): string {
    if (!this.currentLocation) return 'Unknown';
    
    switch (this.currentLocation.source) {
      case 'gps':
        return `GPS (±${Math.round(this.currentLocation.accuracy)}m)`;
      case 'village':
        return 'Village Area';
      case 'taluka':
        return 'Taluka Area';
      case 'district':
        return 'District Area';
      case 'state':
        return 'State Area';
      case 'default':
        return 'Default Location';
      default:
        return `±${Math.round(this.currentLocation.accuracy)}m`;
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