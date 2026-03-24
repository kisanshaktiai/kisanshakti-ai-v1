import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2.57.2"
import { checkRateLimit } from '../_shared/rateLimiter.ts'
import { resolveTenantFromRequest } from '../_shared/tenantMiddleware.ts'
import { withTenantBlocker } from '../_shared/tenantBlocker.ts'
import { corsHeaders } from '../_shared/cors.ts';

// Type definitions
interface WeatherRequest {
  action: 'current' | 'forecast' | 'agricultural' | 'all' | 'land' // NEW: 'land' for land-specific weather
  lat?: number
  lon?: number
  landId?: string // NEW: Fetch weather for specific land by ID
  units?: 'metric' | 'imperial' | 'standard'
}

interface CurrentWeatherData {
  temp: number
  feels_like: number
  temp_min: number
  temp_max: number
  humidity: number
  pressure: number
  wind_speed: number // m/s (API standard)
  wind_deg: number
  description: string
  main: string
  icon: string
  clouds: number
  visibility: number // meters (API standard)
  sunrise: number
  sunset: number
  location: string
  dt: number
  provider?: string
  uv_index?: number
  dew_point?: number
  rain_1h?: number // mm
  rain_3h?: number // mm
}

interface ForecastItem {
  dt: number
  temp: number
  feels_like: number
  humidity: number
  wind_speed: number
  weather: Array<{ description: string; main: string; icon: string }>
  pop: number
  uv_index?: number
}

interface DailyForecast {
  dt: number
  temp: { day: number; min: number; max: number; night: number; eve: number; morn: number }
  humidity: number
  wind_speed: number
  weather: Array<{ description: string; main: string; icon: string }>
  pop: number
  uv_index?: number
  moon_phase?: number
}

// Helper to round coordinates to 2 decimal places (~1km precision)
function roundCoordinates(lat: number, lon: number): { lat: number; lon: number; key: string } {
  const roundedLat = Math.round(lat * 100) / 100
  const roundedLon = Math.round(lon * 100) / 100
  return {
    lat: roundedLat,
    lon: roundedLon,
    key: `${roundedLat},${roundedLon}`
  }
}

// Weather code mapping for Tomorrow.io
function getWeatherDescription(code: number): string {
  const weatherCodes: Record<number, string> = {
    0: 'Unknown',
    1000: 'Clear sky',
    1100: 'Mostly clear',
    1101: 'Partly cloudy',
    1102: 'Mostly cloudy',
    1001: 'Cloudy',
    2000: 'Fog',
    2100: 'Light fog',
    4000: 'Drizzle',
    4001: 'Rain',
    4200: 'Light rain',
    4201: 'Heavy rain',
    5000: 'Snow',
    5001: 'Flurries',
    5100: 'Light snow',
    5101: 'Heavy snow',
    6000: 'Freezing drizzle',
    6001: 'Freezing rain',
    6200: 'Light freezing rain',
    6201: 'Heavy freezing rain',
    7000: 'Ice pellets',
    7101: 'Heavy ice pellets',
    7102: 'Light ice pellets',
    8000: 'Thunderstorm'
  }
  return weatherCodes[code] || 'Unknown'
}

function getWeatherMain(code: number): string {
  if (code >= 1000 && code < 2000) return 'Clear'
  if (code >= 2000 && code < 3000) return 'Fog'
  if (code >= 4000 && code < 5000) return 'Rain'
  if (code >= 5000 && code < 6000) return 'Snow'
  if (code >= 6000 && code < 7000) return 'Freezing Rain'
  if (code >= 7000 && code < 8000) return 'Ice'
  if (code >= 8000 && code < 9000) return 'Thunderstorm'
  return 'Unknown'
}

function getWeatherIcon(code: number): string {
  if (code >= 1000 && code < 1100) return '01d'
  if (code >= 1100 && code < 1102) return '02d'
  if (code >= 1102 && code < 2000) return '03d'
  if (code >= 2000 && code < 3000) return '50d'
  if (code >= 4000 && code < 4200) return '09d'
  if (code >= 4200 && code < 5000) return '10d'
  if (code >= 5000 && code < 6000) return '13d'
  if (code >= 6000 && code < 7000) return '13d'
  if (code >= 7000 && code < 8000) return '13d'
  if (code >= 8000 && code < 9000) return '11d'
  return '01d'
}

// Check cache for valid weather data
async function checkCache(
  supabase: any,
  locationKey: string,
  action: string,
  allowStale: boolean = false // NEW: Allow returning expired cache as fallback
): Promise<{ current?: CurrentWeatherData; forecast?: DailyForecast[]; hourly?: ForecastItem[]; stale?: boolean } | null> {
  try {
    // Check current weather cache
    const cacheQuery = supabase
      .from('weather_current')
      .select('*')
      .eq('location_key', locationKey)
    
    // If we don't allow stale, filter by expiration
    if (!allowStale) {
      cacheQuery.gt('expires_at', new Date().toISOString())
    }
    
    const { data: cachedCurrent, error: cacheError } = await cacheQuery
      .order('observation_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cacheError) {
      console.warn('⚠️ Cache check error:', cacheError)
      return null
    }

    if (!cachedCurrent) {
      console.log(`❌ [Weather] Cache MISS for ${locationKey}`)
      return null
    }
    
    // Check if data is stale
    const isStale = allowStale && new Date(cachedCurrent.expires_at) < new Date()
    
    if (isStale) {
      console.log(`⚠️ [Weather] Returning STALE cache for ${locationKey} (age: ${Math.round((Date.now() - new Date(cachedCurrent.observation_time).getTime()) / 60000)} minutes)`)
    } else {
      console.log(`✅ [Weather] Cache HIT for ${locationKey}`)
    }
    
    // Map cached data to CurrentWeatherData format
    const current: CurrentWeatherData = {
      temp: cachedCurrent.temperature_celsius || 0,
      feels_like: cachedCurrent.feels_like_celsius || 0,
      temp_min: cachedCurrent.temp_min || 0,
      temp_max: cachedCurrent.temp_max || 0,
      humidity: cachedCurrent.humidity_percent || 0,
      pressure: cachedCurrent.pressure_hpa || 0,
      wind_speed: (cachedCurrent.wind_speed_kmh || 0) / 3.6, // FIXED: Convert km/h back to m/s
      wind_deg: cachedCurrent.wind_direction_degrees || 0,
      description: cachedCurrent.weather_description || 'Unknown', // FIXED: column name
      main: cachedCurrent.weather_main || 'Unknown', // FIXED: column name
      icon: '01d', // Default icon - column removed from schema
      clouds: cachedCurrent.cloud_cover_percent || 0,
      visibility: (cachedCurrent.visibility_km || 10) * 1000, // FIXED: Convert km back to meters
      sunrise: cachedCurrent.sunrise ? Math.floor(new Date(cachedCurrent.sunrise).getTime() / 1000) : 0,
      sunset: cachedCurrent.sunset ? Math.floor(new Date(cachedCurrent.sunset).getTime() / 1000) : 0,
      location: `${cachedCurrent.latitude}, ${cachedCurrent.longitude}`,
      dt: Math.floor(new Date(cachedCurrent.observation_time).getTime() / 1000),
      provider: cachedCurrent.data_source || 'Cache',
      uv_index: cachedCurrent.uv_index || 0,
      dew_point: 0, // Column removed from schema
      rain_1h: cachedCurrent.rain_1h_mm || 0, // Return rainfall data
      rain_3h: (cachedCurrent.rain_24h_mm || 0) / 8 // Estimate 3h from 24h
    }

    // If only current weather needed, return now
    if (action === 'current') {
      return { current, stale: isStale }
    }

    // Fetch cached forecasts if needed
    if (action === 'forecast' || action === 'all') {
      const forecastQuery = supabase
        .from('weather_forecasts')
        .select('*')
        .eq('location_key', locationKey)
        .order('forecast_time', { ascending: true })
      
      // If allowing stale, get all forecasts; otherwise filter by time
      if (!allowStale) {
        forecastQuery.gte('forecast_time', new Date().toISOString())
      }
      
      const { data: cachedForecasts } = await forecastQuery

      const hourly: ForecastItem[] = []
      const daily: DailyForecast[] = []

      if (cachedForecasts && cachedForecasts.length > 0) {
        // Group by date for daily forecast
        const dailyMap = new Map<string, any>()

        cachedForecasts.forEach((forecast: any) => {
          const forecastDate = new Date(forecast.forecast_time)
          const dateKey = forecastDate.toDateString()

          // Add to hourly (first 24 hours)
          if (hourly.length < 24 && forecast.forecast_type === 'hourly') {
            hourly.push({
              dt: Math.floor(forecastDate.getTime() / 1000),
              temp: forecast.temperature_celsius || 0,
              feels_like: forecast.feels_like_celsius || 0,
          humidity: forecast.humidity_percent || 0,
          wind_speed: (forecast.wind_speed_kmh || 0) / 3.6, // FIXED: Convert km/h back to m/s for frontend
          weather: [{
            description: forecast.weather_description || 'Unknown', // FIXED: column name
            main: forecast.weather_main || 'Unknown', // FIXED: column name
            icon: '01d' // Default icon - column removed from schema
          }],
          pop: (forecast.precipitation_probability || 0) / 100,
          uv_index: forecast.uv_index || 0
            })
          }

          // Aggregate for daily
          if (forecast.forecast_type === 'daily' || !dailyMap.has(dateKey)) {
            if (!dailyMap.has(dateKey)) {
              dailyMap.set(dateKey, {
                dt: Math.floor(forecastDate.getTime() / 1000),
                temps: [],
                humidity: [],
                wind_speed: [],
              weather: [{
                description: forecast.weather_description || 'Unknown', // FIXED: column name
                main: forecast.weather_main || 'Unknown', // FIXED: column name
                icon: '01d' // Default icon - column removed from schema
              }],
                pop: (forecast.precipitation_probability || 0) / 100,
                uv_index: forecast.uv_index || 0
              })
            }
            const dayData = dailyMap.get(dateKey)!
            dayData.temps.push(forecast.temperature_celsius || 0)
            dayData.humidity.push(forecast.humidity_percent || 0)
            dayData.wind_speed.push((forecast.wind_speed_kmh || 0) / 3.6) // FIXED: Convert to m/s
          }
        })

        // Convert daily map to array
        dailyMap.forEach(day => {
          if (daily.length < 14) {
            daily.push({
              dt: day.dt,
              temp: {
                day: day.temps.reduce((a: number, b: number) => a + b, 0) / day.temps.length,
                min: Math.min(...day.temps),
                max: Math.max(...day.temps),
                night: Math.min(...day.temps),
                eve: day.temps[day.temps.length - 1] || day.temps[0],
                morn: day.temps[0]
              },
              humidity: day.humidity.reduce((a: number, b: number) => a + b, 0) / day.humidity.length,
              wind_speed: day.wind_speed.reduce((a: number, b: number) => a + b, 0) / day.wind_speed.length,
              weather: day.weather,
              pop: day.pop,
              uv_index: day.uv_index
            })
          }
        })
      }

      return { current, forecast: daily, hourly, stale: isStale }
    }

    return { current, stale: isStale }
  } catch (error) {
    console.error('❌ [Weather] Cache check failed:', error)
    return null
  }
}

// ========== WEATHER API INTEGRATIONS ==========

// Fetch current weather from OpenWeather API (PRIMARY SOURCE - 1,000 calls/day free)
async function fetchOpenWeatherCurrent(
  lat: number,
  lon: number,
  apiKey: string
): Promise<CurrentWeatherData> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
  console.log(`🌤️ [Weather] Fetching current from OpenWeather: ${lat},${lon}`)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenWeather API error: ${response.status} - ${errorText}`)
  }
  
  const data = await response.json()
  
  console.log('📊 [Weather] OpenWeather current response:', {
    temp: data.main.temp,
    rain: data.rain,
    wind_speed_ms: data.wind.speed
  })
  
  return {
    temp: data.main.temp,
    feels_like: data.main.feels_like,
    temp_min: data.main.temp_min,
    temp_max: data.main.temp_max,
    humidity: data.main.humidity,
    pressure: data.main.pressure,
    wind_speed: data.wind.speed, // m/s from OpenWeather
    wind_deg: data.wind.deg || 0,
    description: data.weather[0].description,
    main: data.weather[0].main,
    icon: data.weather[0].icon,
    clouds: data.clouds.all,
    visibility: data.visibility || 10000, // meters
    sunrise: data.sys.sunrise,
    sunset: data.sys.sunset,
    location: `${lat}, ${lon}`,
    dt: data.dt,
    provider: 'OpenWeather',
    uv_index: 0, // OpenWeather current doesn't provide UV
    dew_point: 0,
    rain_1h: data.rain?.['1h'] || 0, // Extract 1-hour rainfall in mm
    rain_3h: data.rain?.['3h'] || 0  // Extract 3-hour rainfall in mm
  }
}

// Fetch forecast from OpenWeather API (PRIMARY SOURCE)
async function fetchOpenWeatherForecast(
  lat: number,
  lon: number,
  apiKey: string
): Promise<{ forecast: DailyForecast[]; hourly: ForecastItem[] }> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
  console.log(`🌤️ [Weather] Fetching forecast from OpenWeather: ${lat},${lon}`)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenWeather forecast API error: ${response.status} - ${errorText}`)
  }
  
  const data = await response.json()
  
  // Map hourly data (next 24 hours = 8 intervals of 3-hour forecasts)
  const hourly: ForecastItem[] = data.list.slice(0, 8).map((item: any) => ({
    dt: item.dt,
    temp: item.main.temp,
    feels_like: item.main.feels_like,
    humidity: item.main.humidity,
    wind_speed: item.wind.speed,
    weather: [{
      description: item.weather[0].description,
      main: item.weather[0].main,
      icon: item.weather[0].icon
    }],
    pop: item.pop || 0,
    uv_index: 0
  }))
  
  // Aggregate daily forecasts (group by day)
  const dailyMap = new Map<string, any[]>()
  data.list.forEach((item: any) => {
    const date = new Date(item.dt * 1000).toDateString()
    if (!dailyMap.has(date)) {
      dailyMap.set(date, [])
    }
    dailyMap.get(date)!.push(item)
  })
  
  const forecast: DailyForecast[] = Array.from(dailyMap.entries()).slice(0, 7).map(([date, items]) => {
    const temps = items.map(i => i.main.temp)
    const maxTemp = Math.max(...temps)
    const minTemp = Math.min(...temps)
    const avgTemp = temps.reduce((a, b) => a + b) / temps.length
    
    return {
      dt: items[0].dt,
      temp: {
        day: avgTemp,
        min: minTemp,
        max: maxTemp,
        night: minTemp,
        eve: avgTemp,
        morn: avgTemp
      },
      humidity: items[0].main.humidity,
      wind_speed: items[0].wind.speed,
      weather: [{
        description: items[0].weather[0].description,
        main: items[0].weather[0].main,
        icon: items[0].weather[0].icon
      }],
      pop: Math.max(...items.map((i: any) => i.pop || 0)),
      rain: items.reduce((sum: number, i: any) => sum + (i.rain?.['3h'] || 0), 0),
      uv_index: 0,
      moon_phase: 0
    }
  })
  
  return { forecast, hourly }
}

// Fetch from Tomorrow.io using REALTIME endpoint (FALLBACK SOURCE - 500 calls/day free)
async function fetchTomorrowIoRealtime(
  lat: number,
  lon: number,
  apiKey: string
): Promise<CurrentWeatherData> {
  // Use /realtime endpoint as per Tomorrow.io sample code
  const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&apikey=${apiKey}`
  console.log(`🌤️ [Weather] Fetching from Tomorrow.io /realtime: ${lat},${lon}`)
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'accept-encoding': 'deflate, gzip, br'
    }
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Tomorrow.io API error: ${response.status} - ${errorText}`)
  }
  
  const data = await response.json()
  const values = data.data?.values
  
  if (!values) {
    throw new Error('Tomorrow.io returned invalid data structure')
  }
  
  return {
    temp: values.temperature ?? 0,
    feels_like: values.temperatureApparent ?? 0,
    temp_min: values.temperature ?? 0,
    temp_max: values.temperature ?? 0,
    humidity: values.humidity ?? 0,
    pressure: values.pressureSurfaceLevel ?? 0,
    wind_speed: values.windSpeed ?? 0,
    wind_deg: values.windDirection ?? 0,
    description: getWeatherDescription(values.weatherCode),
    main: getWeatherMain(values.weatherCode),
    icon: getWeatherIcon(values.weatherCode),
    clouds: values.cloudCover ?? 0,
    visibility: values.visibility ?? 10000,
    sunrise: 0,
    sunset: 0,
    location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    dt: Math.floor(new Date(data.data.time).getTime() / 1000),
    provider: 'Tomorrow.io',
    uv_index: values.uvIndex ?? 0,
    dew_point: values.dewPoint ?? 0
  }
}

// Fetch forecast from Tomorrow.io using combined endpoint
async function fetchTomorrowIoForecast(
  lat: number,
  lon: number,
  apiKey: string
): Promise<{ forecast: DailyForecast[]; hourly: ForecastItem[] }> {
  // Single combined call for hourly + daily
  const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${apiKey}&timesteps=1h,1d&units=metric`
  console.log(`🌤️ [Weather] Fetching forecast from Tomorrow.io: ${lat},${lon}`)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Tomorrow.io forecast API error: ${response.status} - ${errorText}`)
  }
  
  const data = await response.json()
  
  // Debug: Log the actual API response structure
  console.log('📊 [Weather] Tomorrow.io forecast response structure:', {
    hasTimelines: !!data.timelines,
    timelinesType: typeof data.timelines,
    timelinesKeys: data.timelines ? Object.keys(data.timelines) : [],
    isArray: Array.isArray(data.timelines)
  })
  
  // Tomorrow.io returns timelines as an OBJECT with hourly/daily properties when using timesteps=1h,1d
  const hourlyTimeline = data.timelines?.hourly || []
  const dailyTimeline = data.timelines?.daily || []
  
  console.log(`📊 [Weather] Received forecast data - hourly: ${hourlyTimeline.length} items, daily: ${dailyTimeline.length} items`)
  
  // Map hourly data (next 24 hours)
  const hourly: ForecastItem[] = hourlyTimeline.slice(0, 24).map((hour: any) => ({
    dt: Math.floor(new Date(hour.time).getTime() / 1000), // Use 'time' property
    temp: hour.values.temperature ?? 0,
    feels_like: hour.values.temperatureApparent ?? 0,
    humidity: hour.values.humidity ?? 0,
    wind_speed: hour.values.windSpeed ?? 0, // m/s (Tomorrow.io default with metric)
    weather: [{
      description: getWeatherDescription(hour.values.weatherCode),
      main: getWeatherMain(hour.values.weatherCode),
      icon: getWeatherIcon(hour.values.weatherCode)
    }],
    pop: (hour.values.precipitationProbability || 0) / 100,
    uv_index: hour.values.uvIndex ?? 0
  }))
  
  // Map daily data (next 14 days)
  const forecast: DailyForecast[] = dailyTimeline.slice(0, 14).map((day: any) => ({
    dt: Math.floor(new Date(day.time).getTime() / 1000), // Use 'time' property
    temp: {
      day: day.values.temperatureAvg ?? day.values.temperature ?? 0,
      min: day.values.temperatureMin ?? day.values.temperature ?? 0,
      max: day.values.temperatureMax ?? day.values.temperature ?? 0,
      night: day.values.temperatureMin ?? day.values.temperature ?? 0,
      eve: day.values.temperatureAvg ?? day.values.temperature ?? 0,
      morn: day.values.temperatureAvg ?? day.values.temperature ?? 0
    },
    humidity: day.values.humidityAvg ?? day.values.humidity ?? 0,
    wind_speed: day.values.windSpeedAvg ?? day.values.windSpeed ?? 0, // m/s
    weather: [{
      description: getWeatherDescription(day.values.weatherCodeMax || day.values.weatherCode),
      main: getWeatherMain(day.values.weatherCodeMax || day.values.weatherCode),
      icon: getWeatherIcon(day.values.weatherCodeMax || day.values.weatherCode)
    }],
    pop: (day.values.precipitationProbabilityAvg || day.values.precipitationProbability || 0) / 100,
    rain: day.values.rainAccumulationAvg ?? day.values.rainAccumulation ?? 0, // mm
    uv_index: day.values.uvIndexMax ?? day.values.uvIndex ?? 0,
    moon_phase: day.values.moonPhase ?? 0
  }))
  
  return { forecast, hourly }
}

// Store weather data in cache AND observation tables - PER LAND storage
async function cacheWeatherData(
  supabase: any,
  locationKey: string,
  rounded: { lat: number; lon: number },
  current: CurrentWeatherData,
  forecast?: DailyForecast[],
  hourly?: ForecastItem[],
  tenantId?: string,
  farmerId?: string,
  landId?: string // Store weather per land for agricultural tracking
) {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour cache
    
    console.log(`💾 [Weather] Caching weather data for location: ${locationKey}, land: ${landId || 'none'}, tenant: ${tenantId || 'none'}`)
    
    // ============= 1. Store in weather_current (cache table) =============
    const currentRecord: Record<string, any> = {
      location_key: locationKey,
      latitude: rounded.lat,
      longitude: rounded.lon,
      land_id: landId || null, // NEW: Per-land storage
      tenant_id: tenantId || null, // NEW: Multi-tenant isolation
      temperature_celsius: current.temp,
      feels_like_celsius: current.feels_like,
      humidity_percent: current.humidity,
      pressure_hpa: current.pressure,
      wind_speed_kmh: current.wind_speed * 3.6, // Convert m/s to km/h
      wind_direction_degrees: current.wind_deg,
      weather_description: current.description,
      weather_main: current.main,
      weather_icon: current.icon,
      cloud_cover_percent: current.clouds,
      visibility_km: current.visibility / 1000, // Convert m to km
      uv_index: current.uv_index || 0,
      // RAIN DATA - Critical for agriculture
      rain_1h_mm: current.rain_1h || 0, // 1-hour rainfall in mm
      rain_3h_mm: current.rain_3h || 0, // 3-hour rainfall in mm (NEW)
      rain_24h_mm: current.rain_1h || 0, // Store actual 1h rain only; daily totals tracked via aggregates
      snow_1h_mm: 0, // Future: Extract from API if available
      sunrise: current.sunrise ? new Date(current.sunrise * 1000).toISOString() : null,
      sunset: current.sunset ? new Date(current.sunset * 1000).toISOString() : null,
      observation_time: new Date(current.dt * 1000).toISOString(),
      data_source: current.provider || 'API',
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString()
    };
    
    // Delete old cache entry first (by location_key for shared 1km grid)
    await supabase.from('weather_current').delete().eq('location_key', locationKey)
    const { error: currentError } = await supabase.from('weather_current').insert(currentRecord)
    
    if (currentError) {
      console.error('❌ [Weather] Failed to cache current weather:', currentError.message)
    } else {
      console.log(`💾 [Weather] ✅ Cached current weather for ${locationKey}`, {
        temp: current.temp,
        rain_1h: current.rain_1h,
        rain_3h: current.rain_3h,
        wind_speed_kmh: current.wind_speed * 3.6,
        land_id: landId
      })
    }
    
    // ============= 2. Store in weather_observations for historical tracking =============
    if (tenantId) {
      const observationRecord: Record<string, any> = {
        tenant_id: tenantId,
        farmer_id: farmerId || null,
        land_id: landId || null, // Critical: Per-land historical data
        observation_date: now.toISOString().split('T')[0],
        observation_time: new Date(current.dt * 1000).toISOString(),
        temperature_celsius: current.temp,
        feels_like_celsius: current.feels_like,
        humidity_percent: current.humidity,
        rainfall_mm: current.rain_1h || 0, // Primary rainfall tracking
        snow_1h_mm: 0, // Future snowfall tracking
        wind_speed_kmh: current.wind_speed * 3.6,
        wind_direction: getWindDirection(current.wind_deg),
        weather_condition: current.main,
        pressure_hpa: current.pressure,
        visibility_km: current.visibility / 1000,
        uv_index: current.uv_index || 0,
        dew_point_celsius: current.dew_point || null,
        cloud_coverage_percent: current.clouds,
        metadata: {
          provider: current.provider,
          location_key: locationKey,
          icon: current.icon,
          description: current.description,
          rain_3h_mm: current.rain_3h || 0 // Store 3h rain in metadata
        },
        created_at: now.toISOString()
      };
      
      const { error: obsError } = await supabase.from('weather_observations').insert(observationRecord)
      
      if (obsError) {
        console.warn('⚠️ [Weather] Failed to save observation:', obsError.message)
      } else {
        console.log(`💾 [Weather] ✅ Saved weather observation for land: ${landId || 'global'}, rain: ${current.rain_1h || 0}mm`)
      }
    }
    
    // ============= 3. Store daily forecasts =============
    if (forecast && forecast.length > 0) {
      const forecastRecords = forecast.map(day => ({
        location_key: locationKey,
        latitude: rounded.lat,
        longitude: rounded.lon,
        land_id: landId || null, // NEW: Per-land forecasts
        tenant_id: tenantId || null, // NEW: Multi-tenant
        forecast_time: new Date(day.dt * 1000).toISOString(),
        forecast_type: 'daily' as const,
        temperature_celsius: day.temp.day,
        temperature_min_celsius: day.temp.min,
        temperature_max_celsius: day.temp.max,
        feels_like_celsius: day.temp.day,
        humidity_percent: Math.round(day.humidity),
        wind_speed_kmh: day.wind_speed * 3.6,
        weather_description: day.weather[0]?.description || 'Unknown',
        weather_main: day.weather[0]?.main || 'Unknown',
        weather_icon: day.weather[0]?.icon || '01d',
        rain_probability_percent: Math.round(day.pop * 100),
        rain_amount_mm: day.rain || 0, // Daily rain forecast
        uv_index: day.uv_index || 0,
        data_source: current.provider || 'API',
        created_at: now.toISOString()
      }));
      
      // Delete old forecasts for this location then insert new
      await supabase.from('weather_forecasts').delete().eq('location_key', locationKey).eq('forecast_type', 'daily')
      
      const { error: dailyInsertErr } = await supabase.from('weather_forecasts').insert(forecastRecords)
      if (dailyInsertErr) {
        console.warn('⚠️ [Weather] Daily forecast insert failed:', dailyInsertErr.message)
      } else {
        console.log(`💾 [Weather] ✅ Cached ${forecastRecords.length} daily forecasts for land: ${landId || 'global'}`)
      }
    }
    
    // ============= 4. Store hourly forecasts =============
    if (hourly && hourly.length > 0) {
      const hourlyRecords = hourly.map(hour => ({
        location_key: locationKey,
        latitude: rounded.lat,
        longitude: rounded.lon,
        land_id: landId || null, // NEW: Per-land forecasts
        tenant_id: tenantId || null, // NEW: Multi-tenant
        forecast_time: new Date(hour.dt * 1000).toISOString(),
        forecast_type: 'hourly' as const,
        temperature_celsius: hour.temp,
        feels_like_celsius: hour.feels_like,
        humidity_percent: Math.round(hour.humidity),
        wind_speed_kmh: hour.wind_speed * 3.6,
        weather_description: hour.weather[0]?.description || 'Unknown',
        weather_main: hour.weather[0]?.main || 'Unknown',
        weather_icon: hour.weather[0]?.icon || '01d',
        rain_probability_percent: Math.round(hour.pop * 100),
        uv_index: hour.uv_index || null,
        data_source: current.provider || 'API',
        created_at: now.toISOString()
      }));
      
      await supabase.from('weather_forecasts').delete().eq('location_key', locationKey).eq('forecast_type', 'hourly')
      const { error: hourlyInsertErr } = await supabase.from('weather_forecasts').insert(hourlyRecords)
      if (hourlyInsertErr) {
        console.warn('⚠️ [Weather] Hourly forecast insert failed:', hourlyInsertErr.message)
      } else {
        console.log(`💾 [Weather] ✅ Cached ${hourlyRecords.length} hourly forecasts for land: ${landId || 'global'}`)
      }
    }
    
    // ============= 5. Update weather_aggregates for the day =============
    if (tenantId) {
      await updateWeatherAggregate(supabase, tenantId, farmerId, landId, current, now, rounded.lat, rounded.lon)
    }
    
    // ============= 6. Compute and store land-level weather metrics =============
    if (landId && tenantId) {
      await computeLandWeatherMetrics(supabase, landId, tenantId, locationKey, current, rounded)
    }
    
    console.log(`✅ [Weather] All weather data cached successfully for ${locationKey}`)
    
  } catch (error) {
    console.error('❌ [Weather] Cache storage error:', error)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LAND WEATHER METRICS — Per-land derived intelligence (USDA SCS method)
// ═══════════════════════════════════════════════════════════════════════════

// Soil infiltration factors (fraction of rainfall that infiltrates)
const SOIL_FACTORS: Record<string, number> = {
  'black': 0.60, 'black_cotton': 0.60, 'vertisol': 0.60,
  'red': 0.75, 'laterite': 0.75, 'alfisol': 0.75,
  'sandy': 0.85, 'sandy_loam': 0.85, 'entisol': 0.85,
  'alluvial': 0.70, 'loamy': 0.70, 'inceptisol': 0.70,
  'clay': 0.55, 'clayey': 0.55,
  'default': 0.70
};

async function computeLandWeatherMetrics(
  supabase: any,
  landId: string,
  tenantId: string,
  locationKey: string,
  current: CurrentWeatherData,
  rounded: { lat: number; lon: number }
) {
  try {
    // Get land properties for adjustment factors
    const { data: land } = await supabase
      .from('lands')
      .select('soil_type, crop_type, area_hectares')
      .eq('id', landId)
      .maybeSingle();

    const soilType = (land?.soil_type || 'default').toLowerCase();
    const soilFactor = SOIL_FACTORS[soilType] || SOIL_FACTORS['default'];
    
    const today = new Date().toISOString().split('T')[0];
    const rainfall = current.rain_1h || 0;
    
    // Effective Rainfall (USDA SCS method simplified)
    const effectiveRainfall = rainfall * soilFactor;
    const runoffLoss = rainfall - effectiveRainfall;
    
    // ET0 calculation
    const tempMax = current.temp_max ?? current.temp;
    const tempMin = current.temp_min ?? current.temp;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const et0 = calculateET0Simple(tempMax, tempMin, rounded.lat, dayOfYear);
    const gdd = calculateDailyGDDSimple(tempMax, tempMin);
    
    // Water deficit = ET0 - effective rainfall (positive = deficit)
    const waterDeficit = Math.max(0, et0 - effectiveRainfall);
    const irrigationNeeded = waterDeficit > 2; // More than 2mm deficit
    const irrigationUrgency = waterDeficit > 5 ? 'HIGH' : waterDeficit > 2 ? 'MEDIUM' : 'NONE';
    
    // Disease risk score (0-100)
    const dewPoint = calculateDewPointSimple(current.temp, current.humidity);
    let diseaseScore = 0;
    if (current.humidity > 85) diseaseScore += 25;
    else if (current.humidity > 70) diseaseScore += 15;
    if (Math.abs(current.temp - dewPoint) < 2) diseaseScore += 30;
    else if (Math.abs(current.temp - dewPoint) < 5) diseaseScore += 15;
    if (current.temp >= 20 && current.temp <= 28) diseaseScore += 20;
    if (rainfall > 15) diseaseScore += 25;
    else if (rainfall > 5) diseaseScore += 15;
    
    const diseaseRiskLevel = diseaseScore >= 75 ? 'CRITICAL' : diseaseScore >= 50 ? 'HIGH' : diseaseScore >= 25 ? 'MEDIUM' : 'LOW';
    
    // Crop stress
    let cropStress = 'NONE';
    if (current.temp > 40) cropStress = 'SEVERE_HEAT';
    else if (current.temp > 38) cropStress = 'HEAT';
    else if (current.temp < 5) cropStress = 'FROST';
    else if (waterDeficit > 5) cropStress = 'WATER_STRESS';
    
    // Water balance
    let waterBalance = 'BALANCED';
    if (effectiveRainfall > et0 * 1.5) waterBalance = 'SURPLUS';
    else if (waterDeficit > 3) waterBalance = 'DEFICIT';
    
    // Get existing accumulated GDD
    const { data: existing } = await supabase
      .from('land_weather_metrics')
      .select('gdd_accumulated')
      .eq('land_id', landId)
      .eq('metric_date', today)
      .maybeSingle();
    
    const gddAccumulated = (existing?.gdd_accumulated || 0) + gdd;
    
    const { error } = await supabase.from('land_weather_metrics').upsert({
      land_id: landId,
      tenant_id: tenantId,
      metric_date: today,
      location_key: locationKey,
      temperature_c: current.temp,
      humidity_percent: current.humidity,
      wind_speed_kmh: current.wind_speed * 3.6,
      total_rainfall_mm: rainfall,
      effective_rainfall_mm: Math.round(effectiveRainfall * 10) / 10,
      runoff_loss_mm: Math.round(runoffLoss * 10) / 10,
      water_deficit_mm: Math.round(waterDeficit * 10) / 10,
      soil_infiltration_rate: soilType,
      irrigation_needed: irrigationNeeded,
      irrigation_urgency: irrigationUrgency,
      gdd_daily: gdd,
      gdd_accumulated: gddAccumulated,
      et0_mm: et0,
      disease_risk_score: diseaseScore,
      disease_risk_level: diseaseRiskLevel,
      crop_stress_level: cropStress,
      water_balance_status: waterBalance,
      computed_at: new Date().toISOString()
    }, { onConflict: 'land_id,metric_date' });
    
    if (error) {
      console.warn('⚠️ [Weather] Failed to compute land metrics:', error.message);
    } else {
      console.log(`🌱 [Weather] ✅ Land metrics computed for ${landId}: ER=${effectiveRainfall.toFixed(1)}mm, deficit=${waterDeficit.toFixed(1)}mm, GDD=${gdd.toFixed(1)}, stress=${cropStress}`);
    }
  } catch (err) {
    console.warn('⚠️ [Weather] Land metrics computation error:', err);
  }
}

// Helper function to convert wind degrees to direction
function getWindDirection(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const index = Math.round(deg / 22.5) % 16
  return directions[index]
}

// Update daily weather aggregates - ENHANCED with agricultural indices
async function updateWeatherAggregate(
  supabase: any,
  tenantId: string,
  farmerId?: string,
  landId?: string,
  current?: CurrentWeatherData,
  now?: Date,
  latitude?: number,
  longitude?: number
) {
  if (!current || !now) return
  
  const today = now.toISOString().split('T')[0]
  const hour = now.getHours()
  
  // Determine time period
  let rainColumn = 'rain_mm_morning'
  if (hour >= 12 && hour < 17) rainColumn = 'rain_mm_afternoon'
  else if (hour >= 17 && hour < 21) rainColumn = 'rain_mm_evening'
  else if (hour >= 21 || hour < 6) rainColumn = 'rain_mm_night'
  
  // Calculate agricultural indices — use API-provided Tmin/Tmax (CRITICAL for GDD/ET0)
  const tempMax = current.temp_max ?? current.temp
  const tempMin = current.temp_min ?? current.temp
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const lat = latitude || 20 // Default to central India
  
  // Calculate dew point, GDD, and ET0
  const dewPoint = calculateDewPointSimple(current.temp, current.humidity)
  const dailyGDD = calculateDailyGDDSimple(tempMax, tempMin)
  const et0 = calculateET0Simple(tempMax, tempMin, lat, dayOfYear)
  const sunshineHours = estimateSunshineHoursSimple(current.clouds, current.sunrise, current.sunset)
  
  console.log(`🌡️ [Weather] Agricultural indices: GDD=${dailyGDD.toFixed(1)}, ET0=${et0.toFixed(1)}mm, DewPoint=${dewPoint.toFixed(1)}°C`)
  
  try {
    // Check if aggregate exists for today
    const { data: existing } = await supabase
      .from('weather_aggregates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('aggregate_date', today)
      .eq('land_id', landId || null)
      .maybeSingle()
    
    if (existing) {
      // Update existing aggregate
      const obsCount = (existing.observation_count || 1);
      const updates: Record<string, any> = {
        updated_at: now.toISOString(),
        rain_mm_total: (existing.rain_mm_total || 0) + (current.rain_1h || 0),
        [rainColumn]: (existing[rainColumn] || 0) + (current.rain_1h || 0),
        observation_count: obsCount + 1
      }
      
      // Update min/max temps — use API Tmin/Tmax AND observed temp
      const candidateMin = Math.min(current.temp, tempMin);
      const candidateMax = Math.max(current.temp, tempMax);
      if (!existing.temp_min_celsius || candidateMin < existing.temp_min_celsius) {
        updates.temp_min_celsius = candidateMin;
      }
      if (!existing.temp_max_celsius || candidateMax > existing.temp_max_celsius) {
        updates.temp_max_celsius = candidateMax;
      }
      
      // Proper incremental mean: avg = old_avg + (new - old_avg) / (n + 1)
      updates.temp_avg_celsius = (existing.temp_avg_celsius || current.temp) + (current.temp - (existing.temp_avg_celsius || current.temp)) / (obsCount + 1);
      updates.humidity_avg_percent = (existing.humidity_avg_percent || current.humidity) + (current.humidity - (existing.humidity_avg_percent || current.humidity)) / (obsCount + 1);
      updates.wind_speed_avg_kmh = (existing.wind_speed_avg_kmh || current.wind_speed * 3.6) + (current.wind_speed * 3.6 - (existing.wind_speed_avg_kmh || current.wind_speed * 3.6)) / (obsCount + 1);
      
      if (current.wind_speed * 3.6 > (existing.wind_speed_max_kmh || 0)) {
        updates.wind_speed_max_kmh = current.wind_speed * 3.6
      }
      
      // Risk calculations - ENHANCED with dew point
      updates.frost_risk = current.temp < 4
      updates.heat_stress_risk = current.temp > 38
      updates.disease_risk_level = calculateDiseaseRiskEnhanced(current.humidity, current.temp, dewPoint, current.rain_1h || 0)
      
      // NEW: Agricultural indices
      updates.gdd_accumulated = (existing.gdd_accumulated || 0) + dailyGDD
      updates.evapotranspiration_mm = et0
      updates.sunshine_hours = sunshineHours
      
      await supabase
        .from('weather_aggregates')
        .update(updates)
        .eq('id', existing.id)
      
    } else {
      // Create new aggregate — use API Tmin/Tmax for real GDD/ET0
      const newAggregate = {
        tenant_id: tenantId,
        farmer_id: farmerId || null,
        land_id: landId || null,
        aggregate_date: today,
        rain_mm_total: current.rain_1h || 0,
        [rainColumn]: current.rain_1h || 0,
        temp_min_celsius: tempMin,
        temp_max_celsius: tempMax,
        observation_count: 1,
        temp_avg_celsius: current.temp,
        humidity_avg_percent: current.humidity,
        wind_speed_avg_kmh: current.wind_speed * 3.6,
        wind_speed_max_kmh: current.wind_speed * 3.6,
        frost_risk: current.temp < 4,
        heat_stress_risk: current.temp > 38,
        disease_risk_level: calculateDiseaseRiskEnhanced(current.humidity, current.temp, dewPoint, current.rain_1h || 0),
        // NEW: Agricultural indices
        gdd_accumulated: dailyGDD,
        evapotranspiration_mm: et0,
        sunshine_hours: sunshineHours,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      }
      
      await supabase.from('weather_aggregates').insert(newAggregate)
    }
    
    console.log(`💾 [Weather] ✅ Updated daily aggregate for ${today} with GDD=${dailyGDD.toFixed(1)}, ET0=${et0.toFixed(1)}`)
    
    // ============= 6. Archive to weather_historical (end-of-day or new day detection) =============
    await archiveToWeatherHistorical(supabase, tenantId, landId, lat, longitude)
    
  } catch (error) {
    console.warn('⚠️ [Weather] Failed to update aggregate:', error)
  }
}

/**
 * Archive completed daily aggregates to weather_historical table
 * This ensures GDD calculations have proper historical data
 * CRITICAL: This was missing - causing weather_historical to be empty!
 */
async function archiveToWeatherHistorical(
  supabase: any,
  tenantId: string,
  landId?: string,
  latitude?: number,
  rounded_lon?: number
) {
  try {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    
    // Check if yesterday's data is already archived
    const { data: existingHistorical } = await supabase
      .from('weather_historical')
      .select('id')
      .eq('record_date', yesterdayStr)
      .eq('latitude', latitude || 0)
      .maybeSingle()
    
    if (existingHistorical) {
      // Already archived, skip
      return
    }
    
    // Get yesterday's aggregate data
    const { data: aggregate } = await supabase
      .from('weather_aggregates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('aggregate_date', yesterdayStr)
      .eq('land_id', landId || null)
      .maybeSingle()
    
    if (!aggregate) {
      // No aggregate for yesterday, try to build from observations
      const { data: observations } = await supabase
        .from('weather_observations')
        .select('temperature_celsius, humidity_percent, rainfall_mm, wind_speed_kmh')
        .eq('observation_date', yesterdayStr)
        .eq('land_id', landId || null)
      
      if (observations && observations.length > 0) {
        const temps = observations.map((o: any) => o.temperature_celsius).filter((t: number) => t != null)
        const humidities = observations.map((o: any) => o.humidity_percent).filter((h: number) => h != null)
        const totalRain = observations.reduce((sum: number, o: any) => sum + (o.rainfall_mm || 0), 0)
        const avgWind = observations.reduce((sum: number, o: any) => sum + (o.wind_speed_kmh || 0), 0) / observations.length
        
        if (temps.length > 0) {
          const tmin = Math.min(...temps)
          const tmax = Math.max(...temps)
          const tavg = temps.reduce((a: number, b: number) => a + b, 0) / temps.length
          const gdd = calculateDailyGDDSimple(tmax, tmin)
          const dayOfYear = Math.floor((yesterday.getTime() - new Date(yesterday.getFullYear(), 0, 0).getTime()) / 86400000)
          const et0 = calculateET0Simple(tmax, tmin, latitude || 20, dayOfYear)
          
          const historicalRecord = {
            latitude: latitude || 0,
            longitude: rounded_lon || 0, // Use actual longitude
            record_date: yesterdayStr,
            temperature_avg_celsius: Math.round(tavg * 10) / 10,
            temperature_min_celsius: Math.round(tmin * 10) / 10,
            temperature_max_celsius: Math.round(tmax * 10) / 10,
            rainfall_mm: Math.round(totalRain * 10) / 10,
            humidity_avg_percent: humidities.length > 0 
              ? Math.round(humidities.reduce((a: number, b: number) => a + b, 0) / humidities.length) 
              : null,
            wind_speed_avg_kmh: Math.round(avgWind * 10) / 10,
            evapotranspiration_mm: et0,
            growing_degree_days: gdd,
            data_source: 'aggregated_observations',
            created_at: new Date().toISOString()
          }
          
          const { error: histError } = await supabase
            .from('weather_historical')
            .insert(historicalRecord)
          
          if (histError) {
            console.warn('⚠️ [Weather] Failed to archive historical from observations:', histError.message)
          } else {
            console.log(`📚 [Weather] ✅ Archived ${yesterdayStr} to weather_historical from observations`)
          }
        }
      }
      return
    }
    
    // Archive from aggregate
    const historicalRecord = {
      latitude: latitude || 0,
      longitude: rounded_lon || 0, // Use actual longitude
      record_date: yesterdayStr,
      temperature_avg_celsius: aggregate.temp_avg_celsius,
      temperature_min_celsius: aggregate.temp_min_celsius,
      temperature_max_celsius: aggregate.temp_max_celsius,
      rainfall_mm: aggregate.rain_mm_total || 0,
      humidity_avg_percent: aggregate.humidity_avg_percent,
      wind_speed_avg_kmh: aggregate.wind_speed_avg_kmh,
      evapotranspiration_mm: aggregate.evapotranspiration_mm || 0,
      growing_degree_days: aggregate.gdd_accumulated || 0,
      data_source: 'daily_aggregate',
      created_at: new Date().toISOString()
    }
    
    const { error: histError } = await supabase
      .from('weather_historical')
      .insert(historicalRecord)
    
    if (histError) {
      console.warn('⚠️ [Weather] Failed to archive historical:', histError.message)
    } else {
      console.log(`📚 [Weather] ✅ Archived ${yesterdayStr} to weather_historical from aggregate`)
    }
    
  } catch (error) {
    console.warn('⚠️ [Weather] Historical archive error:', error)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AGRICULTURAL CALCULATION HELPERS (simplified for inline use)
// Full calculations available in agricultural-calculations.ts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Dew Point using Magnus-Tetens formula
 */
function calculateDewPointSimple(tempC: number, humidityPercent: number): number {
  if (humidityPercent <= 0) return tempC - 20
  if (humidityPercent >= 100) return tempC
  
  const a = 17.27
  const b = 237.7
  const gamma = (a * tempC / (b + tempC)) + Math.log(humidityPercent / 100)
  return Math.round(((b * gamma) / (a - gamma)) * 10) / 10
}

/**
 * Calculate daily Growing Degree Days
 */
function calculateDailyGDDSimple(tempMax: number, tempMin: number, baseTemp: number = 10, maxTemp: number = 30): number {
  const cappedMax = Math.min(tempMax, maxTemp)
  const cappedMin = Math.max(tempMin, baseTemp)
  if (cappedMax <= cappedMin) return 0
  
  const avgTemp = (cappedMax + cappedMin) / 2
  return Math.round(Math.max(0, avgTemp - baseTemp) * 10) / 10
}

/**
 * Calculate Reference Evapotranspiration (ET0) - Hargreaves method
 */
function calculateET0Simple(tempMax: number, tempMin: number, latitude: number, dayOfYear: number): number {
  const tempMean = (tempMax + tempMin) / 2
  const tempRange = Math.max(0, tempMax - tempMin)
  
  // Simplified Ra calculation for tropical/subtropical India
  const latRad = latitude * Math.PI / 180
  const dr = 1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365)
  const delta = 0.409 * Math.sin(2 * Math.PI * dayOfYear / 365 - 1.39)
  const ws = Math.acos(-Math.tan(latRad) * Math.tan(delta))
  const Gsc = 0.0820
  const Ra = (24 * 60 / Math.PI) * Gsc * dr * (
    ws * Math.sin(latRad) * Math.sin(delta) +
    Math.cos(latRad) * Math.cos(delta) * Math.sin(ws)
  )
  
  const RaInMmPerDay = Math.max(0, Ra) / 2.45
  const et0 = 0.0023 * RaInMmPerDay * Math.sqrt(tempRange) * (tempMean + 17.8)
  
  return Math.round(Math.max(0, et0) * 10) / 10
}

/**
 * Estimate sunshine hours from cloud cover
 */
function estimateSunshineHoursSimple(cloudCoverPercent: number, sunriseTs?: number, sunsetTs?: number): number {
  if (!sunriseTs || !sunsetTs) return 0
  
  const daylightHours = (sunsetTs - sunriseTs) / 3600
  if (daylightHours <= 0) return 0
  
  const clearFraction = (100 - Math.min(100, Math.max(0, cloudCoverPercent))) / 100
  return Math.round(daylightHours * clearFraction * 0.9 * 10) / 10
}

/**
 * Enhanced disease risk with dew point and rainfall factors
 */
function calculateDiseaseRiskEnhanced(humidity: number, temp: number, dewPoint: number, recentRainMm: number): string {
  let score = 0
  
  // High humidity
  if (humidity > 85) score += 25
  else if (humidity > 70) score += 15
  
  // Dew point proximity (condensation risk)
  const dewPointProximity = Math.abs(temp - dewPoint)
  if (dewPointProximity < 2) score += 30
  else if (dewPointProximity < 5) score += 15
  
  // Optimal pathogen temperature
  if (temp >= 20 && temp <= 28) score += 20
  else if (temp >= 15 && temp <= 32) score += 10
  
  // Recent rainfall
  if (recentRainMm > 15) score += 25
  else if (recentRainMm > 5) score += 15
  
  if (score >= 75) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 25) return 'medium'
  return 'low'
}

// Main handler
serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Environment validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const tomorrowIoApiKey = Deno.env.get('TOMORROW_IO_API_KEY')
    const openWeatherApiKey = Deno.env.get('OPENWEATHER_API_KEY') || Deno.env.get('WEATHER_API_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }
    
    if (!openWeatherApiKey && !tomorrowIoApiKey) {
      throw new Error('No weather API keys configured')
    }

    // Resolve tenant
    console.log('🔍 [Weather] Resolving tenant from request...')
    const tenant = await resolveTenantFromRequest(req, supabaseUrl, supabaseServiceKey)
    
    if (!tenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found for this domain' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ [Weather] Tenant resolved: ${tenant.name} (${tenant.id})`)

    // Block inactive tenants
    const blockResponse = await withTenantBlocker(tenant, corsHeaders)
    if (blockResponse) {
      console.warn(`🚫 [Weather] Tenant blocked: ${tenant.status}`)
      return blockResponse
    }
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Extract user from auth header (optional - for tracking purposes)
    const authHeader = req.headers.get('Authorization')
    let userId: string | undefined
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id
      } catch (error) {
        console.log('ℹ️ [Weather] No valid user token - proceeding without user tracking')
      }
    }
    
    // Parse request
    const body = await req.json() as WeatherRequest
    let { action, lat, lon, landId, units = 'metric' } = body
    
    let landData: { id: string; name: string; farmer_id: string } | null = null
    
    // NEW: Handle land-based weather request
    if (landId || action === 'land') {
      if (!landId) {
        throw new Error('landId is required for land-based weather request')
      }
      
      console.log(`🌱 [Weather] Fetching weather for land: ${landId}`)
      
      // Get land coordinates from database
      const { data: land, error: landError } = await supabase
        .from('lands')
        .select('id, name, center_lat, center_lon, farmer_id, boundary_polygon_old')
        .eq('id', landId)
        .maybeSingle()
      
      if (landError || !land) {
        throw new Error(`Land not found: ${landId}`)
      }
      
      if (!land.center_lat || !land.center_lon) {
        // Fallback: compute centroid from boundary polygon
        const ring = land.boundary_polygon_old?.coordinates?.[0];
        if (ring && ring.length > 0) {
          lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length;
          lon = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length;
          console.warn(`[Weather] center_lat missing for ${land.name}, computed from boundary: ${lat}, ${lon}`);
        } else {
          throw new Error(`Land ${land.name} has no coordinates or boundary polygon`);
        }
      } else {
        lat = parseFloat(land.center_lat)
        lon = parseFloat(land.center_lon)
      }
      landData = { id: land.id, name: land.name, farmer_id: land.farmer_id }
      
      // For land action, fetch all weather data
      if (action === 'land') {
        action = 'all'
      }
      
      console.log(`📍 [Weather] Land ${land.name} location: ${lat}, ${lon}`)
    }
    
    if (!lat || !lon) {
      throw new Error('Latitude and longitude are required (or provide landId)')
    }
    
    // Round coordinates for caching (~1km precision)
    const rounded = roundCoordinates(lat, lon)
    console.log(`📍 [Weather] Rounded location: ${rounded.key} (original: ${lat},${lon})`)
    console.log(`🌤️ [Weather] Processing request for tenant ${tenant.id}:`, { action, location: rounded.key, landId: landData?.id })
    
    // STEP 1: Check cache first (cache-first strategy)
    const cached = await checkCache(supabase, rounded.key, action)
    if (cached) {
      console.log(`✅ [Weather] Returning cached data (${Object.keys(cached).join(', ')})`)
      return new Response(
        JSON.stringify({ 
          ...cached,
          tenant: { id: tenant.id, name: tenant.name },
          cached: true,
          provider: 'Cache', // Indicate data is from cache
          stale: cached.stale || false,
          timestamp: new Date().toISOString()
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // STEP 2: Cache miss - check rate limit before fetching from API
    console.log(`🌐 [Weather] Cache miss - checking rate limit before API call`)
    
    // Location-based rate limiting (only for actual API calls)
    // Increased from 4 to 12 requests due to:
    // - 1-hour cache duration
    // - Hybrid OpenWeather → Tomorrow.io fallback
    // - Better stale cache handling
    const rateLimit = await checkRateLimit(rounded.key, 'weather', { 
      maxRequests: 12, // Allow 12 fresh fetches per 15 min per ~1km area
      windowMs: 900000 // 15 minutes
    })
    
    if (!rateLimit.allowed) {
      console.warn(`⚠️ [Weather] Rate limit exceeded for ${rounded.key}`)
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded for this location. Try again later or use cached data.',
          resetTime: new Date(rateLimit.resetTime).toISOString(),
          remaining: rateLimit.remaining
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString()
          } 
        }
      )
    }
    
    console.log(`✅ [Weather] Rate limit check passed - fetching from Tomorrow.io API`)
    
    if (!tomorrowIoApiKey) {
      throw new Error('Tomorrow.io API key not configured')
    }
    
    let current: CurrentWeatherData | undefined
    let forecast: DailyForecast[] | undefined
    let hourly: ForecastItem[] | undefined
    let dataProvider = 'unknown'
    
    try {
      // HYBRID STRATEGY: Try OpenWeather first (1,000/day), then Tomorrow.io (500/day)
      
      // Try OpenWeather first if API key is available
      if (openWeatherApiKey) {
        try {
          console.log(`🔄 [Weather] Trying OpenWeather API first (primary source)`)
          
          if (action === 'current' || action === 'all') {
            current = await fetchOpenWeatherCurrent(rounded.lat, rounded.lon, openWeatherApiKey)
            dataProvider = 'OpenWeather'
          }
          
          if (action === 'forecast' || action === 'all') {
            const forecastData = await fetchOpenWeatherForecast(rounded.lat, rounded.lon, openWeatherApiKey)
            forecast = forecastData.forecast
            hourly = forecastData.hourly
            dataProvider = 'OpenWeather'
          }
          
          console.log(`✅ [Weather] OpenWeather API succeeded`)
          
        } catch (openWeatherError: any) {
          // OpenWeather failed - try Tomorrow.io as fallback
          const isOpenWeather429 = openWeatherError.message?.includes('429')
          console.warn(`⚠️ [Weather] OpenWeather failed (${isOpenWeather429 ? 'rate limited' : 'error'}), trying Tomorrow.io fallback`)
          
          if (!tomorrowIoApiKey) {
            throw new Error('Both OpenWeather and Tomorrow.io APIs unavailable')
          }
          
          // Fallback to Tomorrow.io
          if (action === 'current' || action === 'all') {
            current = await fetchTomorrowIoRealtime(rounded.lat, rounded.lon, tomorrowIoApiKey)
            dataProvider = 'Tomorrow.io'
          }
          
          if (action === 'forecast' || action === 'all') {
            const forecastData = await fetchTomorrowIoForecast(rounded.lat, rounded.lon, tomorrowIoApiKey)
            forecast = forecastData.forecast
            hourly = forecastData.hourly
            dataProvider = 'Tomorrow.io'
          }
          
          console.log(`✅ [Weather] Tomorrow.io fallback succeeded`)
        }
      } else if (tomorrowIoApiKey) {
        // No OpenWeather key, use Tomorrow.io directly
        console.log(`🔄 [Weather] Using Tomorrow.io (OpenWeather not configured)`)
        
        if (action === 'current' || action === 'all') {
          current = await fetchTomorrowIoRealtime(rounded.lat, rounded.lon, tomorrowIoApiKey)
          dataProvider = 'Tomorrow.io'
        }
        
        if (action === 'forecast' || action === 'all') {
          const forecastData = await fetchTomorrowIoForecast(rounded.lat, rounded.lon, tomorrowIoApiKey)
          forecast = forecastData.forecast
          hourly = forecastData.hourly
          dataProvider = 'Tomorrow.io'
        }
      } else {
        throw new Error('No weather API keys configured')
      }
      
      // STEP 3: Cache the fresh data
      if (current) {
        await cacheWeatherData(
          supabase, 
          rounded.key, 
          rounded, 
          current, 
          forecast, 
          hourly,
          tenant.id,
          userId || landData?.farmer_id,
          landData?.id // NEW: Pass landId for weather_observations
        )
      }
      
      console.log(`✅ [Weather] Successfully fetched and cached data from ${dataProvider} for ${rounded.key}`)
      
    } catch (apiError: any) {
      // Check if it's a Tomorrow.io rate limit error (429)
      const is429 = apiError.message?.includes('429') || apiError.message?.includes('rate limit')
      
      if (is429) {
        console.warn(`⚠️ [Weather] Tomorrow.io API rate limited - attempting stale cache fallback`)
        
        // Try to get stale cache data as fallback
        const staleCache = await checkCache(supabase, rounded.key, action, true)
        
        if (staleCache) {
          console.log(`✅ [Weather] Returning stale cache data (better than nothing!)`)
          return new Response(
            JSON.stringify({
              ...(action === 'current' ? { current: staleCache.current } :
                  action === 'forecast' ? { forecast: staleCache.forecast, hourly: staleCache.hourly } :
                  { current: staleCache.current, forecast: staleCache.forecast, hourly: staleCache.hourly }),
              tenant: { id: tenant.id, name: tenant.name },
              cached: true,
              stale: true,
              warning: 'Weather API rate limited. Showing cached data.',
              timestamp: new Date().toISOString()
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        
        // No stale cache available either
        console.error(`❌ [Weather] No stale cache available for fallback`)
        return new Response(
          JSON.stringify({ 
            error: 'Weather service temporarily unavailable. Please try again later.',
            details: 'API rate limit reached and no cached data available',
            timestamp: new Date().toISOString()
          }),
          { 
            status: 503, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      // Not a 429 error, rethrow
      throw apiError
    }
    
    // STEP 4: Return response based on action
    const response: any = {
      tenant: { id: tenant.id, name: tenant.name },
      cached: false,
      provider: dataProvider,
      timestamp: new Date().toISOString()
    }
    
    // Include land info if this was a land-based request
    if (landData) {
      response.land = {
        id: landData.id,
        name: landData.name
      }
    }
    
    if (action === 'current') {
      response.current = current
    } else if (action === 'forecast') {
      response.forecast = forecast
      response.hourly = hourly
    } else if (action === 'all') {
      response.current = current
      response.forecast = forecast
      response.hourly = hourly
    }
    
    console.log(`✅ [Weather] Successfully fetched and cached data for ${rounded.key}`)
    
    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
    
  } catch (error) {
    console.error('❌ [Weather] Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})