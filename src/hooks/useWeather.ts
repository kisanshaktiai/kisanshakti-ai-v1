import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import LocationService from '@/services/LocationService';
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

export const useWeather = (location?: { lat: number; lon: number }) => {
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { user } = useAuthStore();
  
  // Use the centralized location service
  const { location: deviceLocation } = useLocation();
  
  // Default location (India - New Delhi)
  const defaultLocation = { lat: 28.6139, lon: 77.2090 };


  const fetchWeatherData = async () => {
    // Don't fetch if tenant isn't loaded yet
    if (!tenant?.id) {
      console.log('⏳ [useWeather] Waiting for tenant to load before fetching weather');
      return;
    }

    const weatherLocation = location || (deviceLocation ? { lat: deviceLocation.lat, lon: deviceLocation.lon } : defaultLocation);
    
    console.log('🌤️ [useWeather] Fetching weather with tenant:', tenant.id);
    console.log('📍 [useWeather] Location:', weatherLocation);
    
    try {
      setLoading(true);
      setError(null);

      // Try to get cached data from localStorage first (more reliable than DB)
      const cacheKey = `weather_cache_${weatherLocation.lat}_${weatherLocation.lon}`;
      const cachedDataStr = localStorage.getItem(cacheKey);
      
      if (cachedDataStr) {
        try {
          const cached = JSON.parse(cachedDataStr);
          const cacheAge = Date.now() - cached.timestamp;
          
          // Use cache if less than 10 minutes old
          if (cacheAge < 600000) {
            console.log('✅ [useWeather] Using cached weather data from localStorage');
            setCurrentWeather(cached.current);
            setForecast(cached.forecast || []);
            setHourlyForecast(cached.hourly || []);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('⚠️ [useWeather] Failed to parse cached weather data:', e);
        }
      }

      // Fetch fresh data from edge function
      console.log('📡 [useWeather] Fetching current weather from API...');
      const { data, error: fetchError } = await supabase.functions.invoke('weather', {
        body: {
          action: 'current',
          lat: weatherLocation.lat,
          lon: weatherLocation.lon,
        },
        headers: (tenant?.id && user?.id) ? {
          'x-tenant-id': tenant.id,
          'x-farmer-id': user.id,
        } : undefined,
      });

      if (fetchError) {
        console.error('❌ [useWeather] Weather fetch error:', fetchError);
        throw fetchError;
      }

      if (data) {
        // Extract current weather from response (API returns { current: {...}, tenant: {...} })
        const currentData = data.current || data;
        
        console.log('✅ [useWeather] Received current weather data:', {
          temp: currentData.temp,
          description: currentData.description,
          provider: currentData.provider
        });
        
        // Add location name from localStorage or use coordinates
        const storedLocationName = localStorage.getItem('weatherLocationName');
        if (storedLocationName) {
          currentData.location = storedLocationName;
        } else if (currentData.location) {
          currentData.location = currentData.location;
        } else {
          currentData.location = `${weatherLocation.lat.toFixed(2)}°N, ${weatherLocation.lon.toFixed(2)}°E`;
        }
        
        setCurrentWeather(currentData);
        
        // Fetch forecast data
        console.log('📡 [useWeather] Fetching forecast data from API...');
        const { data: forecastData, error: forecastError } = await supabase.functions.invoke('weather', {
          body: {
            action: 'forecast',
            lat: weatherLocation.lat,
            lon: weatherLocation.lon,
          },
          headers: (tenant?.id && user?.id) ? {
            'x-tenant-id': tenant.id,
            'x-farmer-id': user.id,
          } : undefined,
        });

        let dailyData: any[] = [];
        let hourlyData: any[] = [];

        if (forecastError) {
          console.error('❌ [useWeather] Forecast fetch error:', forecastError);
        } else if (forecastData) {
          console.log('✅ [useWeather] Received forecast data');
          // Extract forecast from response (API returns { forecast: [...], tenant: {...} })
          dailyData = forecastData.forecast || forecastData.daily || [];
          hourlyData = forecastData.hourly || [];
          setForecast(dailyData);
          setHourlyForecast(hourlyData);
        }
        
        // Cache the complete data in localStorage
        const cacheData = {
          current: currentData,
          forecast: dailyData,
          hourly: hourlyData,
          timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log('💾 [useWeather] Cached weather data in localStorage');
        
        // Also try to cache in database (optional, don't fail if it doesn't work)
        try {
          await supabase.from('weather_alerts').upsert({
            area_name: `${weatherLocation.lat},${weatherLocation.lon}`,
            cache_data: cacheData,
            last_fetched: new Date().toISOString(),
            alert_id: 'weather-cache',
            event_type: 'cache',
            severity: 'info',
            urgency: 'future',
            certainty: 'observed',
            title: 'Weather Cache',
            data_source: data.provider || 'openweathermap',
            start_time: new Date().toISOString(),
          });
        } catch (dbError) {
          console.warn('⚠️ [useWeather] Failed to cache in DB (non-critical):', dbError);
        }
      }
    } catch (err) {
      console.error('❌ [useWeather] Weather fetch error:', err);
      setError('Failed to fetch weather data');
      
      // Try to use localStorage cache even if expired
      const cacheKey = `weather_cache_${weatherLocation.lat}_${weatherLocation.lon}`;
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
      fetchWeatherData();
      // Refresh every 30 minutes
      const interval = setInterval(fetchWeatherData, 1800000);
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

  return {
    currentWeather,
    forecast,
    hourlyForecast,
    loading,
    error,
    refetch: fetchWeatherData,
    location: location || (deviceLocation ? { lat: deviceLocation.lat, lon: deviceLocation.lon } : defaultLocation),
  };
};