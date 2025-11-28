import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkRateLimit } from '../_shared/rateLimiter.ts'
import { resolveTenantFromRequest } from '../_shared/tenantMiddleware.ts'
import { withTenantBlocker } from '../_shared/tenantBlocker.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token',
}

// Type definitions
interface WeatherRequest {
  action: 'current' | 'forecast' | 'agricultural' | 'all' // NEW: 'all' for single combined call
  lat: number
  lon: number
  units?: 'metric' | 'imperial' | 'standard'
}

interface CurrentWeatherData {
  temp: number
  feels_like: number
  temp_min: number
  temp_max: number
  humidity: number
  pressure: number
  wind_speed: number
  wind_deg: number
  description: string
  main: string
  icon: string
  clouds: number
  visibility: number
  sunrise: number
  sunset: number
  location: string
  dt: number
  provider?: string
  uv_index?: number
  dew_point?: number
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
  action: string
): Promise<{ current?: CurrentWeatherData; forecast?: DailyForecast[]; hourly?: ForecastItem[] } | null> {
  try {
    // Check current weather cache
    const { data: cachedCurrent, error: cacheError } = await supabase
      .from('weather_current')
      .select('*')
      .eq('location_key', locationKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (cacheError) {
      console.warn('⚠️ Cache check error:', cacheError)
      return null
    }

    if (!cachedCurrent) {
      console.log(`❌ [Weather] Cache MISS for ${locationKey}`)
      return null
    }

    console.log(`✅ [Weather] Cache HIT for ${locationKey}`)
    
    // Map cached data to CurrentWeatherData format
    const current: CurrentWeatherData = {
      temp: cachedCurrent.temperature_celsius || 0,
      feels_like: cachedCurrent.feels_like_celsius || 0,
      temp_min: cachedCurrent.temp_min || 0,
      temp_max: cachedCurrent.temp_max || 0,
      humidity: cachedCurrent.humidity_percent || 0,
      pressure: cachedCurrent.pressure_hpa || 0,
      wind_speed: cachedCurrent.wind_speed_kph || 0,
      wind_deg: cachedCurrent.wind_direction_degrees || 0,
      description: cachedCurrent.description || 'Unknown',
      main: cachedCurrent.condition || 'Unknown',
      icon: cachedCurrent.icon_code || '01d',
      clouds: cachedCurrent.cloud_cover_percent || 0,
      visibility: cachedCurrent.visibility_meters || 10000,
      sunrise: 0, // Not cached in current schema
      sunset: 0,
      location: `${cachedCurrent.latitude}, ${cachedCurrent.longitude}`,
      dt: Math.floor(new Date(cachedCurrent.observation_time).getTime() / 1000),
      provider: cachedCurrent.data_source || 'Cache',
      uv_index: cachedCurrent.uv_index || 0,
      dew_point: cachedCurrent.dew_point_celsius || 0
    }

    // If only current weather needed, return now
    if (action === 'current') {
      return { current }
    }

    // Fetch cached forecasts if needed
    if (action === 'forecast' || action === 'all') {
      const { data: cachedForecasts } = await supabase
        .from('weather_forecasts')
        .select('*')
        .eq('location_key', locationKey)
        .gte('forecast_time', new Date().toISOString())
        .order('forecast_time', { ascending: true })

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
              wind_speed: forecast.wind_speed_kph || 0,
              weather: [{
                description: forecast.description || 'Unknown',
                main: forecast.condition || 'Unknown',
                icon: forecast.icon_code || '01d'
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
                  description: forecast.description || 'Unknown',
                  main: forecast.condition || 'Unknown',
                  icon: forecast.icon_code || '01d'
                }],
                pop: (forecast.precipitation_probability || 0) / 100,
                uv_index: forecast.uv_index || 0
              })
            }
            const dayData = dailyMap.get(dateKey)!
            dayData.temps.push(forecast.temperature_celsius || 0)
            dayData.humidity.push(forecast.humidity_percent || 0)
            dayData.wind_speed.push(forecast.wind_speed_kph || 0)
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

      return { current, forecast: daily, hourly }
    }

    return { current }
  } catch (error) {
    console.error('❌ [Weather] Cache check failed:', error)
    return null
  }
}

// Fetch from Tomorrow.io using REALTIME endpoint for current weather
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
  
  // Tomorrow.io returns timelines as an array, not an object with daily property
  const hourlyTimeline = data.timelines?.find((t: any) => t.timestep === '1h')?.intervals || []
  const dailyTimeline = data.timelines?.find((t: any) => t.timestep === '1d')?.intervals || []
  
  console.log(`📊 [Weather] Received forecast data - hourly: ${hourlyTimeline.length} items, daily: ${dailyTimeline.length} items`)
  
  // Map hourly data (next 24 hours)
  const hourly: ForecastItem[] = hourlyTimeline.slice(0, 24).map((hour: any) => ({
    dt: Math.floor(new Date(hour.startTime || hour.time).getTime() / 1000),
    temp: hour.values.temperature ?? 0,
    feels_like: hour.values.temperatureApparent ?? 0,
    humidity: hour.values.humidity ?? 0,
    wind_speed: hour.values.windSpeed ?? 0,
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
    dt: Math.floor(new Date(day.time || day.startTime).getTime() / 1000),
    temp: {
      day: day.values.temperatureAvg ?? day.values.temperature ?? 0,
      min: day.values.temperatureMin ?? day.values.temperature ?? 0,
      max: day.values.temperatureMax ?? day.values.temperature ?? 0,
      night: day.values.temperatureMin ?? day.values.temperature ?? 0,
      eve: day.values.temperatureAvg ?? day.values.temperature ?? 0,
      morn: day.values.temperatureAvg ?? day.values.temperature ?? 0
    },
    humidity: day.values.humidityAvg ?? day.values.humidity ?? 0,
    wind_speed: day.values.windSpeedAvg ?? day.values.windSpeed ?? 0,
    weather: [{
      description: getWeatherDescription(day.values.weatherCodeMax || day.values.weatherCode),
      main: getWeatherMain(day.values.weatherCodeMax || day.values.weatherCode),
      icon: getWeatherIcon(day.values.weatherCodeMax || day.values.weatherCode)
    }],
    pop: (day.values.precipitationProbabilityAvg || day.values.precipitationProbability || 0) / 100,
    uv_index: day.values.uvIndexMax ?? day.values.uvIndex ?? 0,
    moon_phase: day.values.moonPhase ?? 0
  }))
  
  return { forecast, hourly }
}

// Store weather data in cache
async function cacheWeatherData(
  supabase: any,
  locationKey: string,
  rounded: { lat: number; lon: number },
  current: CurrentWeatherData,
  forecast?: DailyForecast[],
  hourly?: ForecastItem[]
) {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000) // 15 minutes for current weather
    
    // Upsert current weather to cache
    await supabase.from('weather_current').upsert({
      location_key: locationKey,
      latitude: rounded.lat,
      longitude: rounded.lon,
      temperature_celsius: current.temp,
      feels_like_celsius: current.feels_like,
      temp_min: current.temp_min,
      temp_max: current.temp_max,
      humidity_percent: current.humidity,
      pressure_hpa: current.pressure,
      wind_speed_kph: current.wind_speed,
      wind_direction_degrees: current.wind_deg,
      description: current.description,
      condition: current.main,
      icon_code: current.icon,
      cloud_cover_percent: current.clouds,
      visibility_meters: current.visibility,
      uv_index: current.uv_index,
      dew_point_celsius: current.dew_point,
      observation_time: new Date(current.dt * 1000).toISOString(),
      data_source: current.provider || 'Tomorrow.io',
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    }, { onConflict: 'location_key' })
    
    console.log(`💾 [Weather] Cached current weather for ${locationKey}`)
    
    // Cache forecasts if provided
    if (forecast && forecast.length > 0) {
      const forecastRecords = forecast.map(day => ({
        location_key: locationKey,
        forecast_time: new Date(day.dt * 1000).toISOString(),
        forecast_type: 'daily',
        temperature_celsius: day.temp.day,
        feels_like_celsius: day.temp.day,
        temp_min: day.temp.min,
        temp_max: day.temp.max,
        humidity_percent: day.humidity,
        wind_speed_kph: day.wind_speed,
        description: day.weather[0]?.description || 'Unknown',
        condition: day.weather[0]?.main || 'Unknown',
        icon_code: day.weather[0]?.icon || '01d',
        precipitation_probability: day.pop * 100,
        uv_index: day.uv_index,
        data_source: current.provider || 'Tomorrow.io'
      }))
      
      await supabase.from('weather_forecasts').upsert(forecastRecords)
      console.log(`💾 [Weather] Cached ${forecast.length} daily forecasts`)
    }
    
    // Cache hourly forecasts if provided
    if (hourly && hourly.length > 0) {
      const hourlyRecords = hourly.map(hour => ({
        location_key: locationKey,
        forecast_time: new Date(hour.dt * 1000).toISOString(),
        forecast_type: 'hourly',
        temperature_celsius: hour.temp,
        feels_like_celsius: hour.feels_like,
        humidity_percent: hour.humidity,
        wind_speed_kph: hour.wind_speed,
        description: hour.weather[0]?.description || 'Unknown',
        condition: hour.weather[0]?.main || 'Unknown',
        icon_code: hour.weather[0]?.icon || '01d',
        precipitation_probability: hour.pop * 100,
        uv_index: hour.uv_index,
        data_source: current.provider || 'Tomorrow.io'
      }))
      
      await supabase.from('weather_forecasts').upsert(hourlyRecords)
      console.log(`💾 [Weather] Cached ${hourly.length} hourly forecasts`)
    }
  } catch (error) {
    console.error('❌ [Weather] Failed to cache data:', error)
    // Don't throw - caching is best-effort
  }
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
    
    // Parse request
    const body = await req.json() as WeatherRequest
    const { action, lat, lon, units = 'metric' } = body
    
    if (!lat || !lon) {
      throw new Error('Latitude and longitude are required')
    }
    
    // Round coordinates for caching (~1km precision)
    const rounded = roundCoordinates(lat, lon)
    console.log(`📍 [Weather] Rounded location: ${rounded.key} (original: ${lat},${lon})`)
    
    // Location-based rate limiting (not per-IP)
    const rateLimit = await checkRateLimit(rounded.key, 'weather', { 
      maxRequests: 4, // Only 4 fresh fetches per 15 min per ~1km area
      windowMs: 900000 // 15 minutes
    })
    
    if (!rateLimit.allowed) {
      console.warn(`⚠️ [Weather] Rate limit exceeded for ${rounded.key}`)
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded for this location',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateLimit.remaining)
          } 
        }
      )
    }
    
    console.log(`🌤️ [Weather] Processing request for tenant ${tenant.id}:`, { action, location: rounded.key })
    
    // STEP 1: Check cache first (cache-first strategy)
    const cached = await checkCache(supabase, rounded.key, action)
    if (cached) {
      console.log(`✅ [Weather] Returning cached data (${Object.keys(cached).join(', ')})`)
      return new Response(
        JSON.stringify({ 
          ...cached,
          tenant: { id: tenant.id, name: tenant.name },
          cached: true,
          timestamp: new Date().toISOString()
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // STEP 2: Cache miss - fetch from API
    console.log(`🌐 [Weather] Cache miss - fetching from Tomorrow.io API`)
    
    if (!tomorrowIoApiKey) {
      throw new Error('Tomorrow.io API key not configured')
    }
    
    let current: CurrentWeatherData | undefined
    let forecast: DailyForecast[] | undefined
    let hourly: ForecastItem[] | undefined
    
    if (action === 'current' || action === 'all') {
      // Fetch current weather using /realtime endpoint
      current = await fetchTomorrowIoRealtime(rounded.lat, rounded.lon, tomorrowIoApiKey)
    }
    
    if (action === 'forecast' || action === 'all') {
      // Fetch forecast data
      const forecastData = await fetchTomorrowIoForecast(rounded.lat, rounded.lon, tomorrowIoApiKey)
      forecast = forecastData.forecast
      hourly = forecastData.hourly
    }
    
    // STEP 3: Cache the fresh data
    if (current) {
      await cacheWeatherData(supabase, rounded.key, rounded, current, forecast, hourly)
    }
    
    // STEP 4: Return response based on action
    const response: any = {
      tenant: { id: tenant.id, name: tenant.name },
      cached: false,
      timestamp: new Date().toISOString()
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