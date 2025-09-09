import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// Helper functions for OpenWeather API (fallback)
async function fetchOpenWeatherCurrent(
  lat: number,
  lon: number,
  apiKey: string,
  units: string
): Promise<CurrentWeatherData> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`OpenWeather API error: ${response.status}`)
  }
  
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

async function fetchOpenWeatherForecast(
  lat: number,
  lon: number,
  apiKey: string,
  units: string
): Promise<DailyForecast[]> {
  const url = `https://api.openweathermap.org/data/2.5/forecast/daily?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}&cnt=14`
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      // Fallback to 5-day forecast if daily endpoint not available
      return await fetchOpenWeather5DayForecast(lat, lon, apiKey, units)
    }
    
    const data = await response.json()
    
    return data.list.map((day: any) => ({
      dt: day.dt,
      temp: {
        day: day.temp.day,
        min: day.temp.min,
        max: day.temp.max,
        night: day.temp.night,
        eve: day.temp.eve,
        morn: day.temp.morn
      },
      humidity: day.humidity,
      wind_speed: day.speed,
      weather: day.weather,
      pop: day.pop ?? 0,
      uv_index: day.uvi ?? 0
    }))
  } catch {
    // Use 5-day forecast as fallback
    return await fetchOpenWeather5DayForecast(lat, lon, apiKey, units)
  }
}

async function fetchOpenWeather5DayForecast(
  lat: number,
  lon: number,
  apiKey: string,
  units: string
): Promise<DailyForecast[]> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`OpenWeather forecast API error: ${response.status}`)
  }
  
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
  
  return Array.from(dailyMap.values())
    .slice(0, 5) // Only 5 days available from this endpoint
    .map(day => ({
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

// Combined weather fetch with fallback
async function fetchWeatherWithFallback(
  lat: number,
  lon: number,
  tomorrowIoKey: string | undefined,
  openWeatherKey: string,
  units: string,
  action: string
): Promise<{ current?: CurrentWeatherData; forecast?: DailyForecast[]; hourly?: ForecastItem[] }> {
  let lastError: Error | null = null
  
  // Try Tomorrow.io first if key is available
  if (tomorrowIoKey) {
    try {
      console.log('Attempting to fetch from Tomorrow.io...')
      const { current, forecast } = await fetchTomorrowIoWeather(lat, lon, tomorrowIoKey, units)
      
      if (action === 'current') {
        return { current }
      } else if (action === 'forecast') {
        return { forecast }
      } else {
        return { current, forecast }
      }
    } catch (error) {
      console.error('Tomorrow.io failed:', error)
      lastError = error as Error
    }
  }
  
  // Fallback to OpenWeather
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

function generateAgricultureInsights(
  current: CurrentWeatherData,
  forecast: { daily: DailyForecast[]; hourly: ForecastItem[] }
): AgricultureInsights {
  const recommendations: string[] = []
  const { temp, humidity, wind_speed: windSpeed } = current
  
  // Temperature recommendations
  if (temp > 35) {
    recommendations.push('High temperature: Ensure adequate irrigation')
  } else if (temp < 10) {
    recommendations.push('Low temperature: Protect sensitive crops')
  }
  
  // Humidity recommendations  
  if (humidity > 80) {
    recommendations.push('High humidity: Monitor for fungal diseases')
  } else if (humidity < 40) {
    recommendations.push('Low humidity: Increase irrigation frequency')
  }
  
  // Wind recommendations
  if (windSpeed > 20) {
    recommendations.push('Strong winds: Postpone pesticide spraying')
  }
  
  // Rain forecast check
  const hasUpcomingRain = forecast.hourly.slice(0, 8).some(h => h.pop > 0.3)
  if (hasUpcomingRain) {
    recommendations.push('Rain expected: Delay fertilizer application')
  }
  
  return {
    temperature: temp,
    humidity,
    windSpeed,
    recommendations
  }
}

async function cacheWeatherData(
  supabase: any,
  lat: number,
  lon: number,
  action: string,
  data: unknown
): Promise<void> {
  try {
    await supabase.from('weather_cache').upsert({
      id: `${lat}-${lon}-${action}`,
      lat,
      lon,
      data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Cache error (non-critical):', error)
  }
}

// Main handler
serve(async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Environment validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const tomorrowIoApiKey = Deno.env.get('TOMORROW_IO_API_KEY')
    const openWeatherApiKey = Deno.env.get('OPENWEATHER_API_KEY') || 
                             Deno.env.get('WEATHER_API_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }
    
    if (!openWeatherApiKey && !tomorrowIoApiKey) {
      throw new Error('No weather API keys configured')
    }
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parse and validate request
    const body = await req.json() as WeatherRequest
    const { action, lat, lon, units = 'metric' } = body
    
    if (!lat || !lon) {
      throw new Error('Latitude and longitude are required')
    }
    
    console.log('Processing weather request:', { action, lat, lon })
    console.log('Available APIs:', { 
      tomorrowIo: !!tomorrowIoApiKey, 
      openWeather: !!openWeatherApiKey 
    })
    
    // Process based on action
    let responseData: unknown = {}
    
    switch (action) {
      case 'current': {
        const { current } = await fetchWeatherWithFallback(
          lat, lon, tomorrowIoApiKey, openWeatherApiKey!, units, action
        )
        responseData = current
        break
      }
      
      case 'forecast': {
        const { current, forecast } = await fetchWeatherWithFallback(
          lat, lon, tomorrowIoApiKey, openWeatherApiKey!, units, 'all'
        )
        
        // For backward compatibility, return both daily and hourly
        const hourlyData = forecast?.slice(0, 2).flatMap(day => {
          // Generate synthetic hourly data from daily forecast
          const hours = []
          for (let i = 0; i < 24; i += 3) {
            hours.push({
              dt: day.dt + (i * 3600),
              temp: day.temp.day,
              feels_like: day.temp.day,
              humidity: day.humidity,
              wind_speed: day.wind_speed,
              weather: day.weather,
              pop: day.pop,
              uv_index: day.uv_index
            })
          }
          return hours
        }).slice(0, 16) || []
        
        responseData = { 
          current,
          daily: forecast,
          hourly: hourlyData
        }
        break
      }
      
      case 'agricultural': {
        const { current, forecast } = await fetchWeatherWithFallback(
          lat, lon, tomorrowIoApiKey, openWeatherApiKey!, units, 'all'
        )
        
        if (current && forecast) {
          const insights = generateAgricultureInsights(
            current, 
            { daily: forecast, hourly: [] }
          )
          responseData = { current, forecast, insights }
        }
        break
      }
      
      default:
        throw new Error(`Invalid action: ${action}. Use: current, forecast, or agricultural`)
    }
    
    // Cache the data
    await cacheWeatherData(supabase, lat, lon, action, responseData)
    
    // Return success response
    return new Response(
      JSON.stringify(responseData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
    
  } catch (error) {
    console.error('Weather function error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        message: 'Weather service temporarily unavailable'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})