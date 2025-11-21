import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkRateLimit } from '../_shared/rateLimiter.ts'
import { resolveTenantFromRequest } from '../_shared/tenantMiddleware.ts'
import { validateTenantAuth } from '../_shared/authMiddleware.ts'
import { withTenantBlocker } from '../_shared/tenantBlocker.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

// Type definitions
interface WeatherRequest {
  action: 'current' | 'forecast' | 'agricultural'
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

interface AgricultureInsights {
  temperature: number
  humidity: number
  windSpeed: number
  recommendations: string[]
}

// Helper functions for weather APIs
// Helper function to convert weather codes to descriptions
const weatherCodeMap: { [key: number]: string } = {
  0: "Clear",
  1: "Mostly Clear",
  2: "Partly Cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Depositing Rime Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  56: "Light Freezing Drizzle",
  57: "Dense Freezing Drizzle",
  61: "Slight Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  66: "Light Freezing Rain",
  67: "Heavy Freezing Rain",
  71: "Slight Snow Fall",
  73: "Moderate Snow Fall",
  75: "Heavy Snow Fall",
  77: "Snow Grains",
  80: "Slight Rain Showers",
  81: "Moderate Rain Showers",
  82: "Violent Rain Showers",
  85: "Slight Snow Showers",
  86: "Heavy Snow Showers",
  95: "Thunderstorm",
  96: "Thunderstorm with Slight Hail",
  99: "Thunderstorm with Heavy Hail",
};

// Function to get weather recommendation for agriculture
function getWeatherRecommendation(temperature: number, humidity: number, windSpeed: number): string[] {
  const recommendations: string[] = [];

  if (temperature > 30) {
    recommendations.push("High temperature detected. Ensure adequate irrigation.");
  } else if (temperature < 10) {
    recommendations.push("Low temperature detected. Protect crops from frost.");
  }

  if (humidity > 80) {
    recommendations.push("High humidity detected. Monitor for fungal diseases.");
  } else if (humidity < 30) {
    recommendations.push("Low humidity detected. Increase irrigation.");
  }

  if (windSpeed > 50) {
    recommendations.push("High wind speed detected. Provide windbreaks for crops.");
  }

  return recommendations;
}

// Helper functions for Tomorrow.io API
async function fetchTomorrowIoWeather(
  lat: number,
  lon: number,
  apiKey: string,
  units: string
): Promise<{ current: CurrentWeatherData; forecast: DailyForecast[] }> {
  const unitSystem = units === 'imperial' ? 'imperial' : 'metric'
  const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${apiKey}&units=${unitSystem}&timesteps=1d,1h,current`
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Tomorrow.io API error: ${response.status}`)
  }
  
  const data = await response.json()
  const current = data.timelines.current
  const daily = data.timelines.daily
  
  // Map Tomorrow.io data to our format
  const currentWeather: CurrentWeatherData = {
    temp: current.values.temperature ?? 0,
    feels_like: current.values.temperatureApparent ?? 0,
    temp_min: daily[0]?.values.temperatureMin ?? 0,
    temp_max: daily[0]?.values.temperatureMax ?? 0,
    humidity: current.values.humidity ?? 0,
    pressure: current.values.pressureSurfaceLevel ?? 0,
    wind_speed: current.values.windSpeed ?? 0,
    wind_deg: current.values.windDirection ?? 0,
    description: getWeatherDescription(current.values.weatherCode),
    main: getWeatherMain(current.values.weatherCode),
    icon: getWeatherIcon(current.values.weatherCode),
    clouds: current.values.cloudCover ?? 0,
    visibility: current.values.visibility ?? 10000,
    sunrise: new Date(daily[0]?.values.sunriseTime).getTime() / 1000 ?? 0,
    sunset: new Date(daily[0]?.values.sunsetTime).getTime() / 1000 ?? 0,
    location: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    dt: new Date(current.time).getTime() / 1000,
    provider: 'Tomorrow.io',
    uv_index: current.values.uvIndex ?? 0,
    dew_point: current.values.dewPoint ?? 0
  }
  
  // Map forecast data (14 days)
  const forecastData: DailyForecast[] = daily.slice(0, 14).map((day: any) => ({
    dt: new Date(day.time).getTime() / 1000,
    temp: {
      day: day.values.temperatureAvg ?? 0,
      min: day.values.temperatureMin ?? 0,
      max: day.values.temperatureMax ?? 0,
      night: day.values.temperatureMin ?? 0,
      eve: day.values.temperatureAvg ?? 0,
      morn: day.values.temperatureAvg ?? 0
    },
    humidity: day.values.humidityAvg ?? 0,
    wind_speed: day.values.windSpeedAvg ?? 0,
    weather: [{
      description: getWeatherDescription(day.values.weatherCodeMax),
      main: getWeatherMain(day.values.weatherCodeMax),
      icon: getWeatherIcon(day.values.weatherCodeMax)
    }],
    pop: day.values.precipitationProbabilityAvg / 100 ?? 0,
    uv_index: day.values.uvIndexMax ?? 0,
    moon_phase: day.values.moonPhase ?? 0
  }))
  
  return { current: currentWeather, forecast: forecastData }
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

async function fetchOpenWeatherCurrent(lat: number, lon: number, apiKey: string, units: string): Promise<CurrentWeatherData> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}`
  const response = await fetch(url)
  
  if (!response.ok) throw new Error(`OpenWeather API error: ${response.status}`)
  
  const data = await response.json()
  return {
    temp: data.main?.temp ?? 0,
    feels_like: data.main?.feels_like ?? 0,
    temp_min: data.main?.temp_min ?? 0,
    temp_max: data.main?.temp_max ?? 0,
    humidity: data.main?.humidity ?? 0,
    pressure: data.main?.pressure ?? 0,
    wind_speed: data.wind?.speed ?? 0,
    wind_deg: data.wind?.deg ?? 0,
    description: data.weather?.[0]?.description ?? 'Unknown',
    main: data.weather?.[0]?.main ?? 'Unknown',
    icon: data.weather?.[0]?.icon ?? '01d',
    clouds: data.clouds?.all ?? 0,
    visibility: data.visibility ?? 10000,
    sunrise: data.sys?.sunrise ?? 0,
    sunset: data.sys?.sunset ?? 0,
    location: data.name ?? 'Unknown',
    dt: data.dt ?? Date.now() / 1000,
    provider: 'OpenWeather'
  }
}

async function fetchOpenWeatherForecast(lat: number, lon: number, apiKey: string, units: string): Promise<DailyForecast[]> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`OpenWeather forecast API error: ${response.status}`)
  
  const data = await response.json()
  const dailyMap = new Map<string, any>()
  
  data.list?.forEach((item: any) => {
    const date = new Date(item.dt * 1000).toDateString()
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        dt: item.dt,
        temps: [] as number[],
        humidity: [] as number[],
        weather: item.weather,
        pop: [] as number[],
        wind_speed: [] as number[]
      })
    }
    const daily = dailyMap.get(date)!
    daily.temps.push(item.main.temp)
    daily.humidity.push(item.main.humidity)
    daily.pop.push(item.pop ?? 0)
    daily.wind_speed.push(item.wind.speed)
  })
  
  return Array.from(dailyMap.values()).slice(0, 5).map(day => ({
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
    pop: Math.max(...day.pop)
  }))
}

async function fetchWeatherWithFallback(
  lat: number, lon: number, tomorrowIoKey: string | undefined, openWeatherKey: string, units: string, action: string
): Promise<{ current?: CurrentWeatherData; forecast?: DailyForecast[] }> {
  let lastError: Error | null = null
  
  if (tomorrowIoKey) {
    try {
      console.log('Attempting to fetch from Tomorrow.io...')
      const { current, forecast } = await fetchTomorrowIoWeather(lat, lon, tomorrowIoKey, units)
      if (action === 'current') return { current }
      else if (action === 'forecast') return { forecast }
      else return { current, forecast }
    } catch (error) {
      console.error('Tomorrow.io failed:', error)
      lastError = error as Error
    }
  }
  
  try {
    console.log('Falling back to OpenWeather...')
    if (action === 'current') {
      const current = await fetchOpenWeatherCurrent(lat, lon, openWeatherKey, units)
      return { current }
    } else if (action === 'forecast') {
      const forecast = await fetchOpenWeatherForecast(lat, lon, openWeatherKey, units)
      return { forecast }
    } else {
      const [current, forecast] = await Promise.all([
        fetchOpenWeatherCurrent(lat, lon, openWeatherKey, units),
        fetchOpenWeatherForecast(lat, lon, openWeatherKey, units)
      ])
      return { current, forecast }
    }
  } catch (error) {
    console.error('OpenWeather also failed:', error)
    throw lastError || error
  }
}

// Main handler with middleware
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

    // ===== STEP 1: Resolve Tenant from Domain =====
    console.log('🔍 [Weather] Resolving tenant from request...')
    const tenant = await resolveTenantFromRequest(req, supabaseUrl, supabaseServiceKey)
    
    if (!tenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found for this domain' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ [Weather] Tenant resolved: ${tenant.name} (${tenant.id})`)

    // ===== STEP 2: Block Inactive Tenants =====
    const blockResponse = await withTenantBlocker(tenant, corsHeaders)
    if (blockResponse) {
      console.warn(`🚫 [Weather] Tenant blocked: ${tenant.status}`)
      return blockResponse
    }

    // ===== STEP 3: No Authentication Required (Public Weather Endpoint) =====
    console.log('🌐 [Weather] Public endpoint - no authentication required')
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parse request
    const body = await req.json() as WeatherRequest
    const { action, lat, lon, units = 'metric' } = body
    
    if (!lat || !lon) {
      throw new Error('Latitude and longitude are required')
    }
    
    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
    const rateLimit = await checkRateLimit(clientIp, 'weather', { maxRequests: 100, windowMs: 60000 })
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
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
    
    console.log(`🌤️ [Weather] Processing request for tenant ${tenant.id}:`, { action, lat, lon })
    
    // Fetch weather data
    const weatherData = await fetchWeatherWithFallback(
      lat, lon, tomorrowIoApiKey, openWeatherApiKey, units, action
    )
    
    // Return response with tenant context
    return new Response(
      JSON.stringify({ 
        ...weatherData,
        tenant: {
          id: tenant.id,
          name: tenant.name
        },
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenant.id
        } 
      }
    )
    
  } catch (error: any) {
    console.error('❌ [Weather] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
