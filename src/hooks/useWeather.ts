import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const { toast } = useToast();

  // Default location (India - New Delhi)
  const defaultLocation = { lat: 28.6139, lon: 77.2090 };

  // Get user's current location with reverse geocoding
  const getUserLocation = async () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          };
          setUserLocation(newLocation);
          console.log('User location obtained:', newLocation);
          
          // Try to get location name via reverse geocoding
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLocation.lat}&lon=${newLocation.lon}&zoom=10&addressdetails=1`
            );
            if (response.ok) {
              const data = await response.json();
              const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county;
              const state = data.address?.state;
              const country = data.address?.country;
              
              if (city) {
                const locationName = state ? `${city}, ${state}` : `${city}, ${country}`;
                // Store location name for later use
                localStorage.setItem('weatherLocationName', locationName);
              }
            }
          } catch (error) {
            console.error('Reverse geocoding error:', error);
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          toast({
            title: "Location Access",
            description: "Using default location. Enable location access for accurate weather.",
            variant: "default",
          });
          setUserLocation(defaultLocation);
          localStorage.setItem('weatherLocationName', 'New Delhi, India');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      console.log('Geolocation not supported');
      setUserLocation(defaultLocation);
      localStorage.setItem('weatherLocationName', 'New Delhi, India');
    }
  };

  const fetchWeatherData = async () => {
    const weatherLocation = location || userLocation || defaultLocation;
    
    try {
      setLoading(true);
      setError(null);

      // Try to get cached data first
      const { data: cachedData } = await supabase
        .from('weather_alerts')
        .select('cache_data, last_fetched')
        .eq('area_name', `${weatherLocation.lat},${weatherLocation.lon}`)
        .maybeSingle();

      // If cache is fresh (less than 10 minutes old), use it
      if (cachedData?.cache_data && cachedData.last_fetched) {
        const cacheAge = Date.now() - new Date(cachedData.last_fetched).getTime();
        if (cacheAge < 600000) { // 10 minutes
          const cached = cachedData.cache_data as any;
          setCurrentWeather(cached.current);
          setForecast(cached.forecast || []);
          setHourlyForecast(cached.hourly || []);
          setLoading(false);
          return;
        }
      }

      // Fetch fresh data from edge function
      const { data, error: fetchError } = await supabase.functions.invoke('weather', {
        body: {
          action: 'current',
          lat: weatherLocation.lat,
          lon: weatherLocation.lon,
        },
      });

      if (fetchError) {
        console.error('Weather fetch error:', fetchError);
        throw fetchError;
      }

      if (data) {
        // Add location name from localStorage or use coordinates
        const storedLocationName = localStorage.getItem('weatherLocationName');
        if (storedLocationName) {
          data.location = storedLocationName;
        } else if (data.location) {
          data.location = data.location;
        } else {
          data.location = `${weatherLocation.lat.toFixed(2)}°N, ${weatherLocation.lon.toFixed(2)}°E`;
        }
        
        setCurrentWeather(data);
        
        // Cache the data
        await supabase.from('weather_alerts').upsert({
          area_name: `${weatherLocation.lat},${weatherLocation.lon}`,
          cache_data: { current: data },
          last_fetched: new Date().toISOString(),
          alert_id: 'weather-cache',
          event_type: 'cache',
          severity: 'info',
          urgency: 'future',
          certainty: 'observed',
          title: 'Weather Cache',
          data_source: 'openweathermap',
          start_time: new Date().toISOString(),
        });
      }

      // Fetch forecast data
      const { data: forecastData } = await supabase.functions.invoke('weather', {
        body: {
          action: 'forecast',
          lat: weatherLocation.lat,
          lon: weatherLocation.lon,
        },
      });

      if (forecastData) {
        setForecast(forecastData.daily || []);
        setHourlyForecast(forecastData.hourly || []);
        
        // Update cache with forecast data
        await supabase.from('weather_alerts').update({
          cache_data: { 
            current: data, 
            forecast: forecastData.daily,
            hourly: forecastData.hourly
          },
          last_fetched: new Date().toISOString(),
        }).eq('area_name', `${weatherLocation.lat},${weatherLocation.lon}`);
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError('Failed to fetch weather data');
      
      // Try to use cached data even if expired
      const { data: fallbackData } = await supabase
        .from('weather_alerts')
        .select('cache_data')
        .eq('area_name', `${weatherLocation.lat},${weatherLocation.lon}`)
        .maybeSingle();
        
      if (fallbackData?.cache_data) {
        const cached = fallbackData.cache_data as any;
        setCurrentWeather(cached.current);
        setForecast(cached.forecast || []);
        setHourlyForecast(cached.hourly || []);
        toast({
          title: "Using cached weather data",
          description: "Unable to fetch latest weather. Showing cached data.",
          variant: "default",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Get user location first
    getUserLocation();
  }, []);

  useEffect(() => {
    // Fetch weather data when location is available
    if (location || userLocation) {
      fetchWeatherData();
      // Refresh every 30 minutes
      const interval = setInterval(fetchWeatherData, 1800000);
      return () => clearInterval(interval);
    }
  }, [location?.lat, location?.lon, userLocation?.lat, userLocation?.lon]);

  return {
    currentWeather,
    forecast,
    hourlyForecast,
    loading,
    error,
    refetch: fetchWeatherData,
    location: location || userLocation || defaultLocation,
  };
};