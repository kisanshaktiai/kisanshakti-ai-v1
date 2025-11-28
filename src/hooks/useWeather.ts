import { useState, useEffect } from 'react';
import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from '@/hooks/useLocation';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';

interface WeatherData {
  temp: number;
  feels_like: number;
  temp_min: number;
  temp_max: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_deg: number;
  description: string;
  main: string;
  icon: string;
  clouds: number;
  visibility: number;
  sunrise: number;
  sunset: number;
  location: string;
  dt: number;
  provider?: string;
  uv_index?: number;
  dew_point?: number;
}

interface ForecastData {
  dt: number;
  temp: {
    day: number;
    min: number;
    max: number;
    night: number;
    eve: number;
    morn: number;
  };
  feels_like: {
    day: number;
    night: number;
    eve: number;
    morn: number;
  };
  pressure: number;
  humidity: number;
  wind_speed: number;
  wind_deg: number;
  weather: Array<{
    id: number;
    main: string;
    description: string;
    icon: string;
  }>;
  clouds: number;
  pop: number;
  rain?: number;
  uvi: number;
  moon_phase?: number;
}

interface HourlyData {
  dt: number;
  temp: number;
  feels_like: number;
  pressure: number;
  humidity: number;
  clouds: number;
  visibility: number;
  wind_speed: number;
  wind_deg: number;
  wind_gust?: number;
  weather: Array<{
    id: number;
    main: string;
    description: string;
    icon: string;
  }>;
  pop: number;
  rain?: {
    '1h': number;
  };
}

// Helper to round coordinates to 2 decimal places (~1km precision)
function roundCoordinates(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100
  };
}

export const useWeather = (location?: { lat: number; lon: number }) => {
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const { toast } = useToast();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { user } = useAuthStore();
  
  // Use the centralized location service
  const { location: deviceLocation } = useLocation();
  
  // Default location (India - New Delhi)
  const defaultLocation = { lat: 28.6139, lon: 77.2090 };

  const fetchWeatherData = async (forceRefresh: boolean = false) => {
    // Don't fetch if tenant isn't loaded yet
    if (!tenant?.id) {
      console.log('⏳ [useWeather] Waiting for tenant to load before fetching weather');
      return;
    }

    const weatherLocation = location || (deviceLocation ? { lat: deviceLocation.lat, lon: deviceLocation.lon } : defaultLocation);
    
    // Round coordinates for consistent caching (~1km precision)
    const rounded = roundCoordinates(weatherLocation.lat, weatherLocation.lon);
    
    console.log('🌤️ [useWeather] Fetching weather with tenant:', tenant.id);
    console.log('📍 [useWeather] Rounded location:', rounded);
    console.log('🔄 [useWeather] Force refresh:', forceRefresh);
    
    try {
      // Use rounded coordinates for cache key
      const cacheKey = `weather_cache_${rounded.lat}_${rounded.lon}`;
      const cachedDataStr = localStorage.getItem(cacheKey);
      let hasCache = false;
      
      if (cachedDataStr && !forceRefresh) {
        try {
          const cached = JSON.parse(cachedDataStr);
          const cacheAge = Date.now() - cached.timestamp;
          
          // Show cached data immediately for better UX (stale-while-revalidate)
          if (cacheAge < 900000) { // 15 minutes (match backend cache TTL)
            console.log('✅ [useWeather] Showing cached data while fetching fresh data');
            setCurrentWeather(cached.current);
            setForecast(cached.forecast || []);
            setHourlyForecast(cached.hourly || []);
            setLastUpdated(cached.timestamp);
            setLoading(false);
            hasCache = true;
          }
        } catch (e) {
          console.warn('⚠️ [useWeather] Failed to parse cached weather data:', e);
        }
      }

      // ALWAYS fetch fresh data in background (world-class weather app pattern)
      if (!hasCache) {
        setLoading(true);
      }
      setError(null);

      // Use authenticated client for better RLS support
      const weatherClient = user?.id && tenant?.id 
        ? supabaseWithAuth(user.id, tenant.id)
        : supabase;
      
      // NEW: Single combined API call for all weather data
      console.log('📡 [useWeather] Fetching ALL weather data (current + forecast + hourly) in one call...');
      
      const { data, error: fetchError } = await weatherClient.functions.invoke('weather', {
        body: {
          action: 'all', // NEW: Get everything at once
          lat: rounded.lat,
          lon: rounded.lon,
        },
      });

      if (fetchError) {
        console.error('❌ [useWeather] Weather fetch error:', fetchError);
        throw fetchError;
      }

      if (data) {
        console.log('✅ [useWeather] Received complete weather data:', {
          hasCurrent: !!data.current,
          hasForecast: !!data.forecast,
          hasHourly: !!data.hourly,
          cached: data.cached,
          provider: data.provider || 'Unknown', // Log provider
          isStale: data.stale
        });
        
        // Extract all data from single response
        const currentData = data.current;
        const dailyData = data.forecast || [];
        const hourlyData = data.hourly || [];
        
        // Add location name from localStorage or use coordinates
        if (currentData) {
          const storedLocationName = localStorage.getItem('weatherLocationName');
          if (storedLocationName) {
            currentData.location = storedLocationName;
          } else if (currentData.location) {
            currentData.location = currentData.location;
          } else {
            currentData.location = `${rounded.lat.toFixed(2)}°N, ${rounded.lon.toFixed(2)}°E`;
          }
          
          // Include provider in current weather data
          currentData.provider = data.provider || currentData.provider || 'Unknown';
          
          setCurrentWeather(currentData);
        }
        
        setForecast(dailyData);
        setHourlyForecast(hourlyData);
        
        // Cache the complete data in localStorage with rounded coordinates
        const now = Date.now();
        const cacheData = {
          current: currentData,
          forecast: dailyData,
          hourly: hourlyData,
          provider: data.provider, // Store provider in cache
          timestamp: now
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        setLastUpdated(now);
        console.log(`💾 [useWeather] Cached complete weather data from ${data.provider || 'API'} in localStorage`);
        
        // Show warning if using stale data
        if (data.stale && data.warning) {
          toast({
            title: 'Using Cached Weather',
            description: data.warning,
            variant: 'default'
          });
        }
      }
    } catch (err) {
      console.error('❌ [useWeather] Weather fetch error:', err);
      setError('Failed to fetch weather data');
      
      // Try to use localStorage cache even if expired
      const rounded = roundCoordinates(
        (location || deviceLocation || defaultLocation).lat,
        (location || deviceLocation || defaultLocation).lon
      );
      const cacheKey = `weather_cache_${rounded.lat}_${rounded.lon}`;
      const fallbackDataStr = localStorage.getItem(cacheKey);
      
      if (fallbackDataStr) {
        try {
          const cached = JSON.parse(fallbackDataStr);
          setCurrentWeather(cached.current);
          setForecast(cached.forecast || []);
          setHourlyForecast(cached.hourly || []);
          console.log('📦 [useWeather] Using expired cache due to fetch error');
          toast({
            title: "Using cached weather data",
            description: "Unable to fetch latest weather. Showing cached data.",
            variant: "default",
          });
        } catch (parseError) {
          console.error('❌ [useWeather] Failed to use cached data:', parseError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Wait for tenant to load before fetching weather
    if (tenantLoading) {
      console.log('⏳ [useWeather] Tenant still loading, skipping weather fetch');
      return;
    }

    // Fetch weather data when tenant is available (location will use default if not available)
    if (tenant?.id) {
      console.log('✅ [useWeather] Tenant loaded, fetching weather data');
      fetchWeatherData(false);
      
      // World-class weather app pattern: Refresh every 10 minutes for real-time data
      const interval = setInterval(() => {
        console.log('🔄 [useWeather] Auto-refresh triggered (10-minute interval)');
        fetchWeatherData(false);
      }, 600000); // 10 minutes
      
      return () => clearInterval(interval);
    } else if (!tenant?.id && !tenantLoading) {
      console.warn('⚠️ [useWeather] No tenant ID available after loading completed');
    }
  }, [tenant?.id, tenantLoading, location?.lat, location?.lon, deviceLocation?.lat, deviceLocation?.lon]);

  // Update location name when device location changes
  useEffect(() => {
    if (deviceLocation?.city && deviceLocation?.state) {
      const locationName = `${deviceLocation.city}, ${deviceLocation.state}`;
      localStorage.setItem('weatherLocationName', locationName);
    } else if (deviceLocation?.city) {
      localStorage.setItem('weatherLocationName', deviceLocation.city);
    }
  }, [deviceLocation]);

  const actualLocation = location || (deviceLocation ? { lat: deviceLocation.lat, lon: deviceLocation.lon } : defaultLocation);
  const roundedLocation = roundCoordinates(actualLocation.lat, actualLocation.lon);

  return {
    currentWeather,
    forecast,
    hourlyForecast,
    loading,
    error,
    lastUpdated,
    refetch: () => fetchWeatherData(true), // Force refresh on manual refetch
    location: roundedLocation, // Return rounded location for consistency
  };
};