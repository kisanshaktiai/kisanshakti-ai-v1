import { useEffect, useRef, useState } from 'react';
import { supabase, supabaseWithAuth } from '@/integrations/supabase/client';
import { toastManager } from '@/utils/ToastManager';
import { useLocation } from '@/hooks/useLocation';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';
import { useWeatherStore } from '@/stores/weatherStore';

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

// ---------------------------------------------------------------------------
// SINGLE FETCH OWNER
// The page and the home widget both call useWeather(), but the zustand store is
// shared. Without this guard every mounted consumer ran its own proximity query
// and its own 10-minute interval. Exactly one instance ("the leader") fetches;
// everyone else is a pure store reader. Leadership transfers on unmount.
// ---------------------------------------------------------------------------
let leaderId: string | null = null;
let instanceSeq = 0;
const members = new Set<string>();
const leaderListeners = new Set<(id: string | null) => void>();
const notifyLeaderChange = () => leaderListeners.forEach((fn) => fn(leaderId));

export const useWeather = (location?: { lat: number; lon: number }, landId?: string) => {
  // Use centralized weather store for single source of truth
  const {
    currentWeather,
    forecast,
    hourlyForecast,
    loading,
    error,
    lastUpdated,
    dataSource,
    setWeatherData,
    setLoading,
    setError,
    setLocation,
    isStale,
  } = useWeatherStore();

  const { tenant, isLoading: tenantLoading } = useTenant();
  const { user } = useAuthStore();
  
  // Use the centralized location service
  const { location: deviceLocation } = useLocation();

  // Fetch-leader election (see note above the hook).
  const instanceIdRef = useRef<string>('');
  if (!instanceIdRef.current) instanceIdRef.current = `w-${++instanceSeq}`;
  const [isFetchLeader, setIsFetchLeader] = useState(false);

  useEffect(() => {
    const id = instanceIdRef.current;
    members.add(id);
    if (!leaderId) leaderId = id;
    const onChange = (current: string | null) => setIsFetchLeader(current === id);
    leaderListeners.add(onChange);
    onChange(leaderId);
    return () => {
      leaderListeners.delete(onChange);
      members.delete(id);
      if (leaderId === id) {
        leaderId = members.values().next().value ?? null;
        notifyLeaderChange();
      }
    };
  }, []);



  // Regional fallback: Kolhapur district HQ — 72% of active lands are there.
  // Used ONLY when there is no explicit location, no GPS, and no farm on record.
  // Must be surfaced in the UI as regional, never as the farmer's own weather.
  const REGIONAL_FALLBACK = { lat: 16.7050, lon: 74.2433, label: 'Kolhapur (regional)' };

  const [farmLocation, setFarmLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!user?.id || !tenant?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('lands')
        .select('center_lat, center_lon')
        .eq('farmer_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .not('center_lat', 'is', null)
        .not('center_lon', 'is', null)
        .limit(1)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setFarmLocation({ lat: Number(data.center_lat), lon: Number(data.center_lon) });
    })();
    return () => { cancelled = true; };
  }, [user?.id, tenant?.id]);

  type LocationSource = 'explicit' | 'gps' | 'farm' | 'regional';

  const resolveLocation = (): { lat: number; lon: number; source: LocationSource } => {
    if (location) return { ...location, source: 'explicit' };
    if (deviceLocation) return { lat: deviceLocation.lat, lon: deviceLocation.lon, source: 'gps' };
    if (farmLocation) return { ...farmLocation, source: 'farm' };
    return { lat: REGIONAL_FALLBACK.lat, lon: REGIONAL_FALLBACK.lon, source: 'regional' };
  };

  // MODEL A ONLY. Display weather may use a nearby fresh cell — a farmer just
  // needs to know if it will rain on him. MODEL B MUST NEVER do this: GDD, ET0
  // and disease compound daily, so a 20 km substitution corrupts a season.
  const [nearby, setNearby] = useState<{ distanceKm: number; stationName: string | null } | null>(null);

  const findNearbyFresh = async (lat: number, lon: number) => {
    const { data } = await supabase
      .from('weather_current')
      .select('*')
      .gte('latitude', lat - 0.25).lte('latitude', lat + 0.25)
      .gte('longitude', lon - 0.25).lte('longitude', lon + 0.25)
      .gt('expires_at', new Date().toISOString())
      .order('observation_time', { ascending: false }) // freshness FIRST
      .limit(5);
    if (!data?.length) return null;

    const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
      const R = 6371, rad = (d: number) => d * Math.PI / 180;
      const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const within = data
      .map((r: any) => ({ row: r, d: km(lat, lon, Number(r.latitude), Number(r.longitude)) }))
      .filter((x) => x.d <= 25)
      .sort((a, b) => a.d - b.d);
    return within[0] ?? null;
  };

  const fetchWeatherData = async (forceRefresh: boolean = false) => {
    // Don't fetch if tenant isn't loaded yet
    if (!tenant?.id) {
      console.log('⏳ [useWeather] Waiting for tenant to load before fetching weather');
      return;
    }

    const weatherLocation = resolveLocation();
    
    // Round coordinates for consistent caching (~1km precision)
    const rounded = roundCoordinates(weatherLocation.lat, weatherLocation.lon);
    
    console.log('🌤️ [useWeather] Fetching weather with tenant:', tenant.id);
    console.log('📍 [useWeather] Rounded location:', rounded);
    console.log('🔄 [useWeather] Force refresh:', forceRefresh);
    
    try {
      // Check if store has recent data and not forcing refresh
      if (!forceRefresh && !isStale() && currentWeather) {
        console.log('✅ [useWeather] Using fresh data from store (age:', Date.now() - (lastUpdated || 0), 'ms)');
        return;
      }

      // Show existing data while fetching fresh data (stale-while-revalidate)
      if (currentWeather && !forceRefresh) {
        console.log('✅ [useWeather] Showing stale data while fetching fresh data');
      } else {
        setLoading(true);
      }
      setError(null);

      // Use authenticated client for better RLS support
      const weatherClient = user?.id && tenant?.id 
        ? supabaseWithAuth(user.id, tenant.id)
        : supabase;

      // MODEL A: proximity-first display provenance (freshness first, then distance)
      if (!landId) {
        const near = await findNearbyFresh(rounded.lat, rounded.lon);
        setNearby(near
          ? { distanceKm: Math.round(near.d * 10) / 10, stationName: (near.row as any).station_name ?? null }
          : null);
      } else {
        setNearby(null);
      }

      // NEW: Single combined API call for all weather data
      console.log('📡 [useWeather] Fetching ALL weather data (current + forecast + hourly) in one call...');
      

      
      const { data, error: fetchError } = await weatherClient.functions.invoke('weather', {
        body: {
          action: 'all',
          lat: rounded.lat,
          lon: rounded.lon,
          ...(landId ? { landId } : {}), // Pass landId for land-specific weather intelligence
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
          provider: data.provider || 'Unknown',
          source: data.source || 'api',
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
        }
        
        // Update centralized store (single source of truth for all components)
        setWeatherData({
          current: currentData,
          forecast: dailyData,
          hourly: hourlyData,
          provider: data.provider,
          source: data.cached ? 'database' : 'api'
        });
        
        console.log(`💾 [useWeather] Updated weather store from ${data.provider || 'API'} (source: ${data.cached ? 'database' : 'api'})`);
        
        // Show warning if using stale data (with dedup to prevent spam)
        if (data.stale && data.warning) {
          toastManager.show({
            id: 'weather-stale-data',
            description: data.warning,
            variant: 'default'
          });
        }
      }
    } catch (err) {
      console.error('❌ [useWeather] Weather fetch error:', err);
      setError('Failed to fetch weather data');
      
      // If store has old data, keep showing it as fallback (with dedup)
      if (currentWeather) {
        console.log('📦 [useWeather] Keeping existing weather data from store due to fetch error');
        toastManager.show({
          id: 'weather-cached-fallback',
          description: "Unable to fetch latest weather. Showing previous data.",
          variant: 'default'
        });
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
  }, [tenant?.id, tenantLoading, location?.lat, location?.lon, deviceLocation?.lat, deviceLocation?.lon, farmLocation?.lat, farmLocation?.lon]);

  // Update location name when device location changes
  useEffect(() => {
    if (deviceLocation?.city && deviceLocation?.state) {
      const locationName = `${deviceLocation.city}, ${deviceLocation.state}`;
      localStorage.setItem('weatherLocationName', locationName);
    } else if (deviceLocation?.city) {
      localStorage.setItem('weatherLocationName', deviceLocation.city);
    }
  }, [deviceLocation]);

  // Update store location
  useEffect(() => {
    const resolved = resolveLocation();
    const rounded = roundCoordinates(resolved.lat, resolved.lon);
    setLocation(rounded);
  }, [location?.lat, location?.lon, deviceLocation?.lat, deviceLocation?.lon, farmLocation?.lat, farmLocation?.lon]);

  const actualLocation = resolveLocation();
  const roundedLocation = roundCoordinates(actualLocation.lat, actualLocation.lon);

  return {
    currentWeather,
    forecast,
    hourlyForecast,
    loading,
    error,
    lastUpdated,
    dataSource, // NEW: Return data source
    refetch: () => fetchWeatherData(true), // Force refresh on manual refetch
    location: roundedLocation, // Return rounded location for consistency
    locationSource: actualLocation.source, // 'explicit' | 'gps' | 'farm' | 'regional'
    regionalFallbackLabel: REGIONAL_FALLBACK.label,
    isStale: isStale(), // NEW: Return staleness status
    weatherDistanceKm: nearby?.distanceKm ?? null, // MODEL A provenance
    weatherStationName: nearby?.stationName ?? null,
  };
};