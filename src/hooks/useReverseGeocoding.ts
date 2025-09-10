import { useState, useCallback } from 'react';

interface GeocodingResult {
  state: string;
  district?: string;
  city?: string;
  country?: string;
  formatted?: string;
}

export const useReverseGeocoding = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comprehensive state mapping with more precise boundaries
  const stateCoordinates: Record<string, { bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }; capital: { lat: number; lng: number } }> = {
    'Andhra Pradesh': { 
      bounds: { minLat: 12.6, maxLat: 19.9, minLng: 76.7, maxLng: 84.8 },
      capital: { lat: 16.5062, lng: 80.6480 }
    },
    'Arunachal Pradesh': { 
      bounds: { minLat: 26.6, maxLat: 29.5, minLng: 91.5, maxLng: 97.4 },
      capital: { lat: 27.1004, lng: 93.6167 }
    },
    'Assam': { 
      bounds: { minLat: 24.1, maxLat: 28.0, minLng: 89.7, maxLng: 96.1 },
      capital: { lat: 26.1433, lng: 91.7898 }
    },
    'Bihar': { 
      bounds: { minLat: 24.2, maxLat: 27.5, minLng: 83.3, maxLng: 88.3 },
      capital: { lat: 25.5941, lng: 85.1376 }
    },
    'Chhattisgarh': { 
      bounds: { minLat: 17.8, maxLat: 24.1, minLng: 80.2, maxLng: 84.4 },
      capital: { lat: 21.2514, lng: 81.6296 }
    },
    'Goa': { 
      bounds: { minLat: 14.9, maxLat: 15.8, minLng: 73.7, maxLng: 74.4 },
      capital: { lat: 15.2993, lng: 74.1240 }
    },
    'Gujarat': { 
      bounds: { minLat: 20.1, maxLat: 24.7, minLng: 68.1, maxLng: 74.5 },
      capital: { lat: 23.0225, lng: 72.5714 }
    },
    'Haryana': { 
      bounds: { minLat: 27.6, maxLat: 30.9, minLng: 74.2, maxLng: 77.6 },
      capital: { lat: 30.7333, lng: 76.7794 }
    },
    'Himachal Pradesh': { 
      bounds: { minLat: 30.4, maxLat: 33.3, minLng: 75.5, maxLng: 79.0 },
      capital: { lat: 31.1048, lng: 77.1734 }
    },
    'Jharkhand': { 
      bounds: { minLat: 21.9, maxLat: 25.3, minLng: 83.3, maxLng: 87.9 },
      capital: { lat: 23.3441, lng: 85.3096 }
    },
    'Karnataka': { 
      bounds: { minLat: 11.6, maxLat: 18.4, minLng: 74.0, maxLng: 78.6 },
      capital: { lat: 12.9716, lng: 77.5946 }
    },
    'Kerala': { 
      bounds: { minLat: 8.2, maxLat: 12.8, minLng: 74.8, maxLng: 77.4 },
      capital: { lat: 8.5241, lng: 76.9366 }
    },
    'Madhya Pradesh': { 
      bounds: { minLat: 21.1, maxLat: 26.9, minLng: 74.0, maxLng: 82.8 },
      capital: { lat: 23.2599, lng: 77.4126 }
    },
    'Maharashtra': { 
      bounds: { minLat: 15.7, maxLat: 22.0, minLng: 72.6, maxLng: 80.9 },
      capital: { lat: 19.0760, lng: 72.8777 }
    },
    'Manipur': { 
      bounds: { minLat: 23.8, maxLat: 25.7, minLng: 93.0, maxLng: 94.8 },
      capital: { lat: 24.8170, lng: 93.9368 }
    },
    'Meghalaya': { 
      bounds: { minLat: 25.0, maxLat: 26.1, minLng: 89.8, maxLng: 92.9 },
      capital: { lat: 25.5788, lng: 91.8933 }
    },
    'Mizoram': { 
      bounds: { minLat: 21.9, maxLat: 24.5, minLng: 92.2, maxLng: 93.5 },
      capital: { lat: 23.7367, lng: 92.7146 }
    },
    'Nagaland': { 
      bounds: { minLat: 25.2, maxLat: 27.0, minLng: 93.3, maxLng: 95.3 },
      capital: { lat: 25.6747, lng: 94.1086 }
    },
    'Odisha': { 
      bounds: { minLat: 17.8, maxLat: 22.6, minLng: 81.3, maxLng: 87.5 },
      capital: { lat: 20.2961, lng: 85.8245 }
    },
    'Punjab': { 
      bounds: { minLat: 29.5, maxLat: 32.5, minLng: 73.9, maxLng: 76.9 },
      capital: { lat: 30.7333, lng: 76.7794 }
    },
    'Rajasthan': { 
      bounds: { minLat: 23.0, maxLat: 30.2, minLng: 69.5, maxLng: 78.2 },
      capital: { lat: 26.9124, lng: 75.7873 }
    },
    'Sikkim': { 
      bounds: { minLat: 27.0, maxLat: 28.1, minLng: 88.0, maxLng: 88.9 },
      capital: { lat: 27.3389, lng: 88.6065 }
    },
    'Tamil Nadu': { 
      bounds: { minLat: 8.1, maxLat: 13.6, minLng: 76.2, maxLng: 80.3 },
      capital: { lat: 13.0827, lng: 80.2707 }
    },
    'Telangana': { 
      bounds: { minLat: 15.8, maxLat: 19.9, minLng: 77.2, maxLng: 81.3 },
      capital: { lat: 17.3850, lng: 78.4867 }
    },
    'Tripura': { 
      bounds: { minLat: 22.9, maxLat: 24.3, minLng: 91.0, maxLng: 92.3 },
      capital: { lat: 23.8315, lng: 91.2868 }
    },
    'Uttar Pradesh': { 
      bounds: { minLat: 23.9, maxLat: 30.4, minLng: 77.1, maxLng: 84.6 },
      capital: { lat: 26.8467, lng: 80.9462 }
    },
    'Uttarakhand': { 
      bounds: { minLat: 28.7, maxLat: 31.5, minLng: 77.6, maxLng: 81.0 },
      capital: { lat: 30.0668, lng: 79.0193 }
    },
    'West Bengal': { 
      bounds: { minLat: 21.5, maxLat: 27.2, minLng: 85.8, maxLng: 89.9 },
      capital: { lat: 22.5726, lng: 88.3639 }
    },
    'Delhi': { 
      bounds: { minLat: 28.4, maxLat: 28.9, minLng: 76.8, maxLng: 77.4 },
      capital: { lat: 28.6139, lng: 77.2090 }
    },
    'Puducherry': { 
      bounds: { minLat: 11.9, maxLat: 12.0, minLng: 79.7, maxLng: 79.9 },
      capital: { lat: 11.9416, lng: 79.8083 }
    },
    'Ladakh': {
      bounds: { minLat: 32.2, maxLat: 37.0, minLng: 74.3, maxLng: 80.3 },
      capital: { lat: 34.1526, lng: 77.5771 }
    },
    'Jammu and Kashmir': {
      bounds: { minLat: 32.2, maxLat: 35.0, minLng: 73.7, maxLng: 77.3 },
      capital: { lat: 34.0837, lng: 74.7973 }
    }
  };

  const getStateFromCoordinates = useCallback((lat: number, lng: number): GeocodingResult => {
    // First check if coordinates fall within state boundaries
    for (const [state, data] of Object.entries(stateCoordinates)) {
      const { bounds } = data;
      if (lat >= bounds.minLat && lat <= bounds.maxLat && 
          lng >= bounds.minLng && lng <= bounds.maxLng) {
        return { state, country: 'India' };
      }
    }

    // If no exact match, find nearest state capital
    let nearestState = 'default';
    let minDistance = Infinity;

    for (const [state, data] of Object.entries(stateCoordinates)) {
      const { capital } = data;
      const distance = Math.sqrt(
        Math.pow(lat - capital.lat, 2) + Math.pow(lng - capital.lng, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestState = state;
      }
    }

    // If nearest state is very far (more than 5 degrees), return default
    if (minDistance > 5) {
      return { state: 'default', country: 'India' };
    }

    return { state: nearestState, country: 'India' };
  }, []);

  const reverseGeocode = useCallback(async (latitude: number, longitude: number): Promise<GeocodingResult> => {
    setIsLoading(true);
    setError(null);

    try {
      // First try local detection
      const localResult = getStateFromCoordinates(latitude, longitude);
      
      // Try using OpenStreetMap Nominatim API (free, no API key required)
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
          {
            headers: {
              'Accept-Language': 'en',
              'User-Agent': 'KisanShakti/1.0'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          const address = data.address || {};
          
          // Extract state from OSM response
          const osmState = address.state || address.region || address.province || '';
          
          // Map OSM state names to our standard names
          const stateMapping: Record<string, string> = {
            'NCT of Delhi': 'Delhi',
            'National Capital Territory of Delhi': 'Delhi',
            'Orissa': 'Odisha',
            'Pondicherry': 'Puducherry',
            // Add more mappings as needed
          };

          const mappedState = stateMapping[osmState] || osmState;
          
          // If we found a valid Indian state, use it
          if (mappedState && stateCoordinates[mappedState]) {
            return {
              state: mappedState,
              district: address.state_district || address.county,
              city: address.city || address.town || address.village,
              country: address.country || 'India',
              formatted: data.display_name
            };
          }
        }
      } catch (osmError) {
        console.warn('OSM geocoding failed, using local detection:', osmError);
      }

      // Fall back to local detection
      return localResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to detect location';
      setError(errorMessage);
      return { state: 'default', country: 'India' };
    } finally {
      setIsLoading(false);
    }
  }, [getStateFromCoordinates]);

  return {
    reverseGeocode,
    getStateFromCoordinates,
    isLoading,
    error
  };
};