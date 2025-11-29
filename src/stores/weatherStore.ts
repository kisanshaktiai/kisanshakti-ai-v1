import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  rain_1h?: number;
  rain_3h?: number;
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

interface WeatherState {
  currentWeather: WeatherData | null;
  forecast: ForecastData[];
  hourlyForecast: HourlyData[];
  lastUpdated: number | null;
  loading: boolean;
  error: string | null;
  dataSource: 'database' | 'api' | 'cache' | null;
  location: { lat: number; lon: number } | null;
  
  // Actions
  setWeatherData: (data: {
    current: WeatherData;
    forecast: ForecastData[];
    hourly: HourlyData[];
    provider?: string;
    source: 'database' | 'api' | 'cache';
  }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLocation: (location: { lat: number; lon: number }) => void;
  clearWeather: () => void;
  getDataAge: () => number | null;
  isStale: () => boolean;
}

export const useWeatherStore = create<WeatherState>()(
  persist(
    (set, get) => ({
      currentWeather: null,
      forecast: [],
      hourlyForecast: [],
      lastUpdated: null,
      loading: false,
      error: null,
      dataSource: null,
      location: null,

      setWeatherData: (data) => {
        const now = Date.now();
        set({
          currentWeather: {
            ...data.current,
            provider: data.provider || data.current.provider,
          },
          forecast: data.forecast,
          hourlyForecast: data.hourly,
          lastUpdated: now,
          error: null,
          dataSource: data.source,
        });
      },

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error, loading: false }),

      setLocation: (location) => set({ location }),

      clearWeather: () =>
        set({
          currentWeather: null,
          forecast: [],
          hourlyForecast: [],
          lastUpdated: null,
          error: null,
          dataSource: null,
        }),

      getDataAge: () => {
        const { lastUpdated } = get();
        if (!lastUpdated) return null;
        return Date.now() - lastUpdated;
      },

      isStale: () => {
        const age = get().getDataAge();
        if (!age) return true;
        // Data is stale if older than 15 minutes
        return age > 15 * 60 * 1000;
      },
    }),
    {
      name: 'weather-storage',
      partialize: (state) => ({
        currentWeather: state.currentWeather,
        forecast: state.forecast,
        hourlyForecast: state.hourlyForecast,
        lastUpdated: state.lastUpdated,
        dataSource: state.dataSource,
        location: state.location,
      }),
    }
  )
);
