import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { useAuthStore } from '@/stores/authStore';

interface WeatherObservation {
  id?: string;
  tenant_id: string;
  farmer_id?: string;
  land_id?: string;
  observation_date: string;
  observation_time: string;
  temperature_celsius?: number;
  humidity_percent?: number;
  rainfall_mm: number;
  wind_speed_kmh?: number;
  wind_direction?: string;
  weather_condition?: string;
  pressure_hpa?: number;
  visibility_km?: number;
  uv_index?: number;
  feels_like_celsius?: number;
  dew_point_celsius?: number;
  cloud_coverage_percent?: number;
  metadata?: any;
}

interface WeatherAggregate {
  id?: string;
  tenant_id: string;
  farmer_id?: string;
  land_id?: string;
  aggregate_date: string;
  rain_mm_total: number;
  rain_mm_morning?: number;
  rain_mm_afternoon?: number;
  rain_mm_evening?: number;
  rain_mm_night?: number;
  temp_min_celsius?: number;
  temp_max_celsius?: number;
  temp_avg_celsius?: number;
  humidity_avg_percent?: number;
  wind_speed_avg_kmh?: number;
  wind_speed_max_kmh?: number;
  sunshine_hours?: number;
  frost_risk?: boolean;
  heat_stress_risk?: boolean;
  disease_risk_level?: string;
  agricultural_alerts?: any[];
}

export const useWeatherSync = () => {
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [todayRainfall, setTodayRainfall] = useState<number>(0);
  const [weeklyRainfall, setWeeklyRainfall] = useState<number>(0);
  const { toast } = useToast();
  const { tenant } = useTenant();
  const { user } = useAuthStore();

  // Save weather observation to database
  const saveWeatherObservation = async (weatherData: any, rainfallMm: number = 0) => {
    if (!tenant?.id) return;

    try {
      const observation: WeatherObservation = {
        tenant_id: tenant.id,
        farmer_id: user?.id,
        observation_date: new Date().toISOString().split('T')[0],
        observation_time: new Date().toISOString(),
        temperature_celsius: weatherData.temp,
        humidity_percent: weatherData.humidity,
        rainfall_mm: rainfallMm,
        wind_speed_kmh: weatherData.wind_speed * 3.6, // Convert m/s to km/h
        wind_direction: getWindDirection(weatherData.wind_deg),
        weather_condition: weatherData.main,
        pressure_hpa: weatherData.pressure,
        visibility_km: weatherData.visibility / 1000, // Convert m to km
        uv_index: weatherData.uv_index,
        feels_like_celsius: weatherData.feels_like,
        dew_point_celsius: weatherData.dew_point,
        cloud_coverage_percent: weatherData.clouds,
        metadata: {
          provider: weatherData.provider,
          location: weatherData.location,
          icon: weatherData.icon,
          description: weatherData.description
        }
      };

      const { error } = await supabase
        .from('weather_observations')
        .upsert(observation, {
          onConflict: 'tenant_id,observation_date,observation_time,land_id'
        });

      if (error) throw error;

      // Update or create daily aggregate
      await updateDailyAggregate(observation);
      
      setLastSyncTime(new Date());
      setSyncStatus('success');
    } catch (error) {
      console.error('Error saving weather observation:', error);
      setSyncStatus('error');
      throw error;
    }
  };

  // Update daily aggregate
  const updateDailyAggregate = async (observation: WeatherObservation) => {
    if (!tenant?.id) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch existing aggregate for today
      const { data: existing } = await supabase
        .from('weather_aggregates')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('aggregate_date', today)
        .maybeSingle();

      const currentHour = new Date().getHours();
      const timeOfDay = 
        currentHour < 6 ? 'night' :
        currentHour < 12 ? 'morning' :
        currentHour < 18 ? 'afternoon' :
        'evening';

      const aggregate: WeatherAggregate = {
        tenant_id: tenant.id,
        farmer_id: user?.id,
        aggregate_date: today,
        rain_mm_total: (existing?.rain_mm_total || 0) + observation.rainfall_mm,
        [`rain_mm_${timeOfDay}`]: (existing?.[`rain_mm_${timeOfDay}`] || 0) + observation.rainfall_mm,
        temp_min_celsius: Math.min(existing?.temp_min_celsius || 999, observation.temperature_celsius || 999),
        temp_max_celsius: Math.max(existing?.temp_max_celsius || -999, observation.temperature_celsius || -999),
        temp_avg_celsius: observation.temperature_celsius,
        humidity_avg_percent: observation.humidity_percent,
        wind_speed_avg_kmh: observation.wind_speed_kmh,
        wind_speed_max_kmh: Math.max(existing?.wind_speed_max_kmh || 0, observation.wind_speed_kmh || 0),
        frost_risk: (observation.temperature_celsius || 0) < 5,
        heat_stress_risk: (observation.temperature_celsius || 0) > 35,
        disease_risk_level: calculateDiseaseRisk(observation),
        agricultural_alerts: generateAgriculturalAlerts(observation, existing)
      };

      const { error } = await supabase
        .from('weather_aggregates')
        .upsert(aggregate, {
          onConflict: 'tenant_id,aggregate_date,land_id'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating daily aggregate:', error);
    }
  };

  // Calculate disease risk based on weather conditions
  const calculateDiseaseRisk = (observation: WeatherObservation): string => {
    const temp = observation.temperature_celsius || 0;
    const humidity = observation.humidity_percent || 0;
    
    if (humidity > 80 && temp > 20 && temp < 30) return 'high';
    if (humidity > 70 && temp > 15 && temp < 35) return 'medium';
    return 'low';
  };

  // Generate agricultural alerts
  const generateAgriculturalAlerts = (observation: WeatherObservation, existing: any): any[] => {
    const alerts: any[] = existing?.agricultural_alerts || [];
    const temp = observation.temperature_celsius || 0;
    const humidity = observation.humidity_percent || 0;
    const windSpeed = observation.wind_speed_kmh || 0;
    const rainfall = observation.rainfall_mm || 0;

    // Frost alert
    if (temp < 5) {
      alerts.push({
        type: 'frost',
        severity: temp < 0 ? 'critical' : 'warning',
        message: 'Frost risk detected. Protect sensitive crops.',
        timestamp: new Date().toISOString()
      });
    }

    // Heat stress alert
    if (temp > 35) {
      alerts.push({
        type: 'heat_stress',
        severity: temp > 40 ? 'critical' : 'warning',
        message: 'High temperature detected. Ensure adequate irrigation.',
        timestamp: new Date().toISOString()
      });
    }

    // High wind alert
    if (windSpeed > 30) {
      alerts.push({
        type: 'strong_wind',
        severity: windSpeed > 50 ? 'critical' : 'warning',
        message: 'Strong winds detected. Secure loose items and delay spraying.',
        timestamp: new Date().toISOString()
      });
    }

    // Heavy rainfall alert
    if (rainfall > 50) {
      alerts.push({
        type: 'heavy_rain',
        severity: rainfall > 100 ? 'critical' : 'warning',
        message: 'Heavy rainfall detected. Check field drainage.',
        timestamp: new Date().toISOString()
      });
    }

    // Disease risk alert
    if (humidity > 80 && temp > 20 && temp < 30) {
      alerts.push({
        type: 'disease_risk',
        severity: 'warning',
        message: 'High disease risk conditions. Monitor crops closely.',
        timestamp: new Date().toISOString()
      });
    }

    return alerts;
  };

  // Get wind direction from degrees
  const getWindDirection = (deg: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  // Fetch today's rainfall
  const fetchTodayRainfall = async () => {
    if (!tenant?.id) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('weather_aggregates')
        .select('rain_mm_total')
        .eq('tenant_id', tenant.id)
        .eq('aggregate_date', today)
        .maybeSingle();

      setTodayRainfall(data?.rain_mm_total || 0);
    } catch (error) {
      console.error('Error fetching today rainfall:', error);
    }
  };

  // Fetch weekly rainfall
  const fetchWeeklyRainfall = async () => {
    if (!tenant?.id) return;

    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const { data } = await supabase
        .from('weather_aggregates')
        .select('rain_mm_total')
        .eq('tenant_id', tenant.id)
        .gte('aggregate_date', weekAgo.toISOString().split('T')[0]);

      const total = data?.reduce((sum, day) => sum + (day.rain_mm_total || 0), 0) || 0;
      setWeeklyRainfall(total);
    } catch (error) {
      console.error('Error fetching weekly rainfall:', error);
    }
  };

  // Manual sync trigger
  const triggerManualSync = async () => {
    setIsSyncing(true);
    setSyncStatus('syncing');

    try {
      await fetchTodayRainfall();
      await fetchWeeklyRainfall();
      
      toast({
        title: "Sync Complete",
        description: "Weather data synchronized successfully",
      });
      
      setSyncStatus('success');
      setLastSyncTime(new Date());
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: "Failed to sync weather data. Please try again.",
        variant: "destructive",
      });
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Set up real-time subscription
  useEffect(() => {
    if (!tenant?.id) return;

    // Initial fetch
    fetchTodayRainfall();
    fetchWeeklyRainfall();

    // Subscribe to real-time updates
    const observationsChannel = supabase
      .channel('weather-observations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weather_observations',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          console.log('Weather observation update:', payload);
          fetchTodayRainfall();
        }
      )
      .subscribe();

    const aggregatesChannel = supabase
      .channel('weather-aggregates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weather_aggregates',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          console.log('Weather aggregate update:', payload);
          fetchTodayRainfall();
          fetchWeeklyRainfall();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(observationsChannel);
      supabase.removeChannel(aggregatesChannel);
    };
  }, [tenant?.id]);

  return {
    lastSyncTime,
    isSyncing,
    syncStatus,
    todayRainfall,
    weeklyRainfall,
    saveWeatherObservation,
    triggerManualSync
  };
};